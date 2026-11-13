(() => {
  'use strict';

  const SLOT_ID = 'yt-inline-stats-extension';
  // The same names are defined in page-data.js. They can't live in a shared file: Chrome
  // runs a file listed in both the MAIN and isolated manifest entries in only one world.
  // test/content.test.js fails if the two copies disagree.
  const bridge = {
    publishAttr: 'data-yt-inline-stats-publish',
    requestEvent: 'yt-inline-stats:request-publish-date',
    changedEvent: 'yt-inline-stats:publish-date-changed',
    currentVideoId: () => (location.pathname === '/watch'
      ? new URLSearchParams(location.search).get('v')
      : null)
  };
  const { trim, toIsoDate } = globalThis.ytInlineStatsDates; // From dates.js.
  const initialVideoId = bridge.currentVideoId();
  let watchedMetadata = null;
  let metadataObserver = null;
  let queued = false;

  function getRelativeStats(metadata) {
    const info = metadata.querySelector('ytd-watch-info-text yt-formatted-string#info');
    if (!info) return null;

    const values = [...info.querySelectorAll(':scope > span')]
      .map((span) => trim(span.textContent))
      .filter(Boolean);

    if (values.length >= 2) {
      return { views: values[0], relativeDate: values[1] };
    }

    const watchInfo = metadata.querySelector('ytd-watch-info-text');
    const views = watchInfo?.querySelector('#view-count')?.getAttribute('aria-label');
    const relativeDate = watchInfo?.querySelector('#date-text')?.getAttribute('aria-label');
    return views && relativeDate ? { views: trim(views), relativeDate: trim(relativeDate) } : null;
  }

  function readPageDataDate(videoId) {
    const raw = document.documentElement.getAttribute(bridge.publishAttr);
    if (!raw) return '';
    try {
      const data = JSON.parse(raw);
      return data.videoId === videoId ? toIsoDate(data.date) : '';
    } catch {
      return '';
    }
  }

  // Publish date from YouTube's player data, provided by page-data.js (MAIN world).
  // This is the only source with an exact date for videos uploaded in the last day,
  // where every visible/tooltip date just says "N hours ago".
  function getPageDataDate(videoId) {
    if (!videoId) return '';
    // A video's date never changes, so only ask page-data.js when we don't have it yet.
    const cached = readPageDataDate(videoId);
    if (cached) return cached;
    document.dispatchEvent(new CustomEvent(bridge.requestEvent)); // Handled synchronously.
    return readPageDataDate(videoId);
  }

  function getAbsoluteDate(metadata) {
    // The hidden tooltip usually has the exact date even when the visible UI says "3 days ago".
    const watchInfo = metadata.querySelector('ytd-watch-info-text');
    if (watchInfo) {
      const nodes = [
        watchInfo.querySelector('tp-yt-paper-tooltip #tooltip'),
        watchInfo.querySelector('tp-yt-paper-tooltip'),
        watchInfo.querySelector('#date-text'),
        watchInfo.querySelector('yt-formatted-string#info')
      ];
      for (const node of nodes) {
        if (!node) continue;
        for (const candidate of [node.textContent, node.getAttribute('title'), node.getAttribute('aria-label')]) {
          const date = toIsoDate(candidate);
          if (date) return date;
        }
      }
    }

    const videoId = bridge.currentVideoId();
    const pageDataDate = getPageDataDate(videoId);
    if (pageDataDate) return pageDataDate;

    // Head metadata may remain stale after YouTube's in-page navigation.
    // Only trust it for the video loaded when this content script first started.
    if (videoId && videoId === initialVideoId) {
      for (const selector of [
        'meta[itemprop="datePublished"]',
        'meta[itemprop="uploadDate"]',
        'meta[property="video:release_date"]'
      ]) {
        const date = toIsoDate(document.querySelector(selector)?.getAttribute('content'));
        if (date) return date;
      }
    }
    return '';
  }

  function render() {
    if (location.pathname !== '/watch') {
      document.getElementById(SLOT_ID)?.remove();
      return;
    }
    const metadata = document.querySelector('ytd-watch-metadata');
    if (!metadata) return;

    const owner = metadata.querySelector('#owner');
    const stats = getRelativeStats(metadata);
    if (!owner || !stats) return;

    const absoluteDate = getAbsoluteDate(metadata);
    const label = `${stats.views} · ${stats.relativeDate}${absoluteDate ? ` (${absoluteDate})` : ''}`;

    let slot = metadata.querySelector(`#${SLOT_ID}`);
    if (slot && slot.parentElement !== owner) {
      slot.remove();
      slot = null;
    }
    if (!slot) {
      slot = document.createElement('span');
      slot.id = SLOT_ID;
      slot.setAttribute('aria-label', 'Video views and publication date');
      owner.appendChild(slot); // AFTER the Subscribe / bell / Join buttons.
    } else if (owner.lastElementChild !== slot) {
      owner.appendChild(slot); // Keep it at the far right after YouTube rearranges buttons.
    }
    if (slot.textContent !== label) slot.textContent = label;
    if (slot.title !== label) slot.title = label; // Hover to see the full text.
  }

  function connectMetadataObserver() {
    const metadata = location.pathname === '/watch'
      ? document.querySelector('ytd-watch-metadata')
      : null;
    if (metadata === watchedMetadata) return;
    metadataObserver?.disconnect();
    watchedMetadata = metadata;
    if (metadata) {
      metadataObserver = new MutationObserver(scheduleUpdate);
      metadataObserver.observe(metadata, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title']
      });
    }
  }

  function update() {
    connectMetadataObserver();
    render();
  }

  function scheduleUpdate() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      update();
    }, 100);
  }

  function resetAndRefresh() {
    document.getElementById(SLOT_ID)?.remove();
    for (const delay of [0, 250, 700, 1500, 3000, 5000]) {
      setTimeout(update, delay);
    }
  }

  document.addEventListener('yt-navigate-start', () => {
    document.getElementById(SLOT_ID)?.remove();
  });
  document.addEventListener('yt-navigate-finish', resetAndRefresh);
  document.addEventListener('yt-page-data-updated', scheduleUpdate);
  document.addEventListener(bridge.changedEvent, scheduleUpdate);
  window.addEventListener('popstate', resetAndRefresh);
  resetAndRefresh();
})();
