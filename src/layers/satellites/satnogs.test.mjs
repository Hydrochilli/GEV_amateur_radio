import test from 'node:test';
import assert from 'node:assert/strict';
import { satnogsProxy } from '../../../server/providers/space/satnogs.js';
import {
  normalizeSatnogsObservations,
  isSatnogsSnapshot,
  satnogsMediaUrl,
} from '../../sources/satnogs.js';
import { createSatelliteSource } from './source.js';
import { createObservations } from './observations.js';

const NOW = Date.UTC(2026, 9, 26, 9, 30);
const fixtureRow = (id = 15290005) => ({
  id,
  norad_cat_id: 50466,
  start: '2026-10-26T04:32:33Z',
  end: '2026-10-26T04:35:41Z',
  ground_station: 4260,
  station_name: 'Test station <script>',
  status: 'unknown',
  observation_frequency: 435725000,
  transmitter_mode: 'GMSK',
  payload: `https://network-satnogs.freetls.fastly.net/media/data_obs/2026/10/26/4/${id}/satnogs_${id}.ogg`,
  waterfall: `https://s3.eu-central-1.wasabisys.com/satnogs-network/data_obs/2026/10/26/4/${id}/waterfall.png`,
  demoddata: [{ payload: 'raw contents not retained' }],
});
const fixtureSnapshot = () => ({
  noradId: 50466,
  fetchedAt: NOW,
  stale: false,
  error: null,
  observations: normalizeSatnogsObservations([fixtureRow()], 50466, NOW),
  checkedCount: 1,
  hasMore: false,
});

function proxyHarness(options = {}, preview = false) {
  const plugin = satnogsProxy(options);
  let handler;
  assert.equal(
    plugin[preview ? 'configurePreviewServer' : 'configureServer']({
      middlewares: {
        use(path, fn) {
          assert.equal(path, '/api/satnogs');
          handler = fn;
        },
      },
    }),
    undefined,
  );
  return async (url = '/50466', method = 'GET') => {
    let status, headers, body;
    await handler(
      { url, method, socket: { remoteAddress: '127.0.0.1' } },
      {
        writeHead(code, values) {
          status = code;
          headers = values;
        },
        end(value) {
          body = JSON.parse(value);
        },
      },
    );
    return { status, headers, body };
  };
}

test('completed observations match exact NORAD, exclude future passes, and omit raw metadata/frames', () => {
  const result = normalizeSatnogsObservations(
    [
      fixtureRow(),
      { ...fixtureRow(2), end: new Date(NOW + 1000).toISOString() },
      { ...fixtureRow(3), status: 'future' },
    ],
    50466,
    NOW,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 15290005);
  assert.equal(result[0].stationId, 4260);
  assert.equal(result[0].frequencyHz, 435725000);
  assert.equal(result[0].frameCount, 1);
  assert.equal(
    result[0].status,
    'unknown',
    'media does not turn an unvetted observation into confirmed reception',
  );
  assert.equal('demoddata' in result[0], false);
  assert.equal('client_metadata' in result[0], false);
  assert.equal(
    'receivedAt' in result[0],
    false,
    'observation end is not a packet receipt timestamp',
  );
  assert.ok(isSatnogsSnapshot(fixtureSnapshot(), 50466));
  assert.throws(
    () =>
      normalizeSatnogsObservations(
        [{ ...fixtureRow(), norad_cat_id: 25544 }],
        50466,
        NOW,
      ),
    /different satellite/,
  );
  assert.throws(
    () =>
      normalizeSatnogsObservations(
        [{ ...fixtureRow(), end: 'bad date' }],
        50466,
        NOW,
      ),
    /time/,
  );
  assert.throws(
    () =>
      normalizeSatnogsObservations(
        [{ ...fixtureRow(), status: 'invented' }],
        50466,
        NOW,
      ),
    /status/,
  );
  assert.throws(
    () =>
      normalizeSatnogsObservations(Array(101).fill(fixtureRow()), 50466, NOW),
    /Invalid/,
  );
});

test('normalized observations are deduplicated, time-sorted and limited to five', () => {
  const payload = Array.from({ length: 8 }, (_, i) => ({
    ...fixtureRow(i + 1),
    end: new Date(NOW - i * 60000).toISOString(),
  }));
  const rows = normalizeSatnogsObservations(
    [...payload, payload[0]],
    50466,
    NOW,
  );
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(normalizeSatnogsObservations([], 50466, NOW), []);
});

