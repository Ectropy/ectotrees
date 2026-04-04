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

let diff = execSync(`git diff ${range}`, { encoding: 'utf8' });

console.log(`Generating release notes for ${TAG_NAME} (commits since ${baseLabel})...`);

const model = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5';

// Cap at 200k token context window. (Some models like Opus support more, but we're being conservative.)
// Reserve 1k for output and ~1k for prompt overhead.
const TOKEN_LIMIT = 198_000;

const client = new Anthropic();

const buildMessages = (diffContent, truncated) => [
  {
    role: 'user',
    content: `You are writing release notes for a GitHub Release of **Ectotrees**, a RuneScape 3 web app for tracking Evil Trees — a cooperative Distraction & Diversion where players across all worlds hunt tree spawns for XP and rewards. The app shows a live dashboard of all RuneScape worlds, lets users record tree spawns and health, and supports multi-user sessions so groups can coordinate in real time. There is also an Alt1 Toolkit plugin that lets scouts submit spawn intel from inside the game client without switching windows.

Your audience is **RuneScape players**, not developers. The "Summary" and "What's New" sections should describe changes in terms of what players and scouts will notice or be able to do — avoid technical implementation details unless there is no user-facing way to describe the change. The "Bug Fixes" and "Internal" sections can include more technical details, but still try to focus on the impact to users where possible.

Below are the code changes and commit messages for this release (${TAG_NAME}, since ${baseLabel}).

Use the **diff as the primary source of truth** for what actually changed. Use the **commit messages as context** — they provide feature names, intent, and domain terminology that may not be obvious from the code alone.${truncated ? '\n\nNote: The diff was truncated to fit the model context window.' : ''}

## Commit messages

${commitLog}

## Diff

\`\`\`diff
${diffContent}
\`\`\`

Write concise, user-friendly GitHub release notes in GitHub Flavored Markdown. Use these rules:
- Start with a succinct summary of what this release is about (no heading for the summary). If available, focus on the most important user-facing changes, user-facing polish work, major bug fixes, or other improvements. If there are no user-facing changes, summarize other noteworthy changes instead.
- Then use the following H2 sections, but **only include a section if there are relevant changes**:
  - ## What's New
  - ## Bug Fixes
  - ## Internal
- Use bullet points under each section. Keep each bullet succinct — a sentence or two for most changes, or at worst a short paragraph for major changes. You can use sub-bullets if needed, but only for complex changes that are directly related to each other. Do not use sub-bullets for unrelated changes, even if they are in the same commit or diff hunk.
- If any commits reference closed issues (e.g. \`Fixes #123\`), include the issue number inline in the relevant bullet as a plain \`#123\` reference.
- "Internal" is for refactors, code cleanup, build changes, dependency updates, and developer tooling — omit if there are none or if it would just duplicate the other sections.
- Do not include the version number as a heading — GitHub already shows it.
- Do not include a "Full Changelog" link — GitHub adds that automatically.`,
  },
];

// Count tokens and truncate the diff if needed.
let messages = buildMessages(diff, false);
const { input_tokens } = await client.messages.countTokens({ model, messages });
console.log(`Prompt is ${input_tokens.toLocaleString()} tokens.`);

if (input_tokens > TOKEN_LIMIT) {
  const ratio = TOKEN_LIMIT / input_tokens;
  diff = diff.slice(0, Math.floor(diff.length * ratio));
  messages = buildMessages(diff, true);
  console.log(`Diff truncated to fit within ${TOKEN_LIMIT.toLocaleString()} token limit.`);
}

const response = await client.messages.create({
  model,
  max_tokens: 4096,
  messages,
});

const notes = response.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('');

writeFileSync('.release-notes.md', notes);
console.log('Release notes written to .release-notes.md');
console.log('---');
console.log(notes);
