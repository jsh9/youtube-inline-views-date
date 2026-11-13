// Pure date parsing used by content.js (the manifest loads this file before it).
// Kept free of DOM access so it can be unit tested on its own. Exposed explicitly on
// globalThis so content.js can use it.
globalThis.ytInlineStatsDates = (() => {
  'use strict';

  // YouTube dates its videos in Pacific Time (publishDate carries a -08:00/-07:00
  // offset, and date-only values are Pacific dates), so timestamps are shown in
  // that zone too. This keeps every source consistent with YouTube's own date.
  const youtubeDateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const months = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const MONTH = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const MONTH_DAY_YEAR = new RegExp(`\\b(${MONTH})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i');
  const DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH})\\s+(\\d{4})\\b`, 'i');

  const trim = (value) => (value || '').replace(/\s+/g, ' ').trim();

  function verifiedDate(year, month, day) {
    if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      return '';
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Returns the date as YYYY-MM-DD, or '' when the text has no reliable exact date.
  function toIsoDate(source) {
    const text = trim(source);
    if (!text) return '';

    // Full timestamps, e.g. 2026-11-13T02:15:03-08:00 or 2026-11-20T18:00:00+00:00.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) {
        const parts = Object.fromEntries(
          youtubeDateFormat.formatToParts(date).map(({ type, value }) => [type, value])
        );
        return verifiedDate(Number(parts.year), Number(parts.month), Number(parts.day));
      }
    }

    // e.g. 2026-11-06, 2026/11/06 or 2026.11.6
    let match = text.match(/(?:^|\D)(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/);
    if (match) {
      return verifiedDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    // YouTube's description tooltip commonly says "Nov 6, 2026".
    match = text.match(MONTH_DAY_YEAR);
    if (match) {
      return verifiedDate(Number(match[3]), months[match[1].slice(0, 3).toLowerCase()], Number(match[2]));
    }

    // Other English date formats: "6 Nov 2026".
    match = text.match(DAY_MONTH_YEAR);
    if (match) {
      return verifiedDate(Number(match[3]), months[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
    }
    return '';
  }

  return Object.freeze({ trim, toIsoDate });
})();
