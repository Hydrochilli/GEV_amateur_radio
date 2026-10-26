import { SATNOGS_ORIGIN } from '../sources/satnogs.js';

/** Native text and opt-in media, not a third-party dashboard or automatic audio feed. */
export function createSatelliteObservationPanel({
  getDocument = () => document,
} = {}) {
  let panel = null,
    details = null,
    media = null,
    audio = null;
  let model = null,
    selectedId = null,
    mediaKey = null,
    previousFocus = null;
  let panelRemovers = [],
    detailRemovers = [],
    mediaRemovers = [];
  const listen = (node, type, fn, bucket) => {
    node.addEventListener(type, fn);
    bucket.push(() => node.removeEventListener(type, fn));
  };
  const removeListeners = (bucket) => {
    for (const remove of bucket.splice(0)) remove();
  };
  function stopMedia() {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
    removeListeners(mediaRemovers);
    media?.replaceChildren();
    mediaKey = null;
  }
  function close() {
    if (!panel) return;
    stopMedia();
    removeListeners(detailRemovers);
    removeListeners(panelRemovers);
    panel.remove();
    panel = details = media = null;
    model = null;
    selectedId = null;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function element(tag, text, parent) {
    const node = getDocument().createElement(tag);
    if (text) node.textContent = text;
    parent?.append(node);
    return node;
  }
  function button(text, parent, fn, bucket = detailRemovers) {
    const node = element('button', text, parent);
    node.type = 'button';
    node.className = 'panel-surface-control';
    listen(node, 'click', fn, bucket);
    return node;
  }
  function link(text, url, parent) {
    const node = element('a', text, parent);
    node.href = url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    node.className = 'panel-surface-control';
    return node;
  }
  function renderMedia(row) {
    const key = row ? `${row.id}:${row.audioUrl}:${row.waterfallUrl}` : null;
    if (key === mediaKey) return;
    stopMedia();
    mediaKey = key;
    if (!row) return;
    if (row.audioUrl) {
      const load = button(
        'Load recorded audio (not live)',
        media,
        () => {
          load.disabled = true;
          audio = element('audio', null, media);
          audio.controls = true;
          audio.preload = 'none';
          audio.setAttribute(
            'aria-label',
            `SatNOGS observation ${row.id} recording`,
          );
          const status = element(
            'p',
            'Recording loaded. Press Play to listen; this may be telemetry or noise, not speech.',
            media,
          );
          status.setAttribute('role', 'status');
          listen(
            audio,
            'error',
            () => {
              status.textContent =
                'Recording unavailable or unsupported by this browser. Open the official observation instead.';
              status.className = 'panel-surface-error';
            },
            mediaRemovers,
          );
          audio.src = row.audioUrl;
        },
        mediaRemovers,
      );
      link('Open recording', row.audioUrl, media);
    } else
      element('p', 'No supported recording URL in this observation.', media);
    if (row.waterfallUrl) {
      button(
        'Show waterfall',
        media,
        (event) => {
          event.currentTarget.disabled = true;
          const image = element('img', null, media);
          image.alt = `Waterfall for SatNOGS observation ${row.id}; recorded, not live`;
          image.loading = 'lazy';
          image.referrerPolicy = 'no-referrer';
          listen(
            image,
            'error',
            () => {
              image.remove();
              element(
                'p',
                'Waterfall could not load. Use the official observation link.',
                media,
              ).setAttribute('role', 'status');
            },
            mediaRemovers,
          );
          image.src = row.waterfallUrl;
        },
        mediaRemovers,
      );
      link('Open waterfall', row.waterfallUrl, media);
    }
  }
  function render() {
    if (!panel || !model) return;
    removeListeners(detailRemovers);
    details.replaceChildren();
    element('h3', `${model.name} | NORAD ${model.noradId}`, details);
    const status = element('p', '', details);
    status.setAttribute('role', 'status');
    status.textContent =
      model.status === 'loading'
        ? 'Checking recent completed SatNOGS observations...'
        : model.status === 'unavailable'
          ? model.error
          : model.status === 'error'
            ? model.error
            : 'Latest available observation records (not a live downlink).';
    if (model.error) {
      element('p', model.error, details).className = 'panel-surface-error';
    }
    const snapshot = model.snapshot;
    if (snapshot) {
      element(
        'p',
        `Lookup: ${new Date(snapshot.fetchedAt).toISOString()}${snapshot.stale ? ' | STALE cached result' : ''}. Checked ${snapshot.checkedCount} records from one API page${snapshot.hasMore ? '; older pages exist' : ''}.`,
        details,
      );
      element(
        'p',
        'Observation windows are not exact packet reception timestamps. Signal quality is reported by SatNOGS and may be unvetted; an audio or waterfall file alone does not prove satellite reception.',
        details,
      );
    }
    const rows = snapshot?.observations || [];
    if (!rows.some((row) => row.id === selectedId))
      selectedId = rows[0]?.id ?? null;
    if (snapshot && rows.length === 0)
      element(
        'p',
        'No completed observations in the checked results. This does not prove that no older observations or radio transmissions exist.',
        details,
      );
    for (const row of rows) {
      const choice = button(
        `${row.id} | ${new Date(row.endAt).toISOString()} | ${row.stationName}`,
        details,
        () => {
          selectedId = row.id;
          render();
        },
      );
      choice.setAttribute('aria-pressed', String(selectedId === row.id));
    }
    const selected = rows.find((row) => row.id === selectedId);
    if (selected) {
      element(
        'p',
        `Recorded observation: ${new Date(selected.startAt).toISOString()} to ${new Date(selected.endAt).toISOString()}`,
        details,
      );
      const ageMinutes = Math.max(
        0,
        Math.floor((Date.now() - selected.endAt) / 60_000),
      );
      element(
        'p',
        `Observation ended ${ageMinutes} minutes ago. Ground station: ${selected.stationName}${selected.stationId ? ` (#${selected.stationId})` : ''}. Reported quality: ${selected.status}.`,
        details,
      );
      if (selected.frequencyHz || selected.mode)
        element(
          'p',
          `${selected.frequencyHz ? `${(selected.frequencyHz / 1e6).toFixed(6)} MHz` : 'Frequency not supplied'} | ${selected.mode || 'Mode not supplied'}`,
          details,
        );
      element(
        'p',
        `Demodulated frame files: ${selected.frameCount}. These are not decoded battery/temperature measurements. Engineering telemetry is not imported; the DB telemetry endpoint requires authentication.`,
        details,
      );
      if (selected.mediaNotice) element('p', selected.mediaNotice, details);
      link(
        'Open official observation',
        `${SATNOGS_ORIGIN}/observations/${selected.id}/`,
        details,
      );
      if (selected.stationId)
        link(
          'Open ground station',
          `${SATNOGS_ORIGIN}/stations/${selected.stationId}/`,
          details,
        );
    }
    link('SatNOGS Network', SATNOGS_ORIGIN, details);
    element(
      'p',
      'SatNOGS Network and contributing ground stations. Data adapted by filtering and summarising public observations; CC BY-SA 4.0.',
      details,
    );
    link(
      'CC BY-SA 4.0',
      'https://creativecommons.org/licenses/by-sa/4.0/',
      details,
    );
    renderMedia(selected);
  }
  return {
    update(next) {
      if (!panel) return;
      if (!next || next.noradId !== model?.noradId) {
        close();
        return;
      }
      model = next;
      render();
    },
    show(next) {
      if (!next) return;
      if (panel && model?.noradId === next.noradId) {
        model = next;
        render();
        return;
      }
      close();
      const doc = getDocument();
      previousFocus = doc.activeElement;
      model = next;
      panel = element('section');
      panel.className = 'satellite-observations';
      panel.dataset.panelSurface = '';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'SatNOGS satellite observations');
      const header = element('div', null, panel);
      header.dataset.panelHeader = '';
      element('h2', 'SatNOGS observations', header).className =
        'panel-surface-title';
      const closeButton = button(
        'Close / stop recording',
        header,
        close,
        panelRemovers,
      );
      const body = element('div', null, panel);
      body.dataset.panelBody = '';
      details = element('div', null, body);
      media = element('div', null, body);
      listen(
        panel,
        'keydown',
        (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        },
        panelRemovers,
      );
      doc.body.append(panel);
      closeButton.focus();
      render();
    },
    close,
  };
}
