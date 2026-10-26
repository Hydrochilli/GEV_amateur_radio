import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  brandmeisterRows,
  echolinkRows,
} from '../../../server/providers/amateur-radio/records.js';
import { buildNodeCard, nodeLink } from './cards.js';

export const deviceFixture = {
  id: 234221,
  callsign: 'GB3XR',
  lat: 53.39678,
  lng: -2.06361,
  city: 'Manchester area',
  tx: '430.9875',
  rx: '438.5875',
  last_seen: '2026-10-13 22:55:54',
};
export const kmlFixture = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>
<Placemark><name>G8CZE-L</name><description>Manchester Gateway_RPT [0/2] (430.050) 886150</description>
<Point><coordinates>-2.1471666667,53.4751666667,0</coordinates></Point></Placemark>
</Folder></Document></kml>`;
export const kmzFixture = () => zipSync({ 'doc.kml': strToU8(kmlFixture) });

test('BrandMeister keeps valid local rows without claiming online or live positions', () => {
  const rows = brandmeisterRows([
    deviceFixture,
    { ...deviceFixture },
    { ...deviceFixture, id: 2, lat: 0, lng: 0 },
    { ...deviceFixture, id: 3, lat: 39, lng: 23 },
    { ...deviceFixture, id: 4, lat: '', lng: -2 },
    { ...deviceFixture, id: 5, lat: null },
    { ...deviceFixture, id: 'bad/url' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'brandmeister:234221');
  assert.equal(rows[0].lastSeen, '2026-10-13T22:55:54Z');
  assert.equal(rows[0].txMHz, 430.9875);
  assert.ok(rows[0].distanceKm < 20);
  assert.equal('online' in rows[0], false);
  assert.throws(() => brandmeisterRows({}), /Invalid/);
});

test('EchoLink extracts local RF links from official KMZ without executing descriptions', () => {
  const [row] = echolinkRows(kmzFixture());
  assert.equal(row.callsign, 'G8CZE-L');
  assert.equal(row.nodeId, '886150');
  assert.equal(row.network, 'echolink');
  assert.equal(row.txMHz, 430.05);
  assert.ok(row.distanceKm < 10);
  assert.equal(row.lastSeen, null);
  const noCoordinates = zipSync({
    'doc.kml': strToU8(kmlFixture.replace(/<Point>.*?<\/Point>/s, '')),
  });
  assert.deepEqual(echolinkRows(noCoordinates), []);
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
  const [row] = brandmeisterRows([deviceFixture]);
  const card = buildNodeCard(
    row,
    { fetchedAt: 0, stale: true, error: 'Feed unavailable' },
    120_000,
  );
  assert.ok(
    card.details.includes(
      'Seen within last day; not a live RF/activity report',
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
