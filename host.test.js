import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { DEFAULT_CONFIG, PROTOCOL, PRESET_ID, initialState, fold, validateConfig, validateRequest, permits, projectionDefinition } from './state.js';
import { installPolicy, filterTimeContext } from './policy.js';
import { createController } from './controller.js';
import { fixture, registry } from './test-support.js';

const config = extra => ({ ...DEFAULT_CONFIG, ...extra });
const signal = () => new AbortController().signal;
const request = (revision, extra) => validateRequest({ action: 'set', expectedRevision: revision, config: config(extra) });
const run = id => ({ type: 'command/run', data: { commandId: id, name: PRESET_ID, source: { kind: 'user' } } });
const done = (id, revision, cfg, extra = {}) => ({ type: 'command/done', data: { commandId: id, kind: 'success', text: JSON.stringify({ protocol: PROTOCOL, action: 'set', revision, config: cfg, ...extra }) } });
const code = expected => error => error.code === expected;
const cancelled = error => error.kind === 'hook';
const names = agent => agent.ctx.tools.schemas().map(tool => tool.name);
const guard = (agent, name) => [...agent.registry.guards][0]({ agent, name });
function controllerFixture(options = {}) {
  const f = fixture(), first = f.agent('root', options);
  let controller = createController(f.ctx, z);
  return { ...f, first, get controller() { return controller; },
    get: (agent = first) => controller.read(agent, signal()),
    set: (revision, cfg, agent = first) => controller.set(agent, request(revision, cfg), signal()),
    reload() { controller.dispose(); controller = createController(f.ctx, z); },
    dispose: () => controller.dispose(),
  };
}

test('configuration requires every field and rejects invalid or unknown values', () => {
  assert.deepEqual(validateConfig(config()), DEFAULT_CONFIG);
  assert.equal(permits(config({ allowedTools: [] }), 'read'), false);
  assert.equal(permits(config(), 'read'), true);
  for (const field of Object.keys(DEFAULT_CONFIG)) {
    const incomplete = config(); delete incomplete[field];
    assert.throws(() => validateConfig(incomplete), code('INVALID_REQUEST'));
  }
  for (const bad of [null, {}, config({ prompt: 1 }), config({ allowedTools: [''] }), config({ surprise: true }), config({ includeTimeContext: null }), config({ includeRuntimeContext: undefined })]) {
    assert.throws(() => validateConfig(bad), code('INVALID_REQUEST'));
  }
  assert.deepEqual(validateConfig(config({ allowedTools: ['read', 'read'] })).allowedTools, ['read']);
  for (const bad of [{}, [], { action: 'get', extra: true }, { action: 'set', expectedRevision: Number.MAX_SAFE_INTEGER, config: config() }]) assert.throws(() => validateRequest(bad), code('INVALID_REQUEST'));
});

test('projection restores only paired successful human settings at the next revision', () => {
  const original = initialState(), started = fold(original, run('a'));
  assert.equal(fold(original, done('a', 1, config())), original);
  for (const event of [done('a', 2, config()), done('a', 1, config(), { protocol: 'other' }), done('a', 1, config(), { action: 'get' }), { type: 'command/done', data: { commandId: 'a', kind: 'error' } }]) {
    assert.equal(fold(started, event).snapshot, original.snapshot);
  }
  const saved = config({ overridePrompt: true, prompt: '{{literal}}', allowedTools: [] });
  const restored = fold(started, done('a', 1, saved));
  assert.equal(restored.snapshot.revision, 1);
  assert.deepEqual(restored.pending, []);
  const definition = projectionDefinition(z);
  assert.equal(definition.stateVersion, 2);
  assert.deepEqual(definition.stateSchema.parse(restored), restored);
  assert.deepEqual(definition.wire.viewSchema.parse(definition.wire.view(restored)), restored.snapshot);
  assert.equal(fold(restored, done('a', 1, config())), restored);
  const forged = { ...run('x'), data: { ...run('x').data, source: { kind: 'agent' } } };
  assert.equal(fold(original, forged), original);
});

test('turn projection pins the committed settings and keeps its saved wire view independent', () => {
  const definition = projectionDefinition(z);
  const before = [run('a'), done('a', 1, config({ prompt: 'first' }))].reduce(fold, initialState());
  const opened = fold(before, { type: 'turn/start', data: { turn: 1 } });
  assert.equal(opened.turn.snapshot, before.snapshot);
  assert.equal(definition.wire.view(opened), before.snapshot);
  const changed = [run('b'), done('b', 2, config({ prompt: 'next' }))].reduce(fold, opened);
  assert.equal(changed.turn.snapshot, before.snapshot);
  assert.equal(changed.snapshot.config.prompt, 'next');
  const closed = fold(changed, { type: 'turn/end', data: { turn: 1 } });
  assert.equal(closed.turn, null);
  const next = fold(closed, { type: 'turn/start', data: { turn: 2 } });
  assert.equal(next.turn.snapshot, changed.snapshot);
  assert.deepEqual(definition.stateSchema.parse(next), next);
});

