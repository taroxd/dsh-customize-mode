import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createDefaultsStore, openDefaults } from './defaults.js';
import { createController } from './controller.js';
import { DEFAULT_CONFIG, PRESET_ID, validateRequest } from './state.js';
import { fixture } from './test-support.js';

const config = extra => ({ ...DEFAULT_CONFIG, ...extra });
const request = (revision, extra = {}) => ({ action: 'set-defaults', expectedRevision: revision, config: config(extra) });
const code = expected => error => error.code === expected;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const allow = () => {};

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
          documents.set(spec.name, structuredClone(next)); value = next; state.writes++;
        },
      }, async close() { active.delete(spec.name); state.closes++; } };
    } },
  });
  return { ctx, state, documents };
}

async function storeFixture() {
  const disk = medium();
  return { ...disk, store: await openDefaults(disk.ctx('profile-one'), z) };
}

test('global defaults survive reopening and remain isolated by profile, not workspace', async () => {
  const disk = medium();
  const one = await openDefaults(disk.ctx('profile-one'), z);
  assert.deepEqual(one.current(), { revision: 0, config: config() });
  const desired = config({ overridePrompt: true, prompt: '', allowedTools: [], includeRuntimeContext: false, includeTimeContext: false });
  await one.set({ ...request(0), config: desired }, allow); await one.close();
  const restored = await openDefaults(disk.ctx('profile-one'), z);
  const other = await openDefaults(disk.ctx('profile-two'), z);
  assert.deepEqual(restored.current(), { revision: 1, config: desired });
  assert.deepEqual(other.current(), { revision: 0, config: config() });
  assert.equal(disk.state.names[0], disk.state.names[1]);
  assert.notEqual(disk.state.names[0], disk.state.names[2]);
  assert.doesNotMatch(disk.state.names.join(' '), /profile-one|profile-two/);
  assert.throws(() => { restored.current().config.prompt = 'mutated'; }, TypeError);
  assert.throws(() => { restored.current().config.allowedTools.push('read'); }, TypeError);
  await restored.close(); await other.close();
});

test('global CAS is checked inside the write queue and memory changes only after durability', async () => {
  const f = await storeFixture(), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const one = f.store.set(request(0, { prompt: 'first' }), allow);
  const two = f.store.set(request(0, { prompt: 'stale' }), allow);
  const rejected = assert.rejects(two, code('DEFAULTS_REVISION_CONFLICT'));
  await began.promise;
  assert.equal(f.store.current().revision, 0);
  release.resolve(); await one; await rejected;
  assert.equal(f.state.writes, 1); assert.equal(f.store.current().config.prompt, 'first');
  await f.store.close();
});

test('failed persistence preserves defaults, reports a stable error, and allows retry', async () => {
  const error = new Error('private backend path'), logs = [];
  let value = { revision: 0, config: config() }, fail = true;
  const store = createDefaultsStore({ global: { get: () => value, async set(next) { if (fail) throw error; value = next; } }, async close() {} }, e => logs.push(e));
  await assert.rejects(store.set(request(0, { prompt: 'new' }), allow), code('DEFAULTS_SAVE_FAILED'));
  assert.equal(store.current().revision, 0); assert.equal(value.revision, 0); assert.deepEqual(logs, [error]);
  fail = false; await store.set(request(0, { prompt: 'retry' }), allow);
  assert.equal(store.current().config.prompt, 'retry'); await store.close();
});

test('queued default writes recheck authorization and late cancellation cannot undo a commit', async () => {
  const f = await storeFixture(), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const first = f.store.set(request(0), allow);
  const abort = new AbortController();
  const queued = f.store.set(request(1), () => { if (abort.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'ABORTED' }); });
  const rejected = assert.rejects(queued, code('ABORTED'));
  await began.promise; abort.abort(); release.resolve(); await first; await rejected;
  assert.equal(f.state.writes, 1);
  const late = new AbortController();
  f.state.beforeSet = async () => { late.abort(); };
  await f.store.set(request(1, { prompt: 'committed' }), () => late.signal.throwIfAborted());
  assert.equal(f.store.current().revision, 2); await f.store.close();
});

