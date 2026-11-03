#!/bin/sh
# Points e2e/questdb at the head of QuestDB master and stages the pointer.
# The OSS submodule check rejects a pointer that falls behind master, so the
# pointer moves on every commit. Set SKIP_QUESTDB_SYNC=1 to leave it alone.
# A failed fetch or checkout never blocks the commit.

set -u

SUBMODULE="e2e/questdb"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 0

if [ "${SKIP_QUESTDB_SYNC:-}" = "1" ]; then
  exit 0
fi

if [ ! -f "$SUBMODULE/.git" ] && [ ! -d "$SUBMODULE/.git" ]; then
  echo "questdb submodule is not initialized; run: git submodule update --init"
  exit 0
fi

if ! git -C "$SUBMODULE" fetch -q origin master; then
  echo "Could not fetch QuestDB master; the submodule pointer stays as is."
  exit 0
fi

head="$(git -C "$SUBMODULE" rev-parse origin/master)"
recorded="$(git rev-parse -q --verify "HEAD:$SUBMODULE" 2>/dev/null || true)"
if [ "$head" = "$recorded" ]; then
  exit 0
fi

if [ "$(git -C "$SUBMODULE" rev-parse HEAD)" != "$head" ] &&
  ! git -C "$SUBMODULE" checkout -q --detach "$head"; then
  echo "Could not check out QuestDB master in $SUBMODULE; the pointer stays as is."
  exit 0
fi

git add "$SUBMODULE"
echo "questdb submodule: ${recorded%"${recorded#??????????}"} -> ${head%"${head#??????????}"} (QuestDB master head)"
