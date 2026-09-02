from __future__ import annotations

import struct
import json
from dataclasses import dataclass
from pathlib import Path


KINDS: dict[str, struct.Struct] = {
    "u8": struct.Struct("<B"),
    "u16": struct.Struct("<H"),
    "u32": struct.Struct("<I"),
    "i32": struct.Struct("<i"),
    "u64": struct.Struct("<Q"),
    "f32": struct.Struct("<f"),
}


class SchemaError(ValueError):
    """Raised when a build-specific table schema cannot be applied safely."""


@dataclass(frozen=True, slots=True)
class FieldSpec:
    name: str
    offset: int
    kind: str
    required: bool
    evidence: tuple["Evidence", ...] = ()


@dataclass(frozen=True, slots=True)
class Evidence:
    record_id: int
    value: int | float


@dataclass(frozen=True, slots=True)
class TableSchema:
    table: str
    build_id: str
    record_size: int
    fields: tuple[FieldSpec, ...]
    allow_trailing: bool = False


def validate_schema(schema: TableSchema) -> None:
    if not schema.table or not schema.build_id or schema.record_size <= 0:
        raise SchemaError("schema identity and record size are required")

    names: set[str] = set()
    for field in schema.fields:
        if field.name in names:
            raise SchemaError(f"duplicate field: {field.name}")
        names.add(field.name)
        codec = KINDS.get(field.kind)
        if codec is None:
            raise SchemaError(f"unsupported kind: {field.kind}")
        if field.offset < 0 or field.offset + codec.size > schema.record_size:
            raise SchemaError(f"field {field.name} is outside record")


def decode_record(schema: TableSchema, record: bytes) -> dict[str, int | float]:
    validate_schema(schema)
    size_matches = len(record) == schema.record_size or (
        schema.allow_trailing and len(record) >= schema.record_size
    )
    if not size_matches:
        raise SchemaError(
            f"record size {len(record)} differs from schema size {schema.record_size}"
        )
    return {
        field.name: KINDS[field.kind].unpack_from(record, field.offset)[0]
        for field in schema.fields
    }


def load_schema_file(path: Path) -> TableSchema:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        fields = tuple(
            FieldSpec(
                name=field["name"],
                offset=field["offset"],
                kind=field["kind"],
                required=field["required"],
                evidence=tuple(
                    Evidence(record_id=row["record_id"], value=row["value"])
                    for row in field.get("evidence", [])
                ),
            )
            for field in payload["fields"]
        )
        schema = TableSchema(
            table=payload["table"],
            build_id=str(payload["build_id"]),
            record_size=payload["record_size"],
            fields=fields,
            allow_trailing=payload.get("allow_trailing", False),
        )
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise SchemaError(f"invalid schema file: {path}") from error
    validate_schema(schema)
    return schema


def verify_schema_evidence(schema: TableSchema, records: tuple[bytes, ...]) -> None:
    by_id = {
        int.from_bytes(record[:4], "little"): record
        for record in records
        if len(record) >= 4
    }
    for field in schema.fields:
        if len(field.evidence) < 2:
            raise SchemaError(f"field {field.name} requires at least two evidence rows")
        for evidence in field.evidence:
            try:
                record = by_id[evidence.record_id]
            except KeyError as error:
                raise SchemaError(
                    f"evidence record {evidence.record_id} is absent from {schema.table}"
                ) from error
            actual = decode_record(schema, record)[field.name]
            if actual != evidence.value:
                raise SchemaError(
                    f"evidence mismatch for {schema.table}.{field.name} "
                    f"record {evidence.record_id}: {actual} != {evidence.value}"
                )
