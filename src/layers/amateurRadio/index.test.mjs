import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmateurRadioLayer } from './index.js';

const row = {
  id: 'brandmeister:234221',
  nodeId: '234221',
  network: 'brandmeister',
  callsign: 'GB3XR',
  lat: 53.39678,
  lon: -2.06361,
  distanceKm: 15,
  lastSeenAt: Date.now(),
  lastSeen: new Date().toISOString(),
};
const snapshot = {
  networks: [
    {
      id: 'brandmeister',
      rows: [row],
      fetchedAt: Date.now(),
      stale: false,
      error: null,
    },
    {
      id: 'echolink',
      rows: [],
      fetchedAt: Date.now(),
      stale: false,
      error: null,
    },
  ],
};

function harness(source = { getSnapshot: async () => snapshot }, options = {}) {
  const dataSources = [];
  let callback = null;
  let picked = null;
  const entries = new Map(),
    owners = new Set(),
    opened = [];
  const viewer = {
    scene: { pick: () => picked },
    dataSources: {
      add: (item) => dataSources.push(item),
      remove: (item) => dataSources.splice(dataSources.indexOf(item), 1),
    },
  };
  const layer = createAmateurRadioLayer({
    source,
    overlayHost: {
      setEntries: (id, cards) => entries.set(id, cards),
      clearSource: (id) => entries.delete(id),
      setVisible() {},
      hitTest: () => null,
    },
    picking: {
      registerPickOwner: (id) => owners.add(id),
      unregisterPickOwner: (id) => owners.delete(id),
      resolvePickId: (pick) => pick?.id || null,
      isOwnedByOtherLayer: (_id, pickId) => pickId.startsWith('flights:'),
    },
    screenSpaceEventHandlerFactory: () => ({
      setInputAction: (fn) => {
        callback = fn;
      },
      destroy: () => {
        callback = null;
      },
    }),
    openExternal: (url) => opened.push(url),
    ...options,
  });
  layer.init(viewer);
  layer.enable();
  return {
    layer,
    viewer,
    dataSources,
    entries,
    owners,
    opened,
    click(id) {
      picked = id ? { id } : null;
      callback({ position: { x: 10, y: 10 } });
    },
  };
}
const positionRow = {
  id: 'aprs:M0ABC',
  network: 'aprs',
  callsign: 'M0ABC',
  lat: 53.4808,
  lon: -2.2426,
  distanceKm: 0,
  receivedAt: Date.now(),
  reportedAt: null,
  ambiguity: 0,
  kind: 'station',
  destination: 'APBM1D',
  path: ['TCPIP*'],
  brandmeister: true,
};
const positionSnapshot = {
  status: 'live',
  error: null,
  rows: [positionRow],
  lastPacketAt: positionRow.receivedAt,
  rejectedPackets: 0,
};
const settled = () => new Promise((resolve) => setImmediate(resolve));

function nodeSnapshot(rows, time) {
  return {
    status: 'live',
    error: null,
    fetchedAt: time,
    observedSince: time,
    directoryFetchedAt: time,
    directoryStale: false,
    directoryError: null,
    rows,
  };
}

