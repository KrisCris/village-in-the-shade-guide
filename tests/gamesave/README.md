# Local save-editor integration fixtures

The integration suites use the original development snapshots `save.001`
through `save.005` and `.systemsave` in this directory. Their assertions depend
on the contents of these specific snapshots.

Git stores the saves in `tests/fixtures/gamesave.tar.gz.enc`, an AES-encrypted
archive. CI unpacks it with `tools/save-fixtures.sh unpack` when the
`SAVE_FIXTURES_KEY` Actions secret is configured. After changing a fixture here,
re-encrypt it with `SAVE_FIXTURES_KEY=... tools/save-fixtures.sh pack`.

`npm test` generates the public lookup tables, then runs all available tests.
Vitest uses local fixture availability to enable or skip the integration suites.
Codec, lookup and search unit tests run on every checkout. The original snapshots
enable the full save-editor regression suite.

For a test run using public data, set `SAVE_EDITOR_SKIP_PRIVATE_FIXTURES`.

```powershell
$env:SAVE_EDITOR_SKIP_PRIVATE_FIXTURES = '1'
npm test
Remove-Item Env:SAVE_EDITOR_SKIP_PRIVATE_FIXTURES
```

Keep fixtures read-only. Write edited exports and inspection results under the
ignored `output/save-v2/` directory. See `docs/save-editor.md` for the verified
format, native-code evidence and offline export checks.
