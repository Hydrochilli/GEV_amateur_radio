import net from 'node:net';
import { Frame } from '@hamradio/aprs';
import { AREA, distanceKm } from './records.js';

export const POSITION_TTL = 15 * 60_000;
const MAX_STATIONS = 1000;
const POSITION_TYPES = new Set(['!', '=', '/', '@', '`', "'"]);

function reportTime(timestamp, now) {
  if (!timestamp?.zulu) return null;
  if (
    timestamp &&
    (!Number.isInteger(timestamp.hours) ||
      timestamp.hours < 0 ||
      timestamp.hours > 23 ||
      !Number.isInteger(timestamp.minutes) ||
      timestamp.minutes < 0 ||
      timestamp.minutes > 59 ||
      (timestamp.seconds !== undefined &&
        (!Number.isInteger(timestamp.seconds) ||
          timestamp.seconds < 0 ||
          timestamp.seconds > 59)) ||
      (timestamp.format === 'DHM' &&
        (!Number.isInteger(timestamp.day) ||
          timestamp.day < 1 ||
          timestamp.day > 31)))
  )
    throw new Error('Invalid APRS report timestamp');
  const date = new Date(now);
  const candidates = [];
  if (timestamp.format === 'HMS') {
    for (const offset of [-1, 0, 1])
      candidates.push(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate() + offset,
          timestamp.hours,
          timestamp.minutes,
          timestamp.seconds || 0,
        ),
      );
  } else if (timestamp.format === 'DHM') {
    for (const offset of [-1, 0, 1]) {
      const month = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1),
      );
      const candidate = Date.UTC(
        month.getUTCFullYear(),
        month.getUTCMonth(),
        timestamp.day,
        timestamp.hours,
        timestamp.minutes,
      );
      if (new Date(candidate).getUTCDate() === timestamp.day)
        candidates.push(candidate);
    }
  }
  return (
    candidates
      .filter((value) => Number.isFinite(value) && value <= now + 120_000)
      .sort((a, b) => b - a)[0] ?? null
  );
}

