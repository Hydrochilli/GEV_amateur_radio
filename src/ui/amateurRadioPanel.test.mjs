import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmateurRadioPanel } from './amateurRadioPanel.js';

class Element extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tag = tag;
    this.doc = doc;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.isConnected = true;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (node) => node !== this,
      );
    this.isConnected = false;
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  focus() {
    this.doc.activeElement = this;
  }
}
function fixture(options = {}) {
  const opened = [],
    nodes = [];
  const doc = {
    createElement(tag) {
      const node = new Element(tag, doc);
      nodes.push(node);
      return node;
    },
  };
  doc.createTextNode = (text) => ({ textContent: text });
  doc.body = doc.createElement('body');
  const original = doc.createElement('button');
  doc.activeElement = original;
  const panel = createAmateurRadioPanel({
    getDocument: () => doc,
    openExternal: (url) => opened.push(url),
    ...options,
  });
  return {
    panel,
    nodes,
    doc,
    opened,
    original,
    find: (tag, text) =>
      nodes.findLast(
        (node) =>
          node.tag === tag && (text === undefined || node.textContent === text),
      ),
  };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));
const activity = (talkgroup = 2350) => ({
  status: 'live',
  error: null,
  fetchedAt: Date.now(),
  rows: [
    {
      talkgroup,
      name: 'United Kingdom',
      active: true,
      activityAt: Date.now(),
      receivedAt: Date.now(),
    },
  ],
});

test('latest action preselects preferred group and starts in a compact dock; expanding and minimising preserve the same frame', async () => {
  let calls = 0;
  const f = fixture({
    getActivity: async () => {
      calls++;
      return activity();
    },
  });
  f.panel.show('hoseline');
  assert.equal(f.find('section').dataset.minimized, 'true');
  assert.equal(f.find('iframe'), undefined);
  await settled();
  const frame = f.find('iframe');
  assert.equal(frame.src, 'https://hose.brandmeister.network/?subscribe=2350');
  assert.equal(calls, 1);
  f.find('button', 'Show player').dispatchEvent(new Event('click'));
  assert.equal(f.find('section').dataset.minimized, 'false');
  assert.equal(frame.isConnected, true);
  f.find('button', 'Minimise to dock').dispatchEvent(new Event('click'));
  assert.equal(f.find('section').dataset.minimized, 'true');
  assert.equal(f.find('iframe'), frame);
  f.panel.show('hoseline');
  assert.equal(
    f.find('iframe'),
    frame,
    'reopening controls must not reconnect audio',
  );
  f.find('button', 'Listen latest').dispatchEvent(new Event('click'));
  await settled();
  assert.equal(
    f.find('iframe'),
    frame,
    'same talkgroup must not reconnect audio',
  );
  assert.ok(f.nodes.some((node) => node.textContent?.includes('UK priority')));
  f.panel.close();
  assert.equal(frame.isConnected, false);
});

test('latest errors do not select an arbitrary default or discard an existing player; manual controls remain available', async () => {
  let fail = false;
  const f = fixture({
    getActivity: async () => {
      if (fail) throw new Error('feed offline');
      return activity();
    },
  });
  f.panel.show('hoseline');
  await settled();
  const frame = f.find('iframe');
  fail = true;
  f.find('button', 'Listen latest').dispatchEvent(new Event('click'));
  await settled();
  assert.equal(f.find('iframe'), frame);
  assert.equal(frame.isConnected, true);
  assert.ok(
    f.nodes.some((node) =>
      node.textContent?.includes('Existing player unchanged'),
    ),
  );
  f.panel.close();
  f.panel.show('hoseline');
  await settled();
  assert.equal(
    f.nodes.filter((node) => node.tag === 'iframe').length,
    1,
    'initial error must not silently choose a default TG',
  );
  f.find('button', 'Show player').dispatchEvent(new Event('click'));
  f.find('button', 'Choose manually').dispatchEvent(new Event('click'));
  assert.equal(f.find('iframe').src, 'https://hose.brandmeister.network/');
  f.panel.close();
});

