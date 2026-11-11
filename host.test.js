import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, PROTOCOL, PRESET_ID, initialState, fold, validateConfig, validateSettingsPayload, permits, projectionDefinition } from './state.js';
import { installPolicy, filterTimeContext } from './policy.js';
import { createController } from './controller.js';
import { fixture, registry, memoryPresets, settle } from './test-support.js';

const config = extra => ({ ...DEFAULT_CONFIG, ...extra });
const signal = () => new AbortController().signal;
const run = id => ({ type: 'command/run', data: { commandId: id, name: PRESET_ID, source: { kind: 'user' } } });
const done = (id, revision, cfg, extra = {}) => ({ type: 'command/done', data: { commandId: id, kind: 'success', text: JSON.stringify({ protocol: PROTOCOL, action: 'set', revision, config: cfg, ...extra }) } });
const code = expected => error => error.code === expected;
const cancelled = error => error.kind === 'hook';
const names = agent => agent.ctx.tools.schemas().map(tool => tool.name);
const guard = (agent, name) => [...agent.registry.guards][0]({ agent, name });
const persona = agent => agent.registry.sections.get('deployment:persona-prefix');

async function controllerFixture(options = {}, presets = memoryPresets()) {
  const f = fixture();
  const projection = await f.ctx.sessionProjections.register(projectionDefinition);
  const first = f.agent('root', { announce: false, ...options });
  const controller = createController(f.ctx, { projection, presets });
  await settle();
  return { ...f, first, controller, presets,
    get: (agent = first) => controller.read(agent, signal()),
    set: (revision, cfg, agent = first) => controller.set(agent, { expectedRevision: revision, config: config(cfg) }, signal()),
    dispose: () => controller.dispose(),
  };
}

test('configuration requires every field, deduplicates tools, and rejects Custom mode as its own base', () => {
  assert.deepEqual(validateConfig(config()), DEFAULT_CONFIG);
  assert.equal(permits(config({ allowedTools: [] }), 'read'), false);
  assert.equal(permits(config(), 'read'), true);
  for (const field of Object.keys(DEFAULT_CONFIG)) {
    const incomplete = config(); delete incomplete[field];
    assert.throws(() => validateConfig(incomplete), code('INVALID_REQUEST'), field);
  }
  for (const bad of [null, {}, config({ prompt: 1 }), config({ allowedTools: [''] }), config({ surprise: true }),
    config({ includeTimeContext: null }), config({ baseMode: PRESET_ID }), config({ baseMode: '' }), config({ baseMode: ' standard' })]) {
    assert.throws(() => validateConfig(bad), code('INVALID_REQUEST'));
  }
  assert.deepEqual(validateConfig(config({ allowedTools: ['read', 'read'] })).allowedTools, ['read']);
});

test('requests normalize preset titles and reject malformed actions', () => {
  const request = body => validateSettingsPayload({ sessionId: 'root', request: body }).request;
  assert.deepEqual(request({ action: 'save-preset', title: '  Re\u0301view ', note: ' note ', config: config(), overwrite: false }),
    { action: 'save-preset', title: 'R\u00e9view', note: 'note', config: config(), overwrite: false });
  assert.deepEqual(request({ action: 'set-default-preset', title: null }), { action: 'set-default-preset', title: null });
  for (const bad of [{}, { action: 'get', extra: true }, { action: 'set', expectedRevision: Number.MAX_SAFE_INTEGER, config: config() },
    { action: 'save-preset', title: '   ', note: '', config: config(), overwrite: false },
    { action: 'save-preset', title: 'x'.repeat(81), note: '', config: config(), overwrite: false },
    { action: 'save-preset', title: 'line\nbreak', note: '', config: config(), overwrite: false },
    { action: 'delete-preset' }, { action: 'describe-base', baseMode: PRESET_ID }, { action: 'set-defaults', expectedRevision: 0, config: config() }]) {
    assert.throws(() => request(bad), code('INVALID_REQUEST'), JSON.stringify(bad));
  }
});