/** Keep only public station positions, never messages, comments or raw packets. */
export function decodePosition(line, now) {
  const frame = Frame.fromString(line);
  if (!POSITION_TYPES.has(frame.payload[0])) return null;
  const payload = frame.decode();
  if (!payload?.position || payload.doNotArchive) return null;
  let { latitude: lat, longitude: lon } = payload.position;
  const { ambiguity = 0, symbol } = payload.position;
  if (frame.payload[0] === '`' || frame.payload[0] === "'") {
    // v1.4.2 reverses Mic-E's hemisphere flags and uses the wrong offset bit.
    // APRS 1.01: destination characters 4/5/6 encode N/S, +100 degrees, W/E.
    const destination = frame.destination.call;
    if (!/^[0-9A-JP-Y]{6}$/.test(destination) || frame.payload.length < 9)
      return null;
    const north = destination.charCodeAt(3) >= 80;
    const offset = destination.charCodeAt(4) >= 80;
    const west = destination.charCodeAt(5) >= 80;
    let degrees = frame.payload.charCodeAt(1) - 28 + (offset ? 100 : 0);
    if (degrees >= 180 && degrees <= 189) degrees -= 80;
    else if (degrees >= 190 && degrees <= 199) degrees -= 190;
    let minutes = frame.payload.charCodeAt(2) - 28;
    if (minutes >= 60) minutes -= 60;
    const hundredths = frame.payload.charCodeAt(3) - 28;
    if (
      degrees < 0 ||
      degrees > 180 ||
      minutes < 0 ||
      minutes >= 60 ||
      hundredths < 0 ||
      hundredths > 99
    )
      return null;
    lat = Math.abs(lat) * (north ? 1 : -1);
    lon = (degrees + (minutes + hundredths / 100) / 60) * (west ? -1 : 1);
  }
  const callsign = frame.source.toString();
  if (
    !/^[A-Z0-9]{1,9}(?:-[A-Z0-9]{1,2})?$/.test(callsign) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const distance = distanceKm(lat, lon);
  const reportedAt = reportTime(payload.timestamp, now);
  if (
    distance > AREA.radiusKm ||
    (reportedAt !== null && now - reportedAt > POSITION_TTL)
  )
    return null;
  const destination = frame.destination.toString();
  return {
    id: `aprs:${callsign}`,
    network: 'aprs',
    callsign,
    lat,
    lon,
    distanceKm: distance,
    receivedAt: now,
    reportedAt,
    ambiguity,
    kind: symbol?.code === '_' ? 'weather station' : 'station',
    destination,
    path: frame.path.map((item) => item.toString()).slice(0, 12),
    brandmeister: /^APBM\d[DS]$/.test(destination),
  };
}

/** One shared, leased, receive-only filtered connection; no packet-transmit API. */
export function createAprsReceiver({
  callsign = process.env.APRS_IS_CALLSIGN?.trim(),
  connect = () =>
    net.createConnection({ host: 'rotate.aprs2.net', port: 14580 }),
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  warn = (...args) => console.warn('[APRS]', ...args),
} = {}) {
  const valid = /^[A-Z0-9]{3,9}(?:-[A-Z0-9]{1,2})?$/.test(callsign || '');
  let status = valid ? 'idle' : 'unconfigured';
  let error = valid
    ? null
    : 'Set a valid, unique APRS_IS_CALLSIGN in .env to receive published positions.';
  let socket = null,
    idleTimer = null,
    handshakeTimer = null,
    buffer = '',
    dropping = false;
  let retryAt = 0,
    failures = 0,
    lastPacketAt = null,
    rejected = 0;
  let lastWarningAt = -Infinity,
    closed = false;
  const rows = new Map();

  function stop() {
    if (handshakeTimer !== null) cancel(handshakeTimer);
    handshakeTimer = null;
    const previous = socket;
    socket = null;
    previous?.destroy();
    buffer = '';
    dropping = false;
  }
  function fail(message) {
    status = 'error';
    error = message;
    retryAt = now() + Math.min(60_000, 2000 * 2 ** Math.min(failures++, 5));
    warn(message);
    stop();
  }
  function rejectPacket() {
    rejected++;
    if (now() - lastWarningAt >= 60_000) {
      lastWarningAt = now();
      warn(
        'Discarding malformed or oversized APRS data; see rejectedPackets in the position status.',
      );
    }
  }
  function start() {
    if (closed || !valid || socket || now() < retryAt) return;
    status = 'connecting';
    error = null;
    let current;
    try {
      current = connect();
    } catch (cause) {
      fail(`APRS connection failed: ${cause.message}`);
      return;
    }
    socket = current;
    handshakeTimer = schedule(() => {
      if (socket === current) fail('APRS receive-only login timed out.');
    }, 30_000);
    handshakeTimer.unref?.();
    let loginSent = false;
    current.setEncoding('utf8');
    current.setTimeout(30_000);
    current.on('timeout', () => {
      if (socket === current) fail('APRS connection timed out.');
    });
    current.on('error', (cause) => {
      if (socket === current) fail(`APRS connection failed: ${cause.message}`);
    });
    current.on('close', () => {
      if (socket === current)
        fail('APRS server disconnected; retrying while the layer is active.');
    });
    current.on('data', (chunk) => {
      if (socket !== current) return;
      // Process incrementally so a chunk cannot grow the packet buffer unbounded.
      for (const character of chunk) {
        if (socket !== current) return;
        if (character === '\n') {
          const line = buffer.replace(/\r$/, '');
          buffer = '';
          if (dropping) {
            dropping = false;
            continue;
          }
          if (Buffer.byteLength(line, 'utf8') > 510) {
            rejectPacket();
            continue;
          }
          if (!line) continue;
          if (line.startsWith('#')) {
            if (!loginSent) {
              loginSent = true;
              current.write(
                `user ${callsign} pass -1 vers GodsEyeView 0.2.1 filter r/${AREA.lat}/${AREA.lon}/${AREA.radiusKm}\r\n`,
              );
            } else if (/^# logresp /i.test(line)) {
              if (!line.startsWith(`# logresp ${callsign} unverified,`)) {
                fail('APRS server did not acknowledge the receive-only login.');
                return;
              }
              status = 'live';
              if (handshakeTimer !== null) cancel(handshakeTimer);
              handshakeTimer = null;
              error = null;
              failures = 0;
              current.setTimeout(90_000);
            }
            continue;
          }
          if (status !== 'live') continue;
          try {
            const row = decodePosition(line, now());
            if (!row) continue;
            const previous = rows.get(row.id);
            // Delayed reports cannot rewind a station with a newer explicit timestamp.
            if (
              previous?.reportedAt != null &&
              row.reportedAt != null &&
              row.reportedAt < previous.reportedAt
            )
              continue;
            if (rows.size >= MAX_STATIONS && !rows.has(row.id))
              rows.delete(rows.keys().next().value);
            rows.delete(row.id);
            rows.set(row.id, row);
            lastPacketAt = row.receivedAt;
          } catch {
            rejectPacket();
          }
        } else if (!dropping) {
          buffer += character;
          if (Buffer.byteLength(buffer, 'utf8') > 511) {
            buffer = '';
            dropping = true;
            rejectPacket();
          }
        }
      }
    });
  }
  return {
    getSnapshot() {
      if (!closed && valid) {
        if (idleTimer) cancel(idleTimer);
        idleTimer = schedule(() => {
          idleTimer = null;
          stop();
          if (valid) {
            status = 'idle';
            error = null;
          }
        }, 30_000);
        idleTimer.unref?.();
        start();
      }
      for (const [id, row] of rows)
        if (
          now() - row.receivedAt > POSITION_TTL ||
          (row.reportedAt !== null && now() - row.reportedAt > POSITION_TTL)
        )
          rows.delete(id);
      return {
        area: AREA,
        status,
        error,
        lastPacketAt,
        rejectedPackets: rejected,
        rows: [...rows.values()],
      };
    },
    close() {
      closed = true;
      if (idleTimer) cancel(idleTimer);
      idleTimer = null;
      stop();
      rows.clear();
      if (valid) {
        status = 'idle';
        error = null;
      }
    },
  };
}
