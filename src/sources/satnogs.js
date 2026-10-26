export const SATNOGS_ORIGIN = 'https://network.satnogs.org';
export const validNoradId = (id) =>
  Number.isSafeInteger(id) && id > 0 && id <= 999999999;
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const text = (value, cap = 160) =>
  typeof value === 'string' ? value.trim().slice(0, cap) : '';
const STATUSES = new Set(['good', 'bad', 'unknown', 'failed']);

/** Only verified SatNOGS media locations; never use upstream URLs as proxy targets. */
export function satnogsMediaUrl(value, observationId) {
  if (typeof value !== 'string' || value.length > 1500) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.split('/').includes(String(observationId))
  )
    return null;
  const prefixes = {
    'https://network.satnogs.org': '/media/',
    'https://network-satnogs.freetls.fastly.net': '/media/',
    'https://s3.eu-central-1.wasabisys.com': '/satnogs-network/',
  };
  const prefix = prefixes[url.origin];
  return prefix && url.pathname.startsWith(prefix) ? url.href : null;
}

/** A bounded page is a search window, not proof that no older observations exist. */
export function normalizeSatnogsObservations(payload, noradId, now) {
  if (!validNoradId(noradId) || !Array.isArray(payload) || payload.length > 100)
    throw new Error('Invalid SatNOGS observation response');
  const observations = new Map();
  for (const row of payload) {
    if (!row || row.norad_cat_id !== noradId || !validId(row.id))
      throw new Error(
        'SatNOGS returned an observation for an invalid or different satellite',
      );
    const startAt = Date.parse(row.start),
      endAt = Date.parse(row.end);
    if (
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      startAt < 0 ||
      startAt > endAt
    )
      throw new Error('Invalid SatNOGS observation time');
    if (endAt > now || row.status === 'future') continue;
    if (
      !STATUSES.has(row.status) ||
      !Array.isArray(row.demoddata) ||
      row.demoddata.length > 10000
    )
      throw new Error('Invalid SatNOGS observation status or frame data');
    const audioUrl = satnogsMediaUrl(row.payload, row.id);
    const waterfallUrl = satnogsMediaUrl(row.waterfall, row.id);
    observations.set(row.id, {
      id: row.id,
      noradId,
      startAt,
      endAt,
      stationId: validId(row.ground_station) ? row.ground_station : null,
      stationName: text(row.station_name) || 'Station name not supplied',
      status: row.status,
      frequencyHz:
        Number.isFinite(row.observation_frequency) &&
        row.observation_frequency > 0
          ? row.observation_frequency
          : null,
      mode: text(row.transmitter_mode, 80),
      frameCount: row.demoddata.length,
      audioUrl,
      waterfallUrl,
      mediaNotice:
        (row.payload && !audioUrl) || (row.waterfall && !waterfallUrl)
          ? 'Some media use an unsupported storage location; open the official observation to view them.'
          : null,
    });
  }
  return [...observations.values()]
    .sort((a, b) => b.endAt - a.endAt || b.id - a.id)
    .slice(0, 5);
}

export function isSatnogsSnapshot(value, noradId) {
  return Boolean(
    value &&
    value.noradId === noradId &&
    Number.isFinite(value.fetchedAt) &&
    value.fetchedAt >= 0 &&
    typeof value.stale === 'boolean' &&
    (value.error === null || typeof value.error === 'string') &&
    Number.isSafeInteger(value.checkedCount) &&
    value.checkedCount >= 0 &&
    value.checkedCount <= 100 &&
    typeof value.hasMore === 'boolean' &&
    Array.isArray(value.observations) &&
    value.observations.length <= 5 &&
    new Set(value.observations.map((row) => row?.id)).size ===
      value.observations.length &&
    value.observations.every(
      (row) =>
        row &&
        validId(row.id) &&
        row.noradId === noradId &&
        Number.isFinite(row.startAt) &&
        row.startAt >= 0 &&
        Number.isFinite(row.endAt) &&
        row.startAt <= row.endAt &&
        row.endAt <= value.fetchedAt &&
        (row.stationId === null || validId(row.stationId)) &&
        typeof row.stationName === 'string' &&
        row.stationName.length <= 160 &&
        STATUSES.has(row.status) &&
        (row.frequencyHz === null ||
          (Number.isFinite(row.frequencyHz) && row.frequencyHz > 0)) &&
        typeof row.mode === 'string' &&
        row.mode.length <= 80 &&
        Number.isSafeInteger(row.frameCount) &&
        row.frameCount >= 0 &&
        row.frameCount <= 10000 &&
        (row.audioUrl === null ||
          satnogsMediaUrl(row.audioUrl, row.id) === row.audioUrl) &&
        (row.waterfallUrl === null ||
          satnogsMediaUrl(row.waterfallUrl, row.id) === row.waterfallUrl) &&
        (row.mediaNotice === null || typeof row.mediaNotice === 'string'),
    ),
  );
}
