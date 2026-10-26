import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  normalizeActivity,
  normalizeNodeActivity,
  chooseLatestTalkgroup,
  isActivitySnapshot,
} from '../../sources/brandmeisterActivity.js';
import { createBrandmeisterActivity } from '../../../server/providers/amateur-radio/activity.js';
import { createAmateurRadioSource } from './source.js';

const NOW = Date.now();
function event(overrides = {}) {
  return {
    topic: 'LH',
    payload: JSON.stringify({
      SessionType: 7,
      SessionID: 'session-1',
      Event: 'Session-Start',
      FlagSet: 0,
      DestinationID: 2350,
      DestinationName: 'United Kingdom',
      Start: Math.floor((NOW - 10_000) / 1000),
      Stop: 0,
      ...overrides,
    }),
  };
}
function row(talkgroup, active = true, ago = 10_000, name = '') {
  return { talkgroup, name, active, activityAt: NOW - ago, receivedAt: NOW };
}
test('public metadata omits operator details, validates times, and rejects private/encrypted/non-group traffic', () => {
  const value = normalizeActivity(
    event({ SourceName: 'not retained', TalkerAlias: 'not retained' }),
    NOW,
  );
  assert.equal(value.talkgroup, 2350);
  assert.equal(value.active, true);
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'sessionId',
      'talkgroup',
      'name',
      'active',
      'activityAt',
      'receivedAt',
    ].sort(),
  );
  for (const overrides of [
    { SessionType: 1 },
    { FlagSet: 1 },
    { FlagSet: 2 },
    { DestinationID: 90 },
    { DestinationID: '2350' },
    { SessionID: '' },
    { Start: NOW / 1000 + 300 },
    { Stop: NOW / 1000 - 300 },
    { Stop: NOW / 1000 + 300 },
    { Event: 'other' },
  ])
    assert.equal(normalizeActivity(event(overrides), NOW), null);
  assert.equal(normalizeActivity({ topic: 'LH', payload: '{' }, NOW), null);
  assert.equal(
    normalizeActivity({ topic: 'other', payload: event().payload }, NOW),
    null,
  );
  assert.equal(
    normalizeActivity({ topic: 'LH', payload: 'x'.repeat(16385) }, NOW),
    null,
  );
});
test('selection prioritises transmitting UK, then English-priority, then others, with newest within each tier', () => {
  const rows = [
    row(226),
    row(91),
    row(2350, true, 20_000),
    row(2351, true, 5000),
    row(913),
  ];
  assert.equal(chooseLatestTalkgroup(rows, NOW).talkgroup, 2351);
  assert.equal(
    chooseLatestTalkgroup(
      rows.filter((r) => r.talkgroup < 2340),
      NOW,
    ).talkgroup,
    91,
  );
  assert.equal(
    chooseLatestTalkgroup([row(226), row(52034, true, 5000)], NOW).talkgroup,
    52034,
  );
  assert.equal(
    chooseLatestTalkgroup([row(226), row(9999, true, 10, 'English chat')], NOW)
      .talkgroup,
    9999,
  );
  assert.equal(
    chooseLatestTalkgroup([row(2350, false), row(226)], NOW).talkgroup,
    226,
    'currently transmitting beats a finished UK call',
  );
  assert.equal(
    chooseLatestTalkgroup([row(2350, false), row(91, false, 1000)], NOW)
      .talkgroup,
    2350,
    'recent-only fallback retains tier priority',
  );
  assert.equal(chooseLatestTalkgroup([row(2350, false, 181000)], NOW), null);
  assert.equal(
    chooseLatestTalkgroup([{ ...row(2350), receivedAt: NOW - 181000 }], NOW),
    null,
  );
  assert.equal(chooseLatestTalkgroup([], NOW), null);
});