test('media origins and observation paths are confined, unsupported locations are disclosed', () => {
  const good = fixtureRow();
  assert.equal(satnogsMediaUrl(good.payload, good.id), good.payload);
  for (const url of [
    'http://localhost/audio.ogg',
    `https://network-satnogs.freetls.fastly.net.evil.test/media/${good.id}/x`,
    `https://user:password@network.satnogs.org/media/${good.id}/x`,
    `https://network.satnogs.org/media/${good.id}/x?url=bad`,
    'https://network.satnogs.org/media/1234/x.ogg',
    `https://s3.eu-central-1.wasabisys.com/other-bucket/${good.id}/x`,
    'javascript:alert(1)',
  ])
    assert.equal(satnogsMediaUrl(url, good.id), null);
  const [normalized] = normalizeSatnogsObservations(
    [{ ...good, payload: 'https://unknown.test/x' }],
    50466,
    NOW,
  );
  assert.equal(normalized.audioUrl, null);
  assert.match(normalized.mediaNotice, /unsupported storage/);
  const invalid = fixtureSnapshot();
  invalid.observations[0].audioUrl = 'https://unknown.test/x';
  assert.equal(isSatnogsSnapshot(invalid, 50466), false);
});

test('dev/preview use fixed filtered GETs and coalesce/cache results without following upstream pagination', async () => {
  for (const preview of [false, true]) {
    let calls = 0;
    const request = proxyHarness(
      {
        now: () => NOW,
        fetchImpl: async (url, options) => {
          calls++;
          const target = new URL(url);
          assert.equal(target.origin, 'https://network.satnogs.org');
          assert.equal(target.pathname, '/api/observations/');
          assert.equal(target.searchParams.get('norad_cat_id'), '50466');
          assert.equal(
            target.searchParams.get('end'),
            new Date(NOW).toISOString(),
          );
          assert.equal(options.redirect, 'error');
          assert.ok(options.signal);
          return Response.json([fixtureRow()], {
            headers: { Link: '<https://untrusted.test/next>; rel="next"' },
          });
        },
      },
      preview,
    );
    const [a, b] = await Promise.all([request(), request()]);
    assert.equal(calls, 1);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.status, 200);
    assert.equal(a.body.hasMore, true);
    assert.equal(a.body.observations[0].noradId, 50466);
    await request();
    assert.equal(calls, 1);
    const source = createSatelliteSource({
      fetchImpl: async (url) => {
        assert.equal(url, '/api/satnogs/50466');
        return Response.json(a.body);
      },
    });
    assert.deepEqual(await source.getObservations(50466), a.body);
  }
});

test('arbitrary upstreams, filters and mutations are rejected before fetch', async () => {
  const request = proxyHarness({
    fetchImpl: () => assert.fail('must not fetch'),
  });
  for (const url of [
    '/',
    '/0',
    '/-1',
    '/1.5',
    '/50466?norad=25544',
    '/50466/other',
    '//evil.test/50466',
  ])
    assert.equal((await request(url)).status, 400, url);
  assert.equal((await request('/50466', 'POST')).status, 405);
});

test('upstream errors explicitly retain stale results only briefly, never freshen observation time', async () => {
  let clock = NOW,
    fail = false;
  const request = proxyHarness({
    now: () => clock,
    fetchImpl: async () => {
      if (fail) throw new Error('offline');
      return Response.json([fixtureRow()]);
    },
  });
  const first = await request();
  fail = true;
  clock += 60001;
  const stale = await request();
  assert.equal(stale.status, 200);
  assert.equal(stale.body.stale, true);
  assert.match(stale.body.error, /offline/);
  assert.equal(stale.body.fetchedAt, first.body.fetchedAt);
  assert.equal(
    stale.body.observations[0].endAt,
    first.body.observations[0].endAt,
  );
  clock += 15 * 60000;
  const expired = await request();
  assert.equal(expired.status, 502);
  assert.equal('observations' in expired.body, false);
});

test('oversized and malformed upstreams fail explicitly rather than returning empty success', async () => {
  for (const response of [
    () =>
      new Response('bad', {
        headers: { 'Content-Length': String(3 * 1024 * 1024) },
      }),
    () => Response.json({ results: [] }),
    () => Response.json([{ ...fixtureRow(), norad_cat_id: 25544 }]),
    () => new Response('bad', { status: 503 }),
  ]) {
    const result = await proxyHarness({
      now: () => NOW,
      fetchImpl: async () => response(),
    })();
    assert.equal(result.status, 502);
    assert.match(result.body.error, /SatNOGS observations unavailable/);
  }
});