test('all-tools restriction, empty prompt and runtime suppression dispose independently', () => {
  const r = registry();
  const release = installPolicy({}, config({ overridePrompt: true, allowedTools: [], includeRuntimeContext: false }), r.tools, r.prompt);
  assert.deepEqual(r.tools.schemas(), []);
  r.inherited.set('future', { name: 'future' }); assert.deepEqual(r.tools.schemas(), []);
  assert.equal([...r.sections][0].text, '');
  assert.equal([...r.sections][0].complete, true);
  assert.deepEqual(r.contexts.get('working-directory:current'), { name: 'working-directory:current', order: 100, text: '', interpolate: false, required: false });
  assert.equal(r.suppressors.size, 1);
  release(); release();
  assert.equal(r.sections.size, 0); assert.equal(r.contexts.size, 0); assert.equal(r.restrictions.size, 0); assert.equal(r.suppressors.size, 0);
});

test('session-local conflicts roll back every candidate registration', () => {
  const r = registry(); r.local.set('output', { name: 'output' });
  assert.throws(() => installPolicy({}, config({ overridePrompt: true, allowedTools: [], includeRuntimeContext: false }), r.tools, r.prompt), error => error.code === 'UNSUPPORTED_POLICY' && error.details.tools[0] === 'output');
  assert.equal(r.sections.size, 0); assert.equal(r.contexts.size, 0); assert.equal(r.restrictions.size, 0);
  const release = installPolicy({}, config({ allowedTools: ['read', 'output', 'removed-name'] }), r.tools, r.prompt);
  assert.deepEqual(r.tools.schemas().map(t => t.name), ['read', 'output']); release();
});

test('time filtering retains unrelated user content and every decision field', () => {
  const user = { source: { kind: 'user' }, content: [{ text: 'Time sampled while preparing my example' }] };
  const time = { source: { kind: 'time-context' } };
  const decision = { kind: 'enter', messages: [user, time], startsRequestSeries: true, extra: 1 };
  assert.deepEqual(filterTimeContext(decision, config({ includeTimeContext: false })), { ...decision, messages: [user] });
  assert.equal(filterTimeContext(decision, config()), decision);
});

test('every step keeps prompt, tools, guard, runtime and time pinned; queued next turn takes latest save', async () => {
  const f = controllerFixture({ clock: true }), a = f.first;
  f.set(0, { overridePrompt: true, prompt: 'first', allowedTools: ['read'], includeRuntimeContext: false, includeTimeContext: false });
  a.startTurn();
  const section = [...a.registry.sections][0], mask = [...a.registry.restrictions][0], context = [...a.registry.contexts][0];
  assert.deepEqual((await a.step()).messages, []);
  f.set(1, { overridePrompt: true, prompt: 'superseded', allowedTools: [] });
  f.set(2, { overridePrompt: true, prompt: 'latest', allowedTools: ['subagent'] });
  assert.equal(f.get().config.prompt, 'latest');
  assert.equal([...a.registry.sections][0], section);
  assert.equal([...a.registry.restrictions][0], mask);
  assert.deepEqual([...a.registry.contexts][0], context);
  assert.deepEqual(names(a), ['read']);
  assert.equal(guard(a, 'read'), undefined); assert.ok(guard(a, 'subagent'));
  assert.deepEqual((await a.step()).messages, []);
  assert.ok(a.assemblies.every(value => value.sections[0].text === 'first' && value.runtimeSuppressed));
  a.endTurn({ idle: false });
  assert.equal(a.status, 'running');
  assert.deepEqual(names(a), ['read']);
  a.startTurn();
  assert.deepEqual(names(a), ['subagent']);
  assert.equal([...a.registry.sections][0].text, 'latest');
  assert.equal(a.registry.suppressors.size, 0);
  assert.equal(guard(a, 'subagent'), undefined); assert.ok(guard(a, 'read'));
  assert.equal((await a.step()).messages.length, 1);
  assert.equal(a.assemblies.at(-1).sections[0].text, 'latest');
  a.endTurn(); f.dispose();
});

