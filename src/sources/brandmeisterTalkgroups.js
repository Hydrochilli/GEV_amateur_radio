import {
  findAdminArea,
  getAdminAreasById,
  polygonsContain,
} from '../data/adminBoundaries.js';
import { createRetryableLoader } from '../data/retryableLoad.js';
import { locationDistanceKm } from './brandmeisterCountries.js';

const WIKI = 'https://wiki.brandmeister.network/index.php/';
const CANADA = `${WIKI}Canada`;
const FRANCE = `${WIKI}France`;
const US = `${WIKI}United_States`;
export const TALK_GROUP_DIRECTORY_REVIEWED = '2026-10-26';
export const LOCAL_TALKGROUP_RADIUS_KM = 25;

const US_STATES = [
  ['AL', 1, 'Alabama'],
  ['AK', 2, 'Alaska'],
  ['AZ', 4, 'Arizona'],
  ['AR', 5, 'Arkansas'],
  ['CA', 6, 'California'],
  ['CO', 8, 'Colorado'],
  ['CT', 9, 'Connecticut'],
  ['DE', 10, 'Delaware'],
  ['DC', 11, 'District of Columbia'],
  ['FL', 12, 'Florida'],
  ['GA', 13, 'Georgia'],
  ['HI', 15, 'Hawaii'],
  ['ID', 16, 'Idaho'],
  ['IL', 17, 'Illinois'],
  ['IN', 18, 'Indiana'],
  ['IA', 19, 'Iowa'],
  ['KS', 20, 'Kansas'],
  ['KY', 21, 'Kentucky'],
  ['LA', 22, 'Louisiana'],
  ['ME', 23, 'Maine'],
  ['MD', 24, 'Maryland'],
  ['MA', 25, 'Massachusetts'],
  ['MI', 26, 'Michigan'],
  ['MN', 27, 'Minnesota'],
  ['MS', 28, 'Mississippi'],
  ['MO', 29, 'Missouri'],
  ['MT', 30, 'Montana'],
  ['NE', 31, 'Nebraska'],
  ['NV', 32, 'Nevada'],
  ['NH', 33, 'New Hampshire'],
  ['NJ', 34, 'New Jersey'],
  ['NM', 35, 'New Mexico'],
  ['NY', 36, 'New York'],
  ['NC', 37, 'North Carolina'],
  ['ND', 38, 'North Dakota'],
  ['OH', 39, 'Ohio'],
  ['OK', 40, 'Oklahoma'],
  ['OR', 41, 'Oregon'],
  ['PA', 42, 'Pennsylvania'],
  ['RI', 44, 'Rhode Island'],
  ['SC', 45, 'South Carolina'],
  ['SD', 46, 'South Dakota'],
  ['TN', 47, 'Tennessee'],
  ['TX', 48, 'Texas'],
  ['UT', 49, 'Utah'],
  ['VT', 50, 'Vermont'],
  ['VA', 51, 'Virginia'],
  ['WA', 53, 'Washington'],
  ['WV', 54, 'West Virginia'],
  ['WI', 55, 'Wisconsin'],
  ['WY', 56, 'Wyoming'],
];

const regional = (talkgroup, name, countryCode, adminIds, source) => ({
  talkgroup,
  name,
  countryCode,
  scope: 'regional',
  adminIds,
  source,
});
const city = (talkgroup, name, countryCode, lat, lon, wikidata, source) => ({
  talkgroup,
  name,
  countryCode,
  scope: 'local',
  center: { lat, lon },
  radiusKm: LOCAL_TALKGROUP_RADIUS_KM,
  centerSource: `https://www.wikidata.org/wiki/${wikidata}`,
  source,
});