function receiver({ now = () => NOW } = {}) {
  const timers = new Set();
  const socket = new EventEmitter();
  let connections = 0,
    closed = 0;
  socket.connected = false;
  socket.connect = () => {
    socket.connected = true;
    socket.emit('connect');
  };
  socket.close = () => {
    closed++;
    socket.connected = false;
  };
  const activity = createBrandmeisterActivity({
    now,
    connect(origin, options) {
      assert.equal(origin, 'https://api.brandmeister.network');
      assert.equal(options.path, '/lh');
      assert.equal(options.reconnection, false);
      connections++;
      return socket;
    },
    schedule(fn, ms) {
      const timer = { fn, ms };
      timers.add(timer);
      return timer;
    },
    cancel(timer) {
      timers.delete(timer);
    },
  });
  return {
    activity,
    socket,
    timers,
    get connections() {
      return connections;
    },
    get closed() {
      return closed;
    },
    sample() {
      const timer = [...timers].find((t) => t.ms === 2000);
      timers.delete(timer);
      timer.fn();
    },
  };
}
test('receiver is lazy, coalesces samples, bounds sessions, strips identifiers and shuts down on idle', async () => {
  const f = receiver();
  assert.equal(f.connections, 0);
  const first = f.activity.getSnapshot(),
    second = f.activity.getSnapshot();
  assert.equal(f.connections, 1);
  for (let i = 0; i < 520; i++)
    f.socket.emit(
      'mqtt',
      event({ SessionID: `s${i}`, DestinationID: 1000 + i }),
    );
  f.sample();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.equal(a.rows.length, 512);
  assert.equal(a.rows[0].sessionId, undefined);
  assert.equal(isActivitySnapshot(a), true);
  [...f.timers].find((t) => t.ms === 90000).fn();
  assert.equal(f.closed, 1);
  assert.equal(f.timers.size, 0);
});
test('stop events replace starts, late starts cannot revive a finished session; errors never return healthy cached activity', async () => {
  const f = receiver(),
    pending = f.activity.getSnapshot();
  f.socket.emit('mqtt', event());
  f.socket.emit(
    'mqtt',
    event({ Event: 'Session-Stop', Stop: Math.floor(NOW / 1000) }),
  );
  f.socket.emit('mqtt', event());
  f.sample();
  assert.equal((await pending).rows[0].active, false);
  const retry = f.activity.getSnapshot();
  f.socket.connected = false;
  f.socket.emit('disconnect');
  const failed = await retry;
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.rows, []);
  assert.match(failed.error, /connection lost/);
  f.activity.close();
  assert.equal(f.timers.size, 0);
});
test('closing pending receiver resolves callers and releases all listeners/timers', async () => {
  const f = receiver(),
    pending = f.activity.getSnapshot();
  f.activity.close();
  assert.equal((await pending).status, 'error');
  assert.equal(f.socket.listenerCount('mqtt'), 0);
  assert.equal(f.timers.size, 0);
});

