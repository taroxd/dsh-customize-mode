import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetStore, openPresets, MAX_PRESETS } from './presets.js';
import { DEFAULT_CONFIG } from './state.js';

const config = extra => ({ ...DEFAULT_CONFIG, ...extra });
const code = expected => error => error.code === expected;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const allow = () => {};
const save = (title, extra = {}, overwrite = false) => ({ title, note: '', config: config(extra), overwrite });

function medium() {
  const documents = new Map(), active = new Set();
  const state = { beforeSet: undefined, writes: 0, closes: 0, names: [] };
  const ctx = profile => ({
    profileContext: { dir: profile }, logger: { warn() {} },
    storageDomain: { async open(spec) {
      assert.match(spec.name, /^[a-z][a-z0-9_]*$/);
      assert.equal(active.has(spec.name), false); active.add(spec.name); state.names.push(spec.name);
      let value = spec.global.schema.parse(structuredClone(documents.get(spec.name) ?? spec.global.initial));
      return { global: {
        get: () => value,
        async set(next) {
          await state.beforeSet?.(next);
          documents.set(spec.name, structuredClone(spec.global.schema.parse(next))); value = next; state.writes++;
        },
      }, async close() { active.delete(spec.name); state.closes++; } };
    } },
  });
  return { ctx, state, documents };
}

let clock = 1000;
function memoryStore(initial = { defaultTitle: null, presets: [] }, { fail } = {}) {
  let value = initial;
  const logs = [];
  const store = createPresetStore({ global: { get: () => value, async set(next) { if (fail?.()) throw new Error('private backend path'); value = next; } }, async close() {} },
    error => logs.push(error), () => ++clock);
  return { store, logs, stored: () => value };
}

test('presets survive reopening and stay isolated by profile', async () => {
  const disk = medium();
  const one = await openPresets(disk.ctx('profile-one'));
  assert.deepEqual(one.current(), { defaultTitle: null, presets: [] });
  await one.save(save('Review', { overridePrompt: true, prompt: 'Review it', allowedTools: [] }), allow);
  await one.setDefault('Review', allow);
  await one.close();
  const restored = await openPresets(disk.ctx('profile-one'));
  const other = await openPresets(disk.ctx('profile-two'));
  assert.equal(restored.current().defaultTitle, 'Review');
  assert.equal(restored.defaultConfig().prompt, 'Review it');
  assert.deepEqual(other.current(), { defaultTitle: null, presets: [] });
  assert.equal(disk.state.names[0], disk.state.names[1]);
  assert.notEqual(disk.state.names[0], disk.state.names[2]);
  assert.doesNotMatch(disk.state.names.join(' '), /profile-one|profile-two/);
  assert.throws(() => { restored.current().presets[0].config.prompt = 'mutated'; }, TypeError);
  assert.throws(() => { restored.current().presets.push({}); }, TypeError);
  await restored.close(); await other.close();
});

test('saving an existing title needs explicit overwrite, which replaces its settings and note', async () => {
  const { store } = memoryStore();
  await store.save({ ...save('Review', { prompt: 'first' }), note: 'Old note' }, allow);
  await assert.rejects(store.save(save('Review', { prompt: 'second' }), allow), code('PRESET_EXISTS'));
  assert.equal(store.current().presets[0].config.prompt, 'first');
  const before = store.current().presets[0].updatedAt;
  await store.save({ ...save('Review', { prompt: 'second' }, true), note: 'New note' }, allow);
  assert.equal(store.current().presets.length, 1);
  assert.equal(store.current().presets[0].config.prompt, 'second');
  assert.equal(store.current().presets[0].note, 'New note');
  assert.ok(store.current().presets[0].updatedAt > before);
});

test('overwriting the default preset keeps it the default with the new settings', async () => {
  const { store } = memoryStore();
  await store.save(save('Daily', { prompt: 'v1' }), allow);
  await store.setDefault('Daily', allow);
  await store.save(save('Daily', { prompt: 'v2' }, true), allow);
  assert.equal(store.defaultConfig().prompt, 'v2');
});

