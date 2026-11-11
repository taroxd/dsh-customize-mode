import test from 'node:test';
import assert from 'node:assert/strict';
import { clientRequestSchema } from './protocol.js';
import { createPresetStore } from './presets.js';
import { createHost, SETTINGS_ENDPOINT, SETTINGS_PATH } from './settings.js';
import { DEFAULT_CONFIG, PROTOCOL, PRESET_ID } from './state.js';
import { SettingsError } from './errors.js';
import { fixture as hostFixture, settle } from './test-support.js';

const config = extra => ({ ...DEFAULT_CONFIG, ...extra });

function presetStore(beforeSet) {
  let value = { defaultTitle: null, presets: [] }, now = 0;
  return createPresetStore({ global: { get: () => value, async set(next) { await beforeSet?.(next); value = next; } }, async close() {} }, () => {}, () => ++now);
}

async function fixture(options = {}) {
  const f = hostFixture();
  const browserPeer = { principal: { kind: 'owner' }, signal: new AbortController().signal };
  const routes = new Map(), admissions = new WeakMap();
  let handler, detached = false, cleanupGate, sequence = 0;
  f.ctx.connection = {
    browserPeer,
    admit: request => admissions.get(request) ?? { rejection: 401 },
    fetch: { register(route) {
      assert.equal(route.path, SETTINGS_PATH); assert.deepEqual(route.methods, ['POST']); assert.equal(route.requestBody, 'buffered');
      routes.set(route.path, route); handler = route.fetch;
      return async () => { detached = true; routes.delete(route.path); await cleanupGate; handler = undefined; };
    } },
  };
  const presets = options.presets ?? presetStore();
  const dispose = await createHost(f.ctx, {
    presets,
    describeBase: options.describeBase ?? (async id => ({ template: `Default {{model}} template for ${id}`, tools: [{ name: 'read', description: `read in ${id}` }] })),
  });
  const first = f.agent('root'), child = f.agent('child', { root: false }), ordinary = f.agent('ordinary', { preset: 'standard' });
  await Promise.all([first.created, child.created, ordinary.created]);
  const fetchRaw = (extra = {}) => {
    const method = extra.httpMethod ?? 'POST';
    const message = extra.message ?? { type: 'client-request', rpcId: `test-${++sequence}`, method: extra.endpoint ?? SETTINGS_ENDPOINT,
      payload: Object.hasOwn(extra, 'payload') ? extra.payload : { sessionId: 'root', request: { action: 'get' } } };
    const request = new Request('http://dsh.test' + (extra.path ?? SETTINGS_PATH), { method,
      headers: { 'content-type': 'application/json', ...extra.headers },
      ...(method === 'POST' ? { body: extra.body ?? JSON.stringify(message) } : {}),
      ...(extra.body instanceof ReadableStream ? { duplex: 'half' } : {}), signal: extra.signal });
    admissions.set(request, extra.admission ?? { peer: extra.peer ?? browserPeer });
    return handler(request);
  };
  const call = async (request = { action: 'get' }, extra = {}) => {
    const response = await fetchRaw({ ...extra, payload: Object.hasOwn(extra, 'payload') ? extra.payload : { sessionId: extra.sessionId ?? 'root', request } });
    return (await response.json()).result;
  };
  return { ...f, first, child, ordinary, presets, browserPeer, call, fetchRaw, dispose, routes,
    detached: () => detached, setCleanupGate(value) { cleanupGate = value; } };
}

const savePreset = (title, extra = {}, overwrite = false) => ({ action: 'save-preset', title, note: '', config: config(extra), overwrite });

test('get returns the settings, base modes, and the catalog of the current base', async () => {
  const f = await fixture();
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.equal(result.value.protocol, PROTOCOL);
  assert.deepEqual(result.value.config, DEFAULT_CONFIG);
  assert.equal(result.value.baseLocked, false);
  assert.deepEqual(result.value.bases.map(base => [base.id, base.available]), [['standard', true], ['ptc', true], ['minimal', true], ['cordis', false]]);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  assert.deepEqual(result.value.catalog, { template: 'Default {{model}} template for standard', tools: [{ name: 'read', description: 'read in standard' }] });
  assert.equal(f.first.session.events.length, 0, 'reading writes nothing');
  await f.dispose();
});

test('describe-base reads the prompt and tools of another mode without changing the conversation', async () => {
  const f = await fixture();
  const result = await f.call({ action: 'describe-base', baseMode: 'minimal' });
  assert.deepEqual(result.value, { protocol: PROTOCOL, baseMode: 'minimal', template: 'Default {{model}} template for minimal', tools: [{ name: 'read', description: 'read in minimal' }] });
  assert.equal(f.first.composition, 'standard');
  await f.dispose();
});

test('an unavailable base still opens the settings so the user can pick another one', async () => {
  const f = await fixture({ describeBase: async id => { throw new SettingsError('BASE_MODE_UNAVAILABLE', { baseMode: id }); } });
  const result = await f.call();
  assert.equal(result.ok, true);
  assert.equal(result.value.catalog, null);
  await f.dispose();
});