test('saving from an earlier turn-start observer cannot change the new turn pin', async () => {
  const f = controllerFixture(), a = f.first;
  f.set(0, { overridePrompt: true, prompt: 'boundary', allowedTools: ['read'] });
  a.afterAppend = type => { if (type === 'turn/start') f.set(1, { overridePrompt: true, prompt: 'later', allowedTools: [] }); };
  a.startTurn();
  assert.equal(f.stateOf(a.session).turn.snapshot.config.prompt, 'boundary');
  assert.equal(f.get().config.prompt, 'later');
  assert.equal([...a.registry.sections][0].text, 'boundary');
  assert.deepEqual(names(a), ['read']);
  await a.step();
  a.afterAppend = undefined; a.endTurn({ idle: false }); a.startTurn();
  assert.equal([...a.registry.sections][0].text, 'later'); assert.deepEqual(names(a), []);
  a.endTurn(); f.dispose();
});

test('save during an awaited pre-step keeps the effective context flags', async () => {
  const f = controllerFixture({ clock: true }), a = f.first;
  f.set(0, { includeTimeContext: false }); a.startTurn();
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const off = a.ctx.on('agent/pre-step', async (_payload, next) => { entered(); await wait; return next(); });
  const step = a.step(); await ready;
  f.set(1, { includeTimeContext: true }); release();
  assert.deepEqual((await step).messages, []);
  off(); a.endTurn(); f.dispose();
});

test('a command observer may start a turn while its settings transaction commits', async () => {
  const f = controllerFixture(), a = f.first; let step;
  a.afterAppend = type => {
    if (type !== 'command/run') return;
    assert.throws(() => f.set(0, {}), code('BUSY'));
    a.startTurn(); step = a.step();
  };
  f.set(0, { allowedTools: [], overridePrompt: true, prompt: 'next' });
  await step;
  assert.equal(f.get().revision, 1);
  assert.equal(f.stateOf(a.session).turn.snapshot.revision, 0);
  assert.ok(names(a).includes('read')); assert.equal(guard(a, 'read'), undefined);
  a.afterAppend = undefined; a.endTurn({ idle: false }); a.startTurn();
  assert.deepEqual(names(a), []); assert.equal([...a.registry.sections][0].text, 'next');
  a.endTurn(); f.dispose();
});

test('invalid pending runtime policy is saved but cancels the next turn before assembly', async () => {
  const f = controllerFixture(), a = f.first;
  a.startTurn(); await a.step();
  a.registry.local.set('output', { name: 'output', description: 'Session output' });
  assert.equal(f.set(0, { overridePrompt: true, prompt: 'pending', allowedTools: [] }).revision, 1);
  assert.ok(names(a).includes('read')); assert.equal(a.cancellations.length, 0);
  a.endTurn({ idle: false });
  assert.throws(() => a.startTurn(), cancelled);
  assert.equal(a.assemblies.length, 1);
  assert.equal(a.cancellations.at(-1).options.keepInbox, true);
  assert.equal(f.get().warnings[0].code, 'POLICY_UNAVAILABLE');
  assert.ok(guard(a, 'read'));
  a.endTurn(); f.set(1, { allowedTools: ['output'] }); a.startTurn();
  assert.deepEqual(names(a), ['output']); await a.step();
  a.endTurn(); f.dispose();
});

test('late local tools fail closed without switching policy at a middle step', async () => {
  const f = controllerFixture(), a = f.first;
  f.set(0, { allowedTools: [] }); a.startTurn();
  a.registry.local.set('late', { name: 'late' });
  assert.ok(guard(a, 'late'));
  await assert.rejects(a.step(), code('TOOL_VISIBILITY_CONFLICT'));
  a.endTurn(); a.registry.local.delete('late'); a.startTurn();
  assert.equal((await a.step()).kind, 'enter'); a.endTurn(); f.dispose();
});

test('idle reads refresh catalogs and preserve restrictions from other plugins', () => {
  const f = controllerFixture(), a = f.first;
  const otherMask = a.ctx.tools.restrict({ allow: ['read', 'subagent'] });
  f.set(0, { allowedTools: ['read'] });
  assert.deepEqual(f.get().tools.map(t => [t.name, t.visible]), [['read', true], ['subagent', false]]);
  f.set(1, { allowedTools: [] }); f.get(); assert.deepEqual(names(a), []);
  f.set(2, { allowedTools: ['subagent'] }); f.get(); assert.deepEqual(names(a), ['subagent']);
  otherMask(); a.registry.inherited.set('new-tool', { name: 'new-tool', description: 'New tool' });
  assert.ok(f.get().tools.some(tool => tool.name === 'new-tool'));
  f.dispose();
});

test('restored settings, forks, preset isolation and unload retain correct ownership', () => {
  const saved = config({ overridePrompt: true, prompt: '{{literal}}', allowedTools: [] });
  const f = controllerFixture({ seed: [run('seed'), done('seed', 1, saved)] }), a = f.first;
  assert.deepEqual(names(a), []);
  const child = f.agent('fork', { seed: a.session.snapshotEvents() });
  assert.deepEqual(names(child), []);
  f.select(a, 'standard'); assert.throws(() => f.get(), code('WRONG_PRESET'));
  assert.equal(a.registry.sections.size, 0);
  f.select(a, PRESET_ID); f.reload(); assert.deepEqual(names(a), []);
  assert.equal([...a.registry.sections][0].text, '{{literal}}');
  child.dispose(); assert.equal(child.registry.guards.size, 0);
  f.dispose(); assert.equal(a.registry.guards.size, 0); assert.equal(a.registry.sections.size, 0);
});

