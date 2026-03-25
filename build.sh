#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Sagittarius Build Script
# Concatenates shell + parts into a single testable HTML file.
# No server required — open the output in any browser.
#
# Usage:  ./build.sh              (outputs sag_build.html)
#         ./build.sh myfile.html  (outputs myfile.html)
#         ./build.sh --no-tests   (excludes test harness)
# ═══════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="${1:-sag_build.html}"
SKIP_TESTS=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --no-tests) SKIP_TESTS=true ;;
    --help|-h)
      echo "Usage: ./build.sh [output.html] [--no-tests]"
      echo "  --no-tests   Exclude 10-tests.js (saves ~5K lines)"
      exit 0 ;;
    *) OUTPUT="$arg" ;;
  esac
done

# Verify structure exists
if [ ! -f "$SCRIPT_DIR/shell/head.html" ]; then
  echo "ERROR: shell/head.html not found. Run from the sag-build directory."
  exit 1
fi

# Build
{
  cat "$SCRIPT_DIR/shell/head.html"
  for f in "$SCRIPT_DIR"/parts/*.js; do
    fname=$(basename "$f")
    if [ "$SKIP_TESTS" = true ] && [ "$fname" = "10-tests.js" ]; then
      echo "/* [TESTS EXCLUDED BY BUILD FLAG] */"
      continue
    fi
    cat "$f"
  done
  cat "$SCRIPT_DIR/shell/tail.html"
} > "$SCRIPT_DIR/$OUTPUT"

# Line count
LINES=$(wc -l < "$SCRIPT_DIR/$OUTPUT")
echo "Built: $OUTPUT ($LINES lines)"

if [ "$SKIP_TESTS" = true ]; then
  echo "  (tests excluded — ~5K lines saved)"
fi