test('projection restores only paired successful settings and upgrades records without a base mode', () => {
  const original = initialState(), started = fold(original, run('a'));
  assert.equal(fold(original, done('a', 1, config())), original);
  for (const event of [done('a', 2, config()), done('a', 1, config(), { protocol: 'other' }), done('a', 1, config(), { action: 'get' }), { type: 'command/done', data: { commandId: 'a', kind: 'error' } }]) {
    assert.equal(fold(started, event).snapshot, original.snapshot);
  }
  const legacy = { overridePrompt: true, prompt: '{{literal}}', allowedTools: [], includeRuntimeContext: true, includeTimeContext: false };
  const restored = fold(started, done('a', 1, legacy));
  assert.equal(restored.snapshot.revision, 1);
  assert.deepEqual(restored.snapshot.config, { baseMode: 'standard', ...legacy });
  assert.deepEqual(restored.pending, []);
  assert.deepEqual(projectionDefinition.stateSchema.parse(restored), restored);
  assert.deepEqual(projectionDefinition.wire.viewSchema.parse(projectionDefinition.wire.view(restored)), restored.snapshot);
  const forged = { ...run('x'), data: { ...run('x').data, source: { kind: 'agent' } } };
  assert.equal(fold(original, forged), original);
});

test('turn projection pins the committed settings for the whole turn', () => {
  const before = [run('a'), done('a', 1, config({ prompt: 'first' }))].reduce(fold, initialState());
  const opened = fold(before, { type: 'turn/start', data: { turn: 1 } });
  assert.equal(opened.turn.snapshot, before.snapshot);
  const changed = [run('b'), done('b', 2, config({ prompt: 'next' }))].reduce(fold, opened);
  assert.equal(changed.turn.snapshot, before.snapshot);
  assert.equal(changed.snapshot.config.prompt, 'next');
  assert.equal(fold(changed, { type: 'turn/end', data: { turn: 1 } }).turn, null);
});

test('policy shadows the base persona, restricts inherited tools, and disposes everything', () => {
  const r = registry();
  r.prompt.section({ name: 'deployment:persona-prefix', order: 0, text: 'Base persona' });
  assert.throws(() => installPolicy({}, config({ overridePrompt: true }), r.tools, r.prompt), /duplicate section/,
    'the registry fixture rejects duplicate names, like a scoped shadow of an unscoped one would not');
  r.sections.clear();
  const release = installPolicy({}, config({ overridePrompt: true, allowedTools: [], includeRuntimeContext: false }), r.tools, r.prompt);
  assert.deepEqual(r.tools.schemas(), []);
  assert.equal(r.sections.get('deployment:persona-prefix').text, '');
  assert.equal(r.sections.get('deployment:persona-prefix').complete, true);
  assert.equal(r.sections.get('deployment:persona-prefix').interpolate, true);
  assert.deepEqual(r.contexts.get('working-directory:current'), { name: 'working-directory:current', order: 100, text: '', interpolate: false, required: false });
  assert.equal(r.suppressors.size, 1);
  release(); release();
  assert.equal(r.sections.size, 0); assert.equal(r.contexts.size, 0); assert.equal(r.restrictions.size, 0); assert.equal(r.suppressors.size, 0);
});

test('scope-local tools stay visible and unknown names are ignored', () => {
  const r = registry(); r.local.set('output', { name: 'output' });
  const release = installPolicy({}, config({ allowedTools: ['read', 'removed-name'] }), r.tools, r.prompt);
  assert.deepEqual(r.tools.schemas().map(t => t.name), ['read', 'output']);
  release();
});

test('time filtering keeps unrelated user content and every decision field', () => {
  const user = { source: { kind: 'user' }, content: [{ text: 'Time sampled while preparing my example' }] };
  const time = { source: { kind: 'time-context' } };
  const decision = { kind: 'enter', messages: [user, time], startsRequestSeries: true, extra: 1 };
  assert.deepEqual(filterTimeContext(decision, config({ includeTimeContext: false })), { ...decision, messages: [user] });
  assert.equal(filterTimeContext(decision, config()), decision);
});

test('saved settings apply right away when idle and from the next turn when running', async () => {
  const f = await controllerFixture(), a = f.first;
  await f.set(0, { overridePrompt: true, prompt: 'first', allowedTools: ['read'], includeTimeContext: false });
  assert.deepEqual(names(a), ['read']);
  a.startTurn();
  const section = persona(a);
  assert.equal(section.text, 'first');
  await f.set(1, { overridePrompt: true, prompt: 'next', allowedTools: ['subagent'] });
  assert.equal(persona(a), section, 'a running turn keeps its pinned prompt');
  assert.deepEqual(names(a), ['read']);
  assert.equal(guard(a, 'read'), undefined); assert.ok(guard(a, 'subagent'));
  assert.equal((await f.get()).config.prompt, 'next');
  a.endTurn({ idle: false }); a.startTurn();
  assert.equal(persona(a).text, 'next');
  assert.deepEqual(names(a), ['subagent']);
  a.endTurn(); await f.dispose();
});

