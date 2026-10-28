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

test('projection restores only paired successful human v1 settings at the next revision', () => {
  const original = initialState(), started = fold(original, run('a'));
  assert.equal(fold(original, done('a', 1, config())), original);
  for (const event of [done('a', 2, config()), done('a', 1, config(), { protocol: 'other' }), done('a', 1, config(), { action: 'get' }), { type: 'command/done', data: { commandId: 'a', kind: 'error' } }]) {
    assert.equal(fold(started, event).snapshot, original.snapshot);
  }
  const saved = config({ overridePrompt: true, prompt: '{{literal}}', allowedTools: [] });
  const restored = fold(started, done('a', 1, saved));
  assert.equal(restored.snapshot.revision, 1);
  assert.deepEqual(restored.pending, []);
  assert.deepEqual(restored.snapshot.config, config({ overridePrompt: true, prompt: '{{literal}}', allowedTools: [] }));
  const definition = projectionDefinition(z);
  assert.equal(definition.stateVersion, 1);
  assert.deepEqual(definition.stateSchema.parse(restored), restored);
  assert.deepEqual(definition.wire.viewSchema.parse(definition.wire.view(restored)), restored.snapshot);
  assert.equal(fold(restored, done('a', 1, config())), restored);
  const forged = { ...run('x'), data: { ...run('x').data, source: { kind: 'agent' } } };
  assert.equal(fold(original, forged), original);
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
  assert.ok(r.tools.schemas().some(tool => tool.name === 'run_code'));
});

