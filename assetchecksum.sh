#!/usr/bin/env bash
set -euo pipefail

DOCS_DIR="docs"

# Find all CSS and PDF files in docs/, compute MD5 checksums,
# and append ?checksum=<hash> to references in HTML files.

for asset in "$DOCS_DIR"/*.css "$DOCS_DIR"/*.pdf; do
  [ -f "$asset" ] || continue

  filename=$(basename "$asset")
  checksum=$(md5sum "$asset" 2>/dev/null | cut --delimiter=' ' --fields=1 || md5 -q "$asset")

  echo "Asset: $filename → checksum=$checksum"

  # Replace references in all HTML files (works on both Linux and macOS)
  for html in "$DOCS_DIR"/*.html; do
    [ -f "$html" ] || continue
    if sed --version >/dev/null 2>&1; then
      # GNU sed (Linux)
      sed -i "s|${filename}|${filename}?checksum=${checksum}|g" "$html"
    else
      # BSD sed (macOS)
      sed -i '' "s|${filename}|${filename}?checksum=${checksum}|g" "$html"
    fi
  done
done

echo "Cache busting complete."