test('close, manual selection, and switching to EchoLink cancel selection; late activity cannot load a ghost stream', async () => {
  let resolve, signal;
  const f = fixture({
    getActivity: (options) => {
      signal = options.signal;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  f.panel.show('hoseline');
  f.panel.close();
  assert.equal(signal.aborted, true);
  resolve(activity());
  await settled();
  assert.equal(f.find('iframe'), undefined);
  f.panel.show('hoseline');
  f.find('button', 'Show player').dispatchEvent(new Event('click'));
  f.find('button', 'Choose manually').dispatchEvent(new Event('click'));
  assert.equal(signal.aborted, true);
  const frame = f.find('iframe');
  resolve(activity());
  await settled();
  assert.equal(f.find('iframe'), frame);
  f.panel.close();
  f.panel.show('hoseline');
  f.panel.show('echolink');
  assert.equal(signal.aborted, true);
  resolve(activity());
  await settled();
  assert.equal(f.nodes.filter((node) => node.tag === 'iframe').length, 1);
  f.panel.close();
});
test('external fallback cancels an unfinished selection before handing off playback', async () => {
  let resolve, signal;
  const f = fixture({
    getActivity: (options) => {
      signal = options.signal;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  f.panel.show('hoseline');
  f.find('button', 'Stop embed / open official site').dispatchEvent(
    new Event('click'),
  );
  assert.equal(signal.aborted, true);
  assert.deepEqual(f.opened, ['https://hose.brandmeister.network/']);
  resolve(activity());
  await settled();
  assert.equal(f.find('iframe'), undefined);
  f.panel.close();
});

test('official clients mount only on user action and are unloaded on switch, close and destroy', () => {
  const f = fixture();
  assert.equal(f.doc.body.children.length, 0);
  f.panel.show('hoseline');
  const hose = f.find('iframe');
  assert.equal(hose.src, 'https://hose.brandmeister.network/');
  assert.match(hose.attributes.get('allow'), /microphone 'none'/);
  assert.match(hose.attributes.get('allow'), /camera 'none'/);
  f.panel.show('echolink', 'G8CZE-L');
  assert.equal(hose.isConnected, false);
  assert.equal(
    f.nodes.filter((node) => node.tag === 'iframe').length,
    1,
    'EchoLink is not loaded implicitly',
  );
  f.panel.close();
  assert.equal(f.doc.body.children.length, 0);
  assert.equal(f.doc.activeElement, f.original);
  f.panel.destroy();
  assert.throws(() => f.panel.show('arbitrary'), /Unsupported/);
});
test('EchoLink requires acknowledgment before either embed or external login; microphone remains blocked', () => {
  const f = fixture();
  f.panel.show('echolink');
  const load = f.find('button', 'Load EchoLink (microphone blocked)');
  const fallback = f.find('button', 'Stop embed / open official site');
  assert.equal(load.disabled, true);
  assert.equal(fallback.disabled, true);
  load.dispatchEvent(new Event('click'));
  fallback.dispatchEvent(new Event('click'));
  assert.equal(f.find('iframe'), undefined);
  assert.deepEqual(f.opened, []);
  const acknowledgment = f.find('input');
  acknowledgment.checked = true;
  acknowledgment.dispatchEvent(new Event('change'));
  load.dispatchEvent(new Event('click'));
  const frame = f.find('iframe');
  assert.equal(frame.src, 'https://webapp.echolink.org/');
  assert.match(
    frame.attributes.get('allow'),
    /microphone 'none'; camera 'none'; display-capture 'none'/,
  );
  assert.equal(load.disabled, true);
  assert.equal(acknowledgment.disabled, true);
  frame.dispatchEvent(new Event('error'));
  assert.ok(
    f.nodes.some((node) => node.textContent?.includes('could not load')),
  );
  fallback.dispatchEvent(new Event('click'));
  assert.equal(
    frame.isConnected,
    false,
    'fallback cannot leave a second embedded client running',
  );
  assert.deepEqual(f.opened, ['https://webapp.echolink.org/']);
  f.panel.destroy();
  load.dispatchEvent(new Event('click'));
  assert.equal(
    f.nodes.filter((node) => node.tag === 'iframe').length,
    1,
    'disposed listeners cannot mount another client',
  );
});

test('a stalled player times out at 30 seconds and retry replaces only that stream, retaining its talkgroup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ getActivity: async () => activity() });
  f.panel.show('hoseline');
  await settled();
  const stalled = f.find('iframe');
  const retry = f.find('button', 'Player failed: retry');
  const status = f.nodes.find(
    (node) => node.attributes?.get('role') === 'status',
  );
  t.mock.timers.tick(29_999);
  assert.equal(retry.hidden, true);
  t.mock.timers.tick(1);
  assert.equal(retry.hidden, false);
  assert.equal(status.className, 'panel-surface-error');
  assert.match(status.textContent, /30 seconds/);
  retry.dispatchEvent(new Event('click'));
  const replacement = f.find('iframe');
  assert.notEqual(replacement, stalled);
  assert.equal(stalled.isConnected, false);
  assert.equal(replacement.src, stalled.src);
  assert.equal(f.find('section').dataset.minimized, 'false');
  assert.equal(retry.hidden, true);
  const loading = status.textContent;
  stalled.dispatchEvent(new Event('load'));
  stalled.dispatchEvent(new Event('error'));
  assert.equal(
    status.textContent,
    loading,
    'retired frames cannot change status',
  );
  replacement.dispatchEvent(new Event('load'));
  t.mock.timers.tick(30_000);
  assert.equal(retry.hidden, true);
  assert.equal(status.className, '');
  assert.match(status.textContent, /navigation finished/);
  f.panel.close();
});

test('manual selection preserves a healthy frame but replaces a failed frame with the unselected official client', () => {
  const f = fixture();
  f.panel.show('hoseline');
  const original = f.find('iframe');
  const manual = f.find('button', 'Choose manually');
  original.dispatchEvent(new Event('load'));
  manual.dispatchEvent(new Event('click'));
  assert.equal(f.find('iframe'), original);
  original.dispatchEvent(new Event('error'));
  manual.dispatchEvent(new Event('click'));
  assert.equal(original.isConnected, false);
  assert.notEqual(f.find('iframe'), original);
  assert.equal(f.find('iframe').src, 'https://hose.brandmeister.network/');
  assert.equal(f.find('button', 'Player failed: retry').hidden, true);
  f.panel.close();
});

test('fallback, switching clients, and closing cancel pending frame timers and remove stale event listeners', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.panel.show('hoseline');
  const oldFrame = f.find('iframe');
  const retry = f.find('button', 'Player failed: retry');
  const status = f.nodes.find(
    (node) => node.attributes?.get('role') === 'status',
  );
  oldFrame.dispatchEvent(new Event('error'));
  assert.equal(retry.hidden, false);
  f.find('button', 'Stop embed / open official site').dispatchEvent(
    new Event('click'),
  );
  const stopped = status.textContent;
  oldFrame.dispatchEvent(new Event('load'));
  t.mock.timers.tick(30_000);
  assert.equal(status.textContent, stopped);
  assert.equal(retry.hidden, true);
  f.panel.close();
  f.panel.show('hoseline');
  const pendingStatus = f.nodes.findLast(
    (node) => node.attributes?.get('role') === 'status',
  );
  const pendingText = pendingStatus.textContent;
  f.panel.show('echolink');
  t.mock.timers.tick(30_000);
  assert.equal(pendingStatus.textContent, pendingText);
  const ack = f.find('input');
  ack.checked = true;
  ack.dispatchEvent(new Event('change'));
  f.find('button', 'Load EchoLink (microphone blocked)').dispatchEvent(
    new Event('click'),
  );
  const echoStatus = f.nodes.findLast(
    (node) => node.attributes?.get('role') === 'status',
  );
  const echoText = echoStatus.textContent;
  f.panel.destroy();
  t.mock.timers.tick(30_000);
  assert.equal(echoStatus.textContent, echoText);
});

test('clicked foreign markers select by country, UK markers and unlocated actions preserve UK priority', async () => {
  const f = fixture({
    getActivity: async () => ({
      ...activity(),
      rows: [
        ...activity(2350).rows,
        ...activity(208).rows,
        ...activity(3100).rows,
        ...activity(91).rows,
      ],
    }),
  });
  f.panel.show('hoseline', null, { lat: 48.8566, lon: 2.3522 });
  await settled();
  const french = f.find('iframe');
  assert.equal(french.src, 'https://hose.brandmeister.network/?subscribe=208');
  assert.ok(
    f.nodes.some((node) =>
      node.textContent?.includes('France country priority'),
    ),
  );
  f.find('button', 'Listen latest').dispatchEvent(new Event('click'));
  await settled();
  assert.equal(
    f.find('iframe'),
    french,
    'same country/talkgroup preserves playback',
  );
  f.panel.show('hoseline', null, { lat: 40.71, lon: -74.01 });
  await settled();
  assert.equal(french.isConnected, false);
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=3100',
  );
  assert.ok(
    f.nodes.some((node) =>
      node.textContent?.includes('United States of America country priority'),
    ),
  );
  f.panel.show('hoseline', null, { lat: 53.4808, lon: -2.2426 });
  await settled();
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=2350',
  );
  assert.ok(f.nodes.some((node) => node.textContent?.includes('UK priority')));
  f.panel.show('hoseline');
  await settled();
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=2350',
  );
  f.panel.close();
});

test('a new marker cancels an unfinished prior selection and never uses the old marker country', async () => {
  const pending = [];
  const f = fixture({
    getActivity: ({ signal }) =>
      new Promise((resolve) => pending.push({ signal, resolve })),
  });
  f.panel.show('hoseline', null, { lat: 48.8566, lon: 2.3522 });
  f.panel.show('hoseline', null, { lat: -33.87, lon: 151.21 });
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve(activity(208));
  await settled();
  assert.equal(f.find('iframe'), undefined);
  pending[1].resolve({
    ...activity(),
    rows: [...activity(208).rows, ...activity(505).rows],
  });
  await settled();
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=505',
  );
  f.panel.close();
});