test('client snapshot shape, size caps, NORAD validation, HTTP errors and cancellation are enforced', async () => {
  const value = fixtureSnapshot();
  for (const invalid of [
    {},
    { ...value, noradId: 25544 },
    { ...value, checkedCount: 101 },
    { ...value, observations: [value.observations[0], value.observations[0]] },
    { ...value, observations: [{ ...value.observations[0], endAt: NOW + 1 }] },
  ])
    await assert.rejects(
      createSatelliteSource({
        fetchImpl: async () => Response.json(invalid),
      }).getObservations(50466),
      /Invalid SatNOGS/,
    );
  await assert.rejects(
    createSatelliteSource({ fetchImpl: () => assert.fail() }).getObservations(
      '../control',
    ),
    /NORAD/,
  );
  await assert.rejects(
    createSatelliteSource({
      fetchImpl: async () => new Response('', { status: 502 }),
    }).getObservations(50466),
    /HTTP 502/,
  );
  await assert.rejects(
    createSatelliteSource({
      fetchImpl: async () =>
        new Response('', { headers: { 'Content-Length': String(200 * 1024) } }),
    }).getObservations(50466),
    /too large/,
  );
  const controller = new AbortController();
  const source = createSatelliteSource({
    fetchImpl: async (_url, { signal }) => {
      controller.abort();
      signal.throwIfAborted();
    },
  });
  await assert.rejects(
    source.getObservations(50466, { signal: controller.signal }),
    { name: 'AbortError' },
  );
});

function lifecycleFixture(source) {
  const state = { _enabled: true, _satnogs: null };
  const timers = new Set(),
    events = [];
  const observation = createObservations({
    state,
    source,
    services: {
      observations: {
        update: (value) => events.push(value),
        close: () => events.push('close'),
        show: (value) => events.push(['show', value]),
      },
    },
    parts: {
      tracking: { _updateTrackedSatelliteLabelModel() {} },
      controls: { _notifyRowControls() {} },
    },
    schedule: (fn) => {
      timers.add(fn);
      return fn;
    },
    cancel: (fn) => timers.delete(fn),
  });
  return { observation, state, timers, events };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

test('only selected amateur/ISS satellites fetch; refresh has one timer and clear stops all work', async () => {
  let requests = 0;
  const f = lifecycleFixture({
    getObservations: async () => {
      requests++;
      return fixtureSnapshot();
    },
  });
  assert.equal(requests, 0);
  f.observation.select(12345, { group: 'visual', name: 'OTHER' });
  assert.equal(requests, 0);
  f.observation.select(50466, { group: 'amateur', name: 'XW-3' });
  await settled();
  assert.equal(f.state._satnogs.status, 'ready');
  assert.equal(requests, 1);
  assert.equal(f.timers.size, 1);
  f.observation.show();
  assert.equal(f.events.at(-1)[0], 'show');
  const tick = [...f.timers][0];
  f.timers.delete(tick);
  tick();
  await settled();
  assert.equal(requests, 2);
  assert.equal(f.timers.size, 1);
  f.observation.clear();
  assert.equal(f.state._satnogs, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.at(-1), 'close');
  f.observation.select(25544, { group: 'stations', name: 'ISS' });
  await settled();
  assert.equal(requests, 3);
  f.observation.clear();
});

test('late responses from superseded selections or disabled layers cannot publish or restart timers', async () => {
  const pending = [];
  const f = lifecycleFixture({
    getObservations: (id, { signal }) =>
      new Promise((resolve) => pending.push({ id, signal, resolve })),
  });
  f.observation.select(50466, { group: 'amateur', name: 'XW-3' });
  f.observation.select(40908, { group: 'amateur', name: 'LILACSAT' });
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve(fixtureSnapshot());
  await settled();
  assert.equal(f.state._satnogs.noradId, 40908);
  assert.equal(f.state._satnogs.snapshot, null);
  f.state._enabled = false;
  f.observation.clear();
  assert.equal(pending[1].signal.aborted, true);
  pending[1].resolve({ ...fixtureSnapshot(), noradId: 40908 });
  await settled();
  assert.equal(f.state._satnogs, null);
  assert.equal(f.timers.size, 0);
});

test('directory-only adapters surface unavailable SatNOGS without breaking satellite tracking', () => {
  const f = lifecycleFixture({});
  f.observation.select(50466, { group: 'amateur', name: 'XW-3' });
  assert.equal(f.state._satnogs.status, 'unavailable');
  assert.match(f.state._satnogs.error, /not configured/);
  assert.equal(f.timers.size, 0);
  f.observation.clear();
});

test('selection refresh errors retain explicitly stale metadata, not a healthy empty result', async () => {
  let fail = false;
  const f = lifecycleFixture({
    getObservations: async () => {
      if (fail) throw new Error('test offline');
      return fixtureSnapshot();
    },
  });
  f.observation.select(50466, { group: 'amateur', name: 'XW-3' });
  await settled();
  fail = true;
  const tick = [...f.timers][0];
  f.timers.delete(tick);
  tick();
  await settled();
  assert.equal(f.state._satnogs.status, 'error');
  assert.match(f.state._satnogs.error, /test offline/);
  assert.equal(f.state._satnogs.snapshot.stale, true);
  assert.equal(f.state._satnogs.snapshot.fetchedAt, NOW);
  f.observation.clear();
});
