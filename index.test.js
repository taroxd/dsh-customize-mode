import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from './index.js';

/** Host stub covering exactly the services `apply` resolves. */
function host({ settings = { describe: () => [{ ns: 'locale', value: { preference: 'en' } }] }, fail = false } = {}) {
  const registered = [], failures = [], closed = [];
  let cleanup, listener;
  const ctx = {
    logger: { warn() {}, error() {} },
    get: name => name === 'settings' ? settings : undefined,
    on: () => () => {},
    inject: (_deps, callback) => {
      callback({ on: (_name, fn) => { listener = fn; return () => {}; }, effect: fn => fn() });
      return { dispose: async () => {} };
    },
    effect: async setup => { cleanup = await setup(); },
    agentPresets: {
      async register(definition) {
        registered.push(definition);
        return async () => { registered.splice(registered.indexOf(definition), 1); };
      },
      composedPreset: () => 'customize-mode',
      presetForSession: () => 'customize-mode',
    },
    agents: { get: () => undefined, list: () => [], roots: () => [], currentInitiator: () => undefined },
    sessionProjections: {
      register: () => {
        const handle = { stateOf: () => undefined, dispose: async () => {} };
        return Object.assign(() => {}, { then: (ok, no) => Promise.resolve(handle).then(ok, no) });
      },
    },
    connection: {
      fetch: {
        register() {
          if (fail) throw new Error('route already taken');
          return async () => {};
        },
      },
    },
    tools: {}, systemPrompt: {}, profileContext: { dir: 'D:/tmp/profile' },
    storageDomain: {
      open: async () => ({
        global: { get: () => ({ defaultTitle: null, presets: [] }), set: async () => {} },
        close: async () => { closed.push('presets'); },
      }),
    },
  };
  return { ctx, registered, failures, closed, cleanup: () => cleanup, settings, listener: () => listener };
}

test('activation keeps the preset registered and teardown releases it and the preset store', async () => {
  const f = host();
  await apply(f.ctx);
  assert.equal(f.registered.length, 1);
  assert.equal(f.registered[0].id, 'customize-mode');
  await f.cleanup()();
  assert.equal(f.registered.length, 0, 'teardown must unregister the preset');
  assert.deepEqual(f.closed, ['presets']);
});

test('a failed activation releases the preset and the preset store', async () => {
  const f = host({ fail: true });
  await assert.rejects(apply(f.ctx), /route already taken/);
  assert.equal(f.registered.length, 0, 'a half-activated plugin must not publish a preset');
  assert.deepEqual(f.closed, ['presets']);
});

test('the interface language reaches the registered preset through the live subscription', async () => {
  const f = host();
  await apply(f.ctx);
  assert.equal(f.registered[0].name, 'Custom mode');
  f.settings.describe = () => [{ ns: 'locale', value: { preference: 'zh' } }];
  f.listener()('locale', 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.registered[0].name, '自定义模式');
  await f.cleanup()();
});
