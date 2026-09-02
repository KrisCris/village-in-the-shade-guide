from __future__ import annotations

import struct
import json

import pytest

from honogurashi_extractor.schema import (
    FieldSpec,
    SchemaError,
    TableSchema,
    decode_record,
    load_schema_file,
    verify_schema_evidence,
    validate_schema,
)


def test_rejects_field_outside_record():
    schema = TableSchema(
        "item", "24969282", 8, (FieldSpec("price", 8, "u32", True),)
    )

    with pytest.raises(SchemaError, match="outside record"):
        validate_schema(schema)


def test_rejects_duplicate_field_names_and_unsupported_kinds():
    duplicate = TableSchema(
        "item",
        "24969282",
        8,
        (
            FieldSpec("price", 0, "u32", True),
            FieldSpec("price", 4, "u32", True),
        ),
    )
    unsupported = TableSchema(
        "item", "24969282", 8, (FieldSpec("price", 0, "decimal", True),)
    )

    with pytest.raises(SchemaError, match="duplicate field"):
        validate_schema(duplicate)
    with pytest.raises(SchemaError, match="unsupported kind"):
        validate_schema(unsupported)


def test_decodes_supported_scalar_kinds():
    schema = TableSchema(
        "sample",
        "24969282",
        23,
        (
            FieldSpec("byte", 0, "u8", True),
            FieldSpec("short", 1, "u16", True),
            FieldSpec("integer", 3, "u32", True),
            FieldSpec("signed", 7, "i32", True),
            FieldSpec("wide", 11, "u64", True),
            FieldSpec("ratio", 19, "f32", True),
        ),
    )
    record = struct.pack("<BHIiQf", 7, 500, 70000, -12, 5_000_000_000, 1.25)

    assert decode_record(schema, record) == {
        "byte": 7,
        "short": 500,
        "integer": 70000,
        "signed": -12,
        "wide": 5_000_000_000,
        "ratio": pytest.approx(1.25),
    }


def test_refuses_record_with_a_different_size():
    schema = TableSchema(
        "item", "24969282", 8, (FieldSpec("id", 0, "u32", True),)
    )

    with pytest.raises(SchemaError, match="record size"):
        decode_record(schema, b"\0" * 12)


def test_loads_and_verifies_an_observed_trailing_record_schema(tmp_path):
    path = tmp_path / "item.json"
    path.write_text(
        json.dumps(
            {
                "table": "item",
                "build_id": "24969282",
                "record_size": 8,
                "allow_trailing": True,
                "fields": [
                    {
                        "name": "id",
                        "offset": 0,
                        "kind": "u32",
                        "required": True,
                        "evidence": [
                            {"record_id": 100, "value": 100},
                            {"record_id": 200, "value": 200},
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    schema = load_schema_file(path)
    records = (
        struct.pack("<II", 100, 1),
        struct.pack("<III", 200, 2, 3),
    )

    assert decode_record(schema, records[1]) == {"id": 200}
    verify_schema_evidence(schema, records)
