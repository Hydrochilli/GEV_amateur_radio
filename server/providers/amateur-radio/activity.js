import { io } from 'socket.io-client';
import {
  normalizeActivity,
  normalizeNodeActivity,
  ACTIVITY_MAX_AGE,
} from '../../../src/sources/brandmeisterActivity.js';
import { BRANDMEISTER_SHORT_AGE } from '../../../src/sources/amateurRadioDirectory.js';

/** Public group-call metadata and directory-node matches; no audio or RF controls. */
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
  const heardNodes = new Map();
  let nodeDirectory = new Map();
  let nodeLeaseUntil = 0;
  let observedSince = null;

  function clearNodes() {
    heardNodes.clear();
    nodeDirectory = new Map();
    nodeLeaseUntil = 0;
    observedSince = null;
  }
  function snapshot() {
    const time = now();
    if (nodeLeaseUntil < time) clearNodes();
    for (const [nodeId, lastHeardAt] of heardNodes)
      if (time - lastHeardAt > BRANDMEISTER_SHORT_AGE)
        heardNodes.delete(nodeId);
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
    clearNodes();
    status = 'error';
    error = 'BrandMeister activity disconnected.';
    finish();
  }
  function fail(message) {
    status = 'error';
    error = message;
    sessions.clear();
    heardNodes.clear();
    observedSince = null;
    console.warn('[Amateur Radio] BrandMeister activity:', message);
    finish();
  }
  function requestSample() {
    socket.emit('sendCurrentSessions');
    if (sample !== null) cancel(sample);
    sample = schedule(finish, 2000);
  }
  const api = {
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
          if (nodeLeaseUntil >= now()) observedSince = now();
          socket.emit('join', 'everything');
          requestSample();
        });
        socket.on('mqtt', (message) => {
          const time = now();
          const collectingNodes = nodeLeaseUntil >= time;
          if (!collectingNodes && nodeLeaseUntil) clearNodes();
          const row = normalizeActivity(
            message,
            time,
            collectingNodes ? BRANDMEISTER_SHORT_AGE : ACTIVITY_MAX_AGE,
          );
          if (!row) return;
          const previous = sessions.get(row.sessionId);
          if (
            previous &&
            ((!previous.active && row.active) ||
              previous.activityAt > row.activityAt)
          )
            return;
          if (collectingNodes) {
            const node = normalizeNodeActivity(message, time);
            const directoryNode = node && nodeDirectory.get(node.nodeId);
            if (
              directoryNode &&
              directoryNode.callsign.trim().toUpperCase() === node.nodeCall &&
              node.lastHeardAt > (heardNodes.get(node.nodeId) ?? 0)
            )
              heardNodes.set(node.nodeId, node.lastHeardAt);
          }
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
    async getNodeSnapshot(directory) {
      const time = now();
      if (nodeLeaseUntil < time) {
        heardNodes.clear();
        observedSince = null;
      }
      for (const nodeId of heardNodes.keys())
        if (
          directory.get(nodeId)?.callsign.trim().toUpperCase() !==
          nodeDirectory.get(nodeId)?.callsign.trim().toUpperCase()
        )
          heardNodes.delete(nodeId);
      nodeDirectory = directory;
      nodeLeaseUntil = time + 30_000;
      if (socket?.connected && observedSince === null) observedSince = time;
      const activity = await api.getSnapshot();
      const fetchedAt = now();
      const rows = [];
      for (const [nodeId, lastHeardAt] of heardNodes) {
        const node = nodeDirectory.get(nodeId);
        if (
          !node ||
          lastHeardAt > fetchedAt ||
          fetchedAt - lastHeardAt > BRANDMEISTER_SHORT_AGE
        ) {
          heardNodes.delete(nodeId);
          continue;
        }
        if (activity.status === 'live') rows.push({ ...node, lastHeardAt });
      }
      return {
        status: activity.status,
        error: activity.error,
        fetchedAt,
        observedSince,
        rows,
      };
    },
    close,
  };
  return api;
}
