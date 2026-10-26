const GROUPS = new Set([
  'stations',
  'amateur',
  'visual',
  'gps-ops',
  'glo-ops',
  'galileo',
  'geo',
  'starlink',
]);

/** Read catalog text from the existing group endpoint using a supplied transport. */
export function createSatelliteSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getObservations(noradId, { signal } = {}) {
      if (!validNoradId(noradId))
        throw new TypeError('Invalid satellite NORAD ID');
      signal = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(20_000),
      ]);
      signal.throwIfAborted();
      const response = await fetchImpl(`/api/satnogs/${noradId}`, { signal });
      if (!response.ok)
        throw new Error(
          `SatNOGS observations unavailable (HTTP ${response.status})`,
        );
      const value = await readResponseJsonCapped(response, 128 * 1024, signal);
      if (!isSatnogsSnapshot(value, noradId))
        throw new Error('Invalid SatNOGS observation snapshot');
      return value;
    },
    async readGroup(group, { signal } = {}) {
      if (!GROUPS.has(group)) throw new TypeError('Unknown satellite group');
      signal?.throwIfAborted();
      const response = await fetchImpl(`/api/celestrak/${group}`, { signal });
      const text = response.ok ? await response.text() : '';
      signal?.throwIfAborted();
      // The proxy serves its last copy, marked STALE-ERROR, when CelesTrak
      // is down.
      const stale = response.headers?.get?.('x-tle-cache') === 'STALE-ERROR';
      return { ok: response.ok, status: response.status, text, stale };
    },
  };
}
import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { validNoradId, isSatnogsSnapshot } from '../../sources/satnogs.js';
