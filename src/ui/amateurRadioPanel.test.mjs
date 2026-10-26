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
