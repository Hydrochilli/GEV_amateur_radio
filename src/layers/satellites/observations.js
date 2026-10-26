import { ISS_NORAD } from './policy.js';

/** Only the selected radio satellite owns a lookup, refresh timer and panel model. */
export function createObservations({
  state,
  services,
  parts,
  source,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let request = null,
    timer = null,
    selection = null;
  const panel = services.observations;
  function publish() {
    panel?.update(state._satnogs);
    parts.tracking._updateTrackedSatelliteLabelModel();
    parts.controls._notifyRowControls();
  }
  function clear() {
    selection = null;
    request?.abort();
    request = null;
    if (timer !== null) cancel(timer);
    timer = null;
    state._satnogs = null;
    panel?.close();
    parts.controls._notifyRowControls();
  }
  async function refresh() {
    if (!selection || !state._enabled || request) return;
    const selected = selection;
    const current = new AbortController();
    request = current;
    state._satnogs = { ...state._satnogs, status: 'loading' };
    publish();
    try {
      const snapshot = await source.getObservations(selected.noradId, {
        signal: current.signal,
      });
      if (
        current.signal.aborted ||
        selection !== selected ||
        request !== current ||
        !state._enabled
      )
        return;
      state._satnogs = {
        ...selected,
        status: 'ready',
        snapshot,
        error: snapshot.error,
      };
      publish();
    } catch (cause) {
      if (
        current.signal.aborted ||
        selection !== selected ||
        request !== current ||
        !state._enabled
      )
        return;
      console.warn('[Data:Satellites] SatNOGS lookup failed:', cause);
      state._satnogs = {
        ...state._satnogs,
        status: 'error',
        error: cause.message || 'SatNOGS lookup failed',
        snapshot: state._satnogs.snapshot
          ? { ...state._satnogs.snapshot, stale: true }
          : null,
      };
      publish();
    } finally {
      if (request === current) {
        request = null;
        if (selection === selected && state._enabled) {
          timer = schedule(() => {
            timer = null;
            void refresh();
          }, 60_000);
          timer.unref?.();
        }
      }
    }
  }
  return {
    clear,
    select(noradId, satellite) {
      clear();
      if (
        !state._enabled ||
        (satellite.group !== 'amateur' && noradId !== ISS_NORAD)
      )
        return;
      selection = { noradId, name: satellite.name.trim() };
      state._satnogs = {
        ...selection,
        status:
          typeof source.getObservations === 'function'
            ? 'loading'
            : 'unavailable',
        snapshot: null,
        error:
          typeof source.getObservations === 'function'
            ? null
            : 'SatNOGS observations are not configured for this satellite source.',
      };
      publish();
      if (typeof source.getObservations === 'function') void refresh();
    },
    show() {
      if (state._satnogs) panel?.show(state._satnogs);
    },
    refresh,
  };
}
