import {
  readResponseJsonCapped,
  coalesceProxyRequest,
} from '../common/http.js';
import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import {
  SATNOGS_ORIGIN,
  validNoradId,
  normalizeSatnogsObservations,
} from '../../../src/sources/satnogs.js';

const TTL = 60_000;
const STALE_TTL = 15 * 60_000;
const MAX_CACHE = 100;
const MAX_INFLIGHT = 8;

/** Fixed-origin, GET-only public observation lookup; never schedules ground stations. */
export function satnogsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const cache = new Map(),
    inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 30, globalMax: 300 });
  function remember(id, entry) {
    cache.delete(id);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(id, entry);
  }
  const install = ({ middlewares }) => {
    middlewares.use('/api/satnogs', async (req, res) => {
      function json(status, body) {
        if (res.destroyed) return;
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...(status === 405 ? { Allow: 'GET' } : {}),
          ...(status === 429 || status === 503 ? { 'Retry-After': '60' } : {}),
        });
        res.end(JSON.stringify(body));
      }
      if (req.method !== 'GET')
        return json(405, { error: 'method_not_allowed' });
      if (!/^\/[1-9]\d{0,8}$/.test(req.url || ''))
        return json(400, { error: 'invalid_satnogs_request' });
      const id = Number(req.url.slice(1));
      if (!validNoradId(id)) return json(400, { error: 'invalid_norad_id' });
      if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
      const previous = cache.get(id);
      if (previous && now() < previous.retryAt)
        return json(previous.status, previous.body);
      if (!inFlight.has(id) && inFlight.size >= MAX_INFLIGHT)
        return json(503, { error: 'SatNOGS lookup busy; try again shortly.' });
      const { promise } = coalesceProxyRequest(inFlight, id, async () => {
        try {
          const requestedAt = now();
          const upstream = new URL('/api/observations/', SATNOGS_ORIGIN);
          upstream.searchParams.set('norad_cat_id', String(id));
          upstream.searchParams.set('end', new Date(requestedAt).toISOString());
          upstream.searchParams.set('format', 'json');
          const signal = AbortSignal.timeout(15_000);
          const response = await fetchImpl(upstream.href, {
            signal,
            redirect: 'error',
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await readResponseJsonCapped(
            response,
            2 * 1024 * 1024,
            signal,
          );
          const observations = normalizeSatnogsObservations(
            payload,
            id,
            requestedAt,
          );
          const body = {
            noradId: id,
            fetchedAt: requestedAt,
            stale: false,
            error: null,
            observations,
            checkedCount: payload.length,
            hasMore: /rel="?next"?/.test(response.headers.get('link') || ''),
          };
          const entry = { body, status: 200, retryAt: now() + TTL };
          remember(id, entry);
          return entry;
        } catch (cause) {
          console.warn(
            `[SatNOGS] NORAD ${id} observation lookup failed:`,
            cause.message,
          );
          const error = `SatNOGS observations unavailable: ${cause.message}`;
          const usable =
            previous?.body.fetchedAt != null &&
            now() - previous.body.fetchedAt <= STALE_TTL;
          const entry = {
            status: usable ? 200 : 502,
            body: usable ? { ...previous.body, stale: true, error } : { error },
            retryAt: now() + 30_000,
          };
          remember(id, entry);
          return entry;
        }
      });
      const result = await promise;
      json(result.status, result.body);
    });
  };
  return {
    name: 'satnogs-observations',
    configureServer: install,
    configurePreviewServer: install,
  };
}
