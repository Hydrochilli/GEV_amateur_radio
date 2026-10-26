import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { amateurRadioProxy } from '../../../server/providers/amateur-radio.js';
import { createAmateurRadioSource } from './source.js';
import { decodePosition } from '../../../server/providers/amateur-radio/aprs.js';

const device = { id: 234221, callsign: 'GB3XR', lat: 53.39678, lng: -2.06361 };
const kmz = zipSync({
  'doc.kml': strToU8(`<kml><Document><Placemark><name>G8CZE-L</name>
  <description>Manchester (430.050) 886150</description>
  <Point><coordinates>-2.147,53.475,0</coordinates></Point></Placemark></Document></kml>`),
});

test('position route has fixed scope, is independent of directories and preserves explicit source status', async () => {
  const row = decodePosition(
    'M0ABC>APBM1D,TCPIP*:!5328.85N/00214.56W>',
    Date.now(),
  );
  const snapshot = {
    status: 'live',
    error: null,
    lastPacketAt: row.receivedAt,
    rejectedPackets: 0,
    rows: [row],
  };
  const call = harness({
    positions: { getSnapshot: () => snapshot, close() {} },
    fetchImpl: () => {
      throw new Error('must not fetch directory');
    },
  });

  test('position requests propagate lifecycle cancellation through their bounded timeout signal', async () => {
    const controller = new AbortController();
    const source = createAmateurRadioSource({
      fetchImpl: async (_url, { signal }) => {
        assert.equal(signal.aborted, false);
        controller.abort();
        signal.throwIfAborted();
      },
    });
    await assert.rejects(source.getPositions({ signal: controller.signal }), {
      name: 'AbortError',
    });
  });
  const result = await call('GET', '/positions');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, snapshot);
  assert.equal((await call('GET', '/positions?filter=all')).status, 400);
  assert.equal((await call('POST', '/positions')).status, 405);
  const source = createAmateurRadioSource({
    fetchImpl: async (url) => {
      assert.equal(url, '/api/amateur-radio/positions');
      return Response.json(snapshot);
    },
  });
  assert.deepEqual(await source.getPositions(), snapshot);
  for (const invalid of [
    {},
    { ...snapshot, status: 'okay' },
    { ...snapshot, rows: [row, row] },
    { ...snapshot, rows: [{ ...row, lat: 100 }] },
    { ...snapshot, rows: [{ ...row, receivedAt: null }] },
    { ...snapshot, rows: [{ ...row, reportedAt: row.receivedAt + 999_000 }] },
    { ...snapshot, rows: [{ ...row, path: ['x'.repeat(100)] }] },
  ]) {
    await assert.rejects(
      createAmateurRadioSource({
        fetchImpl: async () => Response.json(invalid),
      }).getPositions(),
      /Invalid APRS/,
    );
  }
  await assert.rejects(
    createAmateurRadioSource({
      fetchImpl: async () => new Response('', { status: 503 }),
    }).getPositions(),
    /HTTP 503/,
  );
});
const upstream = async (url) =>
  String(url).includes('brandmeister')
    ? Response.json([device])
    : new Response(kmz);

function harness(options = {}, preview = false) {
  const plugin = amateurRadioProxy({ fetchImpl: upstream, ...options });
  let handler;
  const hookResult = plugin[
    preview ? 'configurePreviewServer' : 'configureServer'
  ]({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/amateur-radio');
        handler = callback;
      },
    },
  });
  assert.equal(
    hookResult,
    undefined,
    'Vite must not receive a Connect app as a post hook',
  );
  return async (method = 'GET', url = '/') => {
    let status, body, headers;
    await handler(
      { method, url, socket: { remoteAddress: '127.0.0.1' } },
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
    return { status, body, headers };
  };
}