test('invalid marker locations surface selection errors instead of silently choosing a UK talkgroup', async () => {
  const f = fixture({ getActivity: async () => activity() });
  f.panel.show('hoseline', null, { lat: 100, lon: 0 });
  await settled();
  assert.equal(f.find('iframe'), undefined);
  assert.ok(
    f.nodes.some((node) =>
      node.textContent?.includes('coordinates are invalid'),
    ),
  );
  f.panel.close();
});

test('local/regional selection discloses intended area, source and review date while preserving the dock lifecycle', async () => {
  let groups = [2350, 2358, 23520];
  const f = fixture({
    getActivity: async () => ({
      ...activity(),
      rows: groups.flatMap((tg) => activity(tg).rows),
    }),
  });
  f.panel.show('hoseline', null, { lat: 51.507222222222, lon: -0.1275 });
  await settled();
  const london = f.find('iframe');
  assert.equal(london.src, 'https://hose.brandmeister.network/?subscribe=2358');
  assert.ok(
    f.nodes.some((n) => n.textContent?.includes('London local intended area')),
  );
  const source = f.nodes.find(
    (n) => n.tag === 'a' && n.textContent === 'Official area source',
  );
  assert.equal(
    source.href,
    'https://wiki.brandmeister.network/index.php/TalkGroup/2358',
  );
  assert.equal(source.rel, 'noopener noreferrer');
  assert.ok(
    f.nodes.some((n) => n.textContent?.includes('source reviewed 2026-10-26')),
  );
  assert.equal(f.find('section').dataset.minimized, 'true');
  f.find('button', 'Show player').dispatchEvent(new Event('click'));
  f.find('button', 'Minimise to dock').dispatchEvent(new Event('click'));
  assert.equal(f.find('iframe'), london);
  f.panel.show('hoseline', null, { lat: 53.4808, lon: -2.2426 });
  await settled();
  assert.equal(london.isConnected, false);
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=23520',
  );
  assert.ok(
    f.nodes.some((n) =>
      n.textContent?.includes('North West England regional intended area'),
    ),
  );
  groups = [2350, 208, 2081];
  f.panel.show('hoseline', null, { lat: 48.8566, lon: 2.3522 });
  await settled();
  assert.equal(
    f.find('iframe').src,
    'https://hose.brandmeister.network/?subscribe=2081',
  );
  assert.equal(
    source.href,
    'https://wiki.brandmeister.network/index.php/France',
  );
  f.panel.close();
});

