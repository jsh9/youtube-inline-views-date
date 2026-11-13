const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SLOT_ID,
  createPage,
  expectLabel,
  labelOf,
  navigate,
  playerResponse,
  setPlayerResponse,
  waitFor,
  watchPageHtml
} = require('./helpers');

const RECENT = { views: '125 views', relative: '3 hours ago', tooltip: '125 views  3 hours ago' };

function setInfo(page, { views, relative, tooltip }) {
  const { document } = page;
  const spans = document.querySelectorAll('yt-formatted-string#info > span');
  spans[0].textContent = views;
  spans[2].textContent = relative;
  document.querySelector('tp-yt-paper-tooltip #tooltip').textContent = tooltip;
}

test('shows views, relative time and exact date after the Subscribe controls', async (t) => {
  const page = createPage(t);
  await expectLabel(page, '125K views · 3 days ago (2026-11-06)');

  const slot = page.document.getElementById(SLOT_ID);
  assert.equal(slot.parentElement.id, 'owner');
  assert.equal(slot.parentElement.lastElementChild, slot);
  assert.equal(slot.title, slot.textContent);
});

test('shows the exact date for a video uploaded a few hours ago', async (t) => {
  const page = createPage(t, {
    html: watchPageHtml(RECENT),
    response: playerResponse('abc', { publishDate: '2026-11-13T02:15:03-08:00' })
  });
  await expectLabel(page, '125 views · 3 hours ago (2026-11-13)');
});

test('prefers the date YouTube displays over player data', async (t) => {
  const page = createPage(t, { response: playerResponse('abc', { publishDate: '2026-11-07' }) });
  await expectLabel(page, '125K views · 3 days ago (2026-11-06)');
});

test('omits the date rather than guessing when none is available', async (t) => {
  const page = createPage(t, { html: watchPageHtml(RECENT) });
  await expectLabel(page, '125 views · 3 hours ago');
});

test('ignores player data for a different video', async (t) => {
  const page = createPage(t, {
    html: watchPageHtml(RECENT),
    response: playerResponse('previous', { publishDate: '2026-11-06' })
  });
  await expectLabel(page, '125 views · 3 hours ago');
});

test('adds the date when player data arrives after the first render', async (t) => {
  const page = createPage(t, { html: watchPageHtml(RECENT) });
  await expectLabel(page, '125 views · 3 hours ago');

  setPlayerResponse(page.dom, playerResponse('abc', { publishDate: '2026-11-13' }));
  page.document.dispatchEvent(new page.window.CustomEvent('yt-player-updated'));
  await expectLabel(page, '125 views · 3 hours ago (2026-11-13)');
});

test('uses <head> metadata for the video the page was loaded with', async (t) => {
  const page = createPage(t, {
    head: '<meta itemprop="datePublished" content="2026-11-13T02:15:03-08:00">',
    html: watchPageHtml(RECENT)
  });
  await expectLabel(page, '125 views · 3 hours ago (2026-11-13)');
});

test('does not reuse stale <head> metadata after in-page navigation', async (t) => {
  const page = createPage(t, {
    head: '<meta itemprop="datePublished" content="2026-11-06">',
    html: watchPageHtml(RECENT)
  });
  await expectLabel(page, '125 views · 3 hours ago (2026-11-06)');

  setInfo(page, { views: '9 views', relative: '1 hour ago', tooltip: '9 views  1 hour ago' });
  navigate(page, '/watch?v=xyz');
  await expectLabel(page, '9 views · 1 hour ago');
});

test('updates the date after in-page navigation to a recent video', async (t) => {
  const page = createPage(t);
  await expectLabel(page, '125K views · 3 days ago (2026-11-06)');

  setInfo(page, { views: '9 views', relative: '1 hour ago', tooltip: '9 views  1 hour ago' });
  navigate(page, '/watch?v=xyz', {
    response: { playerResponse: playerResponse('xyz', { publishDate: '2026-11-13T07:00:00-08:00' }) }
  });
  await expectLabel(page, '9 views · 1 hour ago (2026-11-13)');
});

test('keeps the label last when YouTube adds more channel controls', async (t) => {
  const page = createPage(t);
  await expectLabel(page, '125K views · 3 days ago (2026-11-06)');

  const owner = page.document.getElementById('owner');
  const join = page.document.createElement('div');
  join.id = 'sponsor-button';
  owner.appendChild(join);
  await waitFor(() => owner.lastElementChild.id === SLOT_ID, 'the label to move after the Join button');
});

test('removes the label when leaving the watch page', async (t) => {
  const page = createPage(t);
  await expectLabel(page, '125K views · 3 days ago (2026-11-06)');

  navigate(page, '/');
  await waitFor(() => labelOf(page) === null, 'the label to be removed');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(labelOf(page), null);
});

test('falls back to aria-labels when the info line has no spans', async (t) => {
  const page = createPage(t, {
    html: `
      <ytd-watch-metadata>
        <div id="owner"><div id="subscribe-button"></div></div>
        <ytd-watch-info-text>
          <yt-formatted-string id="info"></yt-formatted-string>
          <div id="view-count" aria-label="125,000 views"></div>
          <div id="date-text" aria-label="Nov 6, 2026"></div>
        </ytd-watch-info-text>
      </ytd-watch-metadata>`
  });
  await expectLabel(page, '125,000 views · Nov 6, 2026 (2026-11-06)');
});
