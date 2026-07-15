#!/usr/bin/env bash
# 全 E2E スイートを順に実行する。事前に: cd e2e && npm run setup
set -u
cd "$(dirname "$0")"
failed=0
for suite in basic import folders pintabs globalpins restore; do
  echo "=== $suite ==="
  node "$suite.mjs" || failed=1
  echo
done
exit $failed
