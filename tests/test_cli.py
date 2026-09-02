from honogurashi_extractor.cli import build_parser


def test_cli_exposes_extract_and_diff_commands():
    """Removing either public workflow from the CLI must break this contract."""
    parser = build_parser()
    help_text = parser.format_help()

    assert "extract" in help_text
    assert "diff" in help_text
