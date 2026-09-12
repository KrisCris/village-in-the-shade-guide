# Local save-editor integration fixtures

Personal game saves are intentionally excluded from Git. The integration suites
use the original development snapshots `save.001` through `save.005` and
`.systemsave` in this directory. They assert the contents of those specific
snapshots, so arbitrary saves are not interchangeable fixtures.

`npm test` generates the public lookup tables, then runs all available tests.
When these private snapshots are absent, Vitest reports the corresponding
integration suites as skipped; codec, lookup and search unit tests still run.
With the original snapshots present, the full save-editor regression runs.

To check the same behavior as a checkout without private saves, without moving
or deleting any local files:

```powershell
$env:SAVE_EDITOR_SKIP_PRIVATE_FIXTURES = '1'
npm test
Remove-Item Env:SAVE_EDITOR_SKIP_PRIVATE_FIXTURES
```

Keep fixtures read-only. Write edited exports and inspection results under the
ignored `output/save-v2/` directory. See `docs/save-editor.md` for the verified
format, native-code evidence and offline export checks.