export const TALK_GROUP_DIRECTORY = Object.freeze(
  [
    city(
      2358,
      'London',
      'GB',
      51.507222222222,
      -0.1275,
      'Q84',
      `${WIKI}TalkGroup/2358`,
    ),
    city(
      302051,
      'Greater Toronto Area',
      'CA',
      43.670277777778,
      -79.386666666667,
      'Q172',
      CANADA,
    ),
    city(
      302061,
      'Greater Montreal Area',
      'CA',
      45.5033426,
      -73.5868411,
      'Q340',
      CANADA,
    ),
    city(302066, 'London, Ontario', 'CA', 42.9837, -81.2497, 'Q92561', CANADA),
    ...[
      [2355, 'Scotland'],
      [23550, 'Scotland'],
      [2356, 'Wales'],
      [23570, 'Wales'],
      [2354, 'Northern Ireland'],
      [23540, 'Northern Ireland'],
    ].map(([talkgroup, name]) => ({
      talkgroup,
      name,
      countryCode: 'GB',
      scope: 'regional',
      countryArea: `country of ${name}, United Kingdom`,
      source: `${WIKI}TalkGroup/${talkgroup}`,
    })),
    regional(
      23520,
      'North West England',
      'GB',
      [
        'GB-BBD',
        'GB-BPL',
        'GB-BOL',
        'GB-BUR',
        'GB-CHE',
        'GB-CHW',
        'GB-CMA',
        'GB-HAL',
        'GB-WRL',
        'GB-KWL',
        'GB-LAN',
        'GB-LIV',
        'GB-MAN',
        'GB-SHN',
        'GB-OLD',
        'GB-RCH',
        'GB-SLF',
        'GB-SFT',
        'GB-SKP',
        'GB-TAM',
        'GB-TRF',
        'GB-WRT',
        'GB-WGN',
      ],
      `${WIKI}TalkGroup/23520`,
    ),
    ...US_STATES.map(([code, number, name]) =>
      regional(3100 + number, name, 'US', [`US-${code}`], US),
    ),
    ...[
      [
        3020,
        'Newfoundland and Labrador / Prince Edward Island',
        ['CA-NL', 'CA-PE'],
      ],
      [3021, 'Nova Scotia', ['CA-NS']],
      [3022, 'Quebec', ['CA-QC']],
      [3023, 'Ontario', ['CA-ON']],
      [3024, 'Manitoba', ['CA-MB']],
      [3025, 'Saskatchewan', ['CA-SK']],
      [3026, 'Alberta', ['CA-AB']],
      [3027, 'British Columbia', ['CA-BC']],
      [3028, 'Northern Canadian territories', ['CA-NU', 'CA-YT', 'CA-NT']],
      [3029, 'New Brunswick', ['CA-NB']],
    ].map(([tg, name, ids]) => regional(tg, name, 'CA', ids, CANADA)),
    regional(
      2081,
      'Ile-de-France',
      'FR',
      ['FR-75', 'FR-77', 'FR-78', 'FR-91', 'FR-92', 'FR-93', 'FR-94', 'FR-95'],
      FRANCE,
    ),
    ...[
      [20803, 'Allier', 'FR-03'],
      [20810, 'Aube', 'FR-10'],
      [20812, 'Aveyron', 'FR-12'],
      [20818, 'Cher', 'FR-18'],
      [20813, 'Bouches-du-Rhone', 'FR-13'],
      [20837, 'Indre-et-Loire', 'FR-37'],
      [20839, 'Jura', 'FR-39'],
      [20843, 'Haute-Loire', 'FR-43'],
      [20845, 'Loiret', 'FR-45'],
      [20853, 'Mayenne', 'FR-53'],
      [20857, 'Moselle', 'FR-57'],
    ].map(([tg, name, id]) => regional(tg, name, 'FR', [id], FRANCE)),
  ].map((entry) =>
    Object.freeze({
      ...entry,
      reviewedAt: TALK_GROUP_DIRECTORY_REVIEWED,
    }),
  ),
);

const DIRECTORY_BY_ID = new Map(
  TALK_GROUP_DIRECTORY.map((entry) => [entry.talkgroup, entry]),
);
export const getTalkgroupDirectoryEntry = (id) =>
  DIRECTORY_BY_ID.get(id) || null;

const loadRegionalAreas = createRetryableLoader(async () => {
  const regions = TALK_GROUP_DIRECTORY.filter(
    (entry) => entry.scope === 'regional',
  );
  const ids = [...new Set(regions.flatMap((entry) => entry.adminIds || []))];
  const areas = new Map(
    (await getAdminAreasById(ids)).map((area) => [area.id, area]),
  );
  const result = new Map();
  for (const entry of regions) {
    const parts = entry.adminIds
      ? entry.adminIds.map((id) => areas.get(id))
      : [await findAdminArea(entry.countryArea)];
    if (parts.some((part) => !part))
      throw new Error(
        `Directory boundary unavailable for TG ${entry.talkgroup}`,
      );
    result.set(
      entry.talkgroup,
      parts.flatMap((part) => part.polygons),
    );
  }
  return result;
});

/** Curated intended areas only; labels from the live feed are never geocoded. */
export async function resolveTalkgroupAreas(location, talkgroups) {
  const entries = [...new Set(talkgroups)]
    .map(getTalkgroupDirectoryEntry)
    .filter(Boolean);
  const regions = entries.some((entry) => entry.scope === 'regional')
    ? await loadRegionalAreas()
    : null;
  return new Map(
    entries.map((entry) => {
      const distanceKm =
        entry.scope === 'local'
          ? locationDistanceKm(location, entry.center)
          : null;
      const matched =
        entry.scope === 'local'
          ? distanceKm <= entry.radiusKm + 1e-9
          : polygonsContain(
              regions.get(entry.talkgroup),
              location.lat,
              location.lon,
            );
      return [entry.talkgroup, { entry, matched, distanceKm }];
    }),
  );
}