test('deleting a preset clears the default only when it was the default', async () => {
  const { store } = memoryStore();
  await store.save(save('A'), allow); await store.save(save('B'), allow);
  await store.setDefault('A', allow);
  await store.remove('B', allow);
  assert.equal(store.current().defaultTitle, 'A');
  await store.remove('A', allow);
  assert.equal(store.current().defaultTitle, null);
  assert.equal(store.defaultConfig(), undefined);
  await assert.rejects(store.remove('A', allow), code('PRESET_NOT_FOUND'));
  await assert.rejects(store.setDefault('missing', allow), code('PRESET_NOT_FOUND'));
  await store.setDefault(null, allow);
});

test('writes are queued and each one sees the result of the previous write', async () => {
  const f = medium(), store = await openPresets(f.ctx('profile')), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const one = store.save(save('Same', { prompt: 'first' }), allow);
  const two = store.save(save('Same', { prompt: 'second' }), allow);
  const rejected = assert.rejects(two, code('PRESET_EXISTS'));
  await began.promise;
  assert.equal(store.current().presets.length, 0, 'memory changes only after the write is durable');
  release.resolve(); await one; await rejected;
  assert.equal(f.state.writes, 1);
  assert.equal(store.current().presets[0].config.prompt, 'first');
  await store.close();
});

test('a failed write keeps the previous presets, reports a stable error, and allows a retry', async () => {
  let fail = true;
  const { store, logs, stored } = memoryStore(undefined, { fail: () => fail });
  await assert.rejects(store.save(save('A'), allow), code('PRESETS_SAVE_FAILED'));
  assert.deepEqual(store.current().presets, []);
  assert.deepEqual(stored().presets, []);
  assert.equal(logs.length, 1);
  fail = false;
  await store.save(save('A'), allow);
  assert.equal(store.current().presets.length, 1);
});

test('queued writes check authorization again when their turn comes', async () => {
  const f = medium(), store = await openPresets(f.ctx('profile')), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const first = store.save(save('A'), allow);
  let revoked = false;
  const queued = store.save(save('B'), () => { if (revoked) throw Object.assign(new Error('gone'), { code: 'SESSION_NOT_FOUND' }); });
  const rejected = assert.rejects(queued, code('SESSION_NOT_FOUND'));
  await began.promise; revoked = true; release.resolve();
  await first; await rejected;
  assert.deepEqual(store.current().presets.map(preset => preset.title), ['A']);
  await store.close();
});

test('the number of presets and the size of the collection are bounded', async () => {
  const presets = Array.from({ length: MAX_PRESETS }, (_, i) => ({ title: `P${i}`, note: '', config: config(), updatedAt: 1 }));
  const { store } = memoryStore({ defaultTitle: null, presets });
  await assert.rejects(store.save(save('One more'), allow), code('PRESETS_FULL'));
  await store.save(save('P1', { prompt: 'replacing is still allowed' }, true), allow);
  const big = memoryStore();
  const prompt = 'x'.repeat(900_000);
  for (let i = 0; i < 18; i++) await big.store.save(save(`Big ${i}`, { prompt }), allow);
  await assert.rejects(big.store.save(save('Too much', { prompt }), allow), code('PRESETS_FULL'));
});

test('closing drains accepted writes, rejects new ones, and closes the domain once', async () => {
  const f = medium(), store = await openPresets(f.ctx('profile')), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const write = store.save(save('A'), allow); await began.promise;
  const closing = store.close();
  assert.equal(f.state.closes, 0);
  assert.throws(() => store.save(save('B'), allow), code('UNAVAILABLE'));
  release.resolve(); await write; await closing; await store.close();
  assert.equal(f.state.closes, 1);
});

test('a stored collection that breaks its invariants is rejected when the store opens', () => {
  for (const broken of [
    { defaultTitle: 'missing', presets: [] },
    { defaultTitle: null, presets: [{ title: 'A', note: '', config: config(), updatedAt: 1 }, { title: 'A', note: '', config: config(), updatedAt: 2 }] },
  ]) {
    assert.throws(() => memoryStore(broken));
  }
});
