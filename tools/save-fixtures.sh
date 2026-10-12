#!/usr/bin/env bash
# Encrypted copy of the private save fixtures (tests/gamesave), so CI can run the
# save-editor regression without publishing the saves.
#
#   SAVE_FIXTURES_KEY=... tools/save-fixtures.sh pack     # after changing the local fixtures
#   SAVE_FIXTURES_KEY=... tools/save-fixtures.sh unpack   # CI; skipped when the key is absent
set -euo pipefail

archive=tests/fixtures/gamesave.tar.gz.enc
files=(save.001 save.002 save.003 save.004 save.005 .systemsave)
cipher=(-aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:SAVE_FIXTURES_KEY)
# Keys copied from Windows tools can carry a trailing CR; whitespace is never part of the key.
if [ -n "${SAVE_FIXTURES_KEY:-}" ]; then export SAVE_FIXTURES_KEY="$(printf %s "$SAVE_FIXTURES_KEY" | tr -d '[:space:]')"; fi

case "${1:-}" in
  pack)
    : "${SAVE_FIXTURES_KEY:?set SAVE_FIXTURES_KEY}"
    tar -czf - -C tests/gamesave "${files[@]}" | openssl enc -e -salt "${cipher[@]}" -out "$archive"
    echo "Wrote $archive"
    ;;
  unpack)
    if [ -z "${SAVE_FIXTURES_KEY:-}" ]; then
      echo "SAVE_FIXTURES_KEY is not available (for example on a fork); save fixture tests will be skipped."
      exit 0
    fi
    mkdir -p tests/gamesave
    openssl enc -d "${cipher[@]}" -in "$archive" | tar -xzf - -C tests/gamesave
    echo "Unpacked ${#files[@]} save fixtures"
    ;;
  *)
    echo "usage: $0 pack|unpack" >&2
    exit 2
    ;;
esac
