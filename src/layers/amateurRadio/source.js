import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { isActivitySnapshot } from '../../sources/brandmeisterActivity.js';
import {
  MAX_DIRECTORY_ROWS,
  MAX_DIRECTORY_BYTES,
  isRecentBrandmeister,
} from '../../sources/amateurRadioDirectory.js';

function isDirectoryNode(row, network, allowUnknownLastSeen = false) {
  return Boolean(
    row &&
    row.network === network &&
    /^\d{1,12}$/.test(row.nodeId) &&
    row.id === `${network}:${row.nodeId}` &&
    typeof row.callsign === 'string' &&
    typeof row.description === 'string' &&
    (network !== 'brandmeister' ||
      (allowUnknownLastSeen &&
        row.lastSeenAt === null &&
        row.lastSeen === null) ||
      (Number.isSafeInteger(row.lastSeenAt) &&
        row.lastSeenAt > 0 &&
        typeof row.lastSeen === 'string' &&
        Date.parse(row.lastSeen) === row.lastSeenAt)) &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lon) &&
    Math.abs(row.lat) <= 90 &&
    Math.abs(row.lon) <= 180,
  );
}

export function createAmateurRadioSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getNodeActivity({ signal } = {}) {
      signal = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(40_000),
      ]);
      const response = await fetchImpl('/api/amateur-radio/nodes', { signal });
      if (!response.ok)
        throw new Error(
          `BrandMeister node activity unavailable (HTTP ${response.status})`,
        );
      const snapshot = await readResponseJsonCapped(
        response,
        MAX_DIRECTORY_BYTES,
        signal,
      );
      if (
        !snapshot ||
        !['live', 'error'].includes(snapshot.status) ||
        !(snapshot.error === null || typeof snapshot.error === 'string') ||
        !Number.isSafeInteger(snapshot.fetchedAt) ||
        snapshot.fetchedAt <= 0 ||
        !(
          snapshot.observedSince === null ||
          (Number.isSafeInteger(snapshot.observedSince) &&
            snapshot.observedSince > 0 &&
            snapshot.observedSince <= snapshot.fetchedAt)
        ) ||
        (snapshot.status === 'live' &&
          (snapshot.error !== null || snapshot.observedSince === null)) ||
        (snapshot.status === 'error' && !snapshot.error) ||
        !Number.isFinite(snapshot.directoryFetchedAt) ||
        typeof snapshot.directoryStale !== 'boolean' ||
        !(
          snapshot.directoryError === null ||
          typeof snapshot.directoryError === 'string'
        ) ||
        !Array.isArray(snapshot.rows) ||
        snapshot.rows.length > MAX_DIRECTORY_ROWS ||
        (snapshot.status !== 'live' && snapshot.rows.length !== 0) ||
        new Set(snapshot.rows.map((row) => row?.id)).size !==
          snapshot.rows.length ||
        snapshot.rows.some(
          (row) =>
            !isDirectoryNode(row, 'brandmeister', true) ||
            !Number.isSafeInteger(row.lastHeardAt) ||
            row.lastHeardAt <= 0 ||
            row.lastHeardAt > snapshot.fetchedAt,
        )
      )
        throw new Error('Invalid BrandMeister node activity snapshot');
      return snapshot;
    },
    async getActivity({ signal } = {}) {
      signal = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(15_000),
      ]);
      const response = await fetchImpl('/api/amateur-radio/activity', {
        signal,
      });
      if (!response.ok)
        throw new Error(
          `BrandMeister activity unavailable (HTTP ${response.status})`,
        );
      const snapshot = await readResponseJsonCapped(
        response,
        256 * 1024,
        signal,
      );
      if (!isActivitySnapshot(snapshot))
        throw new Error('Invalid BrandMeister activity snapshot');
      if (snapshot.status !== 'live')
        throw new Error(snapshot.error || 'BrandMeister activity unavailable');
      return snapshot;
    },
    async getPositions({ signal } = {}) {
      signal = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(15_000),
      ]);
      const response = await fetchImpl('/api/amateur-radio/positions', {
        signal,
      });
      if (!response.ok)
        throw new Error(`APRS positions unavailable (HTTP ${response.status})`);
      const snapshot = await readResponseJsonCapped(
        response,
        2 * 1024 * 1024,
        signal,
      );
      if (
        !snapshot ||
        !['idle', 'unconfigured', 'connecting', 'live', 'error'].includes(
          snapshot.status,
        ) ||
        !(snapshot.error === null || typeof snapshot.error === 'string') ||
        !(
          snapshot.lastPacketAt === null ||
          Number.isFinite(snapshot.lastPacketAt)
        ) ||
        !Number.isSafeInteger(snapshot.rejectedPackets) ||
        snapshot.rejectedPackets < 0 ||
        !Array.isArray(snapshot.rows) ||
        snapshot.rows.length > 1000 ||
        new Set(snapshot.rows.map((row) => row?.id)).size !==
          snapshot.rows.length ||
        snapshot.rows.some(
          (row) =>
            !row ||
            row.network !== 'aprs' ||
            typeof row.callsign !== 'string' ||
            !/^[A-Z0-9]{1,9}(?:-[A-Z0-9]{1,2})?$/.test(row.callsign) ||
            row.id !== `aprs:${row.callsign}` ||
            !Number.isFinite(row.lat) ||
            Math.abs(row.lat) > 90 ||
            !Number.isFinite(row.lon) ||
            Math.abs(row.lon) > 180 ||
            !Number.isFinite(row.distanceKm) ||
            row.distanceKm < 0 ||
            row.distanceKm > 100 ||
            !Number.isFinite(row.receivedAt) ||
            row.receivedAt < 0 ||
            !(
              row.reportedAt === null ||
              (Number.isFinite(row.reportedAt) &&
                row.reportedAt >= 0 &&
                row.reportedAt <= row.receivedAt + 120_000)
            ) ||
            !Number.isInteger(row.ambiguity) ||
            row.ambiguity < 0 ||
            row.ambiguity > 4 ||
            !['station', 'weather station'].includes(row.kind) ||
            typeof row.brandmeister !== 'boolean' ||
            typeof row.destination !== 'string' ||
            row.destination.length > 20 ||
            !Array.isArray(row.path) ||
            row.path.length > 12 ||
            row.path.some(
              (item) => typeof item !== 'string' || item.length > 20,
            ),
        )
      )
        throw new Error('Invalid APRS position snapshot');
      return snapshot;
    },
    async getSnapshot({ signal } = {}) {
      const response = await fetchImpl('/api/amateur-radio', { signal });
      if (!response.ok)
        throw new Error(
          `Amateur radio directories unavailable (HTTP ${response.status})`,
        );
      const snapshot = await readResponseJsonCapped(
        response,
        MAX_DIRECTORY_BYTES,
        signal,
      );
      if (
        !Array.isArray(snapshot?.networks) ||
        snapshot.networks.length !== 2 ||
        !['brandmeister', 'echolink'].every(
          (id) =>
            snapshot.networks.filter((network) => network?.id === id).length ===
            1,
        ) ||
        snapshot.networks.some(
          (network) =>
            !network ||
            !Array.isArray(network.rows) ||
            network.rows.length > MAX_DIRECTORY_ROWS ||
            new Set(network.rows.map((row) => row?.id)).size !==
              network.rows.length ||
            !(
              network.fetchedAt === null || Number.isFinite(network.fetchedAt)
            ) ||
            typeof network.stale !== 'boolean' ||
            !(network.error === null || typeof network.error === 'string') ||
            network.rows.some((row) => !isDirectoryNode(row, network.id)),
        )
      )
        throw new Error('Invalid amateur radio directory snapshot');
      return {
        ...snapshot,
        networks: snapshot.networks.map((network) =>
          network.id === 'brandmeister'
            ? {
                ...network,
                rows: network.rows.filter((row) =>
                  isRecentBrandmeister(row, Date.now()),
                ),
              }
            : network,
        ),
      };
    },
  };
}
