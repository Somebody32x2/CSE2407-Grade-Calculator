/**
 * Packs js/scrape.js into js/bookmarklet.js as a single template string the
 * app fills in with the user's origin and token.
 *
 * Run: node tools/build-bookmarklet.js
 *
 * The bookmarklet is self-contained rather than a loader that injects a
 * <script> tag, because Canvas sets a Content-Security-Policy on some installs
 * and a script-src directive would block the loader outright.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/scrape.js'), 'utf8');

/**
 * Strip comments and slack. Deliberately conservative: this is not a real
 * minifier, so it only removes things that cannot change behaviour.
 */
function squeeze(code) {
  return code
    // block comments, but not inside a string: scrape.js has none, so this is safe
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // line comments only when the line has nothing but a comment on it
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const body = squeeze(source)
  // the IIFE ends by reading a global; the bookmarklet passes config directly
  .replace(
    /\}\)\(window\.__CSE2407_SYNC__ \|\| \{ origin: '[^']*', token: '' \}\);?\s*$/,
    '})({origin:__ORIGIN__,token:__TOKEN__});',
  );

if (body.indexOf('__ORIGIN__') === -1) {
  throw new Error('build-bookmarklet: could not rewrite the config call in js/scrape.js');
}

const out = `/**
 * GENERATED FILE -- do not edit.
 * Built from js/scrape.js by tools/build-bookmarklet.js.
 */
const BOOKMARKLET_SOURCE = ${JSON.stringify(body)};

/** Build the javascript: URL for a given calculator origin and sync token. */
function buildBookmarklet(origin, token) {
  const body = BOOKMARKLET_SOURCE
    .replace('__ORIGIN__', JSON.stringify(String(origin)))
    .replace('__TOKEN__', JSON.stringify(String(token || '')));
  return 'javascript:' + encodeURIComponent(body);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BOOKMARKLET_SOURCE, buildBookmarklet };
}
`;

fs.writeFileSync(path.join(root, 'js/bookmarklet.js'), out);

const bytes = Buffer.byteLength(encodeURIComponent(body), 'utf8') + 11;
process.stdout.write(`js/bookmarklet.js written — ${bytes} bytes as a javascript: URL\n`);
if (bytes > 60000) {
  process.stdout.write('WARNING: some browsers cap bookmarklet URLs around 64 KB\n');
}
