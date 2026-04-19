#!/usr/bin/env bash
# Fetch all tabs from the source Google Sheet as CSV.
set -euo pipefail

SHEET_ID="10D1aw4824h88jIlXJf2MWmTq8egR0CcNWl7gKQadRPY"
OUT_DIR="data-raw"
mkdir -p "$OUT_DIR"

TABS=(
  "溜娃小娃群分享"
  "最近活动"
  "课外班推荐"
  "医生推荐"
  "师傅推荐"
  "退休账户等"
  "电视电影网站"
)

for NAME in "${TABS[@]}"; do
  ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$NAME")
  URL="https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${ENCODED}"
  OUT="$OUT_DIR/$NAME.csv"
  echo "fetching: $NAME"
  curl -sfL "$URL" -o "$OUT"
done

echo ""
echo "Done. Re-run: node scripts/parse-csv.mjs"