test('set changes the base before the first message and is refused afterwards', async () => {
  const f = await fixture();
  const changed = await f.call({ action: 'set', expectedRevision: 0, config: config({ baseMode: 'ptc' }) });
  assert.equal(changed.ok, true);
  assert.equal(changed.value.config.baseMode, 'ptc');
  assert.equal(f.first.composition, 'ptc');
  f.first.startTurn(); f.first.endTurn();
  assert.equal((await f.call({ action: 'set', expectedRevision: 1, config: config({ baseMode: 'minimal' }) })).error.code, 'BASE_LOCKED');
  assert.equal((await f.call({ action: 'set', expectedRevision: 1, config: config({ baseMode: 'ptc', prompt: 'kept base' }) })).ok, true);
  await f.dispose();
});

test('concurrent saves with the same revision commit exactly once', async () => {
  const f = await fixture();
  const request = { action: 'set', expectedRevision: 0, config: config({ overridePrompt: true, allowedTools: [] }) };
  const [one, two] = await Promise.all([f.call(request), f.call(request)]);
  assert.deepEqual([one.ok, two.error?.code].sort(), [true, 'REVISION_CONFLICT'].sort());
  assert.deepEqual(f.first.session.events.map(event => event.type), ['command/run', 'command/done']);
  assert.equal(f.first.session.events[0].data.name, PRESET_ID);
  await f.dispose();
});

test('preset management saves, overwrites with confirmation, sets the default, and deletes', async () => {
  const f = await fixture();
  let result = await f.call({ ...savePreset('Review', { prompt: 'v1' }), note: 'For reviews' });
  assert.deepEqual(result.value.presets.map(preset => [preset.title, preset.note, preset.config.prompt]), [['Review', 'For reviews', 'v1']]);
  assert.equal((await f.call(savePreset('Review', { prompt: 'v2' }))).error.code, 'PRESET_EXISTS');
  result = await f.call(savePreset(' Review ', { prompt: 'v2' }, true));
  assert.deepEqual(result.value.presets.map(preset => [preset.title, preset.note, preset.config.prompt]), [['Review', '', 'v2']]);
  result = await f.call({ action: 'set-default-preset', title: 'Review' });
  assert.equal(result.value.defaultTitle, 'Review');
  assert.deepEqual((await f.call({ action: 'list-presets' })).value, result.value);
  result = await f.call({ action: 'delete-preset', title: 'Review' });
  assert.deepEqual(result.value, { protocol: PROTOCOL, defaultTitle: null, presets: [] });
  assert.equal((await f.call({ action: 'delete-preset', title: 'Review' })).error.code, 'PRESET_NOT_FOUND');
  assert.equal(f.first.session.events.length, 0, 'presets never touch the conversation log');
  await f.dispose();
});

test('the default preset reaches new conversations through the endpoint', async () => {
  const f = await fixture();
  await f.call(savePreset('Minimal', { baseMode: 'minimal', allowedTools: ['bash'] }));
  await f.call({ action: 'set-default-preset', title: 'Minimal' });
  const fresh = f.agent('fresh');
  await fresh.created;
  const result = await f.call({ action: 'get' }, { sessionId: 'fresh' });
  assert.equal(result.value.config.baseMode, 'minimal');
  assert.equal(fresh.composition, 'minimal');
  await f.dispose();
});

test('a blank conversation opened before the default was set adopts it on the next read', async () => {
  const f = await fixture();
  await f.call(savePreset('PTC', { baseMode: 'ptc' }));
  await f.call({ action: 'set-default-preset', title: 'PTC' });
  const result = await f.call();
  assert.equal(result.value.revision, 1);
  assert.equal(result.value.config.baseMode, 'ptc');
  assert.equal(f.first.composition, 'ptc');
  await f.dispose();
});

test('every action needs the exact owner browser, a main Custom mode conversation, and a human caller', async () => {
  const f = await fixture();
  const actions = [{ action: 'get' }, { action: 'list-presets' }, savePreset('X'), { action: 'set', expectedRevision: 0, config: config() }];
  for (const request of actions) {
    for (const peer of [{ principal: { kind: 'owner' }, signal: new AbortController().signal }, { principal: { kind: 'agent' }, signal: new AbortController().signal }]) {
      assert.equal((await f.call(request, { peer })).error.code, 'FORBIDDEN');
    }
    assert.equal((await f.call(request, { sessionId: 'child' })).error.code, 'ROOT_SESSION_REQUIRED');
    assert.equal((await f.call(request, { sessionId: 'ordinary' })).error.code, 'WRONG_PRESET');
    assert.equal((await f.call(request, { sessionId: 'missing' })).error.code, 'SESSION_NOT_FOUND');
    f.setInitiator(f.first);
    assert.equal((await f.call(request)).error.code, 'HUMAN_ONLY');
    f.setInitiator(undefined);
  }
  assert.deepEqual(f.presets.current().presets, []);
  assert.equal(f.first.session.events.length, 0);
  await f.dispose();
});

