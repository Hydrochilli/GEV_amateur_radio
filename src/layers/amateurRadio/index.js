import * as Cesium from 'cesium';
import {
  BRANDMEISTER_MAX_AGE,
  BRANDMEISTER_SHORT_AGE,
  isRecentBrandmeister,
} from '../../sources/amateurRadioDirectory.js';
import {
  NETWORKS,
  CLIENT_LINKS,
  POSITION_COLOR,
  buildNodeCard,
  buildPositionCard,
} from './cards.js';

const ID = 'amateur-radio';
const PREFIX = `${ID}:`;
const CARD_OPTIONS = { cohortLimit: 1, collisionCapacity: 1, moving: false };

/** Directory markers and last published fixes; no inferred coverage or movement. */
export function createAmateurRadioLayer({
  source,
  overlayHost,
  picking,
  pointer,
  screenSpaceEventHandlerFactory,
  openExternal,
  player,
  schedule = setTimeout,
  cancel = clearTimeout,
  now = () => Date.now(),
  requestRender = () => {},
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Amateur radio requires a snapshot source');
  let viewer = null;
  let dataSource = null;
  let enabled = false;
  let request = null;
  let handler = null;
  let selectedId = null;
  let snapshot = null;
  let lastUpdate = null;
  let error = null;
  let refreshError = null;
  let rowControlsListener = null;
  let positionRequest = null;
  let positionTimer = null;
  let expiryTimer = null;
  let positions = null;
  let liveOnly = false;
  let nodeActivity = null;
  let nodeRequest = null;
  let nodeTimer = null;
  const rows = new Map();
  const notify = () => rowControlsListener?.();

  function isVisibleBrandmeister(row, time) {
    return liveOnly
      ? Number.isSafeInteger(row.lastHeardAt) &&
          row.lastHeardAt > 0 &&
          row.lastHeardAt <= time &&
          time - row.lastHeardAt <= BRANDMEISTER_SHORT_AGE
      : isRecentBrandmeister(row, time);
  }

  function openClient(client, callsign, location) {
    if (!enabled) return false;
    if (player && location) player.show(client, callsign, location);
    else if (player) player.show(client, callsign);
    else openExternal?.(CLIENT_LINKS[client]);
    return Boolean(player || openExternal);
  }

  function activateNode(row) {
    if (!enabled || row.network === 'aprs') return false;
    if (row.network === 'echolink') return openClient('echolink', row.callsign);
    return openClient('hoseline', undefined, { lat: row.lat, lon: row.lon });
  }

  function syncPositions() {
    const currentRows = positions.rows.filter(
      (row) =>
        now() - row.receivedAt <= 900_000 &&
        (row.reportedAt === null || now() - row.reportedAt <= 900_000),
    );
    const ids = new Set(currentRows.map((row) => row.id));
    dataSource.entities.suspendEvents();
    try {
      for (const [id, row] of rows) {
        if (row.network === 'aprs' && !ids.has(id)) {
          rows.delete(id);
          dataSource.entities.removeById(`${PREFIX}${id}`);
        }
      }
      for (const row of currentRows) {
        const previous = rows.get(row.id);
        rows.set(row.id, row);
        let entity = dataSource.entities.getById(`${PREFIX}${row.id}`);
        if (!entity) {
          entity = dataSource.entities.add({
            id: `${PREFIX}${row.id}`,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 11,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        } else if (previous.lat !== row.lat || previous.lon !== row.lon) {
          entity.position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
        }
        entity.point.color = Cesium.Color.fromCssColorString(
          POSITION_COLOR,
        ).withAlpha(positions.status === 'live' ? 1 : 0.45);
      }
    } finally {
      dataSource.entities.resumeEvents();
    }
    if (selectedId?.startsWith('aprs:')) publishCard();
    requestRender();
  }

  function scheduleExpiry() {
    if (expiryTimer !== null) cancel(expiryTimer);
    expiryTimer = null;
    if (!enabled) return;
    const time = now();
    let delay = Infinity;
    for (const row of rows.values())
      if (row.network === 'brandmeister')
        delay = Math.min(
          delay,
          (liveOnly ? row.lastHeardAt : row.lastSeenAt) +
            (liveOnly ? BRANDMEISTER_SHORT_AGE : BRANDMEISTER_MAX_AGE) -
            time +
            1,
        );
    if (!Number.isFinite(delay)) return;
    expiryTimer = schedule(
      () => {
        expiryTimer = null;
        if (!enabled || !dataSource) return;
        dataSource.entities.suspendEvents();
        try {
          for (const [id, row] of rows)
            if (
              row.network === 'brandmeister' &&
              !isVisibleBrandmeister(row, now())
            ) {
              rows.delete(id);
              dataSource.entities.removeById(`${PREFIX}${id}`);
            }
        } finally {
          dataSource.entities.resumeEvents();
        }
        if (selectedId && !rows.has(selectedId)) clearSelection();
        scheduleExpiry();
        notify();
        requestRender();
      },
      Math.max(1, delay),
    );
    expiryTimer.unref?.();
  }

  function syncDirectories() {
    if (!dataSource) return;
    const incoming = new Map();
    const time = now();
    for (const network of snapshot?.networks || [])
      for (const row of network.rows)
        if (
          row.network !== 'brandmeister' ||
          (!liveOnly && isVisibleBrandmeister(row, time))
        )
          incoming.set(row.id, row);
    if (liveOnly && nodeActivity?.status === 'live')
      for (const row of nodeActivity.rows)
        if (isVisibleBrandmeister(row, time)) incoming.set(row.id, row);
    dataSource.entities.suspendEvents();
    try {
      for (const [id, row] of rows)
        if (row.network !== 'aprs' && !incoming.has(id)) {
          rows.delete(id);
          dataSource.entities.removeById(`${PREFIX}${id}`);
        }
      for (const [id, row] of incoming) {
        const previous = rows.get(id);
        rows.set(id, row);
        const entity = dataSource.entities.getById(`${PREFIX}${id}`);
        if (!entity) {
          dataSource.entities.add({
            id: `${PREFIX}${id}`,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 9,
              color: Cesium.Color.fromCssColorString(
                NETWORKS[row.network].color,
              ),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
        } else if (previous.lat !== row.lat || previous.lon !== row.lon) {
          entity.position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
        }
      }
    } finally {
      dataSource.entities.resumeEvents();
    }
    scheduleExpiry();
    if (selectedId) publishCard();
    requestRender();
  }

  async function pollNodeActivity() {
    if (!enabled || !dataSource || !source.getNodeActivity || nodeRequest)
      return;
    const current = new AbortController();
    nodeRequest = current;
    try {
      const next = await source.getNodeActivity({ signal: current.signal });
      if (current.signal.aborted || nodeRequest !== current || !enabled) return;
      nodeActivity = next;
      if (liveOnly) syncDirectories();
    } catch (cause) {
      if (current.signal.aborted || nodeRequest !== current || !enabled) return;
      console.warn('[Data:AmateurRadio] Node activity refresh failed:', cause);
      nodeActivity = {
        status: 'error',
        error: cause.message || 'BrandMeister node activity unavailable',
        rows: [],
        observedSince: null,
      };
      if (liveOnly) syncDirectories();
    } finally {
      if (nodeRequest === current) {
        nodeRequest = null;
        if (enabled) {
          nodeTimer = schedule(() => {
            nodeTimer = null;
            void pollNodeActivity();
          }, 10_000);
          nodeTimer.unref?.();
        }
        notify();
      }
    }
  }

  async function pollPositions() {
    if (!enabled || !dataSource || !source.getPositions || positionRequest)
      return;
    const current = new AbortController();
    positionRequest = current;
    try {
      const next = await source.getPositions({ signal: current.signal });
      if (current.signal.aborted || positionRequest !== current || !enabled)
        return;
      positions = next;
      syncPositions();
    } catch (cause) {
      if (current.signal.aborted || positionRequest !== current || !enabled)
        return;
      const message = cause.message || 'Published APRS positions unavailable';
      console.warn('[Data:AmateurRadio] Position refresh failed:', cause);
      positions = {
        ...(positions || { rows: [] }),
        status: 'error',
        error: message,
      };
      syncPositions();
    } finally {
      if (positionRequest === current) {
        positionRequest = null;
        if (enabled) {
          positionTimer = schedule(() => {
            positionTimer = null;
            void pollPositions();
          }, 10_000);
          positionTimer.unref?.();
        }
        notify();
      }
    }
  }

  function clearSelection() {
    selectedId = null;
    overlayHost?.clearSource(ID);
    requestRender();
    notify();
  }

  function publishCard() {
    const row = rows.get(selectedId);
    const network =
      row?.network === 'brandmeister' && liveOnly && nodeActivity
        ? {
            fetchedAt: nodeActivity.directoryFetchedAt,
            stale: nodeActivity.directoryStale,
            error: nodeActivity.directoryError,
          }
        : snapshot?.networks.find((item) => item.id === row?.network);
    if (!row || (row.network !== 'aprs' && !network)) return clearSelection();
    const height = viewer.scene.globe?.getHeight(
      Cesium.Cartographic.fromDegrees(row.lon, row.lat),
    );
    const entry = {
      ...(row.network === 'aprs'
        ? buildPositionCard(row, positions)
        : buildNodeCard(
            row,
            {
              ...network,
              stale: network.stale || Boolean(refreshError),
              error: network.error || refreshError,
            },
            now(),
          )),
      position: Cesium.Cartesian3.fromDegrees(
        row.lon,
        row.lat,
        Number.isFinite(height) ? height + 5 : 80,
      ),
      interactive: row.network !== 'aprs' && Boolean(openExternal || player),
      activate: () => activateNode(row),
    };
    overlayHost?.setEntries(ID, [entry], CARD_OPTIONS);
    requestRender();
    notify();
  }

  function removeHandler() {
    handler?.destroy();
    handler = null;
    picking?.unregisterPickOwner(ID);
  }

  function installHandler() {
    if (!screenSpaceEventHandlerFactory || !picking || handler) return;
    picking.registerPickOwner(ID, (id) => id.startsWith(PREFIX));
    handler = screenSpaceEventHandlerFactory(viewer);
    handler.setInputAction((click) => {
      if (!enabled || (pointer && !pointer.isPointerFree())) return;
      const hit = overlayHost?.hitTest?.(click.position.x, click.position.y, {
        sourceId: ID,
      });
      if (hit?.entryId === `amateur-radio-card:${selectedId}`) {
        const row = rows.get(selectedId);
        if (row) activateNode(row);
        return;
      }
      const picked = viewer.scene.pick(click.position);
      const pickId = picking.resolvePickId(picked);
      if (pickId?.startsWith(PREFIX) && rows.has(pickId.slice(PREFIX.length))) {
        const row = rows.get(pickId.slice(PREFIX.length));
        if (!row) return;
        selectedId = row.id;
        if (row.network === 'brandmeister') {
          overlayHost?.clearSource(ID);
          requestRender();
          notify();
          activateNode(row);
          return;
        }
        publishCard();
      } else if (!pickId || !picking.isOwnedByOtherLayer(ID, pickId)) {
        clearSelection();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const layer = {
    id: ID,
    name: 'Amateur Radio Preview',
    icon: 'RF',
    source: 'BrandMeister / EchoLink / APRS-IS',
    updateInterval: 180_000,

    init(target) {
      if (viewer) throw new Error('Amateur radio already initialized');
      viewer = target;
      dataSource = new Cesium.CustomDataSource(ID);
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
    },
    enable() {
      if (enabled) return;
      enabled = true;
      if (dataSource) dataSource.show = true;
      overlayHost?.setVisible?.(ID, true);
      installHandler();
      syncDirectories();
      if (positions && dataSource) syncPositions();
      void pollPositions();
      void pollNodeActivity();
      requestRender();
    },
    disable() {
      enabled = false;
      request?.abort();
      request = null;
      positionRequest?.abort();
      positionRequest = null;
      nodeRequest?.abort();
      nodeRequest = null;
      nodeActivity = null;
      if (nodeTimer !== null) cancel(nodeTimer);
      nodeTimer = null;
      if (positionTimer !== null) cancel(positionTimer);
      positionTimer = null;
      if (expiryTimer !== null) cancel(expiryTimer);
      expiryTimer = null;
      player?.close();
      if (dataSource) dataSource.show = false;
      removeHandler();
      clearSelection();
      overlayHost?.setVisible?.(ID, false);
    },
    async update() {
      if (!enabled || !dataSource) return false;
      request?.abort();
      const current = new AbortController();
      request = current;
      notify();
      try {
        const next = await source.getSnapshot({ signal: current.signal });
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        snapshot = next;
        refreshError = null;
        error =
          next.networks
            .map((network) => network.error)
            .filter(Boolean)
            .join('; ') || null;
        syncDirectories();
        lastUpdate = now();
        return true;
      } catch (cause) {
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        error = cause.message || 'Amateur radio directories unavailable';
        refreshError = error;
        console.warn('[Data:AmateurRadio] Refresh failed:', cause);
        syncDirectories();
        return false;
      } finally {
        if (request === current) {
          request = null;
          notify();
        }
      }
    },
    destroy(target = viewer) {
      layer.disable();
      if (dataSource) target.dataSources.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      snapshot = null;
      positions = null;
      player?.destroy();
      rows.clear();
      lastUpdate = null;
      error = null;
      refreshError = null;
      rowControlsListener = null;
    },
    setRowControlsListener(listener) {
      if (listener !== null && typeof listener !== 'function')
        throw new TypeError('Row-controls listener must be a function or null');
      rowControlsListener = listener;
    },
    getRowControls() {
      const selected = rows.get(selectedId);
      const chips = [
        {
          id: 'brandmeister-window',
          label: liveOnly ? 'BrandMeister: 5 min live' : 'BrandMeister: 60 min',
          title: liveOnly
            ? 'Public call activity observed within five minutes, matched by node ID and node callsign to directory positions. Click for the 60-minute directory view. No operator GPS or RF coverage inferred.'
            : 'Directory locations last seen within 60 minutes, not confirmed transmissions. Click for five minutes of verified Last Heard node activity. EchoLink, APRS and playing audio are unchanged.',
          active: liveOnly,
          disabled: false,
          onClick: () => {
            if (!enabled) return;
            liveOnly = !liveOnly;
            syncDirectories();
            notify();
          },
        },
        {
          id: 'hoseline',
          label: 'Listen latest',
          title:
            'Compact audio dock: selected markers prefer matching local/regional intended areas, then country priority; no repeater connection',
          onClick: () =>
            selected?.network === 'brandmeister'
              ? activateNode(selected)
              : openClient('hoseline'),
          disabled: !player && !openExternal,
        },
        {
          id: 'last-heard',
          label: 'Last Heard',
          title: 'Open official BrandMeister activity dashboard',
          onClick: () => openExternal?.(CLIENT_LINKS.lastHeard),
        },
        {
          id: 'echolink',
          label: 'EchoLink Web',
          title:
            'In-app official client; explicit load, existing-login warning and microphone blocked',
          onClick: () => openClient('echolink'),
          disabled: !player && !openExternal,
        },
      ];
      if (selected)
        chips.push({
          id: 'selected-node',
          label: selected.callsign,
          title:
            selected.network === 'aprs'
              ? 'Show published position details'
              : selected.network === 'brandmeister'
                ? 'Open audio dock using this marker for local/regional intended-area and country priority; not a connection to this node'
                : `Open EchoLink Web and select ${selected.callsign} manually`,
          onClick: () =>
            selected.network === 'aprs'
              ? publishCard()
              : activateNode(selected),
          disabled:
            selected.network === 'aprs' ? false : !player && !openExternal,
        });
      return {
        chips: chips.map((chip) => ({
          ...chip,
          disabled: chip.disabled ?? !openExternal,
        })),
        legend: [
          ...Object.entries(NETWORKS).map(([id, network]) => ({
            label: network.label,
            color: network.color,
            count: [...rows.values()].filter((row) => row.network === id)
              .length,
          })),
          {
            label: 'Published APRS positions',
            color: POSITION_COLOR,
            count: [...rows.values()].filter((row) => row.network === 'aprs')
              .length,
          },
        ],
        info: [
          'Worldwide BrandMeister and EchoLink directories. APRS remains within 100 km of Manchester. Click a marker for details.',
          ...(snapshot?.networks || []).map((network) =>
            network.fetchedAt === null
              ? `${NETWORKS[network.id].label}: unavailable`
              : `${NETWORKS[network.id].label}: fetched ${Math.max(0, Math.floor((Date.now() - network.fetchedAt) / 60000))}m ago${network.stale ? ' (stale)' : ''}`,
          ),
          error,
          liveOnly
            ? 'BM: verified Last Heard node activity within five minutes, not directory last-seen age. Unknown nodes and unmatched node callsigns are omitted. Locations are directory positions, not operator GPS or RF coverage.'
            : 'BM: directory last seen within 60 minutes; expired, unknown and future timestamps excluded. Not confirmed radio transmissions.',
          source.getNodeActivity
            ? `Last Heard: ${nodeActivity?.status || 'connecting'}${nodeActivity?.observedSince ? `; collecting since ${new Date(nodeActivity.observedSince).toISOString()}. History builds while enabled; no complete five-minute backfill is promised` : ''}.`
            : 'Last Heard node activity unavailable in this source adapter.',
          nodeActivity?.error,
          nodeActivity?.directoryStale
            ? `Last Heard directory positions are stale: ${nodeActivity.directoryError}`
            : null,
          liveOnly &&
          nodeActivity?.status === 'live' &&
          ![...rows.values()].some((row) => row.network === 'brandmeister')
            ? 'No verified mapped nodes heard in the current five-minute window; waiting for public activity.'
            : null,
          'EchoLink: online snapshot. Positions unverified.',
          source.getPositions
            ? `APRS: ${positions?.status || 'connecting'}; last published fixes, not guaranteed operators or moving GPS.`
            : 'APRS positions unavailable in this source adapter.',
          positions?.error,
          'Selected BrandMeister markers prefer matching curated local intended areas (25 km city-centre rule), then administrative regions, then country priority. Initial directory: UK, US states/DC, Canada and selected French areas; other locations retain country fallback. Intended areas and country prefixes are best effort, not talker locations, RF coverage or repeater connections. Minimise to keep audio running. No automatic EchoLink login/connection; only one login. Embedded microphone blocked.',
        ]
          .filter(Boolean)
          .join(' '),
      };
    },
    getStats() {
      return {
        count: rows.size,
        lastUpdate,
        error: error || (liveOnly ? nodeActivity?.error : null) || null,
        loading: Boolean(
          request ||
          positionRequest ||
          (liveOnly && !nodeActivity && nodeRequest),
        ),
        stale: Boolean(
          lastUpdate &&
          (refreshError || snapshot?.networks.some((network) => network.stale)),
        ),
        partial: Boolean(
          snapshot?.networks.some((network) => network.error) ||
          (liveOnly && nodeActivity?.status !== 'live'),
        ),
        nodeActivityStatus:
          nodeActivity?.status ||
          (source.getNodeActivity ? 'connecting' : 'unavailable'),
        nodeActivityError: nodeActivity?.error || null,
        positionStatus:
          positions?.status ||
          (source.getPositions ? 'connecting' : 'unavailable'),
        positionError: positions?.error || null,
      };
    },
  };
  return layer;
}
