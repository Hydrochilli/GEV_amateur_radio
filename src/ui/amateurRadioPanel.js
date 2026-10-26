import { CLIENT_LINKS } from '../layers/amateurRadio/cards.js';
import {
  chooseLatestTalkgroup,
  talkgroupTier,
  TALK_GROUP_TIERS,
} from '../sources/brandmeisterActivity.js';

/** Official cross-origin clients own credentials and playback; we own their lifetime. */
export function createAmateurRadioPanel({
  getDocument = () => document,
  openExternal,
  getActivity,
} = {}) {
  let panel = null,
    frame = null;
  let removers = [];
  let returnFocus = null;
  let request = null;
  let activeClient = null;
  let expand = null;
  let selectLatest = null;
  function listen(node, type, callback) {
    node.addEventListener(type, callback);
    removers.push(() => node.removeEventListener(type, callback));
  }
  function unload() {
    frame?.remove();
    frame = null;
  }
  function close() {
    if (!panel) return;
    request?.abort();
    request = null;
    unload();
    for (const remove of removers.splice(0)) remove();
    panel.remove();
    panel = null;
    activeClient = null;
    expand = null;
    selectLatest = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  return {
    show(client, callsign = null) {
      if (!['hoseline', 'echolink'].includes(client))
        throw new TypeError('Unsupported official radio client');
      if (panel && client === 'hoseline' && activeClient === client) {
        if (selectLatest) void selectLatest();
        else expand?.();
        return;
      }
      const doc = getDocument();
      const previousFocus = panel ? returnFocus : doc.activeElement;
      close();
      returnFocus = previousFocus;
      const echo = client === 'echolink';
      activeClient = client;
      panel = doc.createElement('section');
      panel.className = 'amateur-radio-client';
      panel.dataset.panelSurface = '';
      panel.setAttribute('role', 'region');
      panel.setAttribute(
        'aria-label',
        echo
          ? 'EchoLink receive-only preview'
          : 'BrandMeister live activity and audio',
      );
      const header = doc.createElement('div');
      header.dataset.panelHeader = '';
      const title = doc.createElement('h2');
      title.className = 'panel-surface-title';
      title.textContent = echo
        ? 'EchoLink receive-only preview'
        : 'BrandMeister audio dock';
      header.append(title);
      const body = doc.createElement('div');
      body.dataset.panelBody = '';
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      const explanation = doc.createElement('p');
      explanation.textContent = echo
        ? 'First log out and close any other EchoLink client using your callsign. A second login can disconnect it. Microphone and camera are blocked in this embedded preview. Connections can announce your presence; incoming connections are controlled in EchoLink settings. Login and choose one node manually.'
        : 'Listen latest selects once: currently transmitting UK groups, then English-priority groups, then others. If none are transmitting, it uses activity from the last three minutes. Language is best effort, not detected speech. Open player controls and press Play if needed; minimise to keep the map clear. Only Stop closes the client; this is not GPS tracking.';
      if (echo && callsign)
        explanation.textContent += ` Select ${callsign} in the official client; no automatic node connection.`;
      body.append(explanation, status);
      panel.append(header, body);
      function button(label, action, parent = header) {
        const node = doc.createElement('button');
        node.type = 'button';
        node.className = 'panel-surface-control';
        node.textContent = label;
        listen(node, 'click', action);
        parent.append(node);
        return node;
      }
      const closeButton = button('Close / stop audio', close);
      const summary = doc.createElement('p');
      summary.className = 'amateur-radio-dock-summary';
      summary.textContent = 'No talkgroup selected.';
      summary.hidden = echo;
      header.append(summary);
      let minimized = !echo;
      let controlsButton = null;
      function setMinimized(value) {
        minimized = value;
        panel.dataset.minimized = String(value);
        body.hidden = value;
        controlsButton.textContent = value ? 'Show player' : 'Minimise to dock';
        controlsButton.setAttribute('aria-expanded', String(!value));
      }
      if (!echo) {
        panel.dataset.radioDock = '';
        controlsButton = button('Show player', () => setMinimized(!minimized));
        expand = () => {
          setMinimized(false);
          controlsButton.focus();
        };
        setMinimized(true);
      }
      let clientUrl = CLIENT_LINKS[client];
      let acknowledged = !echo;
      let acknowledge, loadButton;
      function load() {
        if (!acknowledged || frame) return;
        frame = doc.createElement('iframe');
        frame.title = echo
          ? 'Official EchoLink Web client (microphone blocked)'
          : 'Official BrandMeister Hoseline';
        frame.setAttribute(
          'allow',
          "autoplay; microphone 'none'; camera 'none'; display-capture 'none'",
        );
        frame.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
        );
        frame.referrerPolicy = 'no-referrer';
        status.className = '';
        status.textContent =
          'Loading official client. If it is blank or refuses embedding, stop it and use the official site below. A loaded frame does not guarantee an audio connection.';
        listen(frame, 'load', () => {
          status.textContent =
            'Official frame navigation finished. Check its UI for login, connection and playback status; the app cannot inspect this cross-origin client.';
        });
        listen(frame, 'error', () => {
          status.textContent =
            'Official client could not load. Use the official-site fallback; microphone settings there are independent.';
          status.className = 'panel-surface-error';
        });
        frame.src = clientUrl;
        body.append(frame);
        if (loadButton) loadButton.disabled = true;
        if (acknowledge) acknowledge.disabled = true;
      }
      let latestButton = null;
      async function latest() {
        if (typeof getActivity !== 'function' || request) return;
        const current = new AbortController();
        request = current;
        latestButton.disabled = true;
        summary.textContent = 'Checking public talkgroup activity...';
        try {
          const snapshot = await getActivity({ signal: current.signal });
          if (current.signal.aborted || request !== current || !panel) return;
          const row = chooseLatestTalkgroup(snapshot.rows, Date.now());
          if (!row)
            throw new Error(
              'No fresh eligible activity found. Try again or choose a talkgroup manually.',
            );
          const nextUrl = `${CLIENT_LINKS.hoseline}?subscribe=${row.talkgroup}`;
          if (!frame || clientUrl !== nextUrl) {
            clientUrl = nextUrl;
            unload();
            load();
          }
          summary.textContent = `TG ${row.talkgroup}${row.name ? ` | ${row.name}` : ''} | ${TALK_GROUP_TIERS[talkgroupTier(row.talkgroup, row.name)]} | ${row.active ? 'reported transmitting at selection' : 'recently active; may now be silent'}. Playback is controlled by Hoseline.`;
        } catch (cause) {
          if (current.signal.aborted || request !== current || !panel) return;
          console.warn('[Amateur Radio] Talkgroup selection failed:', cause);
          summary.textContent = `${cause.message || 'Activity unavailable'}. ${frame ? 'Existing player unchanged.' : 'Use Choose manually.'}`;
          status.className = 'panel-surface-error';
          status.textContent = summary.textContent;
        } finally {
          if (request === current) {
            request = null;
            latestButton.disabled = false;
          }
        }
      }
      if (!echo) {
        selectLatest = typeof getActivity === 'function' ? latest : null;
        latestButton = button('Listen latest', () => void latest());
        latestButton.disabled = typeof getActivity !== 'function';
        button(
          'Choose manually',
          () => {
            request?.abort();
            request = null;
            latestButton.disabled = typeof getActivity !== 'function';
            if (!frame) {
              clientUrl = CLIENT_LINKS.hoseline;
              load();
            }
            summary.textContent =
              'Manual selection in official Hoseline player. Minimise to keep audio and return to the map.';
            expand();
          },
          body,
        );
      }
      if (echo) {
        const label = doc.createElement('label');
        acknowledge = doc.createElement('input');
        acknowledge.type = 'checkbox';
        label.append(
          acknowledge,
          doc.createTextNode(
            ' I have logged out and closed my other EchoLink client(s).',
          ),
        );
        body.append(label);
        loadButton = button('Load EchoLink (microphone blocked)', load, body);
      }
      const fallback = button(
        'Stop embed / open official site',
        () => {
          if (!acknowledged) return;
          request?.abort();
          request = null;
          if (latestButton)
            latestButton.disabled = typeof getActivity !== 'function';
          unload();
          if (loadButton) loadButton.disabled = false;
          status.textContent = echo
            ? 'Embedded client stopped. The external official site has its own microphone permissions; deny access there for receive-only use. Use only one EchoLink login.'
            : 'Embedded client stopped. Playback now belongs to the external official Hoseline page.';
          openExternal(clientUrl);
        },
        body,
      );
      if (echo) {
        loadButton.disabled = true;
        fallback.disabled = true;
        listen(acknowledge, 'change', () => {
          acknowledged = acknowledge.checked;
          loadButton.disabled = !acknowledged;
          fallback.disabled = !acknowledged;
        });
      }
      listen(panel, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      });
      doc.body.append(panel);
      closeButton.focus();
      if (!echo) {
        if (getActivity) void latest();
        else {
          summary.textContent =
            'Automatic selection unavailable in this source. Use Show player to choose manually.';
          load();
        }
      }
    },
    close,
    destroy: close,
  };
}
