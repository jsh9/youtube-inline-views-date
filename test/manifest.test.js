const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readSource } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(readSource('manifest.json'));
const entries = manifest.content_scripts;
const entryWith = (file) => entries.find((entry) => entry.js.includes(file));

test('every file the manifest references exists', () => {
  const files = [
    ...entries.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
    ...Object.values(manifest.icons)
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
  }
});

test('no script is listed in more than one content script entry', () => {
  // Chrome runs such a file in only one of the entries' worlds, so the other
  // entry's scripts would silently miss it.
  const files = entries.flatMap((entry) => entry.js);
  assert.deepEqual(files, [...new Set(files)]);
});

test('page-data.js runs in the MAIN world and content.js in the isolated world', () => {
  assert.equal(entryWith('page-data.js').world, 'MAIN');
  assert.ok([undefined, 'ISOLATED'].includes(entryWith('content.js').world));
  assert.ok(Number(manifest.minimum_chrome_version) >= 111, 'MAIN world content scripts need Chrome 111+');
});

test('dates.js loads before content.js', () => {
  const { js } = entryWith('content.js');
  assert.ok(js.indexOf('dates.js') !== -1 && js.indexOf('dates.js') < js.indexOf('content.js'));
});

test('package.json version matches the extension version', () => {
  assert.equal(JSON.parse(readSource('package.json')).version, manifest.version);
});

test('content scripts only run on YouTube', () => {
  for (const entry of entries) assert.deepEqual(entry.matches, ['https://www.youtube.com/*']);
});