test('activity route is fixed and independent of directories in dev and preview', async () => {
  const snapshot = {
    status: 'live',
    error: null,
    fetchedAt: Date.now(),
    rows: [],
  };
  for (const preview of [false, true]) {
    let requests = 0;
    const call = harness(
      {
        activity: {
          getSnapshot: async () => {
            requests++;
            return snapshot;
          },
          close() {},
        },
        fetchImpl: () => {
          throw new Error('must not fetch directory');
        },
      },
      preview,
    );
    const response = await call('GET', '/activity');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, snapshot);
    for (const url of [
      '/activity?group=2350',
      '//evil.test/activity',
      'https://evil.test/activity',
    ])
      assert.equal((await call('GET', url)).status, 400);
    assert.equal((await call('POST', '/activity')).status, 405);
    assert.equal(requests, 1);
  }
});

test('dev and preview serve the real schema and cache/coalesce both directories', async () => {
  for (const preview of [false, true]) {
    let calls = 0;
    const call = harness(
      {
        now: () => 1000,
        fetchImpl: async (url) => {
          calls++;
          return upstream(url);
        },
      },
      preview,
    );
    const [a, b] = await Promise.all([call(), call()]);
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(calls, 2);
    assert.equal(a.body.networks[0].rows[0].callsign, 'GB3XR');
    assert.equal(a.body.networks[1].rows[0].callsign, 'G8CZE-L');
    await call();
    assert.equal(calls, 2);
    const source = createAmateurRadioSource({
      fetchImpl: async () => Response.json(a.body),
    });
    assert.deepEqual(await source.getSnapshot(), a.body);
  }
});

test('only GET of the fixed route is allowed; no supplied upstream or control actions', async () => {
  let calls = 0;
  const call = harness({
    fetchImpl: async () => {
      calls++;
      throw new Error('must not fetch');
    },
  });
  assert.equal((await call('POST')).status, 405);
  assert.equal((await call('GET', '/?url=http://localhost')).status, 400);
  assert.equal((await call('GET', '/device/action')).status, 400);
  assert.equal(calls, 0);
});

test('partial failure and expired stale cache are explicit, not empty success', async () => {
  let clock = 1000;
  let fail = false;
  const call = harness({
    now: () => clock,
    fetchImpl: async (url) => {
      if (fail && String(url).includes('brandmeister'))
        throw new Error('offline');
      return upstream(url);
    },
  });
  await call();
  clock += 300_001;
  fail = true;
  let result = await call();
  assert.equal(result.status, 200);
  assert.equal(result.body.networks[0].stale, true);
  assert.equal(result.body.networks[0].rows.length, 1);
  assert.match(result.body.networks[0].error, /offline/);
  clock += 3600_001;
  result = await call();
  assert.equal(result.body.networks[0].fetchedAt, null);
  assert.equal(result.body.networks[0].rows.length, 0);
  assert.equal(result.body.networks[1].stale, false);
  const unavailable = await harness({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  })();
  assert.equal(unavailable.status, 502);
});

test('upstream payload caps and source cancellation/validation are enforced', async () => {
  const oversized = await harness({
    fetchImpl: async () =>
      new Response('bad', {
        headers: { 'Content-Length': String(30 * 1024 * 1024) },
      }),
  })();
  assert.equal(oversized.status, 502);
  for (const value of [{}, { networks: [] }, { networks: [null, null] }]) {
    await assert.rejects(
      createAmateurRadioSource({
        fetchImpl: async () => Response.json(value),
      }).getSnapshot(),
      /Invalid amateur radio/,
    );
  }
  await assert.rejects(
    createAmateurRadioSource({
      fetchImpl: async () => new Response('', { status: 502 }),
    }).getSnapshot(),
    /HTTP 502/,
  );
  const controller = new AbortController();
  const source = createAmateurRadioSource({
    fetchImpl: async (_url, { signal }) => {
      assert.equal(signal, controller.signal);
      controller.abort();
      return Response.json({});
    },
  });
  await assert.rejects(source.getSnapshot({ signal: controller.signal }), {
    name: 'AbortError',
  });
});
