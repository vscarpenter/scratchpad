#!/usr/bin/env bash
# Recompute sha256 hashes of every inline <script> block in the deployed HTML
# pages, then verify the script-src of every CSP-bearing source file under
# cloudfront/ is EXACTLY 'self' plus those hashes. The active source is
# security-headers-function.js (the CloudFront Function attached at
# viewer-response). response-headers-policy.json is kept as a reference; if it
# exists it is also checked so the two never silently drift.
#
# The page list is derived from deploy.sh's HTML_SHELLS, so this verifier and
# the deploy can never disagree about which shells ship.
#
# Three failure classes, all exit 1:
#   - a computed hash missing from a source (stale CSP: the page breaks)
#   - a script-src token that is not 'self' or a computed hash (weakened CSP:
#     'unsafe-inline', a scheme, or a wildcard would otherwise pass silently)
#   - a sha256 token no inline script hashes to (orphan: a standing allowance
#     for script text that no longer exists)
#
# Run this whenever you edit an inline <script> in any deployed HTML shell.
#
# Invoke with:
#   bash cloudfront/recompute-csp-hashes.sh

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

# shellcheck disable=SC2207
PAGES=($(sed -n 's/^HTML_SHELLS=(\(.*\))$/\1/p' deploy.sh))
if [ "${#PAGES[@]}" -eq 0 ]; then
    echo "Could not derive the page list from deploy.sh's HTML_SHELLS line." >&2
    exit 1
fi
for page in "${PAGES[@]}"; do
    if [ ! -f "$page" ]; then
        echo "deploy.sh lists $page as a deployed shell, but it does not exist." >&2
        exit 1
    fi
done

python3 - "${SOURCES[@]}" -- "${PAGES[@]}" <<'PY'
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

problems = []  # (source_path, description)
print("Inline <script> hashes:")
for h, where in found.items():
    token = f"'sha256-{h}'"
    print(f"  sha256-{h}   {', '.join(where)}")
    for path, text in source_texts.items():
        flag = "OK " if token in text else "MISS"
        print(f"    [{flag}] {pathlib.Path(path).name}")
        if token not in text:
            problems.append((path, f"missing from script-src: {token}"))

# Presence is not enough: a script-src weakened with 'unsafe-inline', a bare
# scheme, or a wildcard would keep every hash present and still gut the
# policy. Assert the directive holds exactly 'self' plus the computed hashes,
# and nothing hashes to script text that no longer exists (orphans).
allowed = {"'self'"} | {f"'sha256-{h}'" for h in found}
src_pat = re.compile(r"script-src([^;\"]*)")
print()
print("script-src strictness:")
for path, text in source_texts.items():
    name = pathlib.Path(path).name
    directives = src_pat.findall(text)
    if not directives:
        problems.append((path, "no script-src directive found"))
        print(f"  [MISS] {name}: no script-src directive")
        continue
    for directive in directives:
        tokens = directive.split()
        foreign = [t for t in tokens if t not in allowed]
        orphans = [t for t in tokens if t.startswith("'sha256-") and t in foreign]
        for token in foreign:
            kind = "orphaned hash" if token in orphans else "disallowed source"
            problems.append((path, f"{kind} in script-src: {token}"))
        flag = "OK " if not foreign else "FAIL"
        print(f"  [{flag}] {name}")

if problems:
    print()
    print("CSP sources need fixing:")
    for path, description in problems:
        print(f"  {pathlib.Path(path).name}: {description}")
    sys.exit(1)

print()
print("All inline-script hashes are present, script-src is exactly 'self' plus")
print("those hashes, and no orphaned hash remains, in every checked source.")
PY
