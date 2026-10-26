import * as Cesium from 'cesium';
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
  let positions = null;
  const rows = new Map();
  const notify = () => rowControlsListener?.();

  function openClient(client, callsign) {
    if (!enabled) return false;
    if (player) player.show(client, callsign);
    else openExternal?.(CLIENT_LINKS[client]);
    return Boolean(player || openExternal);
  }

  function activateNode(row) {
    if (!enabled || row.network === 'aprs') return false;
    if (row.network === 'echolink') return openClient('echolink', row.callsign);
    return openClient('hoseline');
  }

  function syncPositions() {
    const currentRows = positions.rows.filter(
      (row) =>
        Date.now() - row.receivedAt <= 900_000 &&
        (row.reportedAt === null || Date.now() - row.reportedAt <= 900_000),
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
    const network = snapshot?.networks.find((item) => item.id === row?.network);
    if (!row || (row.network !== 'aprs' && !network)) return clearSelection();
    const height = viewer.scene.globe?.getHeight(
      Cesium.Cartographic.fromDegrees(row.lon, row.lat),
    );
    const entry = {
      ...(row.network === 'aprs'
        ? buildPositionCard(row, positions)
        : buildNodeCard(row, {
            ...network,
            stale: network.stale || Boolean(refreshError),
            error: network.error || refreshError,
          })),
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
      if (positions && dataSource) syncPositions();
      void pollPositions();
      requestRender();
    },
    disable() {
      enabled = false;
      request?.abort();
      request = null;
      positionRequest?.abort();
      positionRequest = null;
      if (positionTimer !== null) cancel(positionTimer);
      positionTimer = null;
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
        dataSource.entities.suspendEvents();
        try {
          for (const [id, row] of rows) {
            if (row.network !== 'aprs') {
              rows.delete(id);
              dataSource.entities.removeById(`${PREFIX}${id}`);
            }
          }
          for (const network of next.networks) {
            for (const row of network.rows) {
              rows.set(row.id, row);
              dataSource.entities.add({
                id: `${PREFIX}${row.id}`,
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
            }
          }
        } finally {
          dataSource.entities.resumeEvents();
        }
        lastUpdate = Date.now();
        if (selectedId) publishCard();
        requestRender();
        return true;
      } catch (cause) {
        if (current.signal.aborted || request !== current || !enabled)
          return false;
        error = cause.message || 'Amateur radio directories unavailable';
        refreshError = error;
        console.warn('[Data:AmateurRadio] Refresh failed:', cause);
        if (selectedId) publishCard();
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
          id: 'hoseline',
          label: 'Listen latest',
          title:
            'Compact BrandMeister audio dock: UK, English-priority, then other active talkgroups; no repeater connection',
          onClick: () => openClient('hoseline'),
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
                ? 'Open BrandMeister audio dock; selection is network-wide, not this node'
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
            count:
              snapshot?.networks.find((item) => item.id === id)?.rows.length ||
              0,
          })),
          {
            label: 'Published APRS positions',
            color: POSITION_COLOR,
            count: [...rows.values()].filter((row) => row.network === 'aprs')
              .length,
          },
        ],
        info: [
          'Preview: within 100 km of Manchester. Click a marker for details.',
          ...(snapshot?.networks || []).map((network) =>
            network.fetchedAt === null
              ? `${NETWORKS[network.id].label}: unavailable`
              : `${NETWORKS[network.id].label}: fetched ${Math.max(0, Math.floor((Date.now() - network.fetchedAt) / 60000))}m ago${network.stale ? ' (stale)' : ''}`,
          ),
          error,
          'BM: seen within 24h, not live activity. EchoLink: online snapshot. Positions unverified.',
          source.getPositions
            ? `APRS: ${positions?.status || 'connecting'}; last published fixes, not guaranteed operators or moving GPS.`
            : 'APRS positions unavailable in this source adapter.',
          positions?.error,
          'Listen latest prefers UK, English-priority, then other network-wide activity; it does not connect to a nearby repeater. Minimise the dock to keep the map visible and audio running. No automatic EchoLink login/connection; only one login. Embedded microphone blocked.',
        ]
          .filter(Boolean)
          .join(' '),
      };
    },
    getStats() {
      return {
        count: rows.size,
        lastUpdate,
        error,
        loading: Boolean(request || positionRequest),
        stale: Boolean(
          lastUpdate &&
          (refreshError || snapshot?.networks.some((network) => network.stale)),
        ),
        partial: Boolean(snapshot?.networks.some((network) => network.error)),
        positionStatus:
          positions?.status ||
          (source.getPositions ? 'connecting' : 'unavailable'),
        positionError: positions?.error || null,
      };
    },
  };
  return layer;
}
