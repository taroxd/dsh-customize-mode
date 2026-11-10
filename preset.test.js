import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_ID } from './state.js';
import { openPreset, presetCopy, plugins, PRESET_ORDER } from './preset.js';

/**
 * Minimal Cordis host: `inject` starts its callback immediately with a child
 * context whose `on`/`effect` are disposed together, mirroring the real fiber.
 * Copy updates leave the notification stack, so tests settle microtasks.
 */
const settle = () => new Promise(resolve => setImmediate(resolve));
function host(locale) {
  const listeners = new Map(), registered = [], fibers = new Set();
  const settings = {
    value: locale === undefined ? {} : { preference: locale },
    describe() { return [{ ns: 'locale', value: this.value }]; },
  };
  const emit = (namespace, revision = 1) => {
    for (const fn of [...listeners.get('settings/document-updated') ?? []]) fn(namespace, revision);
  };
  const ctx = {
    logger: { warn() {} },
    get: name => name === 'settings' ? settings : undefined,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    inject(deps, callback) {
      assert.deepEqual(deps, ['settings']);
      const disposers = [];
      const child = {
        on: (name, fn) => { const off = ctx.on(name, fn); disposers.push(off); return off; },
        effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose; },
      };
      const fiber = { dispose: async () => { for (const dispose of disposers.splice(0).reverse()) dispose(); fibers.delete(fiber); } };
      fibers.add(fiber);
      callback(child);
      return fiber;
    },
    agentPresets: {
      async register(definition) {
        const record = { definition, plugins: definition.plugins, get name() { return definition.name; } };
        registered.push(record);
        return async () => { registered.splice(registered.indexOf(record), 1); };
      },
    },
  };
  return {
    ctx, settings, registered, fibers, emit,
    setLocale(preference) {
      settings.value = preference === undefined ? {} : { preference };
      emit('locale');
    },
  };
}

test('the declared preset carries the identity, order, and full plugin list', async () => {
  const f = host('en');
  const close = await openPreset(f.ctx);
  const [row] = f.registered;
  assert.equal(row.definition.id, PRESET_ID);
  assert.equal(row.definition.order, PRESET_ORDER);
  assert.deepEqual(row.plugins, JSON.parse(JSON.stringify(plugins)));
  assert.ok(plugins.length > 20, 'the whole composition must move with the preset');
  assert.equal(row.plugins.filter(plugin => plugin.group).length, 3, 'groups survive the move out of YAML');
  assert.ok(row.plugins.some(plugin => plugin.disabled?.__jsExpr), 'platform conditions survive the move out of YAML');
  await close();
  assert.equal(f.registered.length, 0);
});

test('the registered copy follows the stored interface language', async () => {
  for (const [preference, name] of [['en', 'Custom mode'], ['zh', '自定义模式'], ['zh-CN', '自定义模式'], ['ja', 'Custom mode'], [undefined, 'Custom mode']]) {
    const f = host(preference);
    const close = await openPreset(f.ctx);
    assert.equal(f.registered[0].name, name, String(preference));
    assert.equal(f.registered[0].definition.description, presetCopy(preference).description, String(preference));
    await close();
  }
});

test('switching the language rewrites the live declaration instead of remounting it', async () => {
  const f = host('en');
  const close = await openPreset(f.ctx);
  const { definition } = f.registered[0];
  assert.equal(definition.name, 'Custom mode');
  f.setLocale('zh');
  await settle();
  assert.equal(definition.name, '自定义模式');
  assert.equal(definition.description, presetCopy('zh').description);
  assert.equal(f.registered.length, 1, 'the preset must stay registered as one revision');
  assert.equal(f.registered[0].definition, definition);
  f.setLocale('en');
  await settle();
  assert.equal(definition.name, 'Custom mode');
  f.setLocale(undefined);
  await settle();
  assert.equal(definition.name, 'Custom mode');
  await close();
});

test('only the locale document updates the copy, and closing stops observing', async () => {
  const f = host('en');
  const close = await openPreset(f.ctx);
  const { definition } = f.registered[0];
  f.settings.value = { preference: 'zh' };
  f.emit('ui-settings');
  await settle();
  assert.equal(definition.name, 'Custom mode', 'another settings document must not re-read the preference');
  f.emit('locale');
  await settle();
  assert.equal(definition.name, '自定义模式');
  await close();
  assert.equal(f.fibers.size, 0, 'closing must dispose the settings subscription');
  f.setLocale('en');
  await settle();
  assert.equal(definition.name, '自定义模式', 'a closed preset must not keep observing settings');
});

test('a profile without a settings service still registers the baseline copy', async () => {
  const registered = [];
  const ctx = {
    logger: { warn() {} },
    get: () => undefined,
    on: () => () => {},
    inject: () => ({ dispose: async () => {} }),
    agentPresets: { async register(definition) { registered.push(definition); return async () => {}; } },
  };
  const close = await openPreset(ctx);
  assert.equal(registered[0].name, 'Custom mode');
  await close();
});
