import { CLIENT_LINKS } from '../layers/amateurRadio/cards.js';
import {
  chooseLatestTalkgroup,
  talkgroupTier,
  TALK_GROUP_TIERS,
} from '../sources/brandmeisterActivity.js';
import {
  resolveBrandmeisterLocation,
  talkgroupCountry,
} from '../sources/brandmeisterCountries.js';
import {
  TALK_GROUP_DIRECTORY,
  getTalkgroupDirectoryEntry,
  resolveTalkgroupAreas,
} from '../sources/brandmeisterTalkgroups.js';

/** Official cross-origin clients own credentials and playback; we own their lifetime. */
export function createAmateurRadioPanel({
  getDocument = () => document,
  openExternal,
  getActivity,
} = {}) {
  let panel = null,
    frame = null;
  let removers = [];
  const frameRemovers = [];
  let loadTimer = null;
  let frameFailed = false;
  let returnFocus = null;
  let request = null;
  let activeClient = null;
  let expand = null;
  let selectLatest = null;
  let markerLocation = null;
  function listen(node, type, callback, cleanup = removers) {
    node.addEventListener(type, callback);
    cleanup.push(() => node.removeEventListener(type, callback));
  }
  function unload() {
    clearTimeout(loadTimer);
    loadTimer = null;
    for (const remove of frameRemovers.splice(0)) remove();
    frame?.remove();
    frame = null;
    frameFailed = false;
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
    markerLocation = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  return {
    show(client, callsign = null, location = null) {
      if (!['hoseline', 'echolink'].includes(client))
        throw new TypeError('Unsupported official radio client');
      const nextLocation = location
        ? { lat: location.lat, lon: location.lon }
        : null;
      if (panel && client === 'hoseline' && activeClient === client) {
        if (
          nextLocation?.lat !== markerLocation?.lat ||
          nextLocation?.lon !== markerLocation?.lon
        ) {
          request?.abort();
          request = null;
          markerLocation = nextLocation;
        }
        if (selectLatest) void selectLatest();
        else expand?.();
        return;
      }
      const doc = getDocument();
      const previousFocus = panel ? returnFocus : doc.activeElement;
      close();
      returnFocus = previousFocus;
      markerLocation = nextLocation;
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
        : 'One-shot selection: transmitting groups first, otherwise calls ended within three minutes. A clicked marker prefers matching local intended areas, then administrative regions, then existing country rules. Local matches use a 25 km city-centre rule; neither intended areas nor country prefixes locate speakers or imply RF coverage. Press Play in Hoseline if needed; minimise to keep the map clear.';
      if (echo && callsign)
        explanation.textContent += ` Select ${callsign} in the official client; no automatic node connection.`;
      body.append(explanation, status);
      const provenance = doc.createElement('p');
      const provenanceText = doc.createElement('span');
      const provenanceLink = doc.createElement('a');
      provenanceLink.textContent = 'Official area source';
      provenanceLink.target = '_blank';
      provenanceLink.rel = 'noopener noreferrer';
      provenance.append(provenanceText, provenanceLink);
      provenance.hidden = true;
      body.append(provenance);
      if (!echo) {
        const directory = doc.createElement('details');
        const heading = doc.createElement('summary');
        heading.textContent = `Intended-area directory (${TALK_GROUP_DIRECTORY.length} curated entries)`;
        const note = doc.createElement('p');
        note.textContent =
          'Initial coverage: UK, US states/DC, Canada and selected French areas; not an exhaustive worldwide directory. Source review dates are not live verification. Local matches use a 25 km city-centre proximity rule; regional matches use approximate administrative boundaries, not RF coverage or speaker positions.';
        const search = doc.createElement('input');
        search.type = 'search';
        search.setAttribute('aria-label', 'Filter intended-area directory');
        search.placeholder = 'Area, talkgroup or country code';
        const list = doc.createElement('ul');
        const empty = doc.createElement('p');
        empty.textContent = 'No matching directory entries.';
        empty.hidden = true;
        const items = TALK_GROUP_DIRECTORY.map((entry) => {
          const item = doc.createElement('li');
          item.textContent = `TG ${entry.talkgroup} | ${entry.name} | ${entry.countryCode} | ${entry.scope === 'local' ? '25 km city-centre rule' : 'administrative region'} | reviewed ${entry.reviewedAt} `;
          const link = doc.createElement('a');
          link.textContent = 'Area source';
          link.href = entry.source;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
          if (entry.centerSource) {
            const centerLink = doc.createElement('a');
            centerLink.textContent = ' City point (Wikidata)';
            centerLink.href = entry.centerSource;
            centerLink.target = '_blank';
            centerLink.rel = 'noopener noreferrer';
            item.append(centerLink);
          }
          list.append(item);
          return { item, text: item.textContent.toLowerCase() };
        });
        listen(search, 'input', () => {
          const query = search.value.trim().toLowerCase();
          for (const { item, text } of items)
            item.hidden = !text.includes(query);
          empty.hidden = items.some(({ item }) => !item.hidden);
        });
        directory.append(heading, note, search, empty, list);
        body.append(directory);
      }
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
        const loadingFrame = frame;
        retryButton.hidden = true;
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
        function failed(message) {
          if (frame !== loadingFrame) return;
          clearTimeout(loadTimer);
          loadTimer = null;
          frameFailed = true;
          status.textContent = message;
          status.className = 'panel-surface-error';
          retryButton.hidden = false;
        }
        listen(
          frame,
          'load',
          () => {
            if (frame !== loadingFrame) return;
            clearTimeout(loadTimer);
            loadTimer = null;
            frameFailed = false;
            retryButton.hidden = true;
            status.className = '';
            status.textContent =
              'Official frame navigation finished. Check its UI for login, connection and playback status; the app cannot inspect this cross-origin client.';
          },
          frameRemovers,
        );
        listen(
          frame,
          'error',
          () =>
            failed(
              'Official client could not load. Retry the player or use the official-site fallback; microphone settings there are independent.',
            ),
          frameRemovers,
        );
        loadTimer = setTimeout(
          () =>
            failed(
              'Official player did not finish loading within 30 seconds. If using the VS Code browser, open this app in a regular Chrome or Edge window. Otherwise retry the player or stop the embed and open the official site. Audio has not been confirmed.',
            ),
          30_000,
        );
        frame.src = clientUrl;
        body.append(frame);
        if (loadButton) loadButton.disabled = true;
        if (acknowledge) acknowledge.disabled = true;
      }
      let latestButton = null;
      const retryButton = button('Player failed: retry', () => {
        request?.abort();
        request = null;
        if (latestButton)
          latestButton.disabled = typeof getActivity !== 'function';
        unload();
        load();
        if (!echo) expand?.();
      });
      retryButton.hidden = true;
      async function latest() {
        if (typeof getActivity !== 'function' || request) return;
        const current = new AbortController();
        request = current;
        latestButton.disabled = true;
        summary.textContent = 'Checking public talkgroup activity...';
        try {
          const snapshot = await getActivity({ signal: current.signal });
          if (current.signal.aborted || request !== current || !panel) return;
          const [proximity, areaPriorities] = markerLocation
            ? await Promise.all([
                resolveBrandmeisterLocation(markerLocation),
                resolveTalkgroupAreas(
                  markerLocation,
                  snapshot.rows.map((row) => row.talkgroup),
                ),
              ])
            : [null, null];
          if (current.signal.aborted || request !== current || !panel) return;
          const countryPriorities =
            proximity && proximity.nearest.code !== 'GB'
              ? new Map(
                  snapshot.rows.map((row) => [
                    row.talkgroup,
                    areaPriorities.get(row.talkgroup)
                      ? proximity.countries.get(
                          areaPriorities.get(row.talkgroup).entry.countryCode,
                        )
                      : talkgroupCountry(row.talkgroup, proximity),
                  ]),
                )
              : null;
          const row = chooseLatestTalkgroup(
            snapshot.rows,
            Date.now(),
            countryPriorities,
            areaPriorities,
          );
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
          const country = countryPriorities?.get(row.talkgroup);
          const area = areaPriorities?.get(row.talkgroup);
          const entry =
            area?.entry || getTalkgroupDirectoryEntry(row.talkgroup);
          const priority = area?.matched
            ? entry.scope === 'local'
              ? `${entry.name} local intended area (${Math.round(area.distanceKm)} km from city centre; 25 km rule)`
              : `${entry.name} regional intended area (administrative boundary)`
            : countryPriorities
              ? country
                ? `${country.name} country priority (${Math.round(country.distanceKm)} km from marker)`
                : 'Country unassigned; newest eligible activity'
              : TALK_GROUP_TIERS[talkgroupTier(row.talkgroup, row.name)];
          provenance.hidden = !entry;
          if (entry) {
            provenanceText.textContent = `Directory intended area: ${entry.name}; ${markerLocation ? (area?.matched ? 'marker matches' : 'marker outside mapped area') : 'no marker location'}; source reviewed ${entry.reviewedAt}, not a live guarantee. `;
            provenanceLink.href = entry.source;
          }
          summary.textContent = `TG ${row.talkgroup}${row.name ? ` | ${row.name}` : ''} | ${priority}${proximity ? ` | marker country: ${proximity.nearest.name}` : ''} | ${row.active ? 'reported transmitting at selection' : 'recently active; may now be silent'}. Playback is controlled by Hoseline.`;
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
            if (!frame || frameFailed) {
              clientUrl = CLIENT_LINKS.hoseline;
              unload();
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
          retryButton.hidden = true;
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