test('custom prompts are stored and installed verbatim for DSH to interpolate', async () => {
  const f = await controllerFixture(), a = f.first;
  const template = 'Model: {{model}}; provider: {{provider}}; plugin: {{response_language}}.';
  await f.set(0, { overridePrompt: true, prompt: template });
  a.startTurn();
  assert.equal(persona(a).text, template);
  assert.equal(persona(a).interpolate, true);
  assert.equal(a.session.events.reduce(fold, initialState()).snapshot.config.prompt, template);
  a.endTurn(); await f.dispose();
});

test('time context is filtered by the pinned snapshot, even when settings change during a step', async () => {
  const f = await controllerFixture(), a = f.first;
  await f.set(0, { includeTimeContext: false }); a.startTurn();
  const time = { source: { kind: 'time-context' }, content: [] };
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const off = a.ctx.on('agent/pre-step', async (_payload, next) => { entered(); await wait; return next(); });
  const step = a.step([time]); await ready;
  await f.set(1, { includeTimeContext: true }); release();
  assert.deepEqual((await step).messages, []);
  off(); a.endTurn(); await f.dispose();
});

test('choosing another base mode before the first message rebinds the conversation while it is reserved', async () => {
  const f = await controllerFixture(), a = f.first;
  assert.equal(a.composition, 'standard');
  let reserved;
  a.beforeRecompose = () => { reserved = a.maintenance !== null; assert.throws(() => a.startTurn(), /turn during maintenance/); };
  const value = await f.set(0, { baseMode: 'minimal', allowedTools: ['bash'] });
  assert.equal(reserved, true, 'the base is rebound only while no turn can start');
  assert.equal(a.composition, 'minimal');
  assert.equal(value.config.baseMode, 'minimal');
  assert.deepEqual(names(a), ['bash']);
  assert.deepEqual(value.warnings, []);
  await f.dispose();
});

test('the base mode is locked once the conversation starts', async () => {
  const f = await controllerFixture(), a = f.first;
  a.startTurn(); a.endTurn();
  await assert.rejects(f.set(0, { baseMode: 'minimal' }), code('BASE_LOCKED'));
  assert.equal(a.composition, 'standard');
  assert.equal((await f.get()).baseLocked, true);
  await f.dispose();
});

test('an unavailable base mode is refused before anything is written', async () => {
  const f = await controllerFixture(), a = f.first;
  for (const baseMode of ['cordis', 'missing']) {
    await assert.rejects(f.set(0, { baseMode }), code('BASE_MODE_UNAVAILABLE'));
  }
  assert.equal(a.session.events.length, 0);
  await f.dispose();
});

test('a base mode that fails to load blocks turns and shows a repairable warning', async () => {
  const seed = [run('seed'), done('seed', 1, config({ baseMode: 'ptc' }))];
  const f = await controllerFixture({ seed, composition: 'standard' }), a = f.first;
  assert.equal(a.composition, 'ptc', 'startup rebinds an idle conversation to its saved base');
  f.ctx.agentPresets.rows.find(row => row.id === 'ptc').broken = 'gone';
  a.composition = 'standard';
  const value = await f.get();
  assert.deepEqual(value.warnings.map(warning => warning.code), ['BASE_MODE_UNAVAILABLE']);
  assert.throws(() => a.startTurn(), cancelled);
  assert.ok(guard(a, 'read'));
  a.endTurn();
  f.ctx.agentPresets.rows.find(row => row.id === 'ptc').broken = undefined;
  assert.deepEqual((await f.get()).warnings, [], 'reading the settings again repairs the conversation');
  assert.equal(a.composition, 'ptc');
  await f.dispose();
});

test('new Custom mode conversations adopt the default preset once, before their first turn', async () => {
  const presets = memoryPresets({ defaultTitle: 'Review', presets: [{ title: 'Review', note: '', updatedAt: 1,
    config: config({ baseMode: 'minimal', overridePrompt: true, prompt: 'Review carefully', allowedTools: ['bash'] }) }] });
  const f = await controllerFixture({}, presets);
  const fresh = f.agent('fresh');
  await fresh.created;
  assert.equal(f.controller.snapshotOf(fresh).config.prompt, 'Review carefully');
  assert.equal(fresh.composition, 'minimal');
  assert.deepEqual(names(fresh), ['bash']);
  assert.equal(f.controller.snapshotOf(f.first).revision, 0, 'a conversation that existed before startup is unchanged until it is read');
  presets.set({ defaultTitle: null, presets: [] });
  const later = f.agent('later');
  await later.created;
  assert.equal(f.controller.snapshotOf(later).revision, 0);
  assert.equal(f.controller.snapshotOf(fresh).config.prompt, 'Review carefully', 'later default changes do not touch existing conversations');
  await f.dispose();
});

