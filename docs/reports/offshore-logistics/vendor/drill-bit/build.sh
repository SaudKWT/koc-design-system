#!/bin/sh
# Rebuilds drill-bit.js and drill-bit.svg from a dweg-landing checkout.
#   ./build.sh /path/to/dweg-landing     (branch rig3-design-system-sync)
# Needs Node, and esbuild on PATH or in node_modules/.bin. Both outputs are
# committed, so build.py never needs dweg-landing or Node.
set -e
SRC="$1"; HERE="$(cd "$(dirname "$0")" && pwd)"
[ -d "$SRC/src/landing/fi3/gl" ] || { echo "usage: $0 /path/to/dweg-landing"; exit 1; }
GL="$SRC/src/landing/fi3/gl"
TMP="$(mktemp -d)"
esbuild "$HERE/worker.ts" --bundle --minify --format=iife --target=es2020 \
  --alias:@fi3gl="$GL" --outfile="$TMP/worker.js"
esbuild "$HERE/entry.ts" --bundle --minify --format=iife --target=es2020 \
  --alias:@fi3gl="$GL" --define:WORKER_SRC="$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(process.argv[1],"utf8")))' "$TMP/worker.js")" \
  --outfile="$HERE/drill-bit.js"
esbuild "$HERE/fallback.ts" --bundle --platform=node --format=cjs \
  --alias:@fi3gl="$GL" --outfile="$TMP/fallback.cjs"
node "$TMP/fallback.cjs" > "$HERE/drill-bit.svg"
REV="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf 'dweg-landing %s, src/landing/fi3/gl\n' "$REV" > "$HERE/SOURCE"
rm -rf "$TMP"
