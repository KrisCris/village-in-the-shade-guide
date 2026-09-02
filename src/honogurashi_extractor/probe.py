from __future__ import annotations

from collections import Counter
from collections.abc import Mapping

from .table import TableContainer, TableFormatError


def _u32(record: bytes, offset: int) -> int:
    return int.from_bytes(record[offset : offset + 4], "little")


def _string_groups(table: TableContainer) -> tuple[tuple[str, ...], ...]:
    if any(len(record) < 16 for record in table.records):
        raise TableFormatError("record is too short to locate its string group")
    if not table.string_pool:
        return tuple(() for _ in table.records)
    starts = [_u32(record, 8) for record in table.records]
    ordered_starts = sorted(set(starts))
    if (
        not ordered_starts
        or ordered_starts[0] != 0
        or len(ordered_starts) != len(starts)
        or ordered_starts[-1] >= len(table.string_pool)
    ):
        flat_strings = table.strings()
        if len(flat_strings) == len(table.records):
            return tuple((value,) for value in flat_strings)
        return tuple(() for _ in table.records)
    end_by_start = {
        start: end
        for start, end in zip(
            ordered_starts, ordered_starts[1:] + [len(table.string_pool)], strict=True
        )
    }
    groups: list[tuple[str, ...]] = []
    for start in starts:
        end = end_by_start[start]
        if end < start or end > len(table.string_pool):
            raise TableFormatError("record string group is outside string pool")
        try:
            values = table.string_pool[start:end].decode("utf-8").split("\0")
        except UnicodeDecodeError as error:
            raise TableFormatError("record string group is not valid UTF-8") from error
        if values and values[-1] == "":
            values.pop()
        groups.append(tuple(values))
    return tuple(groups)


def build_probe(tables: Mapping[str, TableContainer]) -> dict[str, object]:
    """Summarize observed scalar columns without assigning unverified meanings."""
    id_sets = {
        name: {_u32(record, 0) for record in table.records}
        for name, table in tables.items()
    }
    result: dict[str, object] = {"format": 1, "tables": {}}
    table_reports: dict[str, object] = result["tables"]  # type: ignore[assignment]

    for name, table in tables.items():
        sizes = Counter(len(record) for record in table.records)
        groups = _string_groups(table)
        representative_indexes = sorted(
            {0, len(table.records) // 2, len(table.records) - 1}
        )
        representatives = []
        for index in representative_indexes:
            record = table.records[index]
            representatives.append(
                {
                    "index": index,
                    "record_size": len(record),
                    "scalars": {
                        str(offset): _u32(record, offset)
                        for offset in range(0, len(record) - 3, 4)
                    },
                    "strings": list(groups[index]),
                }
            )

        fields: dict[str, object] = {}
        max_size = max(sizes)
        for offset in range(0, max_size - 3, 4):
            values = [
                _u32(record, offset)
                for record in table.records
                if offset + 4 <= len(record)
            ]
            matches = {
                target: sum(value in target_ids for value in values)
                for target, target_ids in id_sets.items()
                if target != name
            }
            fields[str(offset)] = {
                "present": len(values),
                "non_zero": sum(value != 0 for value in values),
                "distinct": len(set(values)),
                "min": min(values),
                "max": max(values),
                "sample": values[:8],
                "foreign_keys": {
                    target: count for target, count in matches.items() if count
                },
            }

        table_reports[name] = {
            "record_count": table.record_count,
            "record_sizes": {str(size): count for size, count in sorted(sizes.items())},
            "representative_rows": representatives,
            "fields": fields,
        }
    return result