test('switching a blank conversation into Custom mode adopts the default and rebinds the base', async () => {
  const presets = memoryPresets({ defaultTitle: 'PTC', presets: [{ title: 'PTC', note: '', updatedAt: 1, config: config({ baseMode: 'ptc' }) }] });
  const f = await controllerFixture({ preset: 'standard' }, presets), a = f.first;
  assert.equal(f.controller.snapshotOf(a).revision, 0);
  a.composition = PRESET_ID;
  a.select(PRESET_ID);
  await settle();
  assert.equal(f.controller.snapshotOf(a).config.baseMode, 'ptc');
  assert.equal(a.composition, 'ptc');
  a.select('minimal');
  a.composition = 'minimal';
  await settle();
  assert.equal(a.registry.restrictions.size, 0, 'leaving Custom mode removes the policy');
  assert.equal(a.registry.guards.size, 1);
  assert.equal(guard(a, 'read'), undefined);
  await f.dispose();
});

test('resumed, forked, and started conversations never adopt the default preset', async () => {
  const presets = memoryPresets({ defaultTitle: 'X', presets: [{ title: 'X', note: '', updatedAt: 1, config: config({ prompt: 'default' }) }] });
  const f = await controllerFixture({}, presets);
  const started = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'turn/end', data: { turn: 1 } }];
  const resumed = f.agent('resumed', { seed: started, source: 'resume' });
  const child = f.agent('child', { root: false });
  await resumed.created; await child.created;
  assert.equal(f.controller.snapshotOf(resumed).revision, 0);
  assert.equal(f.controller.snapshotOf(child).revision, 0);
  await f.dispose();
});

test('forked subagents keep their parent settings and composition', async () => {
  const seed = [run('seed'), done('seed', 1, config({ overridePrompt: true, prompt: 'Parent prompt', allowedTools: [] }))];
  const f = await controllerFixture({ seed }), a = f.first;
  const child = f.agent('fork', { seed: a.session.snapshotEvents(), root: false, preset: PRESET_ID, composition: 'standard' });
  await child.created;
  assert.deepEqual(f.recompositions.filter(entry => entry.agent === 'fork'), [], 'children run on their parent composition');
  child.startTurn();
  assert.deepEqual(names(child), []);
  assert.equal(persona(child).text, 'Parent prompt');
  assert.ok(guard(child, 'read'));
  const spawned = f.agent('spawn', { root: false, preset: 'standard' });
  await spawned.created;
  spawned.startTurn();
  assert.deepEqual(names(spawned), ['read', 'write', 'subagent'], 'a fresh subagent is not governed');
  await f.dispose();
});

test('settings access requires a live main Custom mode conversation and a human caller', async () => {
  const f = await controllerFixture();
  const other = f.agent('other', { preset: 'standard' });
  const child = f.agent('child', { root: false });
  await other.created; await child.created;
  await assert.rejects(f.get(other), code('WRONG_PRESET'));
  await assert.rejects(f.get(child), code('ROOT_SESSION_REQUIRED'));
  f.setInitiator(f.first);
  await assert.rejects(f.get(), code('HUMAN_ONLY'));
  f.setInitiator(undefined);
  f.remove(f.first);
  await assert.rejects(f.get(), code('SESSION_NOT_FOUND'));
  await f.dispose();
});

test('scope-local tools stay callable while inherited tools follow the allowlist', async () => {
  const f = await controllerFixture(), a = f.first;
  a.registry.local.set('output', { name: 'output', description: 'Session output' });
  await f.set(0, { allowedTools: [] });
  a.startTurn();
  assert.deepEqual(names(a), ['output']);
  assert.equal(guard(a, 'output'), undefined);
  assert.ok(guard(a, 'read'));
  assert.equal(guard(a, 'run_code'), undefined, 'PTC programs are checked call by call');
  a.endTurn(); await f.dispose();
});