test('closing defaults drains accepted writes, rejects new writes, and closes once', async () => {
  const f = await storeFixture(), began = deferred(), release = deferred();
  f.state.beforeSet = async () => { began.resolve(); await release.promise; };
  const write = f.store.set(request(0), allow); await began.promise;
  const closing = f.store.close();
  assert.equal(f.state.closes, 0);
  assert.throws(() => f.store.set(request(0), allow), code('UNAVAILABLE'));
  release.resolve(); await write; await closing; await f.store.close();
  assert.equal(f.state.closes, 1);
});

test('default requests validate action, complete config, reserved tools, and safe revisions', async () => {
  const f = await storeFixture();
  for (const bad of [{ ...request(0), action: 'set' }, request(-1), request(Number.MAX_SAFE_INTEGER),
    request(0, { prompt: 1 }), request(0, { allowedTools: ['run_code'] })]) {
    assert.throws(() => f.store.set(bad, allow));
  }
  assert.equal(f.state.writes, 0); await f.store.close();
});

test('only future fresh roots capture defaults once, including before Custom preset selection', async () => {
  const f = fixture(), existing = f.agent('existing'), storage = await storeFixture();
  await storage.store.set(request(0, { overridePrompt: true, prompt: 'first default', allowedTools: [] }), allow);
  const controller = createController(f.ctx, z, storage.store);
  const custom = f.agent('workspace-one');
  const blank = f.agent('workspace-two', { preset: 'standard' });
  assert.equal(controller.snapshotOf(existing).revision, 0);
  assert.equal(controller.snapshotOf(custom).revision, 1);
  assert.equal(controller.snapshotOf(custom).config.prompt, 'first default');
  assert.deepEqual(custom.ctx.tools.schemas(), []);
  assert.equal(blank.registry.sections.size, 0);
  assert.deepEqual(blank.session.events.map(event => event.type), ['command/run', 'command/done']);
  await storage.store.set(request(1, { overridePrompt: true, prompt: 'next default' }), allow);
  f.select(blank, PRESET_ID);
  assert.equal([...blank.registry.sections][0].text, 'first default');
  assert.equal(controller.snapshotOf(custom).config.prompt, 'first default');
  assert.equal(controller.snapshotOf(existing).revision, 0);
  const next = f.agent('workspace-three');
  assert.equal(controller.snapshotOf(next).config.prompt, 'next default');
  const revision = controller.snapshotOf(custom).revision;
  controller.set(custom, validateRequest({ action: 'set', expectedRevision: revision, config: config({ prompt: 'session only' }) }), new AbortController().signal);
  assert.equal(storage.store.current().config.prompt, 'next default');
  controller.dispose(); await storage.store.close();
});

test('resumes, seeded forks, child roots, clears and compactions never take newer global defaults', async () => {
  const f = fixture(), storage = await storeFixture();
  const controller = createController(f.ctx, z, storage.store);
  const original = f.agent('original');
  const seed = original.session.snapshotEvents();
  await storage.store.set(request(0, { prompt: 'must not inherit' }), allow);
  const fork = f.agent('fork', { seed, parentSession: 'original' });
  const resumed = f.agent('resumed', { seed, source: 'resume' });
  for (const a of [fork, resumed]) assert.equal(controller.snapshotOf(a).config.prompt, '');
  const excluded = [{ source: 'resume' }, { source: 'clear' }, { source: 'compact' }, { root: false },
    { isSeeded: true }, { parentSession: 'original' }, { origin: 'subagent' }, { inheritedEventCount: 1 }];
  excluded.forEach((options, i) => {
    const a = f.agent('excluded-' + i, options);
    assert.equal(controller.snapshotOf(a).revision, 0);
    assert.equal(a.session.events.length, 0);
  });
  controller.dispose(); await storage.store.close();
});
