// Runs in the page's MAIN world so it can read YouTube's player data, which the
// isolated content script cannot see. It exposes only { videoId, date } through
// a DOM attribute that content.js reads.
(() => {
  'use strict';

  // The same names are defined in content.js. They can't live in a shared file: Chrome
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
  let navigationPlayerResponse = null;

  function candidateResponses() {
    const responses = [];
    try {
      responses.push(document.getElementById('movie_player')?.getPlayerResponse?.());
    } catch {
      // Ignore player API errors; other sources may still work.
    }
    responses.push(navigationPlayerResponse);
    const flexy = document.querySelector('ytd-watch-flexy');
    responses.push(flexy?.playerData, flexy?.__data?.playerData);
    responses.push(window.ytInitialPlayerResponse); // Only valid for the first loaded video.
    return responses;
  }

  function findPublishDate() {
    const videoId = bridge.currentVideoId();
    if (!videoId) return null;
    for (const response of candidateResponses()) {
      // Never trust data belonging to a different (e.g. previous) video.
      if (response?.videoDetails?.videoId !== videoId) continue;
      const micro = response.microformat?.playerMicroformatRenderer;
      // Streams and premieres are labelled by their start time ("Streamed live on…",
      // "Premiered…", "Scheduled for…"), which can differ from when they were created.
      const date = micro?.liveBroadcastDetails?.startTimestamp || micro?.publishDate || micro?.uploadDate;
      if (typeof date === 'string' && date) return { videoId, date };
    }
    return null;
  }

  function publish() {
    const info = findPublishDate();
    const value = info ? JSON.stringify(info) : '';
    const root = document.documentElement;
    if ((root.getAttribute(bridge.publishAttr) || '') === value) return;
    if (value) root.setAttribute(bridge.publishAttr, value);
    else root.removeAttribute(bridge.publishAttr);
    document.dispatchEvent(new CustomEvent(bridge.changedEvent));
  }

  document.addEventListener(bridge.requestEvent, publish);
  document.addEventListener('yt-navigate-finish', (event) => {
    navigationPlayerResponse = event.detail?.response?.playerResponse ?? null;
    publish();
  });
  document.addEventListener('yt-player-updated', publish);
  document.addEventListener('yt-page-data-updated', publish);
  publish();
})();