test('upstream connection failure resolves the sample explicitly without retaining sessions', async () => {
  const f = receiver(),
    pending = f.activity.getSnapshot();
  f.socket.emit('mqtt', event());
  f.socket.emit('connect_error', new Error('test unavailable'));
  const failed = await pending;
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /test unavailable/);
  assert.deepEqual(failed.rows, []);
  f.activity.close();
  assert.equal(f.timers.size, 0);
});
test('source validates public activity snapshots and propagates errors and cancellation', async () => {
  const good = {
    status: 'live',
    error: null,
    fetchedAt: NOW,
    rows: [row(2350)],
  };
  let payload = good;
  const source = createAmateurRadioSource({
    fetchImpl: async (url, { signal }) => {
      assert.equal(url, '/api/amateur-radio/activity');
      signal.throwIfAborted();
      return new Response(JSON.stringify(payload));
    },
  });
  assert.deepEqual(await source.getActivity(), good);
  payload = { ...good, rows: [row(1)] };
  await assert.rejects(source.getActivity(), /Invalid/);
  payload = {
    ...good,
    status: 'error',
    error: 'public feed offline',
    rows: [],
  };
  await assert.rejects(source.getActivity(), /public feed offline/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(source.getActivity({ signal: controller.signal }), {
    name: 'AbortError',
  });
});

function nodeEvent(overrides = {}) {
  return event({
    LinkType: 1,
    ContextID: 234221,
    LinkCall: 'GB3XR',
    ...overrides,
  });
}

function directoryNode(nodeId = '234221') {
  return {
    id: `brandmeister:${nodeId}`,
    network: 'brandmeister',
    nodeId,
    callsign: 'GB3XR',
    lat: 53.39678,
    lon: -2.06361,
    description: '',
    lastSeenAt: null,
    lastSeen: null,
  };
}

test('node activity uses repeater context IDs, excludes bridges/private traffic and distinguishes activity from directory age', () => {
  assert.deepEqual(normalizeNodeActivity(nodeEvent(), NOW), {
    nodeId: '234221',
    nodeCall: 'GB3XR',
    lastHeardAt: NOW,
  });
  assert.equal(
    normalizeNodeActivity(
      nodeEvent({
        LinkType: '1',
        ContextID: '234221',
        LinkCall: ' gb3xr ',
        Start: NOW / 1000 - 600,
      }),
      NOW,
    ).lastHeardAt,
    NOW,
    'an observed ongoing call is heard now, not only at call start',
  );
  for (const invalid of [
    { LinkType: 2 },
    { ContextID: null },
    { ContextID: '234221/evil' },
    { ContextID: 0, SourceID: 234221 },
    { ContextID: 234221.5 },
    { LinkCall: '' },
    { LinkCall: '<bad>' },
    { FlagSet: 1 },
    { FlagSet: 2 },
    { SessionType: 1 },
    { Event: 'other' },
    { Stop: NOW / 1000 + 1 },
  ])
    assert.equal(normalizeNodeActivity(nodeEvent(invalid), NOW), null);
  const ended = {
    Start: (NOW - 400_000) / 1000,
    Stop: (NOW - 300_000) / 1000,
    Event: 'Session-Stop',
  };
  assert.equal(
    normalizeNodeActivity(nodeEvent(ended), NOW).lastHeardAt,
    NOW - 300_000,
  );
  assert.equal(normalizeNodeActivity(nodeEvent(ended), NOW + 1), null);
});

test('node collector verifies both ID and node callsign, shares the audio metadata socket and never exposes operator details', async () => {
  const f = receiver();
  const node = directoryNode();
  const directory = new Map([[node.nodeId, node]]);
  const pending = f.activity.getNodeSnapshot(directory);
  const metadata = f.activity.getSnapshot();
  for (const overrides of [
    { ContextID: 999999, SourceID: 234221 },
    { LinkCall: 'DIFFERENT' },
    { LinkType: 2 },
    { FlagSet: 1 },
  ])
    f.socket.emit(
      'mqtt',
      nodeEvent({ SessionID: JSON.stringify(overrides), ...overrides }),
    );
  f.socket.emit(
    'mqtt',
    nodeEvent({
      SourceID: 1234567,
      SourceName: 'not retained',
      TalkerAlias: 'not retained',
    }),
  );
  f.sample();
  const heard = await pending;
  await metadata;
  assert.equal(f.connections, 1);
  assert.equal(heard.status, 'live');
  assert.equal(heard.observedSince, NOW);
  assert.deepEqual(heard.rows, [{ ...node, lastHeardAt: NOW }]);
  assert.equal(heard.rows[0].SourceID, undefined);
  assert.equal(heard.rows[0].SourceName, undefined);
  assert.equal(heard.rows[0].TalkerAlias, undefined);
  assert.equal(heard.rows[0].nodeCall, undefined);

  const changed = f.activity.getNodeSnapshot(
    new Map([[node.nodeId, { ...node, callsign: 'GB7NEW' }]]),
  );
  f.sample();
  assert.deepEqual(
    (await changed).rows,
    [],
    'changed node identity must be verified again',
  );
  f.activity.close();
  assert.equal(f.timers.size, 0);
});

test('five-minute node retention is independent of the 512-session audio sample and preserves exact expiry', async () => {
  let clock = NOW;
  const f = receiver({ now: () => clock });
  const directory = new Map(
    Array.from({ length: 520 }, (_, i) => {
      const node = directoryNode(`${234221 + i}`);
      return [node.nodeId, node];
    }),
  );
  let pending = f.activity.getNodeSnapshot(directory);
  for (const node of directory.values())
    f.socket.emit(
      'mqtt',
      nodeEvent({
        ContextID: node.nodeId,
        SessionID: `node-${node.nodeId}`,
      }),
    );
  f.sample();
  assert.equal((await pending).rows.length, 520);
  for (let i = 0; i < 10; i++) {
    clock += 30_000;
    pending = f.activity.getNodeSnapshot(directory);
    f.sample();
    assert.equal((await pending).rows.length, 520);
  }
  clock++;
  pending = f.activity.getNodeSnapshot(directory);
  f.sample();
  assert.deepEqual(
    (await pending).rows,
    [],
    'five minutes plus one millisecond expires',
  );
  clock += 30_001;
  pending = f.activity.getNodeSnapshot(directory);
  f.sample();
  assert.equal(
    (await pending).observedSince,
    clock,
    'a lapsed map lease starts fresh history',
  );
  f.activity.close();
});

test('node feed failures clear healthy-looking history, and idle or closing releases node collection', async () => {
  const f = receiver();
  const node = directoryNode();
  const directory = new Map([[node.nodeId, node]]);
  const pending = f.activity.getNodeSnapshot(directory);
  f.socket.emit('mqtt', nodeEvent());
  f.socket.connected = false;
  f.socket.emit('disconnect');
  const failed = await pending;
  assert.equal(failed.status, 'error');
  assert.equal(failed.observedSince, null);
  assert.deepEqual(failed.rows, []);
  assert.match(failed.error, /connection lost/);
  f.activity.close();
  assert.equal(f.timers.size, 0);
  assert.equal(f.socket.listenerCount('mqtt'), 0);
});
