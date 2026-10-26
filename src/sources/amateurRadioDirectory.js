export const MAX_DIRECTORY_ROWS = 50_000;
export const MAX_DIRECTORY_BYTES = 32 * 1024 * 1024;
export const BRANDMEISTER_MAX_AGE = 3600_000;
export const BRANDMEISTER_SHORT_AGE = 300_000;
export const DIRECTORY_AREA = Object.freeze({
  scope: 'worldwide',
  name: 'Worldwide',
});

export function brandmeisterLastSeen(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
  )
    return null;
  const iso = `${value.replace(' ', 'T')}.000Z`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString() === iso
    ? time
    : null;
}

export function isRecentBrandmeister(row, now) {
  return (
    Number.isSafeInteger(row.lastSeenAt) &&
    row.lastSeenAt > 0 &&
    row.lastSeenAt <= now &&
    now - row.lastSeenAt <= BRANDMEISTER_MAX_AGE
  );
}
