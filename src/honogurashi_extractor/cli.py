from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict
from importlib.metadata import version
from collections.abc import Sequence
from pathlib import Path

from .gamedir import add_game_dir
from .archive import FafullfsArchive
from .audit import audit_snapshot
from .diff import diff_snapshots
from .manifest import Provenance, write_snapshot
from .icons import extract_item_icons
from .normalize import normalize_snapshot
from .normalize_world import normalize_world
from .normalize_activities import normalize_activities
from .probe import build_probe, _string_groups
from .schema import SchemaError, load_schema_file, verify_schema_evidence
from .table import read_table, TableFormatError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="honogurashi-data")
    subcommands = parser.add_subparsers(dest="command", required=True)

    extract = subcommands.add_parser("extract", help="extract a normalized snapshot")
    add_game_dir(extract)
    extract.add_argument("--build-id", required=True)
    extract.add_argument("--output", type=Path, required=True)
    extract.add_argument("--schema-dir", type=Path, default=Path("data/schemas"))
    extract.add_argument(
        "--overrides",
        type=Path,
        default=Path("data/localization/zh-hans-overrides.json"),
    )

    diff = subcommands.add_parser("diff", help="compare two normalized snapshots")
    diff.add_argument("before", type=Path)
    diff.add_argument("after", type=Path)

    inspect_archive = subcommands.add_parser(
        "inspect-archive", help="list entries in the installed data.dat"
    )
    add_game_dir(inspect_archive)

    inspect_table = subcommands.add_parser(
        "inspect-table", help="show the shape of one archived database table"
    )
    add_game_dir(inspect_table)
    inspect_table.add_argument("entry")

    probe = subcommands.add_parser(
        "probe", help="write an evidence report for archived database tables"
    )
    add_game_dir(probe)
    probe.add_argument("--tables", required=True)
    probe.add_argument("--output", type=Path, required=True)

    verify_schemas = subcommands.add_parser(
        "verify-schemas", help="verify build schemas against installed game data"
    )
    add_game_dir(verify_schemas)
    verify_schemas.add_argument("--build-id", required=True)
    verify_schemas.add_argument("--schema-dir", type=Path, default=Path("data/schemas"))

    audit = subcommands.add_parser("audit", help="validate a generated snapshot")
    audit.add_argument("snapshot", type=Path)

    extract_icons = subcommands.add_parser(
        "extract-icons", help="extract item icons from the installed game"
    )
    add_game_dir(extract_icons)
    extract_icons.add_argument("--snapshot", type=Path, required=True)
    extract_icons.add_argument("--output", type=Path, required=True)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "extract":
        archive_path = args.game_dir / "data.dat"
        archive = FafullfsArchive.open(archive_path)
        table_names = (
            "item",
            "itemcategory",
            "construction", "bundle", "bundlegroup", "subquestitem", "skilltree", "gameflag", "cropsharvest",
            "crops",
            "craft",
            "cooking",
            "storesales",
            "gimmickprocess",
            "gimmick",
            "fish",
            "fishing",
            "livestock",
            "livestockfeature",
            "character",
            "characterpresent",
            "facility",
            "facilityrelease",
            "quest",
            "lostbook",
            "huntreward",
            "treasurebox",
            "weather",
        )
        raw_tables = {
            name: archive.read_entry(f"data/database/{name}.dat")
            for name in table_names
        }
        # Build 24969282 had six native language slots; 25311578 added a seventh.
        language_count = 6 if args.build_id == "24969282" else 7
        tables = {name: read_table(data, language_count=language_count) for name, data in raw_tables.items()}
        schema_root = args.schema_dir / f"build-{args.build_id}"
        schemas = {
            name: load_schema_file(schema_root / f"{name}.json")
            for name in table_names
            if (schema_root / f"{name}.json").exists()
        }
        overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
        snapshot = normalize_snapshot(tables, schemas, overrides)
        world = normalize_world(tables, snapshot, overrides)
        for attribute in (
            "fish",
            "livestock",
            "characters",
            "facilities",
            "facility_releases",
            "quests",
            "collectibles",
            "hunt_rewards",
            "weather",
        ):
            setattr(snapshot, attribute, getattr(world, attribute))
        normalize_activities(tables, snapshot, overrides, archive)
        with archive_path.open("rb") as stream:
            archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
        provenance = Provenance(
            app_id=3934250,
            build_id=args.build_id,
            archive_sha256=archive_hash,
            table_sha256={
                name: hashlib.sha256(data).hexdigest()
                for name, data in raw_tables.items()
            },
            extractor_version=version("honogurashi-extractor"),
        )
        write_snapshot(snapshot, args.output, provenance)
        # Preserve every native database string in original slot order. The
        # evidence includes tables used by specialized site features as well.
        localization_tables = {}
        for entry in archive.entries():
            if not entry.name.startswith("data/database/") or not entry.name.endswith(".dat"):
                continue
            name = Path(entry.name).stem
            data = archive.read_entry(entry.name)
            native_hash = hashlib.sha256(data).hexdigest()
            try:
                table = read_table(data, language_count=language_count)
                strings = table.strings()
                index_by_offset = {}
                offset = 0
                for index, value in enumerate(strings):
                    index_by_offset[offset] = index
                    offset += len(value.encode("utf-8")) + 1
                groups = _string_groups(table)
                record_groups = []
                for index, (record, group) in enumerate(zip(table.records, groups, strict=True)):
                    start = index_by_offset.get(int.from_bytes(record[8:12], "little")) if group else None
                    if group and (start is None or tuple(strings[start:start + len(group)]) != group):
                        # Some scalar-only tables store one ID string per row
                        # without an offset pointer at byte 8.
                        start = index if len(strings) == len(table.records) and group == (strings[index],) else None
                    record_groups.append({"numeric_id": int.from_bytes(record[:4], "little"),
                                          "string_start": start, "string_count": len(group)})
                localization_tables[name] = {
                    "sha256": native_hash,
                    "language_count": language_count,
                    "strings": list(strings),
                    "records": record_groups,
                }
            except TableFormatError as error:
                if data in (bytes(4), bytes(12)):
                    localization_tables[name] = {"sha256": native_hash, "empty": True, "byte_size": len(data), "strings": [], "records": []}
                else:
                    localization_tables[name] = {"sha256": native_hash, "unparsed": str(error)}
        evidence = {"format": 1, "build_id": args.build_id,
                    "record_string_encoding": "strings[string_start:string_start + string_count]; null start means no identified record group",
                    "tables": localization_tables}
        evidence_data = (json.dumps(evidence, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
        (args.output / "localization-evidence.json").write_bytes(evidence_data)
        manifest_path = args.output / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["language_count"] = language_count
        manifest["schema_sha256"] = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                      for path in sorted(schema_root.glob("*.json"))}
        manifest["generated_files"]["localization-evidence.json"] = hashlib.sha256(evidence_data).hexdigest()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        print(
            f"wrote={args.output} entities="
            f"{sum(len(getattr(snapshot, name)) for name in snapshot.__dataclass_fields__ if isinstance(getattr(snapshot, name), dict))}"
        )
    elif args.command == "diff":
        print(json.dumps(asdict(diff_snapshots(args.before, args.after)), ensure_ascii=False, indent=2))
    elif args.command == "audit":
        counts = audit_snapshot(args.snapshot)
        print("ok " + " ".join(f"{name}={count}" for name, count in sorted(counts.items())))
    elif args.command == "inspect-archive":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        print(f"entries={len(archive.entries())}")
        for entry in archive.entries():
            print(f"{entry.name}\t{entry.size}")
    elif args.command == "inspect-table":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        table = read_table(archive.read_entry(args.entry))
        print(
            f"records={table.record_count} record_size={table.record_size} "
            f"strings={len(table.string_pool)}"
        )
    elif args.command == "probe":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        names = [name.strip() for name in args.tables.split(",") if name.strip()]
        tables = {
            name: read_table(archive.read_entry(f"data/database/{name}.dat"))
            for name in names
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(build_probe(tables), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote={args.output} tables={len(tables)}")
    elif args.command == "verify-schemas":
        archive = FafullfsArchive.open(args.game_dir / "data.dat")
        schema_root = args.schema_dir / f"build-{args.build_id}"
        schema_paths = sorted(schema_root.glob("*.json"))
        if not schema_paths:
            raise SchemaError(f"no schemas found in {schema_root}")
        for path in schema_paths:
            schema = load_schema_file(path)
            if schema.build_id != args.build_id:
                raise SchemaError(
                    f"schema {path.name} targets build {schema.build_id}, not {args.build_id}"
                )
            raw_schema = json.loads(path.read_text(encoding="utf-8"))
            table = read_table(
                archive.read_entry(f"data/database/{schema.table}.dat"),
                language_count=raw_schema.get("language_count", 6),
            )
            observed = set(raw_schema.get("observed_record_sizes", []))
            actual = {len(record) for record in table.records}
            if observed and actual != observed:
                raise SchemaError(
                    f"record sizes changed for {schema.table}: {sorted(actual)}"
                )
            verify_schema_evidence(schema, table.records)
            print(
                f"ok table={schema.table} records={table.record_count} "
                f"sizes={','.join(map(str, sorted(actual)))}"
            )
    elif args.command == "extract-icons":
        report = extract_item_icons(args.game_dir, args.snapshot, args.output)
        print(
            f"requested={report.requested} written={report.written} "
            f"missing={report.missing_icon} failed={report.failed}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
