#!/usr/bin/env bash
# Recompute sha256 hashes of every inline <script> block in the deployed HTML
# pages, then verify each one is present in every CSP-bearing source file
# under cloudfront/. The active source is security-headers-function.js (the
# CloudFront Function attached at viewer-response). response-headers-policy.json
# is kept as a reference; if it exists it is also checked so the two never
# silently drift.
#
# Run this whenever you edit an inline <script> in index.html, privacy.html, or
# terms.html. CSP rejects any inline script whose hash is not listed, so a
# stale hash means the page silently breaks (theme guard fails to fire, etc).
#
# Invoke with:
#   bash cloudfront/recompute-csp-hashes.sh
#
# Exit codes:
#   0 — every computed hash is present in every checked source
#   1 — at least one hash is missing somewhere; sources need updating

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Every file under cloudfront/ that should contain the current CSP string.
# The .js file is the active deployed source; the .json is reference-only.
SOURCES=()
[ -f "$SCRIPT_DIR/security-headers-function.js" ] && SOURCES+=("$SCRIPT_DIR/security-headers-function.js")
[ -f "$SCRIPT_DIR/response-headers-policy.json"  ] && SOURCES+=("$SCRIPT_DIR/response-headers-policy.json")

if [ "${#SOURCES[@]}" -eq 0 ]; then
    echo "No CSP source file found under $SCRIPT_DIR." >&2
    exit 1
fi

cd "$REPO_ROOT"

python3 - "${SOURCES[@]}" -- index.html privacy.html terms.html <<'PY'
import sys, re, hashlib, base64, pathlib

argv = sys.argv[1:]
sep = argv.index("--")
sources, pages = argv[:sep], argv[sep + 1:]
source_texts = {p: pathlib.Path(p).read_text() for p in sources}

pat = re.compile(r"<script(?:\s+[^>]*)?>(.*?)</script>", re.DOTALL)

found = {}
for page in pages:
    text = pathlib.Path(page).read_text()
    for i, m in enumerate(pat.finditer(text), start=1):
        body = m.group(1)
        if body.strip() == "":
            continue
        digest = hashlib.sha256(body.encode("utf-8")).digest()
        b64 = base64.b64encode(digest).decode()
        found.setdefault(b64, []).append(f"{page}#{i}")

missing = []  # list of (token, source_path)
print("Inline <script> hashes:")
for h, where in found.items():
    token = f"'sha256-{h}'"
    print(f"  sha256-{h}   {', '.join(where)}")
    for path, text in source_texts.items():
        flag = "OK " if token in text else "MISS"
        print(f"    [{flag}] {pathlib.Path(path).name}")
        if token not in text:
            missing.append((token, path))

if missing:
    print()
    print("CSP sources are out of date. Add these tokens to script-src:")
    for token, path in missing:
        print(f"  {pathlib.Path(path).name}: {token}")
    sys.exit(1)

print()
print("All inline-script hashes are present in every checked source.")
PY
