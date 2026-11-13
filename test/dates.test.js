const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDates } = require('./helpers');

const { toIsoDate, trim } = loadDates();

function expectDates(cases) {
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(toIsoDate(input), expected, `toIsoDate(${JSON.stringify(input)})`);
  }
}

test('parses the date formats YouTube shows in tooltips and descriptions', () => {
  expectDates({
    'Nov 6, 2026': '2026-11-06',
    'November 6 2026': '2026-11-06',
    'dec 25, 2026': '2026-12-25',
    '125,000 views  Nov 6, 2026': '2026-11-06',
    'Premiered Nov 6, 2026': '2026-11-06',
    'Streamed live on 6 Nov 2026': '2026-11-06',
    '6 November 2026': '2026-11-06',
    '2026-11-06': '2026-11-06',
    '2026/11/06': '2026-11-06',
    '2026.11.6': '2026-11-06'
  });
});

test('returns an empty string when there is no exact date', () => {
  for (const input of ['3 hours ago', 'Streamed 2 hours ago', '1,234,567 views', 'Nov 2026', '', '   ', null, undefined]) {
    assert.equal(toIsoDate(input), '', `toIsoDate(${JSON.stringify(input)})`);
  }
});

test('rejects impossible or out-of-range dates', () => {
  for (const input of ['2026-02-30', 'Feb 29, 2027', '2026-13-01', '2026-00-10', '1969-12-31']) {
    assert.equal(toIsoDate(input), '', `toIsoDate(${JSON.stringify(input)})`);
  }
  assert.equal(toIsoDate('Feb 29, 2028'), '2028-02-29');
});

test('converts full timestamps to the Pacific date YouTube uses', () => {
  expectDates({
    '2026-11-13T02:15:03-08:00': '2026-11-13', // PST offset kept as-is
    '2026-11-13T23:30:00-08:00': '2026-11-13',
    '2026-07-01T23:30:00-07:00': '2026-07-01', // PDT
    '2026-11-20T06:00:00+00:00': '2026-11-19', // 22:00 PST the day before
    '2026-07-01T06:30:00Z': '2026-06-30', // 23:30 PDT the day before
    '2026-11-14T09:00:00+09:00': '2026-11-13' // Tokyo morning = Pacific afternoon
  });
});

test('timestamp conversion does not depend on the viewer time zone', (t) => {
  const original = process.env.TZ;
  t.after(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  for (const zone of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    process.env.TZ = zone;
    assert.equal(toIsoDate('2026-11-13T23:30:00-08:00'), '2026-11-13', zone);
    assert.equal(toIsoDate('2026-11-20T06:00:00+00:00'), '2026-11-19', zone);
  }
});

test('trim collapses whitespace and tolerates missing values', () => {
  assert.equal(trim('  125K\n views \t'), '125K views');
  assert.equal(trim(null), '');
  assert.equal(trim(undefined), '');
});
