import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  brandmeisterRows,
  echolinkRows,
} from '../../../server/providers/amateur-radio/records.js';
import { buildNodeCard, nodeLink } from './cards.js';
import {
  BRANDMEISTER_MAX_AGE,
  MAX_DIRECTORY_ROWS,
  brandmeisterLastSeen,
} from '../../sources/amateurRadioDirectory.js';

const NOW = Date.UTC(2026, 9, 26, 11);
const lastSeen = (time) =>
  new Date(time).toISOString().slice(0, 19).replace('T', ' ');

export const deviceFixture = {
  id: 234221,
  callsign: 'GB3XR',
  lat: 53.39678,
  lng: -2.06361,
  city: 'Manchester area',
  tx: '430.9875',
  rx: '438.5875',
  last_seen: '2026-10-26 10:55:54',
};
export const kmlFixture = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>
<Placemark><name>G8CZE-L</name><description>Manchester Gateway_RPT [0/2] (430.050) 886150</description>
<Point><coordinates>-2.1471666667,53.4751666667,0</coordinates></Point></Placemark>
</Folder></Document></kml>`;
export const kmzFixture = () => zipSync({ 'doc.kml': strToU8(kmlFixture) });

test('BrandMeister keeps worldwide recently seen rows without claiming confirmed transmissions', () => {
  const rows = brandmeisterRows(
    [
      deviceFixture,
      { ...deviceFixture },
      { ...deviceFixture, id: 2, lat: 0, lng: 0 },
      { ...deviceFixture, id: 3, lat: 39, lng: 23 },
      { ...deviceFixture, id: 4, lat: '', lng: -2 },
      { ...deviceFixture, id: 5, lat: null },
      { ...deviceFixture, id: 'bad/url' },
    ],
    NOW,
  );
  assert.equal(rows.length, 2);
  const local = rows.find((row) => row.nodeId === '234221');
  assert.equal(local.lastSeen, '2026-10-26T10:55:54.000Z');
  assert.equal(local.lastSeenAt, Date.UTC(2026, 9, 26, 10, 55, 54));
  assert.equal(rows.find((row) => row.nodeId === '3').lat, 39);
  assert.equal(local.txMHz, 430.9875);
  assert.equal('distanceKm' in local, false);
  assert.equal('online' in local, false);
  assert.throws(() => brandmeisterRows({}), /Invalid/);
});

test('EchoLink extracts worldwide RF links from official KMZ without executing descriptions', () => {
  const [row] = echolinkRows(kmzFixture());
  assert.equal(row.callsign, 'G8CZE-L');
  assert.equal(row.nodeId, '886150');
  assert.equal(row.network, 'echolink');
  assert.equal(row.txMHz, 430.05);
  assert.equal('distanceKm' in row, false);
  assert.equal(row.lastSeen, null);
  const noCoordinates = zipSync({
    'doc.kml': strToU8(kmlFixture.replace(/<Point>.*?<\/Point>/s, '')),
  });
  assert.deepEqual(echolinkRows(noCoordinates), []);
  const worldwide = echolinkRows(
    zipSync({
      'doc.kml': strToU8(
        kmlFixture.replace('-2.1471666667,53.4751666667,0', '151.21,-33.87,0'),
      ),
    }),
  );
  assert.equal(worldwide[0].lat, -33.87);
  assert.equal(worldwide[0].lon, 151.21);
});

test('live matching can use geolocated directory nodes with old or unknown timestamps without changing hourly admission', () => {
  const devices = [
    deviceFixture,
    { ...deviceFixture, id: 2, last_seen: lastSeen(NOW - 7200_000) },
    { ...deviceFixture, id: 3, last_seen: null },
    { ...deviceFixture, id: 4, last_seen: '1970-01-01 00:00:00' },
    { ...deviceFixture, id: 5, lat: 0, lng: 0 },
  ];
  const all = brandmeisterRows(devices, NOW, { recentOnly: false });
  assert.deepEqual(
    all.map((row) => row.nodeId),
    ['2', '234221', '3', '4'],
  );
  assert.equal(all.find((row) => row.nodeId === '3').lastSeenAt, null);
  assert.equal(all.find((row) => row.nodeId === '4').lastSeenAt, null);
  assert.equal(all.find((row) => row.nodeId === '4').lastSeen, null);
  assert.deepEqual(
    brandmeisterRows(devices, NOW).map((row) => row.nodeId),
    ['234221'],
  );
});

test('last-hour eligibility is exact and excludes absent, invalid, old and future timestamps', () => {
  const at = NOW - BRANDMEISTER_MAX_AGE;
  const rows = brandmeisterRows(
    [
      { ...deviceFixture, id: 1, last_seen: lastSeen(at) },
      { ...deviceFixture, id: 2, last_seen: lastSeen(at - 1000) },
      { ...deviceFixture, id: 3, last_seen: lastSeen(NOW) },
      { ...deviceFixture, id: 4, last_seen: lastSeen(NOW + 1000) },
      { ...deviceFixture, id: 5, last_seen: null },
      { ...deviceFixture, id: 6, last_seen: '2026-02-30 10:00:00' },
      { ...deviceFixture, id: 7, last_seen: 'not a time' },
      { ...deviceFixture, id: 8, last_seen: lastSeen(NOW - 1000) },
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((row) => row.nodeId),
    ['1', '3', '8'],
  );
  assert.equal(
    brandmeisterRows([{ ...deviceFixture, last_seen: lastSeen(at) }], NOW + 1)
      .length,
    0,
  );
  assert.equal(brandmeisterLastSeen('2026-02-30 10:00:00'), null);
});

test('worldwide catalogues are not silently truncated at the former 2000-marker limit', () => {
  const devices = Array.from({ length: 2500 }, (_, i) => ({
    ...deviceFixture,
    id: i + 1,
    lat: -33.87,
    lng: 151.21,
  }));
  assert.equal(brandmeisterRows(devices, NOW).length, 2500);
  assert.throws(
    () =>
      brandmeisterRows(Array(MAX_DIRECTORY_ROWS + 1).fill(deviceFixture), NOW),
    /record limit/,
  );
});

test('malformed XML, archive bombs, external entities and non-KML archives are rejected', () => {
  assert.throws(() => echolinkRows(new Uint8Array([1, 2, 3])));
  for (const xml of [
    '<kml><Document></kml>',
    '<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///etc/passwd">]><kml/>',
    '<html/>',
    '<kml>' + ' '.repeat(4 * 1024 * 1024) + '</kml>',
  ]) {
    assert.throws(() => echolinkRows(zipSync({ 'doc.kml': strToU8(xml) })));
  }
  assert.throws(() => echolinkRows(zipSync({ 'other.txt': strToU8('hello') })));
  assert.throws(() =>
    echolinkRows(
      zipSync({
        'first.kml': strToU8(kmlFixture),
        'second.kml': strToU8(kmlFixture),
      }),
    ),
  );
});

test('cards disclose freshness and directory limitations; links are fixed official origins', () => {
  const [row] = brandmeisterRows([deviceFixture], NOW);
  const card = buildNodeCard(
    row,
    { fetchedAt: NOW - 120_000, stale: true, error: 'Feed unavailable' },
    NOW,
  );
  assert.ok(
    card.details.includes(
      'Directory last seen within one hour; not proof of a radio transmission',
    ),
  );
  assert.ok(
    buildNodeCard(
      { ...row, lastHeardAt: NOW },
      { fetchedAt: NOW },
      NOW,
    ).details.includes(
      'Public Last Heard activity within five minutes; node ID and node callsign matched to this directory location',
    ),
  );
  assert.ok(card.details.some((line) => line.includes('2m ago | STALE')));
  assert.ok(card.details.includes('Feed unavailable'));
  assert.equal(nodeLink(row), 'https://brandmeister.network/#/device/234221');
  assert.equal(
    nodeLink(echolinkRows(kmzFixture())[0]),
    'https://webapp.echolink.org/',
  );
  assert.throws(() =>
    nodeLink({ network: 'brandmeister', nodeId: '../selfcare' }),
  );
});
