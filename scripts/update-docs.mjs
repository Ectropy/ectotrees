#!/usr/bin/env node
// scripts/update-docs.mjs
//
// Pre-release gate: shows commits since the last version tag and asks whether
// docs are up to date before allowing `npm version` to proceed.

import { execSync } from 'child_process';
import { createInterface } from 'readline';

const tags = execSync('git tag -l "v*"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const lastTag = tags.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);

let base, baseLabel;
if (lastTag) {
  base = execSync(`git rev-list -n 1 ${lastTag}`, { encoding: 'utf8' }).trim();
  baseLabel = lastTag;
} else {
  base = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
  baseLabel = 'initial commit';
}

const log = execSync(`git log ${base}..HEAD --oneline`, { encoding: 'utf8' }).trim();

console.log('\n=== Pre-release check ===\n');
console.log(`Commits since ${baseLabel}:`);
console.log(log || '(none)');
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Are your docs (README.md, CLAUDE.md) up to date? Continue with version bump? [y/N] ', (answer) => {
  rl.close();
  if (answer !== 'y' && answer !== 'Y') {
    console.error('Aborting. Update your docs first, then re-run npm version.');
    process.exit(1);
  }
});
