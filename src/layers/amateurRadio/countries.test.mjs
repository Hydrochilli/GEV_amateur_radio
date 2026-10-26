import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countryDistanceKm,
  resolveBrandmeisterLocation,
  talkgroupCountry,
} from '../../sources/brandmeisterCountries.js';
import { chooseLatestTalkgroup } from '../../sources/brandmeisterActivity.js';

test('marker geography resolves countries worldwide, including UK constituent boundaries and the date line', async () => {
  for (const [lat, lon, code] of [
    [51.5, -0.12, 'GB'],
    [55.95, -3.19, 'GB'],
    [48.8566, 2.3522, 'FR'],
    [-33.87, 151.21, 'AU'],
    [40.71, -74.01, 'US'],
    [35.68, 139.69, 'JP'],
    [-18.14, 178.44, 'FJ'],
    [64.5, -165.4, 'US'],
  ]) {
    const proximity = await resolveBrandmeisterLocation({ lat, lon });
    assert.equal(proximity.nearest.code, code, `${lat}, ${lon}`);
  }
  const west = await resolveBrandmeisterLocation({ lat: 52, lon: -180 });
  const east = await resolveBrandmeisterLocation({ lat: 52, lon: 180 });
  assert.equal(west.nearest.code, east.nearest.code);
  assert.ok(Math.abs(west.nearest.distanceKm - east.nearest.distanceKm) < 1e-6);
  await assert.rejects(
    resolveBrandmeisterLocation({ lat: 91, lon: 0 }),
    /invalid/,
  );
  await assert.rejects(
    resolveBrandmeisterLocation({ lat: 0, lon: NaN }),
    /invalid/,
  );
});

test('proximity uses containment and nearest boundary segments, respecting holes and longitude wrapping', () => {
  const country = {
    polygons: [
      [
        [
          [-5, 0],
          [5, 0],
          [5, 10],
          [-5, 10],
        ],
      ],
    ],
  };
  assert.equal(countryDistanceKm(country, { lat: 5, lon: 0 }), 0);
  const nearEdge = countryDistanceKm(country, { lat: -0.1, lon: 0 });
  assert.ok(nearEdge > 11 && nearEdge < 11.2, `edge distance ${nearEdge}`);
  country.polygons[0].push([
    [-1, 4],
    [1, 4],
    [1, 6],
    [-1, 6],
  ]);
  assert.ok(countryDistanceKm(country, { lat: 5, lon: 0 }) > 100);
  const island = {
    polygons: [
      [
        [
          [178, 0],
          [179, 0],
          [179, 2],
          [178, 2],
        ],
      ],
    ],
  };
  const acrossDateLine = countryDistanceKm(island, { lat: 1, lon: -179.9 });
  assert.ok(acrossDateLine > 120 && acrossDateLine < 124);
});

test('MCC association handles multiple national prefixes and shared codes; worldwide and unknown groups are not assigned a fictional country', async () => {
  const paris = await resolveBrandmeisterLocation({
    lat: 48.8566,
    lon: 2.3522,
  });
  assert.equal(talkgroupCountry(208, paris).code, 'FR');
  assert.equal(talkgroupCountry(20875, paris).distanceKm, 0);
  for (const tg of [2340, 2350])
    assert.equal(talkgroupCountry(tg, paris).code, 'GB');
  for (const tg of [3100, 3110, 3120, 3130, 3140, 3150, 31665])
    assert.equal(talkgroupCountry(tg, paris).code, 'US');
  for (const tg of [91, 93, 95, 913, 9999])
    assert.equal(talkgroupCountry(tg, paris), null);
  const shared = {
    countries: new Map([
      ['BQ', { code: 'BQ', distanceKm: 500 }],
      ['CW', { code: 'CW', distanceKm: 10 }],
      ['SX', { code: 'SX', distanceKm: 300 }],
    ]),
  };
  assert.equal(talkgroupCountry(3620, shared).code, 'CW');
});

test('foreign selection ranks nearest available country before recency, without relaxing active/freshness rules', () => {
  const now = Date.now();
  const row = (talkgroup, age = 1000, active = true) => ({
    talkgroup,
    name: '',
    active,
    activityAt: now - age,
    receivedAt: now,
  });
  const priorities = new Map([
    [208, { distanceKm: 0 }],
    [206, { distanceKm: 100 }],
    [2350, { distanceKm: 200 }],
    [262, { distanceKm: 300 }],
  ]);
  assert.equal(
    chooseLatestTalkgroup(
      [row(91), row(2350), row(208, 20_000)],
      now,
      priorities,
    ).talkgroup,
    208,
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(91), row(2350), row(262), row(206, 10_000)],
      now,
      priorities,
    ).talkgroup,
    206,
    'if the marker country is unavailable, use the next nearest transmitting country',
  );
  assert.equal(
    chooseLatestTalkgroup([row(208, 1000, false), row(262)], now, priorities)
      .talkgroup,
    262,
    'a transmitting group still beats a recently ended local call',
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(208, 10_000, false), row(2350, 1000, false)],
      now,
      priorities,
    ).talkgroup,
    208,
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(208, 181_000, false), row(2350)],
      now,
      priorities,
    ).talkgroup,
    2350,
  );
  assert.equal(
    chooseLatestTalkgroup([row(9999, 10_000), row(91, 1000)], now, priorities)
      .talkgroup,
    91,
    'unassigned countries fall back explicitly to newest eligible activity',
  );
  assert.equal(
    chooseLatestTalkgroup([row(208), row(2350, 20_000)], now).talkgroup,
    2350,
    'no marker retains the existing UK default',
  );
  priorities.set(20875, { distanceKm: 0 });
  assert.equal(
    chooseLatestTalkgroup([row(208, 20_000), row(20875, 1000)], now, priorities)
      .talkgroup,
    20875,
    'newest activity breaks ties in the same country',
  );
});