test('session-local conflicts roll back the whole candidate policy; permitted local tools remain', () => {
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

test('independent context flags, preset isolation, replay and unload preserve ownership', async () => {
  const f = controllerFixture({ clock: true });
  assert.equal((await f.first.step()).messages.length, 1);
  f.set(0, { includeTimeContext: false }); assert.deepEqual((await f.first.step()).messages, []);
  assert.equal(f.first.registry.suppressors.size, 0);
  f.set(1, { includeRuntimeContext: false, includeTimeContext: true }); assert.equal((await f.first.step()).messages.length, 1);
  assert.equal(f.first.registry.suppressors.size, 1);
  f.set(2, { includeRuntimeContext: false, includeTimeContext: false, overridePrompt: true, prompt: '{{literal}}', allowedTools: [] });
  const child = f.agent('fork', { seed: f.first.session.snapshotEvents() });
  assert.deepEqual(child.ctx.tools.schemas(), []);
  f.select(f.first, 'standard');
  assert.throws(() => f.get(), code('WRONG_PRESET')); assert.equal(f.first.registry.sections.size, 0);
  assert.equal((await f.first.step()).messages.length, 1);
  f.select(f.first, PRESET_ID); f.reload();
  assert.deepEqual((await f.first.step()).messages, []);
  assert.equal([...f.first.registry.sections][0].text, '{{literal}}');
  child.dispose(); assert.equal(child.registry.guards.size, 0);
  f.dispose(); assert.equal(f.first.registry.suppressors.size, 0); assert.equal(f.first.registry.guards.size, 0);
});

test('catalog can restore individually hidden subagent tools without lifting other masks', () => {
  const f = controllerFixture();
  const otherMask = f.first.ctx.tools.restrict({ allow: ['read', 'subagent'] });
  f.set(0, { allowedTools: ['read'] });
  assert.deepEqual(f.get().tools.map(t => [t.name, t.visible]), [['read', true], ['subagent', false]]);
  f.set(1, { allowedTools: [] }); assert.deepEqual(f.first.ctx.tools.schemas(), []);
  f.set(2, { allowedTools: ['subagent'] }); assert.deepEqual(f.first.ctx.tools.schemas().map(t => t.name), ['subagent']);
  f.set(3, { allowedTools: null }); assert.ok(!f.first.ctx.tools.schemas().some(t => t.name === 'write'));
  otherMask(); f.dispose();
});

test('late local tools fail closed and a recovered policy requires a fresh assembly', async () => {
  const f = controllerFixture(); const other = f.agent('other');
  f.set(0, { allowedTools: [] }); f.first.registry.local.set('late', { name: 'late' });
  assert.ok([...f.first.registry.guards][0]({ agent: f.first, name: 'late' }));
  assert.equal([...f.first.registry.guards][0]({ agent: other, name: 'late' }), undefined);
  await assert.rejects(f.first.step(), code('TOOL_VISIBILITY_CONFLICT'));
  f.reload(); assert.equal(f.get().warnings[0].code, 'POLICY_UNAVAILABLE');
  f.first.registry.local.delete('late');
  await assert.rejects(f.first.step(), code('POLICY_RECOVERED'));
  assert.equal((await f.first.step()).startsRequestSeries, true);
  f.dispose();
});

test('running reads do not lift policy masks and return localizable warnings', () => {
  const f = controllerFixture(); f.set(0, { allowedTools: [] });
  f.first.status = 'running';
  const mask = [...f.first.registry.restrictions][0];
  const value = f.get(); assert.equal([...f.first.registry.restrictions][0], mask);
  assert.equal(value.warnings[0].code, 'CATALOG_STALE'); assert.equal(typeof value.warnings[0].message, 'string');
  assert.throws(() => f.set(1, {}), code('RUNNING'));
  f.dispose();
});

test('synchronous observer reentrancy cannot start a second commit or model step', async () => {
  const f = controllerFixture(); let step;
  f.first.afterAppend = type => {
    if (type !== 'command/run') return;
    assert.throws(() => f.set(0, {}), code('BUSY'));
    step = f.first.step(); step.catch(() => {});
  };
  f.set(0, { allowedTools: [] });
  await assert.rejects(step, code('BUSY'));
  assert.deepEqual(f.first.session.events.map(e => e.type), ['command/run', 'command/done']);
  assert.equal(f.get().revision, 1); f.dispose();
});

test('a revision committed by a registry callback is not overwritten or mistaken for this update', () => {
  const f = controllerFixture(), presentAs = f.first.ctx.tools.presentAs;
  let changed = false;
  f.first.ctx.tools.presentAs = mode => {
    const release = presentAs(mode);
    if (!changed) {
      changed = true;
      f.first.session.append('command/run', run('other').data);
      f.first.session.append('command/done', done('other', 1, config({ prompt: 'other update' })).data);
    }
    return release;
  };
  assert.throws(() => f.set(0, { allowedTools: [] }), code('REVISION_CONFLICT'));
  assert.equal(f.get().config.prompt, 'other update');
  assert.equal(f.get().revision, 1);
  assert.equal(f.first.session.events.at(-1).data.kind, 'error');
  f.dispose();
});

test('failed startup unwinds earlier agents, partial guards, subscriptions, and projection', () => {
  const f = fixture(), first = f.agent('first'), second = f.agent('second');
  const problem = new Error('hook registration failed');
  second.ctx.on = () => { throw problem; };
  let subscriptions = 0, projectionDisposed = false;
  const originalOn = f.ctx.on, originalChanges = f.ctx.sessionProjections.onChanged, originalRegister = f.ctx.sessionProjections.register;
  f.ctx.on = (...args) => { const release = originalOn(...args); subscriptions++; return () => { subscriptions--; release(); }; };
  f.ctx.sessionProjections.onChanged = (...args) => { const release = originalChanges(...args); subscriptions++; return () => { subscriptions--; release(); }; };
  f.ctx.sessionProjections.register = (...args) => { const release = originalRegister(...args); return () => { projectionDisposed = true; release(); }; };
  assert.throws(() => createController(f.ctx, z), error => error === problem);
  assert.equal(first.registry.guards.size, 0); assert.equal(second.registry.guards.size, 0);
  assert.equal(subscriptions, 0); assert.equal(projectionDisposed, true);
});

test('unexpected registry errors retain their original Error in logs, not user diagnostics', () => {
  const f = controllerFixture(), problem = new Error('private registry diagnostic'), logs = [];
  f.ctx.logger.warn = (...args) => logs.push(args);
  f.first.ctx.tools.presentAs = () => { throw problem; };
  assert.throws(() => f.set(0, { allowedTools: [] }), error => error.code === 'UNSUPPORTED_POLICY' && !error.message.includes('private registry'));
  assert.ok(logs.some(args => args.includes(problem)));
  f.dispose();
});

test('a preset change from a commit observer aborts without leaking policy', () => {
  const f = controllerFixture();
  f.first.afterAppend = type => { if (type === 'command/run') f.select(f.first, 'standard'); };
  assert.throws(() => f.set(0, { allowedTools: [], overridePrompt: true }), code('WRONG_PRESET'));
  assert.equal(f.stateOf(f.first.session).snapshot.revision, 0);
  assert.equal(f.first.registry.sections.size, 0);
  assert.equal(f.first.registry.restrictions.size, 0);
  f.dispose();
});
