import { io } from 'socket.io-client';
import {
  normalizeActivity,
  ACTIVITY_MAX_AGE,
} from '../../../src/sources/brandmeisterActivity.js';

/** Public group-call metadata only; no audio, callsigns, credentials or RF controls. */
export function createBrandmeisterActivity({
  connect = io,
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let socket = null,
    idle = null,
    sample = null,
    pending = null,
    resolve = null;
  let status = 'error',
    error = 'BrandMeister activity has not connected.';
  const sessions = new Map();
  function snapshot() {
    const time = now();
    for (const [id, row] of sessions) {
      if (
        time - row.receivedAt > ACTIVITY_MAX_AGE ||
        time - row.activityAt > (row.active ? 900_000 : ACTIVITY_MAX_AGE)
      )
        sessions.delete(id);
    }
    return {
      status,
      error,
      fetchedAt: time,
      rows:
        status === 'live'
          ? [...sessions.values()].map(({ sessionId, ...row }) => row)
          : [],
    };
  }
  function finish() {
    if (sample !== null) cancel(sample);
    sample = null;
    const done = resolve;
    resolve = null;
    pending = null;
    done?.(snapshot());
  }
  function close() {
    if (idle !== null) cancel(idle);
    idle = null;
    socket?.removeAllListeners();
    socket?.close();
    socket = null;
    sessions.clear();
    status = 'error';
    error = 'BrandMeister activity disconnected.';
    finish();
  }
  function fail(message) {
    status = 'error';
    error = message;
    sessions.clear();
    console.warn('[Amateur Radio] BrandMeister activity:', message);
    finish();
  }
  function requestSample() {
    socket.emit('sendCurrentSessions');
    if (sample !== null) cancel(sample);
    sample = schedule(finish, 2000);
  }
  return {
    async getSnapshot() {
      if (idle !== null) cancel(idle);
      idle = schedule(close, 90_000);
      idle.unref?.();
      if (pending) return pending;
      pending = new Promise((done) => {
        resolve = done;
      });
      const result = pending;
      sample = schedule(
        () => fail('Timed out waiting for public activity.'),
        12_000,
      );
      if (socket?.connected) requestSample();
      else {
        socket?.removeAllListeners();
        socket?.close();
        sessions.clear();
        socket = connect('https://api.brandmeister.network', {
          path: '/lh',
          transports: ['websocket'],
          query: { version: 2 },
          autoConnect: false,
          reconnection: false,
          timeout: 10_000,
          transportOptions: {
            websocket: { maxPayload: 256 * 1024, perMessageDeflate: false },
          },
        });
        socket.on('connect', () => {
          status = 'live';
          error = null;
          socket.emit('join', 'everything');
          requestSample();
        });
        socket.on('mqtt', (message) => {
          const row = normalizeActivity(message, now());
          if (!row) return;
          const previous = sessions.get(row.sessionId);
          if (
            previous &&
            ((!previous.active && row.active) ||
              previous.activityAt > row.activityAt)
          )
            return;
          sessions.delete(row.sessionId);
          sessions.set(row.sessionId, row);
          while (sessions.size > 512)
            sessions.delete(sessions.keys().next().value);
        });
        socket.on('disconnect', () =>
          fail('Public activity connection lost. Try Listen latest again.'),
        );
        socket.on('connect_error', (cause) =>
          fail(`Public activity unavailable: ${cause.message}`),
        );
        socket.connect();
      }
      return result;
    },
    close,
  };
}
