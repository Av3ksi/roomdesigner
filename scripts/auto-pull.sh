#!/usr/bin/env bash
# Polls origin for new commits on the current branch and fast-forwards
# automatically. Leave this running in a spare terminal alongside
# `npm run dev` (which stays running the whole time and hot-reloads on its
# own) — new pushes just show up, no manual `git pull` needed.
#
# Uses --ff-only so it's a safe no-op whenever your working tree has
# uncommitted changes or local commits of your own: it never merges,
# rebases, or discards anything, it just tells you to pull by hand instead.
set -euo pipefail
INTERVAL="${1:-15}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Watching origin/$BRANCH for new commits every ${INTERVAL}s (Ctrl+C to stop)…"
while true; do
  git fetch origin "$BRANCH" --quiet
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL" != "$REMOTE" ]; then
    if git merge --ff-only "origin/$BRANCH" --quiet 2>/dev/null; then
      echo "[$(date +%H:%M:%S)] Pulled new changes ($LOCAL -> $REMOTE) — dev server will hot-reload, just refresh the browser."
    else
      echo "[$(date +%H:%M:%S)] New commits on origin/$BRANCH, but your branch has diverged or has uncommitted changes — pull manually."
    fi
  fi
  sleep "$INTERVAL"
done
