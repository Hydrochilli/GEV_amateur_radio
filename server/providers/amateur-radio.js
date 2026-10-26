import {
  readResponseBytesCapped,
  readResponseJsonCapped,
  coalesceProxyRequest,
} from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import {
  AREA,
  brandmeisterRows,
  echolinkRows,
} from './amateur-radio/records.js';
import { createAprsReceiver } from './amateur-radio/aprs.js';
import { createBrandmeisterActivity } from './amateur-radio/activity.js';
import {
  DIRECTORY_AREA,
  isRecentBrandmeister,
} from '../../src/sources/amateurRadioDirectory.js';

const PROVIDERS = [
  {
    id: 'brandmeister',
    url: 'https://api.brandmeister.network/v2/device',
    ttl: 300_000,
    cap: 24 * 1024 * 1024,
    read: readResponseJsonCapped,
    normalize: (payload, time) =>
      brandmeisterRows(payload, time, { recentOnly: false }),
  },
  {
    id: 'echolink',
    url: 'https://www.echolink.org/node_location.kmz',
    ttl: 180_000,
    cap: 2 * 1024 * 1024,
    read: readResponseBytesCapped,
    normalize: echolinkRows,
  },
];

/** Read-only directories; no credentials, audio relay, or device-control routes. */
export function amateurRadioProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  positions = createAprsReceiver({ now }),
  activity = createBrandmeisterActivity({ now }),
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 600 });

  async function acquire(provider) {
    const previous = cache.get(provider.id);
    if (previous && now() < previous.retryAt) return previous.snapshot;
    const { promise } = coalesceProxyRequest(
      inFlight,
      provider.id,
      async () => {
        try {
          const signal = AbortSignal.timeout(25_000);
          const response = await fetchImpl(provider.url, {
            signal,
            redirect: 'error',
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await provider.read(response, provider.cap, signal);
          const rows = provider.normalize(payload, now());
          const fetchedAt = now();
          const snapshot = {
            id: provider.id,
            rows,
            fetchedAt,
            stale: false,
            error: null,
          };
          cache.set(provider.id, {
            snapshot,
            retryAt: fetchedAt + provider.ttl,
          });
          return snapshot;
        } catch (error) {
          console.warn(
            `[Amateur Radio] ${provider.id} directory failed:`,
            error.message,
          );
          const usable =
            previous?.snapshot.fetchedAt != null &&
            now() - previous.snapshot.fetchedAt <= 3600_000;
          const snapshot = {
            id: provider.id,
            rows: usable ? previous.snapshot.rows : [],
            fetchedAt: usable ? previous.snapshot.fetchedAt : null,
            stale: Boolean(usable),
            error: `${provider.id} directory unavailable: ${error.message}`,
          };
          cache.set(provider.id, { snapshot, retryAt: now() + 30_000 });
          return snapshot;
        }
      },
    );
    return promise;
  }

  async function handler(req, res) {
    const json = (status, body) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    if (!['/', '/positions', '/activity', '/nodes'].includes(req.url || '/'))
      return json(400, { error: 'unsupported_radio_directory_request' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    if (req.url === '/activity') return json(200, await activity.getSnapshot());
    if (req.url === '/positions') return json(200, positions.getSnapshot());
    if (req.url === '/nodes') {
      const network = await acquire(PROVIDERS[0]);
      if (network.fetchedAt === null)
        return json(502, { error: network.error });
      const snapshot = await activity.getNodeSnapshot(
        new Map(network.rows.map((row) => [row.nodeId, row])),
      );
      return json(200, {
        ...snapshot,
        directoryFetchedAt: network.fetchedAt,
        directoryStale: network.stale,
        directoryError: network.error,
      });
    }
    const networks = (await Promise.all(PROVIDERS.map(acquire))).map(
      (network) =>
        network.id === 'brandmeister'
          ? {
              ...network,
              rows: network.rows.filter((row) =>
                isRecentBrandmeister(row, now()),
              ),
            }
          : network,
    );
    const unavailable = networks.every((network) => network.fetchedAt === null);
    json(unavailable ? 502 : 200, {
      area: DIRECTORY_AREA,
      aprsArea: AREA,
      networks,
      ...(unavailable
        ? { error: 'Amateur radio directories unavailable' }
        : {}),
    });
  }

  const install = ({ middlewares, httpServer }) => {
    middlewares.use('/api/amateur-radio', handler);
    httpServer?.once('close', () => {
      positions.close();
      activity.close();
    });
  };
  return {
    name: 'amateur-radio',
    configureServer: install,
    configurePreviewServer: install,
    closeBundle: () => {
      positions.close();
      activity.close();
    },
  };
}
