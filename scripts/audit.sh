#!/usr/bin/env bash
# YouPrune — supply-chain / least-privilege audit.
#
# Fails (non-zero exit) if the extension grows new permissions or introduces
# dangerous APIs. Run it before every release and in CI, so a malicious or
# careless change to permissions or code is caught before it ships.
#
# The allowlists below are the ONLY place new capabilities can be granted, and
# changing them shows up as a reviewable diff. If you ever genuinely need a new
# permission or a network call, widen the allowlist in the same commit and say
# why in the message — that is the audit trail.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { printf '  %s\n' "$1"; }
err()  { printf 'FAIL: %s\n' "$1"; fail=1; }

# ---- 1. Permission allowlist --------------------------------------------------
ALLOWED_PERMS='["contextMenus","storage"]'
ALLOWED_HOSTS='["*://*.youtube.com/*"]'

echo "[1] Manifest permissions"
perms=$(jq -c '(.permissions // []) | sort' manifest.json)
hosts=$(jq -c '(.host_permissions // []) | sort' manifest.json)
opt=$(jq -c '.optional_permissions // [] | length' manifest.json)
opthost=$(jq -c '.optional_host_permissions // [] | length' manifest.json)

[ "$perms" = "$ALLOWED_PERMS" ]  || err "permissions changed: got $perms, allowed $ALLOWED_PERMS"
[ "$hosts" = "$ALLOWED_HOSTS" ]  || err "host_permissions changed: got $hosts, allowed $ALLOWED_HOSTS"
[ "$opt" = "0" ]                 || err "optional_permissions must be empty"
[ "$opthost" = "0" ]             || err "optional_host_permissions must be empty"
# content-script match scope must stay youtube-only.
jq -e '[.content_scripts[].matches[]] | all(. == "*://*.youtube.com/*")' manifest.json >/dev/null \
  || err "a content_script matches something other than youtube.com"
[ "$fail" = "0" ] && note "ok: storage + contextMenus, youtube-only hosts"

# ---- 2. Dangerous API patterns in source -------------------------------------
echo "[2] Source red-flags (src/)"
# Property access / assignment forms so prose comments don't false-positive.
PATTERNS='\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|chrome\.scripting|executeScript|chrome\.webRequest|chrome\.declarativeNetRequest|chrome\.cookies|chrome\.history|chrome\.downloads'
if hits=$(grep -rnE "$PATTERNS" src/); then
  err "dangerous API usage found:"; echo "$hits" | sed 's/^/      /'
else
  note "ok: no eval / HTML-injection / scripting / webRequest / cookies APIs"
fi

# ---- 3. No network egress (yet) ----------------------------------------------
# YouPrune v0.x makes zero network calls. When the network module lands, relax
# this block to permit fetch to the ONE configured API origin, and update the
# host_permissions allowlist above in the same commit.
echo "[3] Network egress"
if hits=$(grep -rnE "\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource" src/); then
  err "network call found (none allowed in this version):"; echo "$hits" | sed 's/^/      /'
else
  note "ok: no fetch / XHR / websocket / beacon"
fi

# ---- 4. No remote code loading -----------------------------------------------
echo "[4] Remote code loading"
if hits=$(grep -rnE "importScripts\(\s*['\"](https?:)?//|\.src\s*=\s*['\"]?https?:|import\(\s*['\"]https?:" src/); then
  err "remote code reference found:"; echo "$hits" | sed 's/^/      /'
else
  note "ok: scripts load only local files"
fi

echo
if [ "$fail" = "0" ]; then
  echo "AUDIT PASSED"
else
  echo "AUDIT FAILED — review the findings above."
fi
exit $fail
