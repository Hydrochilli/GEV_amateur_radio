const ENGLISH_PRIORITY = new Set([91, 93, 95, 913, 3100]);
export const ACTIVITY_MAX_AGE = 180_000;

export function talkgroupTier(talkgroup, name = '') {
  if (/^(234|235)/.test(String(talkgroup))) return 0;
  if (ENGLISH_PRIORITY.has(talkgroup) || /\benglish\b/i.test(name)) return 1;
  return 2;
}

export const TALK_GROUP_TIERS = [
  'UK priority',
  'English priority (best effort)',
  'Other talkgroups',
];

export function normalizeActivity(message, now) {
  if (
    !message ||
    !['LH', 'LH-Startup'].includes(message.topic) ||
    typeof message.payload !== 'string' ||
    message.payload.length > 16_384
  )
    return null;
  let row;
  try {
    row = JSON.parse(message.payload);
  } catch {
    return null;
  }
  if (
    !row ||
    row.SessionType !== 7 ||
    !['Session-Start', 'Session-Update', 'Session-Stop'].includes(row.Event) ||
    !Number.isSafeInteger(row.DestinationID) ||
    row.DestinationID <= 90 ||
    row.DestinationID > 999999 ||
    !Number.isSafeInteger(row.FlagSet) ||
    row.FlagSet < 0 ||
    (row.FlagSet & 3) !== 0 ||
    typeof row.SessionID !== 'string' ||
    row.SessionID.length > 100 ||
    !row.SessionID ||
    !Number.isFinite(row.Start) ||
    row.Start <= 0 ||
    !Number.isFinite(row.Stop) ||
    row.Stop < 0 ||
    row.Start * 1000 > now + 30_000 ||
    (row.Stop !== 0 && (row.Stop < row.Start || row.Stop * 1000 > now + 30_000))
  )
    return null;
  const active = row.Stop === 0;
  const activityAt = (active ? row.Start : row.Stop) * 1000;
  if (now - activityAt > (active ? 900_000 : ACTIVITY_MAX_AGE)) return null;
  return {
    sessionId: row.SessionID,
    talkgroup: row.DestinationID,
    name:
      typeof row.DestinationName === 'string'
        ? row.DestinationName.replace(/[\u0000-\u001f\u007f]/g, ' ')
            .trim()
            .slice(0, 100)
        : '',
    active,
    activityAt,
    receivedAt: now,
  };
}

export function chooseLatestTalkgroup(rows, now) {
  const recent = rows.filter(
    (row) =>
      now - row.receivedAt <= ACTIVITY_MAX_AGE &&
      row.activityAt <= now + 30_000 &&
      now - row.activityAt <= (row.active ? 900_000 : ACTIVITY_MAX_AGE),
  );
  const active = recent.filter((row) => row.active);
  const candidates = active.length ? active : recent;
  return (
    candidates.sort(
      (a, b) =>
        talkgroupTier(a.talkgroup, a.name) -
          talkgroupTier(b.talkgroup, b.name) ||
        b.activityAt - a.activityAt ||
        a.talkgroup - b.talkgroup,
    )[0] || null
  );
}

export function isActivitySnapshot(snapshot) {
  return (
    snapshot &&
    ['live', 'error'].includes(snapshot.status) &&
    Number.isFinite(snapshot.fetchedAt) &&
    (snapshot.error === null || typeof snapshot.error === 'string') &&
    Array.isArray(snapshot.rows) &&
    snapshot.rows.length <= 512 &&
    snapshot.rows.every(
      (row) =>
        row &&
        Number.isSafeInteger(row.talkgroup) &&
        row.talkgroup > 90 &&
        row.talkgroup <= 999999 &&
        typeof row.name === 'string' &&
        row.name.length <= 100 &&
        typeof row.active === 'boolean' &&
        Number.isFinite(row.activityAt) &&
        row.activityAt > 0 &&
        Number.isFinite(row.receivedAt) &&
        row.receivedAt > 0 &&
        row.activityAt <= snapshot.fetchedAt + 30_000 &&
        row.receivedAt <= snapshot.fetchedAt,
    )
  );
}