test('the intended-area directory is collapsed and filterable, with provenance and no playback caused by searching', () => {
  const f = fixture();
  f.panel.show('hoseline');
  const frame = f.find('iframe');
  const details = f.find('details');
  assert.notEqual(details.open, true);
  assert.match(f.find('summary').textContent, /84 curated entries/);
  const input = f.nodes.find(
    (n) => n.attributes?.get('aria-label') === 'Filter intended-area directory',
  );
  input.value = 'London';
  input.dispatchEvent(new Event('input'));
  const visible = f.nodes.filter((n) => n.tag === 'li' && !n.hidden);
  assert.equal(
    visible.length,
    2,
    'UK and Canadian London must be distinguished',
  );
  assert.ok(
    visible.some(
      (n) => n.textContent.includes('2358') && n.textContent.includes('GB'),
    ),
  );
  assert.ok(
    visible.some(
      (n) => n.textContent.includes('302066') && n.textContent.includes('CA'),
    ),
  );
  assert.ok(
    visible.every((n) => n.children.some((child) => child.tag === 'a')),
  );
  input.value = 'not a directory area';
  input.dispatchEvent(new Event('input'));
  assert.equal(f.find('p', 'No matching directory entries.').hidden, false);
  assert.equal(f.find('iframe'), frame);
  f.panel.close();
  input.value = '';
  input.dispatchEvent(new Event('input'));
  assert.equal(
    f.find('p', 'No matching directory entries.').hidden,
    false,
    'search listener is removed on close',
  );
});