test('a competing committed revision is never overwritten', async () => {
  const f = await controllerFixture(), a = f.first; let once = true;
  a.afterAppend = type => {
    if (type !== 'command/run' || !once) return;
    once = false;
    a.session.append('command/run', run('other').data);
    a.session.append('command/done', done('other', 1, config({ prompt: 'other update' })).data);
  };
  await assert.rejects(f.set(0, { allowedTools: [] }), code('REVISION_CONFLICT'));
  assert.equal((await f.get()).config.prompt, 'other update');
  assert.equal(a.session.events.at(-1).data.kind, 'error');
  await f.dispose();
});

test('a failed success append is closed as an error and the next attempt succeeds', async () => {
  const f = await controllerFixture(), a = f.first; let once = true;
  a.beforeAppend = (type, data) => { if (once && type === 'command/done' && data.kind === 'success') { once = false; throw new Error('disk failure'); } };
  await assert.rejects(f.set(0, { allowedTools: [] }), code('COMMIT_FAILED'));
  assert.equal(f.controller.snapshotOf(a).revision, 0);
  assert.equal(a.session.events.at(-1).data.kind, 'error');
  assert.equal((await f.set(0, { allowedTools: [] })).revision, 1);
  await f.dispose();
});

test('an observer error after the success record leaves the commit in place', async () => {
  const f = await controllerFixture(), a = f.first;
  a.afterAppend = (type, data) => { if (type === 'command/done' && data.kind === 'success') throw new Error('observer failed'); };
  assert.equal((await f.set(0, { allowedTools: [] })).revision, 1);
  assert.equal(a.session.events.length, 2);
  await f.dispose();
});

test('policy failures are logged privately and block the next turn with a stable message', async () => {
  const f = await controllerFixture(), a = f.first, problem = new Error('private registry diagnostic'), logs = [];
  f.ctx.logger.warn = (...args) => logs.push(args);
  await f.set(0, {});
  a.ctx.tools.restrict = () => { throw problem; };
  await f.set(1, { allowedTools: [] });
  assert.ok(logs.some(args => args.includes(problem)));
  assert.throws(() => a.startTurn(), cancelled);
  assert.equal(a.cancellations.at(-1).options.keepInbox, true);
  assert.doesNotMatch(JSON.stringify((await f.controller.view(a)).warnings), /private registry/);
  a.endTurn(); await f.dispose();
});

test('reloading the plugin during a turn stops that turn instead of continuing with mixed settings', async () => {
  const seed = [run('seed'), done('seed', 1, config({ allowedTools: [] })), { type: 'turn/start', data: { turn: 1 } }];
  const f = await controllerFixture({ seed, running: true }), a = f.first;
  assert.equal(a.cancellations.length, 1);
  assert.equal(a.cancellations[0].options.keepInbox, true);
  assert.ok(guard(a, 'read'));
  await assert.rejects(a.step(), cancelled);
  a.endTurn();
  await settle();
  assert.deepEqual(names(a), [], 'the conversation recovers once it is idle');
  a.startTurn(); await a.step(); a.endTurn();
  await f.dispose();
});

test('disposal waits for a running rebind, then removes guards, policies, and the projection', async () => {
  const f = await controllerFixture(), a = f.first;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  a.beforeRecompose = () => gate;
  const pending = f.set(0, { baseMode: 'ptc', allowedTools: ['read'] });
  await settle();
  let disposed = false;
  const disposal = f.dispose().then(() => { disposed = true; });
  await settle();
  assert.equal(disposed, false);
  release();
  await pending; await disposal;
  assert.equal(a.registry.guards.size, 0);
  assert.equal(a.registry.restrictions.size, 0);
});

test('failed startup unwinds partial agent hooks and subscriptions', async () => {
  const f = fixture();
  const projection = await f.ctx.sessionProjections.register(projectionDefinition);
  const first = f.agent('first', { announce: false }), second = f.agent('second', { announce: false });
  const problem = new Error('hook registration failed'); second.ctx.on = () => { throw problem; };
  let subscriptions = 0;
  const originalOn = f.ctx.on;
  f.ctx.on = (...args) => { const release = originalOn(...args); subscriptions++; return () => { subscriptions--; release(); }; };
  assert.throws(() => createController(f.ctx, { projection, presets: memoryPresets() }), error => error === problem);
  await settle();
  assert.equal(first.registry.guards.size, 0); assert.equal(second.registry.guards.size, 0);
  assert.equal(subscriptions, 0);
});
