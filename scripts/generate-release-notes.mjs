#!/usr/bin/env node
// scripts/generate-release-notes.mjs
//
// Called by .github/workflows/release.yml to produce AI-generated release notes.
// Writes .release-notes.md which is passed to softprops/action-gh-release as body_path.

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const TAG_NAME = process.env.TAG_NAME;
if (!TAG_NAME) {
  console.error('TAG_NAME environment variable is required');
  process.exit(1);
}

// Find the previous tag to determine the commit range
const allTags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const currentIndex = allTags.indexOf(TAG_NAME);
const previousTag = currentIndex !== -1 ? allTags[currentIndex + 1] : null;

const base = previousTag
  ? execSync(`git rev-list -n 1 ${previousTag}`, { encoding: 'utf8' }).trim()
  : execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();

const baseLabel = previousTag ?? 'initial commit';
const range = `${base}..${TAG_NAME}`;

const commitLog = execSync(
  `git log ${range} --pretty=format:"%H %s%n%b%n---"`,
  { encoding: 'utf8' }
).trim();

if (!commitLog) {
  console.log('No commits found — writing minimal release notes.');
  writeFileSync('.release-notes.md', `## ${TAG_NAME}\n\nNo changes recorded.\n`);
  process.exit(0);
}

// Get the full diff for the range. Truncate if very large to stay within model limits.
const MAX_DIFF_CHARS = 80_000;
let diff = execSync(`git diff ${range}`, { encoding: 'utf8' });
let diffTruncated = false;
if (diff.length > MAX_DIFF_CHARS) {
  diff = diff.slice(0, MAX_DIFF_CHARS);
  diffTruncated = true;
}

console.log(`Generating release notes for ${TAG_NAME} (commits since ${baseLabel})...`);

const model = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5';

const client = new Anthropic();

const response = await client.messages.create({
  model,
  max_tokens: 1024,
  messages: [
    {
      role: 'user',
      content: `You are writing release notes for a GitHub Release of a RuneScape 3 Evil Trees tracker web app called Ectotrees.

Below are the code changes and commit messages for this release (${TAG_NAME}, since ${baseLabel}).

Use the **diff as the primary source of truth** for what actually changed. Use the **commit messages as context** — they provide feature names, intent, and domain terminology that may not be obvious from the code alone.${diffTruncated ? '\n\nNote: The diff was truncated due to size. Base your notes on what is shown.' : ''}

## Commit messages

${commitLog}

## Diff

\`\`\`diff
${diff}
\`\`\`

Write concise, user-friendly GitHub release notes in GitHub Flavored Markdown. Use these rules:
- Start with a short 1–2 sentence summary of what this release is about (no heading for the summary).
- Then use the following H2 sections, but **only include a section if there are relevant changes**:
  - ## What's New
  - ## Bug Fixes
  - ## Internal
- Use bullet points under each section. Keep each bullet to one line.
- "Internal" is for refactors, code cleanup, build changes, and developer tooling — omit if there are none or if it would just duplicate the other sections.
- Do not include the version number as a heading — GitHub already shows it.
- Do not include a "Full Changelog" link — GitHub adds that automatically.`,
    },
  ],
});

const notes = response.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('');

writeFileSync('.release-notes.md', notes);
console.log('Release notes written to .release-notes.md');
console.log('---');
console.log(notes);
