/* Fails if the version in js/version.js, sw.js and the manifest disagree —
   a mismatch means installed copies would not pick the update up. */
import fs from 'node:fs';

const v = /const APP_VERSION = '([^']+)'/.exec(fs.readFileSync('js/version.js', 'utf8'))[1];
const sw = /const BUILD_STAMP = '([^']+)'/.exec(fs.readFileSync('sw.js', 'utf8'))[1];
const mf = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8')).version;

if (v !== sw || v !== mf) {
  console.error(`version mismatch: js/version.js=${v} sw.js=${sw} manifest=${mf}`);
  console.error('run: node tools/bump-version.mjs <version>');
  process.exit(1);
}
console.log('version ok: ' + v);
