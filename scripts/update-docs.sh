#!/bin/bash
# scripts/update-docs.sh
#
# Updates README.md and CLAUDE.md based on committed changes since the last
# npm version tag (v*). Run this just before `npm version patch/minor/major`.
#
# Usage:
#   bash scripts/update-docs.sh           # dry-run: show diff, no changes
#   bash scripts/update-docs.sh --apply   # update and stage both files

set -euo pipefail

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
fi

# ── Find base commit ─────────────────────────────────────────────────────────
LAST_TAG=$(git tag -l 'v*' | sort -V | tail -1)

if [[ -n "$LAST_TAG" ]]; then
  BASE=$(git rev-list -n 1 "$LAST_TAG")
  BASE_LABEL="$LAST_TAG"
else
  BASE=$(git rev-list --max-parents=0 HEAD)
  BASE_LABEL="initial commit"
fi

# ── Collect diff ─────────────────────────────────────────────────────────────
DIFF=$(git diff "$BASE" HEAD -- . \
  ':(exclude).git' \
  ':(exclude)*.lock' \
  ':(exclude)package-lock.json' \
  ':(exclude)dist/')

if [[ -z "$DIFF" ]]; then
  echo "No committed changes since $BASE_LABEL."
  exit 0
fi

echo "Changes since $BASE_LABEL:"
git log --oneline "$BASE"..HEAD
echo ""

if [[ "$APPLY" == false ]]; then
  echo "Run 'bash scripts/update-docs.sh --apply' to update docs first."
  echo ""
  read -rp "Docs up to date? Continue with npm version? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
  exit 0
fi

# ── Helper: call Claude and strip any markdown fences from output ─────────────
call_claude() {
  local prompt="$1"
  local result
  result=$(echo "$prompt" | claude --print)
  # Strip leading/trailing ```...``` fences if Claude wrapped the output
  result=$(echo "$result" | sed '/^```/d')
  echo "$result"
}

# ── Update a single file ──────────────────────────────────────────────────────
update_file() {
  local FILE="$1"
  local INSTRUCTIONS="$2"

  if [[ ! -f "$FILE" ]]; then
    echo "⚠️  $FILE not found, skipping."
    return
  fi

  echo "Updating $FILE..."

  local CURRENT
  CURRENT=$(cat "$FILE")

  local PROMPT
  PROMPT="${INSTRUCTIONS}

Current ${FILE}:
<current>
${CURRENT}
</current>

Git diff since ${BASE_LABEL}:
<diff>
${DIFF}
</diff>

Output ONLY the updated file content. No preamble, no explanation, no markdown code fences. If no changes are needed, output the file exactly as-is."

  local UPDATED
  UPDATED=$(call_claude "$PROMPT")

  if [[ -z "$UPDATED" ]]; then
    echo "⚠️  No output from Claude for $FILE."
    return
  fi

  echo "$UPDATED" > "$FILE"
  git add "$FILE"
  echo "✅ $FILE staged."
}

# ── README.md ─────────────────────────────────────────────────────────────────
update_file "README.md" \
  "You are updating README.md for a RuneScape 3 Evil Trees tracker app.
Update only the sections directly affected by the git diff below.
Preserve all existing structure, headings, tone, and content that is unaffected.
Focus on user-facing changes: new features, changed behaviour, updated commands."

# ── CLAUDE.md ─────────────────────────────────────────────────────────────────
update_file "CLAUDE.md" \
  "You are updating CLAUDE.md — a developer guide for AI assistants working on this codebase.
Update only the sections directly affected by the git diff below.
Sections to potentially update include: Tech Stack, Commands, Project Structure, Key Architecture Decisions, component descriptions, and any constants or settings that changed.
Preserve all existing structure, headings, and content that is unaffected.
Be precise and technical; this file is read by AI coding assistants."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Review staged changes:"
echo "  git diff --cached README.md CLAUDE.md"
echo ""
echo "When satisfied, commit and then run: npm version patch|minor|major"
