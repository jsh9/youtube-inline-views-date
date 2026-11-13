const test = require('node:test');
const assert = require('node:assert/strict');
const { createPage, navigate, playerResponse, setPlayerResponse } = require('./helpers');

const SCRIPTS = ['page-data.js'];
const HTML = '<ytd-watch-flexy></ytd-watch-flexy><div id="movie_player"></div>';

function setup(t, options = {}) {
  return createPage(t, { html: HTML, scripts: SCRIPTS, ...options });
}

function published(page) {
  const raw = page.document.documentElement.getAttribute(page.bridge.publishAttr);
  return raw ? JSON.parse(raw) : null;
}

function request(page) {
  page.document.dispatchEvent(new page.window.CustomEvent(page.bridge.requestEvent));
}

test('publishes the current video\'s publishDate from the player', (t) => {
  const page = setup(t, { response: playerResponse('abc', { publishDate: '2026-11-13T02:15:03-08:00' }) });
  assert.deepEqual(published(page), { videoId: 'abc', date: '2026-11-13T02:15:03-08:00' });
});

test('prefers the live broadcast start time for streams and premieres', (t) => {
  const page = setup(t, {
    response: playerResponse('abc', {
      publishDate: '2026-11-10T08:00:00-08:00',
      liveBroadcastDetails: { startTimestamp: '2026-11-20T18:00:00+00:00' }
    })
  });
  assert.equal(published(page).date, '2026-11-20T18:00:00+00:00');
});

test('falls back to uploadDate', (t) => {
  const page = setup(t, { response: playerResponse('abc', { uploadDate: '2026-11-06' }) });
  assert.equal(published(page).date, '2026-11-06');
});

test('ignores player data that belongs to another video', (t) => {
  const page = setup(t, { response: playerResponse('previous', { publishDate: '2026-11-06' }) });
  assert.equal(published(page), null);
});

test('clears a stale date after navigating to a video without data', (t) => {
  const page = setup(t, { response: playerResponse('abc', { publishDate: '2026-11-06' }) });
  assert.equal(published(page).videoId, 'abc');
  navigate(page, '/watch?v=xyz');
  assert.equal(published(page), null);
});

test('reads the player response carried by yt-navigate-finish', (t) => {
  const page = setup(t);
  navigate(page, '/watch?v=xyz', {
    response: { playerResponse: playerResponse('xyz', { publishDate: '2026-11-07' }) }
  });
  assert.deepEqual(published(page), { videoId: 'xyz', date: '2026-11-07' });
});

test('reads ytd-watch-flexy playerData', (t) => {
  const page = setup(t);
  page.document.querySelector('ytd-watch-flexy').playerData = playerResponse('abc', { publishDate: '2026-11-08' });
  request(page);
  assert.equal(published(page).date, '2026-11-08');
});

test('reads ytInitialPlayerResponse and survives a throwing player API', (t) => {
  const page = setup(t, { response: () => { throw new Error('player not ready'); } });
  page.window.ytInitialPlayerResponse = playerResponse('abc', { publishDate: '2026-11-09' });
  request(page);
  assert.equal(published(page).date, '2026-11-09');
});

test('publishes nothing outside watch pages', (t) => {
  const page = setup(t, { url: 'https://www.youtube.com/?v=abc', response: playerResponse('abc', { publishDate: '2026-11-06' }) });
  assert.equal(published(page), null);
});

test('answers a request synchronously and signals only real changes', (t) => {
  const page = setup(t);
  let changes = 0;
  page.document.addEventListener(page.bridge.changedEvent, () => changes++);

  request(page);
  assert.equal(changes, 0, 'no data yet, nothing changed');

  setPlayerResponse(page.dom, playerResponse('abc', { publishDate: '2026-11-06' }));
  request(page);
  assert.equal(published(page).date, '2026-11-06', 'available right after dispatchEvent returns');
  assert.equal(changes, 1);

  request(page);
  assert.equal(changes, 1, 'same value is not re-announced');
});
