import test from 'node:test';
import assert from 'node:assert/strict';
import { twoline2satrec } from 'satellite.js';
import { createSatelliteSource } from './source.js';
import { createSatellitesLayer } from './index.js';
import { createState } from './state.js';
import { createIngestion } from './ingestion.js';
import { createControls } from './controls.js';
import { createOrbits } from './orbits.js';
import { createTracking } from './tracking.js';
import { CATALOG_GROUPS } from './policy.js';
import { parseTleText } from '../../sources/tle.js';
import { satelliteClassLabel, SATELLITE_CLASSES } from '../../data/satelliteClass.js';

test('satellite sources confine catalog groups and reject a cancelled body', async () => {
  const controller = new AbortController();
  let requests = 0;
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      requests++;
      assert.equal(url, '/api/celestrak/stations');
      return {
        ok: true,
        status: 200,
        text: async () => {
          controller.abort();
          return 'late catalog';
        },
      };
    },
  });
  await assert.rejects(
    source.readGroup('../active'),
    /Unknown satellite group/,
  );
  assert.equal(requests, 0);
  await assert.rejects(
    source.readGroup('stations', { signal: controller.signal }),
    { name: 'AbortError' },
  );
});

test('satellite factories keep control state separate and construct without requests', () => {
  const source = {
    readGroup() {
      assert.fail('construction fetched a catalog');
    },
  };
  const services = Object.fromEntries(
    [
      'picking',
      'focus',
      'readout',
      'overlays',
      'context',
      'render',
      'layerState',
    ].map((key) => [key, {}]),
  );
  services.layerState.isExplicitLayerStateOrigin = () => false;
  const first = createSatellitesLayer({ source, services });
  const second = createSatellitesLayer({ source, services });
  first.setParams({ showPoints: false });
  assert.equal(first.getParams().showPoints, false);
  assert.equal(second.getParams().showPoints, true);
  assert.notEqual(first.getStats(), second.getStats());
});

test('amateur orbital requests use the fixed group endpoint and preserve cache-stale status', async () => {
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      assert.equal(url, '/api/celestrak/amateur');
      return new Response('orbital elements', {
        headers: { 'x-tle-cache': 'STALE-ERROR' },
      });
    },
  });
  assert.deepEqual(await source.readGroup('amateur'), {
    ok: true, status: 200, text: 'orbital elements', stale: true,
  });
});

const tle = (id, name) => [
  name,
  `1 ${id}U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927`,
  `2 ${id}  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537`,
].join('\n');

function ingestionFixture() {
  const state = createState({ services: { overlays: {} } });
  const points = [];
  state._pointCollection = {
    removeAll: () => { points.length = 0; },
    add: (point) => { points.push(point); return point; },
  };
  const parts = {
    orbits: { parseTLE: parseTleText, propagatePosition: () => ({ latitude: 53, longitude: -2, altitude: 500_000 }) },
    labels: { _syncIssOverlay() {} },
    rendering: { _showOrbitPath() {} },
    tracking: { _reconcileTrackedSubjectContext() {}, _applyPendingTrackingRestore() {} },
  };
  const controls = createControls({
    state, parts, services: { layerState: { isExplicitLayerStateOrigin: () => false } },
  });
  parts.controls = controls;
  const feeds = new Map([
    ['stations', tle('25544', 'ISS')],
    ['amateur', `${tle('25544', 'ISS')}\n${tle('44444', 'RADIO TEST')}`],
    ...['visual', 'gps-ops', 'glo-ops', 'galileo', 'geo'].map((path) => [path, tle('44444', 'RADIO TEST')]),
  ]);
  const requested = [];
  const source = { async readGroup(path) {
    requested.push(path);
    return { ok: feeds.has(path), text: feeds.get(path) || '', status: feeds.has(path) ? 200 : 502 };
  } };
  const ingestion = createIngestion({ state, parts, services: {}, source });
  return { state, controls, feeds, requested, points,
    update: () => ingestion.methods.update({ scene: { primitives: { remove() {} } } }),
  };
}

test('amateur group is loaded, wins over generic groups, and reuses a single point per NORAD ID', async () => {
  const f = ingestionFixture();
  await f.update();
  assert.deepEqual(f.requested, CATALOG_GROUPS.map((group) => group.path));
  assert.equal(f.state._catalog.get(44444).group, 'amateur');
  assert.equal(f.state._catalog.get(25544).group, 'stations');
  assert.equal(f.points.length, 2);
  assert.equal(satelliteClassLabel(f.state._catalog.get(44444).group), 'AMATEUR RADIO');
  const color = f.state._points.get(44444).color;
  assert.equal(color.toCssHexString(), SATELLITE_CLASSES.amateur.color);
  const legend = f.controls.methods.getRowControls().legend;
  assert.equal(legend.find((item) => item.klass === 'amateur').count, 1);
  assert.equal(legend.find((item) => item.klass === 'station').count, 1);
  assert.match(f.controls.methods.getRowControls().info, /does not confirm an operating radio/);
  assert.equal(f.state._lastError, null);
  await f.update();
  assert.equal(f.points.length, 2, 'refresh replaces points rather than duplicating them');
});

test('amateur group failure is named without hiding other satellites or fabricating radio classification', async () => {
  const f = ingestionFixture();
  f.feeds.delete('amateur');
  await f.update();
  assert.match(f.state._lastError, /unavailable: amateur/);
  assert.equal(f.state._catalog.get(44444).group, 'visual');
  assert.equal(f.controls.methods.getRowControls().legend.some((row) => row.klass === 'amateur'), false);
  assert.equal(f.points.length, 2);
});

