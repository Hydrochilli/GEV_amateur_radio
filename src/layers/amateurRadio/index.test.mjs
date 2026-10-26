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

test('published positions update independently, reuse markers, show provenance and survive directory refresh', async () => {
  const timers = new Set(),
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
      schedule(fn) {
        timers.add(fn);
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
  const timer = [...timers][0];
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
  const second = [...timers][0];
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
test('BrandMeister marker clicks open Hoseline directly and EchoLink stays explicit', async () => {
  const playerCalls = [];
  const h = harness(undefined, {
    player: {
      show: (...args) => playerCalls.push(args),
      close() {},
      destroy() {},
    },
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
  assert.deepEqual(playerCalls, [['hoseline', undefined]]);
  assert.equal(h.entries.has('amateur-radio'), false);
  assert.deepEqual(h.opened, []);
  h.layer
    .getRowControls()
    .chips.find((chip) => chip.id === 'echolink')
    .onClick();
  assert.deepEqual(playerCalls[1], ['echolink', undefined]);
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
