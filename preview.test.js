import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPromptPreview } from './preview.js';
const signal = () => new AbortController().signal;

test('default template uses an independent preset lease and preserves raw variables', async () => {
  const agent = { ctx: {}, get options() { throw new Error('Live model state must not be read'); } };
  const key = {}; let released = 0;
  const ctx = {
    agentPresets: { composedPreset: context => { assert.equal(context, agent.ctx); return 'customize-mode'; },
      acquireScope: async id => { assert.equal(id, 'customize-mode'); return { key, [Symbol.asyncDispose]: async () => { released++; } }; } },
    systemPrompt: { assemble: async input => {
      assert.equal(input.scope, key); assert.equal(input.agent, undefined); assert.notEqual(input.scope, agent);
      return { sections: [{ text: 'You are {{model}}.' }, { text: '' }, { text: 'Default tool instructions' }] };
    } },
  };
  assert.equal(await createDefaultPromptPreview(ctx)(agent, { signal: signal() }), 'You are {{model}}.\n\nDefault tool instructions');
  assert.equal(released, 1);
});

test('assembly failure releases the lease', async () => {
  let released = false;
  const ctx = { agentPresets: { composedPreset: () => 'customize-mode', acquireScope: async () => ({ key: {}, [Symbol.asyncDispose]: async () => { released = true; } }) },
    systemPrompt: { assemble: async () => { throw new Error('assembly failed'); } } };
  await assert.rejects(createDefaultPromptPreview(ctx)({ ctx: {} }, { signal: signal() }), /assembly failed/);
  assert.equal(released, true);
});

test('cancellation before acquisition does no work and cancellation during acquisition releases its lease', async () => {
  const stop = new AbortController(); stop.abort();
  await assert.rejects(createDefaultPromptPreview({})({ ctx: {} }, { signal: stop.signal }), error => error.code === 'ABORTED');
  const later = new AbortController(); let released = false;
  const ctx = { agentPresets: { composedPreset: () => 'customize-mode', acquireScope: async () => {
    later.abort(); return { key: {}, [Symbol.asyncDispose]: async () => { released = true; } };
  } }, systemPrompt: { assemble() { throw new Error('Assembly must not start'); } } };
  await assert.rejects(createDefaultPromptPreview(ctx)({ ctx: {} }, { signal: later.signal }), error => error.code === 'ABORTED');
  assert.equal(released, true);
});

test('missing or changed preset fails explicitly instead of returning a blank placeholder', async () => {
  const ctx = { agentPresets: { composedPreset: () => undefined, acquireScope() { throw new Error('Unexpected acquisition'); } } };
  await assert.rejects(createDefaultPromptPreview(ctx)({ ctx: {} }, { signal: signal() }), error => error.code === 'SESSION_CHANGED');
});