test('amateur positions change with propagation time at orbital altitude, not a ground directory location', () => {
  const records = parseTleText(tle('44444', 'RADIO TEST'));
  const satrec = twoline2satrec(records[0].line1, records[0].line2);
  const orbits = createOrbits({ state: {}, services: {}, parts: {} });
  const first = orbits.propagatePosition(satrec, new Date('2008-09-21T00:00:00Z'));
  const second = orbits.propagatePosition(satrec, new Date('2008-09-21T00:01:00Z'));
  assert.ok(first && second);
  assert.ok(first.altitude > 100_000);
  assert.ok(Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude) > 0.1);
});

test('amateur tracked card discloses predicted location, NORAD ID and orbital epoch', () => {
  const entry = parseTleText(tle('44444', 'RADIO TEST'))[0];
  const satrec = twoline2satrec(entry.line1, entry.line2);
  const state = {
    _catalog: new Map([[44444, { name: entry.name, group: 'amateur', satrec }]]),
    _trackedNorad: 44444,
    _trackedEntity: {},
    _trackedFrameGeo: { altitude: 500_000 },
  };
  let refreshed = 0;
  const tracking = createTracking({
    state,
    services: { focus: {}, context: {}, readout: { refreshTrackedReadout: () => refreshed++ } },
    parts: { labels: { _dockedCompanionNames: () => [] } },
  });
  tracking._updateTrackedSatelliteLabelModel();
  const card = state._trackedEntity.gevLabelModel;
  assert.equal(card.title, 'RADIO TEST');
  assert.equal(card.details[0], 'AMATEUR RADIO');
  assert.ok(card.details.includes('500 km · NORAD 44444'));
  assert.ok(card.details.includes('SGP4 predicted position; radio status unverified'));
  assert.ok(card.details.some((line) => line.startsWith('Orbital elements epoch: 2008-09-20T')));
  assert.equal(refreshed, 1);
  tracking._updateTrackedSatelliteLabelModel();
  assert.equal(refreshed, 1, 'unchanged cards retain the existing per-frame cache');
});

test('satellite pass prediction methods report no-tle on cold catalog and coerce IDs', () => {
  const source = { readGroup() {} };
  const services = Object.fromEntries(
    [
      'picking',
      'focus',
      'readout',
      'overlays',
      'context',
      'render',
      'layerState',
    ].map((key) => [key, {}]),
  );
  services.layerState.isExplicitLayerStateOrigin = () => false;
  const layer = createSatellitesLayer({ source, services });

  // Cold catalog (no satellites loaded yet)
  assert.deepEqual(layer.getNextIssPass({ latDeg: 30, lonDeg: -97 }), {
    status: 'no-tle',
  });
  assert.deepEqual(
    layer.getNextSatellitePass(25544, { latDeg: 30, lonDeg: -97 }),
    { status: 'no-tle' },
  );

  // String NORAD ID coercion
  assert.deepEqual(
    layer.getNextSatellitePass('25544', { latDeg: 30, lonDeg: -97 }),
    { status: 'no-tle' },
  );

  // Invalid / non-finite ID handling
  assert.deepEqual(
    layer.getNextSatellitePass(NaN, { latDeg: 30, lonDeg: -97 }),
    { status: 'no-tle' },
  );
  assert.deepEqual(
    layer.getNextSatellitePass(null, { latDeg: 30, lonDeg: -97 }),
    { status: 'no-tle' },
  );

  // Populated catalog: verify numeric and string coercion succeed
  const L1 =
    '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
  const L2 =
    '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
  const satrec = twoline2satrec(L1, L2);
  layer._setTrackedSatelliteRefreshStateForTest({
    noradId: 25544,
    name: 'ISS (ZARYA)',
    satrec,
  });

  const FROM_MS = 1221868800000;
  const numericResult = layer.getNextSatellitePass(25544, {
    latDeg: 30.2672,
    lonDeg: -97.7431,
    fromMs: FROM_MS,
  });
  assert.equal(numericResult.status, 'ok');
  assert.ok(numericResult.pass);

  const stringResult = layer.getNextSatellitePass('25544', {
    latDeg: 30.2672,
    lonDeg: -97.7431,
    fromMs: FROM_MS,
  });
  assert.equal(stringResult.status, 'ok');
  assert.deepEqual(stringResult, numericResult);

  const issResult = layer.getNextIssPass({
    latDeg: 30.2672,
    lonDeg: -97.7431,
    fromMs: FROM_MS,
  });
  assert.equal(issResult.status, 'ok');
  assert.deepEqual(issResult, numericResult);

  layer._setTrackedSatelliteRefreshStateForTest({
    noradId: 25544,
    name: 'ISS (ZARYA)',
    satrec,
    neighbours: [
      { noradId: 10, name: 'STARLINK ONE', satrec },
      { noradId: 11, name: 'STARLINK TWO', satrec },
    ],
  });
  assert.equal(layer.resolveSatelliteForPass('25544').noradId, 25544);
  assert.equal(layer.resolveSatelliteForPass('iss (zarya)').noradId, 25544);
  assert.equal(layer.resolveSatelliteForPass('starlink').status, 'ambiguous');
  assert.equal(layer.resolveSatelliteForPass('starlink').totalMatches, 2);
  assert.equal(layer.resolveSatelliteForPass('STARLINK ONE').noradId, 10);
  assert.equal(layer.resolveSatelliteForPass('missing').status, 'not-found');
  layer._clearDenseCatalogStateForTest();
  assert.equal(layer.resolveSatelliteForPass('25544').status, 'not-found');

  // Non-existent satellite ID in populated catalog
  assert.deepEqual(
    layer.getNextSatellitePass(99999, {
      latDeg: 30.2672,
      lonDeg: -97.7431,
      fromMs: FROM_MS,
    }),
    { status: 'no-tle' },
  );
});
