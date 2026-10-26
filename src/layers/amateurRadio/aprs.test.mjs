import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  decodePosition,
  createAprsReceiver,
  POSITION_TTL,
} from '../../../server/providers/amateur-radio/aprs.js';

const NOW = Date.UTC(2026, 0, 31, 23, 59, 55);
const PACKET =
  'M0ABC>APBM1D,TCPIP*,qAC,T2TEST:!5328.85N/00214.56W>private comment excluded';
const MIC_E = `M0ABC>532XXU,TCPIP*:\`x*T${String.fromCharCode(28, 28, 28)}>/`;
function base91(value) {
  const chars = [];
  for (let i = 0; i < 4; i++) {
    chars.unshift(String.fromCharCode(33 + (value % 91)));
    value = Math.floor(value / 91);
  }
  return chars.join('');
}
const COMPRESSED = `M0ABC>APRS:!/${base91(Math.floor(380926 * (90 - 53.4808333333)))}${base91(Math.floor(190463 * (180 - 2.2426666667)))}>!!!`;

function fixture(options = {}) {
  let clock = NOW;
  const writes = [],
    sockets = [],
    warnings = [],
    timers = new Map();
  const receiver = createAprsReceiver({
    callsign: 'M0TEST-GV',
    now: () => clock,
    schedule(fn, delay) {
      const token = { fn, delay };
      timers.set(token, fn);
      return token;
    },
    cancel(token) {
      timers.delete(token);
    },
    warn: (...args) => warnings.push(args),
    connect() {
      const socket = new EventEmitter();
      socket.setEncoding = () => {};
      socket.setTimeout = () => {};
      socket.write = (value) => writes.push(value);
      socket.destroy = () => {
        socket.destroyed = true;
        socket.emit('close');
      };
      sockets.push(socket);
      return socket;
    },
    ...options,
  });
  return {
    receiver,
    writes,
    sockets,
    timers,
    warnings,
    advance: (ms) => {
      clock += ms;
    },
    login() {
      receiver.getSnapshot();
      sockets.at(-1).emit('data', '# jav');
      sockets
        .at(-1)
        .emit(
          'data',
          'APRSSrvr ready\r\n# logresp M0TEST-GV unverified, server TEST\r\n',
        );
    },
  };
}

test('standard, compressed and Mic-E positions preserve accurate Manchester coordinates', () => {
  for (const line of [PACKET, COMPRESSED, MIC_E]) {
    const row = decodePosition(line, NOW);
    assert.ok(row, line);
    assert.ok(Math.abs(row.lat - 53.4808333333) < 0.00001);
    assert.ok(Math.abs(row.lon + 2.2426666667) < 0.00001);
    assert.equal(row.receivedAt, NOW);
    assert.equal(
      row.reportedAt,
      null,
      'a parser receipt time must not become a fix timestamp',
    );
    assert.equal('raw' in row, false);
    assert.equal('comment' in row, false);
  }
  assert.equal(decodePosition(PACKET, NOW).brandmeister, true);
  // Known APRS 1.01 Mic-E example: 33 25.64 N, 12 07.74 W (outside our filter).
  assert.equal(decodePosition('SQ7PFS-10>S32U6T:`(_fn"Oj/>Hello', NOW), null);
  assert.equal(
    decodePosition(PACKET.replace('5328.85N', '5328.85S'), NOW),
    null,
  );
  assert.equal(
    decodePosition(PACKET.replace('00214.56W', '00214.56E'), NOW),
    null,
  );
});

test('only explicit UTC report timestamps are recorded, with month/day rollover and expiry', () => {
  const timestamped = PACKET.replace(':!', ':@312359z');
  assert.equal(
    decodePosition(timestamped, NOW).reportedAt,
    Date.UTC(2026, 0, 31, 23, 59),
  );
  assert.equal(
    decodePosition(timestamped, Date.UTC(2026, 1, 1, 0, 1)).reportedAt,
    Date.UTC(2026, 0, 31, 23, 59),
  );
  assert.equal(
    decodePosition(
      PACKET.replace(':!', ':@235900h'),
      Date.UTC(2026, 1, 1, 0, 1),
    ).reportedAt,
    Date.UTC(2026, 0, 31, 23, 59),
  );
  assert.equal(
    decodePosition(PACKET.replace(':!', ':@312359/'), NOW).reportedAt,
    null,
  );
  assert.equal(decodePosition(PACKET.replace(':!', ':@312330z'), NOW), null);
});