test('a queued preset write checks access again after the previous write finishes', async () => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; }), began = new Promise(resolve => { started = resolve; });
  const presets = presetStore(async () => { started(); await gate; });
  const f = await fixture({ presets });
  const first = f.call(savePreset('First'));
  await began;
  const second = f.call(savePreset('Second'));
  await settle();
  f.remove(f.first); release();
  assert.equal((await first).ok, true);
  assert.equal((await second).error.code, 'SESSION_NOT_FOUND');
  assert.deepEqual(presets.current().presets.map(preset => preset.title), ['First']);
  await f.dispose();
});

test('the route validates method, path, content type, JSON, envelope, and size', async () => {
  const f = await fixture();
  assert.equal((await f.fetchRaw({ httpMethod: 'GET' })).status, 404);
  assert.equal((await f.fetchRaw({ path: '/api/another-feature' })).status, 404);
  assert.equal((await f.fetchRaw({ headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.fetchRaw({ body: 'not JSON' })).status, 400);
  for (const status of [401, 403]) assert.equal((await f.fetchRaw({ admission: { rejection: status }, body: 'not JSON' })).status, status);
  const mismatch = await (await f.fetchRaw({ message: { type: 'client-request', rpcId: 'mismatch', method: 'other', payload: {} } })).json();
  assert.equal(mismatch.rpcId, 'mismatch'); assert.equal(mismatch.result.error.code, 'INVALID_REQUEST');
  assert.equal((await f.fetchRaw({ headers: { 'content-length': String(4 * 1024 * 1024 + 32769) } })).status, 413);
  assert.equal((await f.fetchRaw({ body: ' '.repeat(4 * 1024 * 1024 + 32769) })).status, 413);
  for (const payload of [null, [], {}, { sessionId: 'root', request: { action: 'get', extra: true } }, { sessionId: 'root', request: { action: 'set', expectedRevision: 0, config: {} } }]) {
    assert.equal((await f.call({}, { payload })).error.code, 'INVALID_REQUEST');
  }
  const response = await f.fetchRaw({ message: { type: 'client-request', rpcId: 'correlation-123', method: SETTINGS_ENDPOINT, payload: { sessionId: 'root', request: { action: 'get' } } } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).rpcId, 'correlation-123');
  assert.equal(f.first.session.events.length, 0);
  await f.dispose();
});

test('the request parser validates the envelope and strips unknown fields', () => {
  const message = { type: 'client-request', rpcId: 'r-1', method: SETTINGS_ENDPOINT, payload: { sessionId: 'root' }, extra: 'ignored' };
  assert.deepEqual(clientRequestSchema.parse(message), { type: 'client-request', rpcId: 'r-1', method: SETTINGS_ENDPOINT, payload: { sessionId: 'root' } });
  for (const invalid of [null, [], {}, { ...message, type: 'server-response' }, { ...message, rpcId: 1 }, { ...message, method: null }]) {
    assert.equal(clientRequestSchema.safeParse(invalid).success, false);
  }
});

test('unexpected describe failures return a stable code without internal text', async () => {
  const f = await fixture({ describeBase: async () => { throw new Error('private internal information'); } });
  const result = await f.call({ action: 'describe-base', baseMode: 'ptc' });
  assert.equal(result.error.code, 'PREVIEW_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /private internal information/);
  assert.deepEqual(result.error.details, {});
  await f.dispose();
});

test('teardown cancels pending requests and waits for describe work before removing policies', async () => {
  let started, release;
  const began = new Promise(resolve => { started = resolve; });
  const cleanup = new Promise(resolve => { release = resolve; });
  const f = await fixture({ describeBase: async (_id, { signal }) => {
    started();
    try { await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })); }
    finally { await cleanup; }
  } });
  const reading = f.call();
  await began;
  let disposed = false;
  const stopping = f.dispose().then(() => { disposed = true; });
  assert.equal((await reading).error.code, 'ABORTED');
  assert.equal(f.detached(), true);
  assert.equal(disposed, false);
  assert.equal(f.first.registry.guards.size, 1);
  release(); await stopping;
  assert.equal(f.first.registry.guards.size, 0);
  assert.equal(f.routes.size, 0);
});

test('a body whose cancellation fails cannot mask the abort or stall teardown', async () => {
  const f = await fixture(), abort = new AbortController();
  let pulling;
  const started = new Promise(resolve => { pulling = resolve; }), problem = new Error('cancel failed'), logs = [];
  f.ctx.logger.warn = (...args) => logs.push(args);
  const body = new ReadableStream({ pull() { pulling(); return new Promise(() => {}); }, cancel() { throw problem; } });
  const reading = f.fetchRaw({ body, signal: abort.signal });
  await started; abort.abort();
  assert.equal((await (await reading).json()).result.error.code, 'ABORTED');
  await f.dispose();
  assert.ok(logs.some(args => args.includes(problem)));
});
