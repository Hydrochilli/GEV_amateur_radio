import test from 'node:test';
import assert from 'node:assert/strict';
import { createSatelliteObservationPanel } from './satelliteObservations.js';

class Element extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tag = tag;
    this.doc = doc;
    this.children = [];
    this.dataset = {};
    this.attrs = new Map();
    this.isConnected = true;
    this.pauses = 0;
    this.loads = 0;
    this.textContent = '';
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.isConnected = false;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (node) => node !== this,
      );
    this.isConnected = false;
  }
  setAttribute(key, value) {
    this.attrs.set(key, value);
  }
  removeAttribute(key) {
    this.attrs.delete(key);
    if (key === 'src') this.src = '';
  }
  focus() {
    this.doc.activeElement = this;
  }
  pause() {
    this.pauses++;
  }
  load() {
    this.loads++;
  }
}
const row = {
  id: 15290005,
  noradId: 50466,
  startAt: Date.UTC(2026, 9, 26, 4, 32),
  endAt: Date.UTC(2026, 9, 26, 4, 35),
  stationId: 4260,
  stationName: '<script>unsafe station</script>',
  status: 'unknown',
  mode: 'GMSK',
  frequencyHz: 435725000,
  frameCount: 3,
  audioUrl:
    'https://network-satnogs.freetls.fastly.net/media/15290005/test.ogg',
  waterfallUrl: 'https://network.satnogs.org/media/15290005/waterfall.png',
  mediaNotice: null,
};
const model = () => ({
  noradId: 50466,
  name: 'XW-3',
  status: 'ready',
  error: null,
  snapshot: {
    fetchedAt: Date.UTC(2026, 9, 26, 9, 30),
    stale: false,
    error: null,
    checkedCount: 25,
    hasMore: true,
    observations: [structuredClone(row)],
  },
});

function fixture() {
  const nodes = [];
  const doc = {
    createElement(tag) {
      const node = new Element(tag, doc);
      nodes.push(node);
      return node;
    },
  };
  doc.body = doc.createElement('body');
  const original = doc.createElement('button');
  doc.activeElement = original;
  const panel = createSatelliteObservationPanel({ getDocument: () => doc });
  return {
    nodes,
    doc,
    original,
    panel,
    find: (tag, text) =>
      nodes.findLast(
        (node) =>
          node.isConnected &&
          node.tag === tag &&
          (text === undefined || node.textContent === text),
      ),
    texts: () =>
      nodes
        .filter((node) => node.isConnected)
        .map((node) => node.textContent)
        .join('\n'),
  };
}
test('observation UI is lazy, labels historical/unvetted data and renders attribution and safe links', () => {
  const f = fixture();
  f.panel.update(model());
  assert.equal(f.doc.body.children.length, 0);
  f.panel.show(model());
  assert.equal(
    f.find('section').attrs.get('aria-label'),
    'SatNOGS satellite observations',
  );
  assert.match(f.texts(), /not a live downlink/);
  assert.match(f.texts(), /not exact packet reception/);
  assert.match(f.texts(), /Reported quality: unknown/);
  assert.match(f.texts(), /Demodulated frame files: 3/);
  assert.match(f.texts(), /requires authentication/);
  assert.match(f.texts(), /CC BY-SA 4.0/);
  assert.match(f.texts(), /<script>unsafe station<\/script>/);
  assert.equal(
    f.nodes.some((node) => node.tag === 'script'),
    false,
    'untrusted text never becomes markup',
  );
  assert.equal(f.find('audio'), undefined);
  assert.equal(f.find('img'), undefined);
  const observation = f.find('a', 'Open official observation');
  assert.equal(
    observation.href,
    'https://network.satnogs.org/observations/15290005/',
  );
  assert.equal(observation.rel, 'noopener noreferrer');
  f.panel.close();
  assert.equal(f.doc.body.children.length, 0);
  assert.equal(f.doc.activeElement, f.original);
});

test('recording is user-loaded, never autoplayed, retained across metadata refresh and stopped on close', () => {
  const f = fixture();
  f.panel.show(model());
  const button = f.find('button', 'Load recorded audio (not live)');
  button.dispatchEvent(new Event('click'));
  const audio = f.find('audio');
  assert.equal(audio.src, row.audioUrl);
  assert.equal(audio.preload, 'none');
  assert.equal(audio.autoplay, undefined);
  assert.equal(audio.controls, true);
  f.panel.update({ ...model(), status: 'loading' });
  assert.equal(f.find('audio'), audio);
  f.panel.update(model());
  assert.equal(
    f.find('audio'),
    audio,
    'periodic refresh must not restart or interrupt the recording',
  );
  audio.dispatchEvent(new Event('error'));
  assert.match(f.texts(), /Recording unavailable/);
  f.panel.close();
  assert.equal(audio.pauses, 1);
  assert.equal(audio.src, '');
  assert.equal(
    audio.loads,
    1,
    'removes the media resource, not just the visible control',
  );
  button.dispatchEvent(new Event('click'));
  assert.equal(
    f.nodes.filter((node) => node.tag === 'audio').length,
    1,
    'disposed listener cannot load audio',
  );
});

test('different observation or satellite stops media; waterfall loads only after explicit action', () => {
  const f = fixture();
  f.panel.show(model());
  f.find('button', 'Load recorded audio (not live)').dispatchEvent(
    new Event('click'),
  );
  const audio = f.find('audio');
  f.find('button', 'Show waterfall').dispatchEvent(new Event('click'));
  assert.equal(f.find('img').src, row.waterfallUrl);
  const next = model();
  next.snapshot.observations = [
    { ...row, id: 42, audioUrl: null, waterfallUrl: null },
  ];
  f.panel.update(next);
  assert.equal(audio.pauses, 1);
  assert.equal(audio.src, '');
  f.panel.update({ ...next, noradId: 25544 });
  assert.equal(f.doc.body.children.length, 0);
});

test('empty, stale, unavailable and failed results do not masquerade as live reception', () => {
  const f = fixture();
  const empty = model();
  empty.snapshot.observations = [];
  f.panel.show(empty);
  assert.match(f.texts(), /No completed observations in the checked results/);
  assert.match(f.texts(), /does not prove/);
  const stale = model();
  stale.snapshot.stale = true;
  stale.error = 'Upstream offline';
  stale.status = 'error';
  f.panel.update(stale);
  assert.match(f.texts(), /STALE cached result/);
  assert.match(f.texts(), /Upstream offline/);
  f.panel.close();
  f.panel.show({
    ...model(),
    status: 'unavailable',
    error: 'Adapter not configured',
    snapshot: null,
  });
  assert.match(f.texts(), /Adapter not configured/);
  assert.equal(f.find('audio'), undefined);
  f.panel.close();
});
