(() => {
  'use strict';

  const SLOT_ID = 'yt-inline-stats-extension';
  const initialVideoId = new URLSearchParams(location.search).get('v');
  let watchedMetadata = null;
  let metadataObserver = null;
  let queued = false;

  const trim = (value) => (value || '').replace(/\s+/g, ' ').trim();

  function getRelativeStats(metadata) {
    // Keep the same source as v0.1.0, which works on the user's YouTube layout.
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

  function toIsoDate(source) {
    const text = trim(source);
    if (!text) return '';

    // e.g. 2026-11-06, 2026-11-06T12:34:56Z, or 2026年11月6日
    let match = text.match(/(?:^|\D)(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})(?:日|(?!\d))/);
    if (match) {
      return verifiedDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    // YouTube's description tooltip commonly says "Nov 6, 2026".
    const months = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (match) {
      return verifiedDate(Number(match[3]), months[match[1].slice(0, 3).toLowerCase()], Number(match[2]));
    }

    // Other English date formats: "6 Nov 2026".
    match = text.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i);
    if (match) {
      return verifiedDate(Number(match[3]), months[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
    }
    return '';
  }

  function verifiedDate(year, month, day) {
    if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      return '';
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

    // Head metadata may remain stale after YouTube's in-page navigation.
    // Only trust it for the video loaded when this content script first started.
    const currentVideoId = new URLSearchParams(location.search).get('v');
    if (currentVideoId && currentVideoId === initialVideoId) {
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
  window.addEventListener('popstate', resetAndRefresh);
  resetAndRefresh();
})();
