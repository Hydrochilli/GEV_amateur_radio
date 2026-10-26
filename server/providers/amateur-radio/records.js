import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const AREA = Object.freeze({
  lat: 53.4808,
  lon: -2.2426,
  radiusKm: 100,
  name: 'Manchester',
});
const MAX_KML_BYTES = 4 * 1024 * 1024;
const text = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, 240);
const number = (value) =>
  typeof value === 'number' || (typeof value === 'string' && value.trim())
    ? Number(value)
    : NaN;

function coordinates(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function distanceKm(lat, lon) {
  const radians = (value) => (value * Math.PI) / 180;
  const a =
    Math.sin(radians(lat - AREA.lat) / 2) ** 2 +
    Math.cos(radians(lat)) *
      Math.cos(radians(AREA.lat)) *
      Math.sin(radians(lon - AREA.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function localRows(rows) {
  return rows
    .map((row) => ({ ...row, distanceKm: distanceKm(row.lat, row.lon) }))
    .filter((row) => row.distanceKm <= AREA.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
    .slice(0, 2000);
}

export function brandmeisterRows(payload) {
  if (!Array.isArray(payload))
    throw new Error('Invalid BrandMeister device directory');
  const rows = new Map();
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const id = text(item.id);
    const callsign = text(item.callsign);
    const lat = number(item.lat);
    const lon = number(item.lng);
    if (!/^\d{1,12}$/.test(id) || !callsign || !coordinates(lat, lon)) continue;
    rows.set(id, {
      id: `brandmeister:${id}`,
      network: 'brandmeister',
      nodeId: id,
      callsign,
      lat,
      lon,
      description: text(item.city),
      txMHz: number(item.tx) > 0 ? number(item.tx) : null,
      rxMHz: number(item.rx) > 0 ? number(item.rx) : null,
      lastSeen: /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(item.last_seen)
        ? `${item.last_seen.replace(' ', 'T')}Z`
        : null,
    });
  }
  return localRows([...rows.values()]);
}

export function echolinkRows(bytes) {
  let kmlCount = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      if (!entry.name.toLowerCase().endsWith('.kml')) return false;
      if (++kmlCount > 1)
        throw new Error('EchoLink archive must contain one KML document');
      if (entry.originalSize > MAX_KML_BYTES)
        throw new Error('EchoLink KML exceeds size limit');
      return true;
    },
  });
  const kmlFiles = Object.values(files);
  if (kmlFiles.length !== 1)
    throw new Error('EchoLink archive must contain one KML document');
  const xml = strFromU8(kmlFiles[0]);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new Error('EchoLink KML declarations are not supported');
  if (XMLValidator.validate(xml) !== true)
    throw new Error('Invalid EchoLink KML');
  const parsed = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
    isArray: (name) => name === 'Placemark' || name === 'Folder',
  }).parse(xml);
  if (!parsed.kml) throw new Error('Missing EchoLink KML root');
  const rows = new Map();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const mark of node.Placemark || []) {
      const callsign = text(mark.name);
      const parts = text(mark.Point?.coordinates).split(',');
      const lon = number(parts[0]);
      const lat = number(parts[1]);
      const description = text(mark.description);
      const nodeId = /(?:^|\s)(\d{1,12})$/.exec(description)?.[1];
      if (
        !/^[A-Z0-9/]+-[LR]$/.test(callsign) ||
        !nodeId ||
        !coordinates(lat, lon)
      )
        continue;
      const frequency = /\((\d+(?:\.\d+)?)\)\s+\d+$/.exec(description);
      rows.set(nodeId, {
        id: `echolink:${nodeId}`,
        network: 'echolink',
        nodeId,
        callsign,
        lat,
        lon,
        description,
        txMHz:
          frequency && Number(frequency[1]) > 0 ? Number(frequency[1]) : null,
        rxMHz: null,
        lastSeen: null,
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'Placemark') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parsed.kml);
  return localRows([...rows.values()]);
}
