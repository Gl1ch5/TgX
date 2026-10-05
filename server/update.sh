#!/usr/bin/env bash
# Self-update of the TeleX mod store API: runs from a systemd timer every few minutes.
# If the server/ folder of the tracked branch differs from what is installed, it tests the new code and re-runs install.sh.
set -euo pipefail
CONF=/etc/telex-api.update
SRC=/opt/telex-api-src
[ -f "$CONF" ] || exit 0
# shellcheck disable=SC1090
. "$CONF"
exec 9>/run/telex-api-update.lock
flock -n 9 || exit 0

remote="$(git ls-remote "$REPO" "refs/heads/$BRANCH" | cut -f1)"
[ -n "$remote" ] || { echo "cannot read $REPO ($BRANCH)"; exit 0; }
[ "$remote" = "$(cat /opt/telex-api/.deployed 2>/dev/null || true)" ] && exit 0

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
  git -C "$SRC" checkout -q -f FETCH_HEAD
else
  rm -rf "$SRC"; git clone -q --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi

changed=0
for f in index.js package.json install.sh update.sh; do
  cmp -s "$SRC/server/$f" "/opt/telex-api/$f" || changed=1
done
if [ "$changed" = 1 ]; then
  echo "new server code ($remote): testing"
  node "$SRC/server/test.js" >/dev/null || { echo "tests failed, keeping the running version"; exit 0; }
  echo "installing"
  env DOMAIN="${DOMAIN:-}" EMAIL="${EMAIL:-}" TLS_HOST="${TLS_HOST:-}" PUBLIC_PORT="${PUBLIC_PORT:-8443}" bash "$SRC/server/install.sh"
fi
echo "$remote" > /opt/telex-api/.deployed
echo "up to date: $remote"
