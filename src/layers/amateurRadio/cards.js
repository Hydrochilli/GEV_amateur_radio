export const NETWORKS = Object.freeze({
  brandmeister: { label: 'BrandMeister', color: '#ffb347' },
  echolink: { label: 'EchoLink', color: '#50c8ff' },
});
export const POSITION_COLOR = '#76e3a0';
export const CLIENT_LINKS = Object.freeze({
  hoseline: 'https://hose.brandmeister.network/',
  lastHeard: 'https://brandmeister.network/#/lh',
  echolink: 'https://webapp.echolink.org/',
});

export function nodeLink(row) {
  if (row.network === 'echolink') return CLIENT_LINKS.echolink;
  if (row.network === 'brandmeister' && /^\d{1,12}$/.test(row.nodeId))
    return `https://brandmeister.network/#/device/${row.nodeId}`;
  throw new Error('Invalid amateur radio node link');
}

export function buildNodeCard(row, network, now = Date.now()) {
  const details = [
    `Node ${row.nodeId} | ${row.lat.toFixed(4)}, ${row.lon.toFixed(4)} (lat, lon)`,
    row.description,
    row.network === 'echolink'
      ? 'Online in directory snapshot; owner-supplied position'
      : row.lastHeardAt
        ? 'Public Last Heard activity within five minutes; node ID and node callsign matched to this directory location'
        : 'Directory last seen within one hour; not proof of a radio transmission',
  ].filter(Boolean);
  if (Number.isFinite(row.txMHz))
    details.push(`Listed TX: ${row.txMHz.toFixed(4)} MHz`);
  if (Number.isFinite(row.rxMHz))
    details.push(`Listed RX: ${row.rxMHz.toFixed(4)} MHz`);
  if (row.lastSeen) details.push(`Last seen: ${row.lastSeen} (UTC)`);
  if (row.lastHeardAt)
    details.push(
      `Last public node activity: ${new Date(row.lastHeardAt).toISOString()} (UTC)`,
    );
  if (network.fetchedAt !== null)
    details.push(
      `Directory fetched ${Math.max(0, Math.floor((now - network.fetchedAt) / 60000))}m ago${network.stale ? ' | STALE' : ''}`,
    );
  if (network.error) details.push(network.error);
  details.push('Coordinates unverified; no coverage inferred');
  details.push(
    row.network === 'echolink'
      ? `Click: EchoLink Web; select ${row.callsign} manually`
      : 'Click: open audio dock; prefer matching local/regional intended areas, then country priority from this marker. Not a speaker fix or connection to this node.',
  );
  return {
    id: `amateur-radio-card:${row.id}`,
    selected: true,
    interactive: true,
    title: `${NETWORKS[row.network].label} | ${row.callsign}`,
    details,
    accent: NETWORKS[row.network].color,
    accessibilityLabel:
      row.network === 'brandmeister'
        ? `Open BrandMeister Hoseline for ${row.callsign}`
        : `Open official EchoLink page for ${row.callsign}`,
    priority: Number.MAX_SAFE_INTEGER,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}

export function buildPositionCard(row, status, now = Date.now()) {
  return {
    id: `amateur-radio-card:${row.id}`,
    selected: true,
    interactive: false,
    title: `Published APRS position | ${row.callsign}`,
    details: [
      `${row.kind} | ${row.distanceKm.toFixed(1)} km from Manchester`,
      `Last received ${Math.max(0, Math.floor((now - row.receivedAt) / 1000))}s ago${status.status !== 'live' ? ' | STALE / disconnected' : ''}`,
      row.reportedAt === null
        ? 'Report time not supplied in UTC; receipt time is not GPS fix time'
        : `Report timestamp: ${new Date(row.reportedAt).toISOString()}`,
      ...(row.ambiguity
        ? [`APRS ambiguity level ${row.ambiguity}; not an exact fix`]
        : []),
      `${row.brandmeister ? 'BrandMeister APRS gateway identifier' : 'APRS destination'}: ${row.destination}`,
      `Source path: ${row.path.join(', ') || '(not supplied)'}`,
      'Self-published station coordinates; not verified operator identity, movement or GPS accuracy.',
      'EchoLink directory locations are separate; activity/audio do not supply these coordinates.',
      status.error,
    ].filter(Boolean),
    accent: POSITION_COLOR,
    priority: Number.MAX_SAFE_INTEGER,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}
