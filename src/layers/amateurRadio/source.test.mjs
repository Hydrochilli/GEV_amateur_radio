import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { amateurRadioProxy } from '../../../server/providers/amateur-radio.js';
import { createAmateurRadioSource } from './source.js';
import { decodePosition } from '../../../server/providers/amateur-radio/aprs.js';

const NOW = Date.now();
const device = {
  id: 234221,
  callsign: 'GB3XR',
  lat: 53.39678,
  lng: -2.06361,
  last_seen: new Date(NOW - 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' '),
};
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

test('node route joins live activity to the full geolocated directory without widening the hourly directory view', async () => {
  for (const preview of [false, true]) {
    let calls = 0;
    const call = harness(
      {
        now: () => NOW,
        fetchImpl: async (url) => {
          calls++;
          return String(url).includes('brandmeister')
            ? Response.json([
                device,
                {
                  ...device,
                  id: 2,
                  last_seen: new Date(NOW - 7200_000)
                    .toISOString()
                    .slice(0, 19)
                    .replace('T', ' '),
                },
                { ...device, id: 3, last_seen: null },
              ])
            : new Response(kmz);
        },
        activity: {
          getNodeSnapshot: async (directory) => {
            assert.equal(directory.size, 3);
            assert.equal(directory.get('3').lastSeenAt, null);
            return {
              status: 'live',
              error: null,
              fetchedAt: NOW,
              observedSince: NOW,
              rows: ['2', '3'].map((id) => ({
                ...directory.get(id),
                lastHeardAt: NOW,
              })),
            };
          },
          close() {},
        },
      },
      preview,
    );
    const heard = await call('GET', '/nodes');
    assert.equal(heard.status, 200);
    assert.equal(calls, 1, 'node polling does not fetch EchoLink');
    assert.equal(heard.body.rows.length, 2);
    assert.equal(heard.body.directoryFetchedAt, NOW);
    const hourly = await call();
    assert.deepEqual(
      hourly.body.networks[0].rows.map((r) => r.nodeId),
      ['234221'],
    );
    assert.equal(calls, 2, 'directory routes share the BrandMeister cache');
    assert.equal((await call('POST', '/nodes')).status, 405);
    assert.equal((await call('GET', '/nodes?url=evil')).status, 400);
    const source = createAmateurRadioSource({
      fetchImpl: async (url, { signal }) => {
        assert.equal(url, '/api/amateur-radio/nodes');
        signal.throwIfAborted();
        return Response.json(heard.body);
      },
    });
    assert.deepEqual(await source.getNodeActivity(), heard.body);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      source.getNodeActivity({ signal: controller.signal }),
      { name: 'AbortError' },
    );
  }
});

test('node source validates timestamps, identities, error state and HTTP failures', async () => {
  const data = {
    status: 'live',
    error: null,
    fetchedAt: NOW,
    observedSince: NOW,
    directoryFetchedAt: NOW,
    directoryStale: false,
    directoryError: null,
    rows: [
      {
        id: 'brandmeister:234221',
        network: 'brandmeister',
        nodeId: '234221',
        callsign: 'GB3XR',
        description: '',
        lat: 53.39,
        lon: -2.06,
        lastSeenAt: null,
        lastSeen: null,
        lastHeardAt: NOW,
      },
    ],
  };
  for (const invalid of [
    {},
    { ...data, observedSince: null },
    { ...data, observedSince: NOW + 1 },
    { ...data, rows: [data.rows[0], data.rows[0]] },
    { ...data, rows: [{ ...data.rows[0], lastHeardAt: NOW + 1 }] },
    { ...data, rows: [{ ...data.rows[0], lastHeardAt: null }] },
    { ...data, rows: [{ ...data.rows[0], network: 'echolink' }] },
    { ...data, rows: [{ ...data.rows[0], lat: 100 }] },
    { ...data, status: 'error', error: 'offline' },
  ]) {
    await assert.rejects(
      createAmateurRadioSource({
        fetchImpl: async () => Response.json(invalid),
      }).getNodeActivity(),
      /Invalid BrandMeister node/,
    );
  }
  const failed = {
    ...data,
    status: 'error',
    error: 'offline',
    observedSince: null,
    rows: [],
  };
  assert.deepEqual(
    await createAmateurRadioSource({
      fetchImpl: async () => Response.json(failed),
    }).getNodeActivity(),
    failed,
  );
  await assert.rejects(
    createAmateurRadioSource({
      fetchImpl: async () => new Response('', { status: 502 }),
    }).getNodeActivity(),
    /HTTP 502/,
  );
});

test('dev and preview serve the real schema and cache/coalesce both directories', async () => {
  for (const preview of [false, true]) {
    let calls = 0;
    const call = harness(
      {
        now: () => NOW,
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
    assert.equal(a.body.area.scope, 'worldwide');
    assert.equal(a.body.aprsArea.name, 'Manchester');
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
  let clock = NOW;
  let fail = false;
  const call = harness({
    now: () => clock,
    fetchImpl: async (url) => {
      if (fail && String(url).includes('brandmeister'))
        throw new Error('offline');
      return upstream(url);
    },
  });

  test('BrandMeister cutoff is rechecked on fresh cache hits and stale-on-error responses', async () => {
    let clock = NOW,
      calls = 0,
      fail = false;
    const nearCutoff = {
      ...device,
      last_seen: new Date(NOW - 3599_000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' '),
    };
    const call = harness({
      now: () => clock,
      fetchImpl: async (url) => {
        calls++;
        if (String(url).includes('brandmeister')) {
          if (fail) throw new Error('test offline');
          return Response.json([nearCutoff]);
        }
        return new Response(kmz);
      },
    });
    assert.equal((await call()).body.networks[0].rows.length, 1);
    clock += 1001;
    assert.equal((await call()).body.networks[0].rows.length, 0);
    assert.equal(
      calls,
      2,
      'eligibility changes even while the directory cache is fresh',
    );
    clock += 300_000;
    fail = true;
    const stale = (await call()).body.networks[0];
    assert.equal(stale.stale, true);
    assert.equal(
      stale.rows.length,
      0,
      'stale cache must not prolong the last-seen eligibility window',
    );
  });

  test('browser source accepts complete worldwide catalogues and rejects or filters ineligible BrandMeister timestamps', async () => {
    const initial = (await harness()()).body;
    const template = initial.networks[0].rows[0];
    initial.networks[0].rows = Array.from({ length: 2501 }, (_, i) => ({
      ...template,
      id: `brandmeister:${i + 1}`,
      nodeId: String(i + 1),
      lat: -33.87,
      lon: 151.21,
    }));
    let payload = initial;
    const source = createAmateurRadioSource({
      fetchImpl: async () => Response.json(payload),
    });
    const global = await source.getSnapshot();
    assert.equal(global.networks[0].rows.length, 2501);
    assert.equal(global.networks[0].rows[0].lon, 151.21);
    for (const lastSeenAt of [Date.now() - 3600_001, Date.now() + 60_000]) {
      payload = structuredClone(initial);
      payload.networks[0].rows = [
        {
          ...template,
          lastSeenAt,
          lastSeen: new Date(lastSeenAt).toISOString(),
        },
      ];
      assert.equal((await source.getSnapshot()).networks[0].rows.length, 0);
    }
    payload = structuredClone(initial);
    delete payload.networks[0].rows[0].lastSeenAt;
    await assert.rejects(source.getSnapshot(), /Invalid amateur radio/);
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