test('BrandMeister window chip filters and restores cached dots without changing other networks or playing audio', async () => {
  const clock = Date.now();
  const timers = new Map();
  const played = [];
  let directoryCalls = 0;
  let nodeCalls = 0;
  let notifications = 0;
  const next = structuredClone(snapshot);
  next.networks[0].rows = [
    0,
    300_000,
    300_001,
    3600_000,
    3600_001,
    -1,
    undefined,
    null,
  ].map((age, index) => ({
    ...row,
    id: `brandmeister:${index + 1}`,
    nodeId: `${index + 1}`,
    lastSeenAt: typeof age === 'number' ? clock - age : age,
  }));
  next.networks[1].rows = [
    { ...row, id: 'echolink:9', nodeId: '9', network: 'echolink' },
  ];
  const h = harness(
    {
      getSnapshot: async () => {
        directoryCalls++;
        return next;
      },
      getPositions: async () => ({
        ...positionSnapshot,
        rows: [{ ...positionRow, receivedAt: clock }],
      }),
      getNodeActivity: async () => {
        nodeCalls++;
        return nodeSnapshot(
          [
            ...next.networks[0].rows.slice(0, 3).map((r) => ({
              ...r,
              lastHeardAt: r.lastSeenAt,
            })),
            {
              ...row,
              id: 'brandmeister:9',
              nodeId: '9',
              lastSeenAt: clock - 7200_000,
              lastHeardAt: clock - 60_000,
            },
          ],
          clock,
        );
      },
    },
    {
      openExternal: undefined,
      now: () => clock,
      schedule(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      cancel: (fn) => timers.delete(fn),
      player: {
        show: (...args) => played.push(args),
        close: () => played.push('close'),
        destroy() {},
      },
    },
  );
  try {
    await h.layer.update();
    await settled();
    const chip = () =>
      h.layer
        .getRowControls()
        .chips.find((c) => c.id === 'brandmeister-window');
    const entities = h.dataSources[0].entities;
    const retained = [
      'amateur-radio:brandmeister:1',
      'amateur-radio:brandmeister:2',
      'amateur-radio:echolink:9',
      'amateur-radio:aprs:M0ABC',
    ].map((id) => entities.getById(id));
    assert.equal(chip().label, 'BrandMeister: 60 min');
    assert.equal(chip().active, false);
    assert.equal(chip().disabled, false, 'local chip needs no external opener');
    assert.equal(h.layer.getStats().count, 6);
    assert.equal(
      timers.size,
      3,
      'one expiry plus APRS and node activity polls',
    );
    h.click('amateur-radio:brandmeister:3');
    assert.equal(played.length, 1);
    h.layer.setRowControlsListener(() => notifications++);

    chip().onClick();
    assert.equal(chip().label, 'BrandMeister: 5 min live');
    assert.equal(chip().active, true);
    assert.match(chip().title, /matched by node ID and node callsign/);
    assert.equal(h.layer.getStats().count, 5);
    assert.equal(
      h.layer.getRowControls().legend.find((c) => c.label === 'BrandMeister')
        .count,
      3,
      'the inclusive five-minute boundary is retained',
    );
    assert.equal(entities.getById('amateur-radio:brandmeister:3'), undefined);
    assert.equal(entities.getById('amateur-radio:brandmeister:4'), undefined);
    assert.ok(
      entities.getById('amateur-radio:brandmeister:9'),
      'fresh public activity can map a node whose directory last-seen is older than an hour',
    );
    assert.equal(h.entries.has('amateur-radio'), false);
    assert.equal(
      h.layer.getRowControls().chips.some((c) => c.id === 'selected-node'),
      false,
    );
    assert.equal(
      played.length,
      1,
      'hiding the selected dot must not stop audio',
    );
    assert.ok(notifications > 0);
    assert.match(h.layer.getRowControls().info, /within five minutes/);
    assert.equal(timers.size, 3);

    chip().onClick();
    assert.equal(chip().label, 'BrandMeister: 60 min');
    assert.equal(chip().active, false);
    assert.equal(h.layer.getStats().count, 6);
    assert.ok(entities.getById('amateur-radio:brandmeister:3'));
    assert.ok(entities.getById('amateur-radio:brandmeister:4'));
    assert.equal(entities.getById('amateur-radio:brandmeister:9'), undefined);
    assert.equal(
      directoryCalls,
      1,
      'widening uses the retained hourly snapshot',
    );
    for (const entity of retained)
      assert.equal(entities.getById(entity.id), entity);
    assert.equal(timers.size, 3, 'switching replaces, not duplicates, expiry');
    assert.equal(nodeCalls, 1, 'toggling uses the current live sample');
    assert.equal(played.length, 1);
  } finally {
    h.layer.destroy();
  }
  assert.equal(timers.size, 0);
});

test('BrandMeister rolling expiry follows the selected window at the exact five-minute and one-hour boundaries', async () => {
  const start = Date.now();
  let clock = start;
  const timers = new Map();
  const next = structuredClone(snapshot);
  next.networks[0].rows[0].lastSeenAt = start - 300_000 + 50;
  next.networks[1].rows = [
    { ...row, id: 'echolink:9', nodeId: '9', network: 'echolink' },
  ];
  const h = harness(
    {
      getSnapshot: async () => next,
      getNodeActivity: async () =>
        nodeSnapshot(
          [{ ...next.networks[0].rows[0], lastHeardAt: start - 300_000 + 50 }],
          clock,
        ),
    },
    {
      now: () => clock,
      schedule(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      cancel: (fn) => timers.delete(fn),
    },
  );
  const chip = () =>
    h.layer.getRowControls().chips.find((c) => c.id === 'brandmeister-window');
  const fire = () => {
    const expiry = [...timers.keys()].filter((fn) => timers.get(fn) !== 10_000);
    assert.equal(expiry.length, 1);
    const [timer] = expiry;
    timers.delete(timer);
    timer();
  };
  try {
    await h.layer.update();
    await settled();
    assert.deepEqual(
      [...timers.values()].sort((a, b) => a - b),
      [10_000, 3300_051],
    );
    for (let i = 0; i < 6; i++) chip().onClick();
    assert.equal(timers.size, 2, 'rapid toggles leave one expiry and one poll');
    chip().onClick();
    assert.deepEqual(
      [...timers.values()].sort((a, b) => a - b),
      [51, 10_000],
    );
    clock = start + 50;
    fire();
    assert.equal(
      h.layer.getStats().count,
      2,
      'exactly five minutes is included',
    );
    assert.deepEqual(
      [...timers.values()].sort((a, b) => a - b),
      [1, 10_000],
    );
    clock++;
    fire();
    assert.equal(
      h.layer.getStats().count,
      1,
      'one millisecond older is removed',
    );
    assert.deepEqual([...timers.values()], [10_000]);

    chip().onClick();
    assert.equal(
      h.layer.getStats().count,
      2,
      'widening restores an eligible dot',
    );
    clock = start + 3300_050;
    fire();
    assert.equal(h.layer.getStats().count, 2, 'exactly one hour is included');
    assert.deepEqual(
      [...timers.values()].sort((a, b) => a - b),
      [1, 10_000],
    );
    clock++;
    fire();
    assert.equal(h.layer.getStats().count, 1);
    assert.deepEqual([...timers.values()], [10_000]);
    assert.ok(h.dataSources[0].entities.getById('amateur-radio:echolink:9'));
    chip().onClick();
    chip().onClick();
    assert.equal(
      h.layer.getStats().count,
      1,
      'expired hourly dots stay excluded',
    );
  } finally {
    h.layer.destroy();
  }
});

test('live node updates survive directory refresh, surface failures and respect disable/enable', async () => {
  const start = Date.now();
  let clock = start;
  let fail = false;
  let calls = 0;
  const timers = new Map();
  const next = structuredClone(snapshot);
  const heard = [{ ...row, lastHeardAt: start }];
  next.networks[0].rows = [
    { ...row, lastSeenAt: start },
    { ...row, id: 'brandmeister:2', nodeId: '2', lastSeenAt: start - 600_000 },
  ];
  const h = harness(
    {
      getSnapshot: async () => {
        calls++;
        return structuredClone(next);
      },
      getNodeActivity: async () => {
        if (fail) throw new Error('Last Heard unavailable');
        return nodeSnapshot(structuredClone(heard), clock);
      },
    },
    {
      now: () => clock,
      schedule(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      cancel: (fn) => timers.delete(fn),
    },
  );
  const chip = () =>
    h.layer.getRowControls().chips.find((c) => c.id === 'brandmeister-window');
  try {
    await h.layer.update();
    await settled();
    chip().onClick();
    assert.equal(h.layer.getStats().count, 1);
    next.networks[0].rows.push({
      ...row,
      id: 'brandmeister:3',
      nodeId: '3',
      lastSeenAt: start - 60_000,
    });
    await h.layer.update();
    assert.equal(
      h.layer.getStats().count,
      1,
      'directory refresh cannot add unobserved nodes to live mode',
    );
    heard.push({ ...next.networks[0].rows[2], lastHeardAt: start - 60_000 });
    const poll = async () => {
      const timer = [...timers.keys()].find((fn) => timers.get(fn) === 10_000);
      timers.delete(timer);
      timer();
      assert.equal(
        h.layer.getStats().loading,
        false,
        'background node polling must not mark an already loaded layer unavailable',
      );
      await settled();
    };
    await poll();
    assert.equal(h.layer.getStats().count, 2);
    assert.equal(chip().active, true);
    fail = true;
    await poll();
    assert.match(h.layer.getStats().error, /Last Heard unavailable/);
    assert.equal(h.layer.getStats().nodeActivityStatus, 'error');
    assert.equal(
      h.layer.getStats().count,
      0,
      'failed live feed is not healthy cached data',
    );
    assert.match(h.layer.getRowControls().info, /Last Heard unavailable/);
    assert.equal(chip().active, true);
    chip().onClick();
    assert.equal(
      h.layer.getStats().count,
      3,
      'hourly directory view remains available despite live-feed failure',
    );
    chip().onClick();
    assert.equal(h.layer.getStats().count, 0);
    fail = false;
    await poll();
    assert.equal(h.layer.getStats().count, 2, 'next live poll recovers');
    h.layer.disable();
    assert.equal(timers.size, 0);
    clock = start + 300_001;
    h.layer.enable();
    await settled();
    assert.equal(chip().active, true, 'choice survives layer disable/enable');
    assert.equal(h.layer.getStats().count, 0);
    assert.deepEqual([...timers.values()], [10_000]);
    chip().onClick();
    assert.equal(h.layer.getStats().count, 3);
    assert.equal(
      calls,
      2,
      'toggling and reenabling do not refetch the directory',
    );
    assert.equal(timers.size, 2);
  } finally {
    h.layer.destroy();
  }
  assert.equal(timers.size, 0);
});

test('late node activity cannot revive a disabled layer, and reenable starts a fresh request', async () => {
  let finish;
  let signal;
  let calls = 0;
  const timers = new Map();
  const time = Date.now();
  const h = harness(
    {
      getSnapshot: async () => snapshot,
      getNodeActivity: ({ signal: nextSignal }) => {
        calls++;
        signal = nextSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    {
      now: () => time,
      schedule(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      cancel: (fn) => timers.delete(fn),
    },
  );
  const chip = () =>
    h.layer.getRowControls().chips.find((c) => c.id === 'brandmeister-window');
  try {
    chip().onClick();
    assert.match(h.layer.getRowControls().info, /Last Heard: connecting/);
    assert.equal(h.layer.getStats().loading, true);
    h.layer.disable();
    assert.equal(signal.aborted, true);
    finish(nodeSnapshot([{ ...row, lastHeardAt: time }], time));
    await settled();
    assert.equal(h.layer.getStats().count, 0);
    assert.equal(timers.size, 0);
    h.layer.enable();
    assert.equal(calls, 2);
    finish(nodeSnapshot([], time));
    await settled();
    assert.equal(h.layer.getStats().count, 0);
    assert.match(
      h.layer.getRowControls().info,
      /No verified mapped nodes heard/,
    );
    assert.deepEqual([...timers.values()], [10_000]);
  } finally {
    h.layer.destroy();
  }
  assert.equal(timers.size, 0);
});

test('published positions update independently, reuse markers, show provenance and survive directory refresh', async () => {
  const timers = new Map(),
    played = [];
  let next = structuredClone(positionSnapshot),
    directoryCalls = 0;
  const h = harness(
    {
      getSnapshot: async () => {
        directoryCalls++;
        return snapshot;
      },
      getPositions: async () => next,
    },
    {
      schedule(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      cancel: (fn) => timers.delete(fn),
      player: {
        show: (...args) => played.push(args),
        close: () => played.push('close'),
        destroy: () => played.push('destroy'),
      },
    },
  );
  await settled();
  assert.equal(directoryCalls, 0);
  const marker = h.dataSources[0].entities.getById('amateur-radio:aprs:M0ABC');
  assert.ok(marker);
  await h.layer.update();
  assert.equal(h.layer.getStats().count, 2);
  assert.equal(h.dataSources[0].entities.getById(marker.id), marker);
  h.click(marker.id);
  let card = h.entries.get('amateur-radio')[0];
  assert.match(card.title, /Published APRS/);
  assert.ok(
    card.details.some((detail) =>
      detail.includes('receipt time is not GPS fix time'),
    ),
  );
  assert.ok(card.details.some((detail) => detail.includes('APBM1D')));
  assert.equal(card.activate(), false);
  next.rows[0].lon += 0.005;
  const timer = [...timers.keys()].find((fn) => timers.get(fn) === 10_000);
  timers.delete(timer);
  timer();
  await settled();
  assert.equal(h.dataSources[0].entities.getById(marker.id), marker);
  assert.equal(
    directoryCalls,
    1,
    'live poll does not refresh global directories',
  );
  h.layer
    .getRowControls()
    .chips.find((chip) => chip.id === 'hoseline')
    .onClick();
  assert.deepEqual(played[0], ['hoseline', undefined]);
  next = { ...next, status: 'error', error: 'APRS outage' };
  const second = [...timers.keys()].find((fn) => timers.get(fn) === 10_000);
  timers.delete(second);
  second();
  await settled();
  card = h.entries.get('amateur-radio')[0];
  assert.ok(card.details.some((detail) => detail.includes('STALE')));
  assert.match(h.layer.getRowControls().info, /APRS outage/);
  h.layer.disable();
  assert.equal(timers.size, 0);
  assert.equal(played.at(-1), 'close');
  h.layer.destroy();
  assert.equal(played.at(-1), 'destroy');
});

test('late position responses cannot repopulate disabled layers or reschedule acquisition', async () => {
  let finish, signal;
  const timers = [];
  const h = harness(
    {
      getSnapshot: async () => snapshot,
      getPositions: (options) => {
        signal = options.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });

        test('global markers are reused and last-hour BrandMeister expiry removes points and counts without a directory refresh', async () => {
          const start = Date.now();
          let clock = start;
          const timers = new Map();
          const expiring = {
            ...row,
            lat: -33.87,
            lon: 151.21,
            lastSeenAt: start - 3600_000 + 50,
          };
          const fresh = {
            ...expiring,
            id: 'brandmeister:2',
            nodeId: '2',
            lastSeenAt: start,
          };
          const echo = {
            ...row,
            id: 'echolink:3',
            nodeId: '3',
            network: 'echolink',
            callsign: 'VK2ABC-L',
            lat: -33.87,
            lon: 151.21,
          };
          const next = structuredClone(snapshot);
          next.networks[0].rows = [expiring, fresh];
          next.networks[1].rows = [echo];
          const h = harness(
            { getSnapshot: async () => next },
            {
              now: () => clock,
              schedule(fn, ms) {
                timers.set(fn, ms);
                return fn;
              },
              cancel: (fn) => timers.delete(fn),
            },
          );
          await h.layer.update();
          const entities = h.dataSources[0].entities;
          const original = entities.getById('amateur-radio:brandmeister:2');
          assert.equal(h.layer.getStats().count, 3);
          await h.layer.update();
          assert.equal(
            entities.getById(original.id),
            original,
            'refresh must not rebuild thousands of unchanged directory markers',
          );
          h.click('amateur-radio:brandmeister:234221');
          assert.ok(
            h.layer
              .getRowControls()
              .chips.some((chip) => chip.id === 'selected-node'),
          );
          clock = start + 50;
          let timer = [...timers.keys()][0];
          assert.equal(timers.get(timer), 51);
          timers.delete(timer);
          timer();
          assert.ok(
            entities.getById('amateur-radio:brandmeister:234221'),
            'exactly one hour is still eligible',
          );
          clock++;
          timer = [...timers.keys()][0];
          timers.delete(timer);
          timer();
          assert.equal(
            entities.getById('amateur-radio:brandmeister:234221'),
            undefined,
          );
          assert.equal(h.layer.getStats().count, 2);
          assert.equal(
            h.layer
              .getRowControls()
              .legend.find((item) => item.label === 'BrandMeister').count,
            1,
          );
          assert.equal(
            h.layer
              .getRowControls()
              .chips.some((chip) => chip.id === 'selected-node'),
            false,
          );
          assert.match(h.layer.getRowControls().info, /Worldwide/);
          h.layer.disable();
          assert.equal(timers.size, 0);
          clock = start + 3600_001;
          h.layer.enable();
          assert.equal(
            h.layer.getStats().count,
            1,
            'reenabling cannot resurrect expired BrandMeister points',
          );
          assert.ok(
            entities.getById('amateur-radio:echolink:3'),
            'worldwide EchoLink is not subject to the BrandMeister hour filter',
          );
          h.layer.destroy();
          assert.equal(timers.size, 0);
        });
      },
    },
    { schedule: (fn) => timers.push(fn) },
  );
  h.layer.disable();
  assert.equal(signal.aborted, true);
  finish(positionSnapshot);
  await settled();
  assert.equal(h.layer.getStats().count, 0);
  assert.equal(timers.length, 0);
  h.layer.destroy();
});

test('failed acquisition is explicit and expired positions are removed rather than left on the map', async () => {
  let fail = false;
  const timers = [];
  const h = harness(
    {
      getSnapshot: async () => snapshot,
      getPositions: async () => {
        if (fail) throw new Error('position HTTP failure');
        return {
          ...positionSnapshot,
          rows: [
            positionRow,
            {
              ...positionRow,
              id: 'aprs:M0OLD',
              callsign: 'M0OLD',
              receivedAt: Date.now() - 900_001,
            },
          ],
        };
      },
    },
    {
      schedule: (fn) => {
        timers.push(fn);
        return fn;
      },
      cancel: () => {},
    },
  );
  await settled();
  assert.equal(h.layer.getStats().count, 1);
  fail = true;
  timers.shift()();
  await settled();
  assert.equal(h.layer.getStats().positionStatus, 'error');
  assert.match(h.layer.getRowControls().info, /position HTTP failure/);
  h.layer.destroy();
});
test('BrandMeister marker clicks pass their location to Hoseline and EchoLink stays explicit', async () => {
  const playerCalls = [];
  const h = harness(undefined, {
    player: {
      show: (...args) => playerCalls.push(args),
      close() {},
      destroy() {},
    },
  });

  test('foreign marker location is passed independently of its node ID country prefix', async () => {
    const foreign = { ...row, lat: 48.8566, lon: 2.3522 };
    const calls = [];
    const h = harness(
      {
        getSnapshot: async () => ({
          networks: snapshot.networks.map((network) => ({
            ...network,
            rows: network.id === 'brandmeister' ? [foreign] : [],
          })),
        }),
      },
      {
        player: {
          show: (...args) => calls.push(args),
          close() {},
          destroy() {},
        },
      },
    );
    await h.layer.update();
    h.click(`amateur-radio:${foreign.id}`);
    assert.deepEqual(calls, [
      ['hoseline', undefined, { lat: foreign.lat, lon: foreign.lon }],
    ]);
    h.layer.destroy();
  });
  let controlsChanged = 0;
  h.layer.setRowControlsListener(() => controlsChanged++);
  await h.layer.update();
  assert.equal(h.layer.getStats().count, 1);
  assert.equal(
    h.dataSources[0].entities.values[0].id,
    'amateur-radio:brandmeister:234221',
  );
  h.click('amateur-radio:brandmeister:234221');
  assert.ok(controlsChanged > 0);
  assert.equal(h.layer.getRowControls().chips.at(-1).label, 'GB3XR');
  assert.deepEqual(playerCalls, [
    ['hoseline', undefined, { lat: row.lat, lon: row.lon }],
  ]);
  h.layer
    .getRowControls()
    .chips.find((chip) => chip.id === 'hoseline')
    .onClick();
  assert.deepEqual(
    playerCalls[1],
    playerCalls[0],
    'Listen latest retains the selected marker location',
  );
  assert.equal(h.entries.has('amateur-radio'), false);
  assert.deepEqual(h.opened, []);
  h.layer
    .getRowControls()
    .chips.find((chip) => chip.id === 'echolink')
    .onClick();
  assert.deepEqual(playerCalls[2], ['echolink', undefined]);
  h.click('flights:123');
  assert.equal(h.entries.has('amateur-radio'), false);
  h.click(null);
  assert.equal(h.entries.has('amateur-radio'), false);
  h.layer.disable();
  assert.equal(h.owners.size, 0);
  assert.equal(h.dataSources[0].show, false);
  assert.equal(
    h.layer.getRowControls().chips.some((chip) => chip.label === 'GB3XR'),
    false,
  );
  h.layer.destroy();
  assert.equal(h.dataSources.length, 0);
});

test('late snapshots cannot repopulate a disabled or destroyed layer', async () => {
  for (const action of ['disable', 'destroy']) {
    let complete, signal;
    const h = harness({
      getSnapshot(options) {
        signal = options.signal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    const pending = h.layer.update();
    h.layer[action]();
    assert.equal(signal.aborted, true);
    complete(snapshot);
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
  }
});

test('refresh errors retain prior markers and explicitly mark them stale', async () => {
  let fail = false;
  const h = harness({
    getSnapshot: async () => {
      if (fail) throw new Error('test directory outage');
      return snapshot;
    },
  });
  await h.layer.update();
  fail = true;
  assert.equal(await h.layer.update(), false);
  assert.equal(h.layer.getStats().count, 1);
  assert.equal(h.layer.getStats().stale, true);
  assert.match(h.layer.getRowControls().info, /test directory outage/);
  h.layer.destroy();
});

test('failure of one network does not label the other network card stale', async () => {
  const partial = structuredClone(snapshot);
  partial.networks[0].fetchedAt = null;
  partial.networks[0].error = 'BrandMeister unavailable';
  partial.networks[1].rows = [
    {
      ...row,
      id: 'echolink:12345',
      nodeId: '12345',
      network: 'echolink',
      callsign: 'G0TEST',
    },
  ];
  const h = harness({ getSnapshot: async () => partial });
  await h.layer.update();
  h.click('amateur-radio:echolink:12345');
  const [card] = h.entries.get('amateur-radio');
  assert.equal(
    card.details.some((line) => line.includes('STALE')),
    false,
  );
  assert.equal(card.details.includes('BrandMeister unavailable'), false);
  assert.equal(h.layer.getStats().partial, true);
  h.layer.destroy();
});