test('hot-loading into an active turn cancels rather than installing midway', async () => {
  const seed = [run('seed'), done('seed', 1, config({ allowedTools: [] })), { type: 'turn/start', data: { turn: 1 } }];
  const f = controllerFixture({ seed, running: true }), a = f.first;
  assert.equal(a.cancellations.length, 1); assert.equal(a.cancellations[0].options.keepInbox, true);
  assert.equal(a.registry.restrictions.size, 0); assert.ok(guard(a, 'read'));
  await assert.rejects(a.step(), cancelled); assert.equal(a.assemblies.length, 0);
  a.endTurn(); a.startTurn(); assert.deepEqual(names(a), []);
  await a.step(); a.endTurn(); f.dispose();
});

test('a turn started reentrantly during idle catalog application aborts before assembly', () => {
  const f = controllerFixture(), a = f.first, presentAs = a.ctx.tools.presentAs;
  let once = true;
  a.ctx.tools.presentAs = mode => {
    const release = presentAs(mode);
    if (once) {
      once = false;
      // A real followup starts an async driver: cancellation settles there,
      // rather than throwing out of the registry's synchronous observer.
      assert.throws(() => a.startTurn(), cancelled);
    }
    return release;
  };
  f.set(0, { allowedTools: [] });
  assert.equal(f.get().revision, 1);
  assert.equal(a.assemblies.length, 0); assert.equal(a.cancellations[0].cause.kind, 'hook');
  a.endTurn(); a.startTurn(); assert.deepEqual(names(a), []);
  a.endTurn(); f.dispose();
});

test('a competing committed revision from an observer cannot be overwritten', () => {
  const f = controllerFixture(), a = f.first; let once = true;
  a.afterAppend = type => {
    if (type !== 'command/run' || !once) return;
    once = false;
    a.session.append('command/run', run('other').data);
    a.session.append('command/done', done('other', 1, config({ prompt: 'other update' })).data);
  };
  assert.throws(() => f.set(0, { allowedTools: [] }), code('REVISION_CONFLICT'));
  assert.equal(f.get().config.prompt, 'other update');
  assert.equal(f.get().revision, 1); assert.equal(a.session.events.at(-1).data.kind, 'error');
  f.dispose();
});

test('failed startup unwinds earlier agents, partial guards, subscriptions, and projection', () => {
  const f = fixture(), first = f.agent('first'), second = f.agent('second');
  const problem = new Error('hook registration failed'); second.ctx.on = () => { throw problem; };
  let subscriptions = 0, projectionDisposed = false;
  const originalOn = f.ctx.on, originalRegister = f.ctx.sessionProjections.register;
  f.ctx.on = (...args) => { const release = originalOn(...args); subscriptions++; return () => { subscriptions--; release(); }; };
  f.ctx.sessionProjections.register = (...args) => { const release = originalRegister(...args); return () => { projectionDisposed = true; release(); }; };
  assert.throws(() => createController(f.ctx, z), error => error === problem);
  assert.equal(first.registry.guards.size, 0); assert.equal(second.registry.guards.size, 0);
  assert.equal(subscriptions, 0); assert.equal(projectionDisposed, true);
});

test('runtime validation logs original registry exceptions without exposing them in the saved reply', () => {
  const f = controllerFixture(), a = f.first, problem = new Error('private registry diagnostic'), logs = [];
  f.ctx.logger.warn = (...args) => logs.push(args); a.ctx.tools.presentAs = () => { throw problem; };
  assert.equal(f.set(0, { allowedTools: [] }).revision, 1);
  assert.equal(logs.length, 0);
  assert.throws(() => a.startTurn(), cancelled);
  assert.ok(logs.some(args => args.includes(problem)));
  assert.doesNotMatch(JSON.stringify(f.get().warnings), /private registry/);
  a.endTurn(); f.dispose();
});

test('a preset change from a commit observer aborts without leaking policy', () => {
  const f = controllerFixture();
  f.first.afterAppend = type => { if (type === 'command/run') f.select(f.first, 'standard'); };
  assert.throws(() => f.set(0, { allowedTools: [], overridePrompt: true }), code('WRONG_PRESET'));
  assert.equal(f.stateOf(f.first.session).snapshot.revision, 0);
  assert.equal(f.first.registry.sections.size, 0); assert.equal(f.first.registry.restrictions.size, 0);
  f.dispose();
});
