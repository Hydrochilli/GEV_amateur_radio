import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TALK_GROUP_DIRECTORY,
  TALK_GROUP_DIRECTORY_REVIEWED,
  LOCAL_TALKGROUP_RADIUS_KM,
  getTalkgroupDirectoryEntry,
  resolveTalkgroupAreas,
} from '../../sources/brandmeisterTalkgroups.js';
import { chooseLatestTalkgroup } from '../../sources/brandmeisterActivity.js';
import { getAdminAreasById, packLoads } from '../../data/adminBoundaries.js';

test('city matches are lazy, inclusive at 25 km, and do not guess from unknown talkgroup names', async () => {
  assert.equal(packLoads.admin1, 0);
  const city = getTalkgroupDirectoryEntry(2358);
  const north = (km) => ({
    lat: city.center.lat + ((km / 6371) * 180) / Math.PI,
    lon: city.center.lon,
  });
  for (const [distance, expected] of [
    [0, true],
    [24.999, true],
    [25, true],
    [25.001, false],
  ]) {
    const matches = await resolveTalkgroupAreas(
      north(distance),
      [2358, 999999],
    );
    assert.equal(matches.get(2358).matched, expected, `${distance} km`);
    assert.ok(Math.abs(matches.get(2358).distanceKm - distance) < 1e-6);
    assert.equal(matches.has(999999), false);
  }
  assert.equal(packLoads.admin1, 0);
});

test('all curated entries have unique IDs, source provenance, review dates and explicit geometry rules', () => {
  assert.equal(TALK_GROUP_DIRECTORY.length, 84);
  assert.equal(new Set(TALK_GROUP_DIRECTORY.map((e) => e.talkgroup)).size, 84);
  for (const entry of TALK_GROUP_DIRECTORY) {
    assert.ok(
      Number.isSafeInteger(entry.talkgroup) &&
        entry.talkgroup > 90 &&
        entry.talkgroup <= 999999,
    );
    assert.ok(entry.name.length > 0);
    assert.match(entry.countryCode, /^(GB|US|CA|FR)$/);
    assert.equal(
      new URL(entry.source).origin,
      'https://wiki.brandmeister.network',
    );
    assert.equal(entry.reviewedAt, TALK_GROUP_DIRECTORY_REVIEWED);
    assert.match(entry.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    if (entry.scope === 'local') {
      assert.equal(entry.radiusKm, LOCAL_TALKGROUP_RADIUS_KM);
      assert.equal(entry.radiusKm, 25);
      assert.equal(
        new URL(entry.centerSource).origin,
        'https://www.wikidata.org',
      );
      assert.ok(
        Number.isFinite(entry.center.lat) && Number.isFinite(entry.center.lon),
      );
    } else {
      assert.equal(entry.scope, 'regional');
      assert.ok(entry.adminIds?.length > 0 || entry.countryArea);
    }
  }
});

test('every administrative ID resolves, including North West England unions, states and French departments', async () => {
  const ids = TALK_GROUP_DIRECTORY.map((e) => e.talkgroup);
  const cases = [
    [53.4808, -2.2426, [23520], [2358, 2355]],
    [55.9533, -3.1883, [2355, 23550], [23520, 2356]],
    [51.4816, -3.1791, [2356, 23570], [2355]],
    [54.5973, -5.9301, [2354, 23540], [2355]],
    [43.6703, -79.3867, [302051, 3023], [302061, 3022]],
    [45.5033, -73.5868, [302061, 3022], [302051, 3023]],
    [30.2672, -97.7431, [3148], [3106, 3136]],
    [34.0522, -118.2437, [3106], [3148, 3132]],
    [48.8566, 2.3522, [2081], [20857, 20813]],
    [-33.87, 151.21, [], [2358, 23520, 2081, 3148, 3023]],
  ];
  for (const [lat, lon, inside, outside] of cases) {
    const matches = await resolveTalkgroupAreas({ lat, lon }, ids);
    for (const tg of inside)
      assert.equal(
        matches.get(tg).matched,
        true,
        `TG${tg} should contain ${lat},${lon}`,
      );
    for (const tg of outside)
      assert.equal(
        matches.get(tg).matched,
        false,
        `TG${tg} must not contain ${lat},${lon}`,
      );
  }
  await assert.rejects(getAdminAreasById(['GB-NOT-AN-AREA']), /not found/);
});

test('selection prefers matching local, regional, then country without discarding freshness and transmitting-first rules', async () => {
  const now = Date.now();
  const row = (talkgroup, age = 1000, active = true) => ({
    talkgroup,
    name: '',
    active,
    activityAt: now - age,
    receivedAt: now,
  });
  const areas = await resolveTalkgroupAreas(
    getTalkgroupDirectoryEntry(302051).center,
    [302051, 302061, 3023, 3022],
  );
  const priorities = new Map(
    [302, 302051, 302061, 3023, 3022].map((tg) => [tg, { distanceKm: 0 }]),
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(302), row(3023), row(302051, 50_000)],
      now,
      priorities,
      areas,
    ).talkgroup,
    302051,
    'a local match beats newer regional/country activity',
  );
  assert.equal(
    chooseLatestTalkgroup([row(302), row(3023, 50_000)], now, priorities, areas)
      .talkgroup,
    3023,
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(302, 20_000), row(302061), row(3022)],
      now,
      priorities,
      areas,
    ).talkgroup,
    302,
    'known out-of-area groups do not masquerade as nationwide groups',
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(302051, 1000, false), row(302)],
      now,
      priorities,
      areas,
    ).talkgroup,
    302,
    'a recent local call does not beat a currently transmitting group',
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(302051, 50_000, false), row(302, 1000, false)],
      now,
      priorities,
      areas,
    ).talkgroup,
    302051,
  );
  assert.equal(
    chooseLatestTalkgroup(
      [row(302051, 181_000, false), row(302)],
      now,
      priorities,
      areas,
    ).talkgroup,
    302,
  );
  assert.equal(
    chooseLatestTalkgroup([row(2358, 10_000), row(2350)], now).talkgroup,
    2350,
    'without marker geometry, no new local priority is invented',
  );
});

test('matching UK regions override only UK fallback, not ongoing calls elsewhere', async () => {
  const now = Date.now();
  const row = (talkgroup, age = 1000) => ({
    talkgroup,
    name: '',
    active: true,
    activityAt: now - age,
    receivedAt: now,
  });
  const areas = await resolveTalkgroupAreas(
    { lat: 53.4808, lon: -2.2426 },
    [23520, 2355, 2358],
  );
  assert.equal(
    chooseLatestTalkgroup([row(2350), row(23520, 30_000)], now, null, areas)
      .talkgroup,
    23520,
  );
  assert.equal(
    chooseLatestTalkgroup([row(2358), row(2350, 30_000)], now, null, areas)
      .talkgroup,
    2350,
  );
  const nearest = new Map([
    [505, { distanceKm: 0 }],
    [23520, { distanceKm: 15_000 }],
  ]);
  const australia = await resolveTalkgroupAreas(
    { lat: -33.87, lon: 151.21 },
    [23520],
  );
  assert.equal(
    chooseLatestTalkgroup([row(505), row(23520)], now, nearest, australia)
      .talkgroup,
    505,
  );
});
