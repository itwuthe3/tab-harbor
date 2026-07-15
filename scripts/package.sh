#!/usr/bin/env bash
# ストア提出用の zip を dist/ に作る(ランタイムに必要なファイルのみ同梱)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
OUT="dist/tab-harbor-${VERSION}.zip"
rm -f "$OUT"

zip -r "$OUT" manifest.json background.js sidepanel icons _locales -x "*.DS_Store"

echo
echo "created: $OUT"
unzip -l "$OUT"