test('messages, objects, non-local reports and do-not-archive packets are not retained', () => {
  for (const line of [
    'M0ABC>APRS::M0TEST   :not a position',
    'M0ABC>APRS:>station status',
    'M0ABC>APRS:;OBJECT   *312359z5328.85N/00214.56W>object',
    PACKET.replace('5328.85N', '4928.85N'),
    `${PACKET}!x!`,
  ])
    assert.equal(decodePosition(line, NOW), null, line);
});

test('login waits for banner, uses pass -1 and a fixed range; packets are never written', () => {
  const f = fixture();
  f.receiver.getSnapshot();
  f.sockets[0].emit('connect');
  assert.deepEqual(f.writes, []);
  f.sockets[0].emit('data', '# javAPRSSrvr ready\r\n');
  assert.deepEqual(f.writes, [
    'user M0TEST-GV pass -1 vers GodsEyeView 0.2.1 filter r/53.4808/-2.2426/100\r\n',
  ]);
  f.sockets[0].emit('data', '# logresp M0TEST-GV unverified, server TEST\r\n');
  f.sockets[0].emit(
    'data',
    `${PACKET}\r\nM0ABC>APRS::M0TEST   :do not store\r\n`,
  );
  assert.equal(f.receiver.getSnapshot().status, 'live');
  assert.equal(f.receiver.getSnapshot().rows.length, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.sockets.length, 1, 'polls reuse one connection');
  f.receiver.close();
  assert.equal(f.timers.size, 0);
});

test('invalid identifiers cannot connect or inject login commands', () => {
  for (const callsign of [
    undefined,
    '',
    'M0ABC\r\nfake',
    'M0ABC-GVV',
    'bad call',
  ]) {
    const f = fixture({
      callsign,
      connect: () => {
        throw new Error('must not connect');
      },
    });
    const snapshot = f.receiver.getSnapshot();
    assert.equal(snapshot.status, 'unconfigured');
    assert.match(snapshot.error, /APRS_IS_CALLSIGN/);
    assert.equal(f.timers.size, 0);
    f.receiver.close();
  }
});

test('oversized and malformed lines are bounded, counted and recover without retaining their contents', () => {
  const f = fixture();
  f.login();
  f.sockets[0].emit('data', 'x'.repeat(200_000));
  f.sockets[0].emit('data', `\nmalformed\n${PACKET.slice(0, 30)}`);
  f.sockets[0].emit('data', `${PACKET.slice(30)}\r\n`);
  const snapshot = f.receiver.getSnapshot();
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rejectedPackets, 2);
  assert.equal(f.warnings.length, 1, 'warnings are rate limited');
  assert.equal(f.writes.length, 1);
  f.receiver.close();
});

test('station count, TTL, newer-timestamp ordering and idle shutdown are bounded', () => {
  const f = fixture();
  f.login();
  f.sockets[0].emit('data', `${PACKET.replace(':!', ':@312359z')}\r\n`);
  f.sockets[0].emit(
    'data',
    `${PACKET.replace(':!', ':@312358z').replace('5328.85N', '5328.00N')}\r\n`,
  );
  assert.ok(
    Math.abs(f.receiver.getSnapshot().rows[0].lat - 53.4808333) < 0.00001,
  );
  for (let i = 0; i < 1005; i++)
    f.sockets[0].emit('data', `${PACKET.replace('M0ABC', `TEST${i}`)}\r\n`);
  assert.equal(f.receiver.getSnapshot().rows.length, 1000);
  f.advance(POSITION_TTL + 1);
  assert.equal(f.receiver.getSnapshot().rows.length, 0);
  [...f.timers.values()].forEach((fn) => fn());
  assert.equal(f.sockets[0].destroyed, true);
  f.receiver.close();
});

test('failed login, timeout and network errors are explicit and retried with backoff', () => {
  const f = fixture();
  f.login();
  f.sockets[0].emit('error', new Error('offline'));
  assert.equal(f.receiver.getSnapshot().status, 'error');
  assert.match(f.receiver.getSnapshot().error, /offline/);
  assert.equal(f.sockets.length, 1);
  f.advance(2001);
  f.receiver.getSnapshot();
  assert.equal(f.sockets.length, 2);
  f.sockets[1].emit('data', '# ready\n# logresp OTHER verified, server TEST\n');
  assert.match(f.receiver.getSnapshot().error, /receive-only login/);
  f.advance(4001);
  f.receiver.getSnapshot();
  f.sockets[2].emit('timeout');
  assert.match(f.receiver.getSnapshot().error, /timed out/);
  f.receiver.close();
});
