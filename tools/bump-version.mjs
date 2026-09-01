/* Bumps the app version everywhere it is written down.
   Usage:  node tools/bump-version.mjs 1.1.0
           node tools/bump-version.mjs patch|minor|major                */
import fs from 'node:fs';

const cur = /const APP_VERSION = '([^']+)'/.exec(fs.readFileSync('js/version.js', 'utf8'))[1];
const arg = process.argv[2];
if (!arg) { console.log('current version: ' + cur); process.exit(0); }

let next = arg;
if (['patch', 'minor', 'major'].includes(arg)) {
  const [a, b, c] = cur.split('.').map(Number);
  next = arg === 'major' ? `${a + 1}.0.0` : arg === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
if (!/^\d+\.\d+\.\d+$/.test(next)) { console.error('not a version: ' + next); process.exit(1); }

const edits = [
  ['js/version.js', /const APP_VERSION = '[^']+'/, `const APP_VERSION = '${next}'`],
  ['sw.js', /const BUILD_STAMP = '[^']+'/, `const BUILD_STAMP = '${next}'`],
  ['manifest.webmanifest', /"version": "[^"]+"/, `"version": "${next}"`],
  ['README.md', /Current version: \*\*v[^*]+\*\*/, `Current version: **v${next}**`]
];
for (const [file, re, to] of edits) {
  const src = fs.readFileSync(file, 'utf8');
  if (!re.test(src)) { console.error('pattern not found in ' + file); process.exit(1); }
  fs.writeFileSync(file, src.replace(re, to));
  console.log('updated ' + file);
}
console.log(`\n${cur} -> ${next}. Commit, push, and the service worker will offer the update on next launch.`);
