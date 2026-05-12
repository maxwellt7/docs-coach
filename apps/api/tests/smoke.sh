#!/usr/bin/env bash
# Smoke test for the deployed Docs Coach API. Asserts that every
# returned suggestion has paragraph_index populated.
#
# Usage:
#   ./apps/api/tests/smoke.sh                     # hits prod by default
#   API_BASE=http://localhost:8000 ./apps/api/tests/smoke.sh

set -euo pipefail

API_BASE="${API_BASE:-https://docs-coachweb-production.up.railway.app}"

PAYLOAD='{
  "surface": "google_docs",
  "url": "https://docs.google.com/document/d/test",
  "title": "Smoke Test SOP",
  "paragraphs": [
    "We need to ship the feature quickly.",
    "The product owner is responsible for approving every change.",
    "Refunds over $500 require manager approval per company policy."
  ],
  "review_mode": "auto"
}'

response=$(curl -sS -X POST "$API_BASE/api/document-review" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")

echo "$response" | python3 -c '
import json, sys
data = json.load(sys.stdin)
suggestions = data.get("suggestions", [])
assert suggestions, "no suggestions returned"
missing = [s for s in suggestions if s.get("paragraph_index") is None]
if missing:
    print("FAIL: suggestions without paragraph_index:")
    for s in missing:
        print(" -", s["lens"], s["title"])
    sys.exit(1)
print(f"OK: {len(suggestions)} suggestions, all with paragraph_index")
for s in suggestions:
    sev = s["severity"]; lens = s["lens"]; idx = s["paragraph_index"]
    print(f"  [{sev}] {lens} -> paragraph {idx}")
'
