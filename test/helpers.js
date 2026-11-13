const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SLOT_ID = 'yt-inline-stats-extension';

const readSource = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs each extension file in its own function scope inside the shared global. Like
// Chrome's content scripts, files can then only share what they put on globalThis;
// a top-level const in one file is invisible to the next.
function runScripts(context, files) {
  for (const file of files) {
    vm.compileFunction(readSource(file), [], { parsingContext: context, filename: file })();
  }
}

// The names page-data.js and content.js use to talk to each other. Each script has
// its own copy; tests use this third copy, so a rename on either side fails a test.
const BRIDGE = Object.freeze({
  publishAttr: 'data-yt-inline-stats-publish',
  requestEvent: 'yt-inline-stats:request-publish-date',
  changedEvent: 'yt-inline-stats:publish-date-changed'
});

// The content script files in manifest order (MAIN world entry first). Chrome keeps
// the two worlds separate; in tests they share one window.
function manifestScripts() {
  const manifest = JSON.parse(readSource('manifest.json'));
  const entries = [...manifest.content_scripts].sort((a, b) => (b.world === 'MAIN') - (a.world === 'MAIN'));
  return entries.flatMap((entry) => entry.js);
}

function loadDates() {
  const context = vm.createContext({});
  runScripts(context, ['dates.js']);
  return vm.runInContext('ytInlineStatsDates', context);
}

// A minimal stand-in for a YouTube watch page's metadata area.
function watchPageHtml({
  views = '125K views',
  relative = '3 days ago',
  tooltip = '125,000 views  Nov 6, 2026'
} = {}) {
  return `
    <ytd-watch-flexy>
      <ytd-watch-metadata>
        <div id="owner">
          <ytd-video-owner-renderer>Channel</ytd-video-owner-renderer>
          <div id="subscribe-button"><button>Subscribe</button></div>
        </div>
        <ytd-watch-info-text>
          <yt-formatted-string id="info"><span>${views}</span><span> </span><span>${relative}</span></yt-formatted-string>
          <tp-yt-paper-tooltip><div id="tooltip">${tooltip}</div></tp-yt-paper-tooltip>
        </ytd-watch-info-text>
      </ytd-watch-metadata>
    </ytd-watch-flexy>
    <div id="movie_player"></div>`;
}

function playerResponse(videoId, microformat) {
  return { videoDetails: { videoId }, microformat: { playerMicroformatRenderer: microformat } };
}

// Creates a jsdom page and injects extension scripts into it (by default, exactly the
// files the manifest lists).
function createPage(t, {
  url = 'https://www.youtube.com/watch?v=abc',
  head = '',
  html = watchPageHtml(),
  response,
  scripts = manifestScripts()
} = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${html}</body></html>`, {
    url,
    runScripts: 'outside-only'
  });
  t.after(() => dom.window.close()); // Also clears content.js's pending timers.
  if (response) setPlayerResponse(dom, response);
  runScripts(dom.getInternalVMContext(), scripts);
  return { dom, window: dom.window, document: dom.window.document, bridge: BRIDGE };
}

function setPlayerResponse(dom, response) {
  const player = dom.window.document.getElementById('movie_player');
  player.getPlayerResponse = typeof response === 'function' ? response : () => response;
}

function navigate(page, url, detail) {
  const { window, document } = page;
  document.dispatchEvent(new window.CustomEvent('yt-navigate-start'));
  window.history.pushState({}, '', url);
  document.dispatchEvent(new window.CustomEvent('yt-navigate-finish', { detail }));
}

const labelOf = (page) => page.document.getElementById(SLOT_ID)?.textContent ?? null;

async function waitFor(check, description, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await sleep(10);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

// Waits for the label to equal `expected`, then checks it stays that way past
// content.js's 100 ms update debounce (so a late, wrong date would be caught).
async function expectLabel(page, expected) {
  const start = Date.now();
  while (labelOf(page) !== expected && Date.now() - start < 2000) await sleep(10);
  assert.equal(labelOf(page), expected);
  await sleep(250);
  assert.equal(labelOf(page), expected);
}

module.exports = {
  SLOT_ID,
  createPage,
  expectLabel,
  labelOf,
  loadDates,
  navigate,
  playerResponse,
  readSource,
  setPlayerResponse,
  waitFor,
  watchPageHtml
};
