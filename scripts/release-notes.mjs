/**
 * Prints one version's section of CHANGELOG.md — the release notes the
 * Release workflow publishes.
 *
 *   node scripts/release-notes.mjs 2.0.0
 *
 * Exits non-zero if the changelog has no section for that version, so a tag
 * cannot be released without notes.
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## [') || /^\[[^\]]+\]: /.test(line));
console.log(
  rest
    .slice(0, end === -1 ? undefined : end)
    .join('\n')
    .trim(),
);
