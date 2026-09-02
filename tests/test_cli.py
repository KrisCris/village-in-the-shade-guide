from honogurashi_extractor.cli import build_parser


def test_cli_exposes_extract_and_diff_commands():
    """Removing either public workflow from the CLI must break this contract."""
    parser = build_parser()
    help_text = parser.format_help()

    assert "extract" in help_text
    assert "diff" in help_text


def test_cli_extract_requires_the_game_build_identity(tmp_path):
    args = build_parser().parse_args(
        [
            "extract",
            "--game-dir",
            str(tmp_path),
            "--build-id",
            "24969282",
            "--output",
            str(tmp_path / "snapshot"),
        ]
    )

    assert args.build_id == "24969282"


def test_cli_accepts_a_build_probe_request(tmp_path):
    parser = build_parser()

    args = parser.parse_args(
        [
            "probe",
            "--game-dir",
            str(tmp_path),
            "--tables",
            "item,crops",
            "--output",
            str(tmp_path / "probe.json"),
        ]
    )

    assert args.command == "probe"
    assert args.tables == "item,crops"


def test_cli_accepts_schema_verification_request(tmp_path):
    args = build_parser().parse_args(
        [
            "verify-schemas",
            "--game-dir",
            str(tmp_path),
            "--build-id",
            "24969282",
        ]
    )

    assert args.command == "verify-schemas"
    assert args.build_id == "24969282"


def test_cli_accepts_snapshot_audit_request(tmp_path):
    args = build_parser().parse_args(["audit", str(tmp_path)])

    assert args.command == "audit"
