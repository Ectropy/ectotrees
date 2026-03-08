#!/bin/bash
# scripts/update-docs.sh
#
# Pre-release gate: shows commits since the last version tag and asks whether
# docs are up to date before allowing `npm version` to proceed.

set -euo pipefail

LAST_TAG=$(git tag -l 'v*' | sort -V | tail -1)

if [[ -n "$LAST_TAG" ]]; then
  BASE=$(git rev-list -n 1 "$LAST_TAG")
  BASE_LABEL="$LAST_TAG"
else
  BASE=$(git rev-list --max-parents=0 HEAD)
  BASE_LABEL="initial commit"
fi

echo ""
echo "=== Pre-release check ==="
echo ""
echo "Commits since $BASE_LABEL:"
git log "$BASE"..HEAD --oneline
echo ""
read -rp "Are your docs (README.md, CLAUDE.md) up to date? Continue with version bump? [y/N] " answer
if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
  echo "Aborting. Update your docs first, then re-run npm version."
  exit 1
fi
