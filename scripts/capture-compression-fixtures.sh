#!/usr/bin/env bash
# Capture compression benchmark fixtures from real command output.
#
# Run this script manually from the repo root to refresh the fixture corpus.
# Each captured file becomes a deterministic fixture — re-run to update.
# Commit any changes with a message describing the capture context.
#
# Prerequisites:
#   - pnpm, git, rg (ripgrep) installed
#   - Optional: `rtk` installed (cargo install rtk) for *.rtk.txt pairs
#   - Run from /workspaces/valora
#
# Usage:
#   bash scripts/capture-compression-fixtures.sh
#   bash scripts/capture-compression-fixtures.sh --with-rtk   # also capture RTK pairs
set -euo pipefail

FIXTURES="tests/fixtures/compression"
WITH_RTK=false
[[ "${1-}" == "--with-rtk" ]] && WITH_RTK=true

has_rtk() { command -v rtk &>/dev/null; }

capture() {
  local outfile="$1"; shift
  mkdir -p "$(dirname "$outfile")"
  # Use `script` to preserve ANSI codes from interactive tools;
  # fall back to direct execution if script is unavailable.
  if command -v script &>/dev/null; then
    script -q -c "$*" /dev/null > "$outfile" 2>&1 || true
  else
    eval "$@" > "$outfile" 2>&1 || true
  fi
  echo "  captured: $outfile  ($(wc -c < "$outfile") bytes)"
}

capture_rtk() {
  local outfile="$1"; shift
  if ! $WITH_RTK || ! has_rtk; then
    echo "  skipped (rtk unavailable): ${outfile%.txt}.rtk.txt"
    return
  fi
  local rtkfile="${outfile%.txt}.rtk.txt"
  mkdir -p "$(dirname "$rtkfile")"
  eval "rtk $@" > "$rtkfile" 2>&1 || true
  echo "  captured: $rtkfile  ($(wc -c < "$rtkfile") bytes)"
}

echo "=== Capturing compression benchmark fixtures ==="
echo

echo "--- TypeScript ---"
capture "$FIXTURES/typescript/tsc-noemit-clean.txt"        pnpm tsc --noEmit
capture "$FIXTURES/typescript/tsc-noemit-cascade.txt"       pnpm tsc --noEmit
capture_rtk "$FIXTURES/typescript/tsc-noemit-clean.txt"    tsc --noEmit

echo
echo "--- ESLint ---"
capture "$FIXTURES/eslint/eslint-stylish-mixed.txt"         pnpm lint
capture "$FIXTURES/eslint/eslint-compact.txt"               pnpm lint --format compact 2>/dev/null || echo "(compact format unavailable)" > "$FIXTURES/eslint/eslint-compact.txt"

echo
echo "--- Test runner ---"
capture "$FIXTURES/test-runner/vitest-allpass.txt"          pnpm exec vitest run --reporter=verbose
capture "$FIXTURES/test-runner/vitest-coverage-table.txt"   pnpm exec vitest run --coverage --reporter=verbose

echo
echo "--- Package manager ---"
capture "$FIXTURES/package-manager/pnpm-install-clean.txt"        pnpm install
capture "$FIXTURES/package-manager/pnpm-install-with-warnings.txt" pnpm install --force
capture_rtk "$FIXTURES/package-manager/pnpm-install-clean.txt"    pnpm install

echo
echo "--- Git ---"
capture "$FIXTURES/git/git-log-20.txt"          git log -20
capture "$FIXTURES/git/git-diff-head5.txt"       git diff HEAD~5
capture "$FIXTURES/git/git-show-commit.txt"      git show HEAD
capture_rtk "$FIXTURES/git/git-log-20.txt"       git log -20
capture_rtk "$FIXTURES/git/git-diff-head5.txt"   git diff HEAD~5

echo
echo "--- Search ---"
capture "$FIXTURES/search/rg-pattern-dense.txt"   rg "import" src/ --type ts -l
capture "$FIXTURES/search/rg-with-context.txt"    rg "compress" src/ --type ts -C 2

echo
echo "--- Mixed (wrapper dispatch) ---"
capture "$FIXTURES/mixed/pnpm-tsc-wrapper.txt"     pnpm tsc --noEmit
capture "$FIXTURES/mixed/npx-vitest-wrapper.txt"   pnpm exec vitest run --reporter=verbose
capture "$FIXTURES/mixed/yarn-eslint-wrapper.txt"  pnpm lint

echo
echo "=== Done. Review changes with: git diff tests/fixtures/compression/ ==="
echo "Update manifest.json if new fixtures were added, then run:"
echo "  WRITE_BENCHMARK_REPORT=true pnpm bench:compression"
