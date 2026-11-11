import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseDescriber, listBases, assertBaseAvailable } from './bases.js';
import { PRESET_ID } from './state.js';

const signal = () => new AbortController().signal;
const roster = [
  { id: 'standard', order: 1 },
  { id: PRESET_ID, name: 'Custom mode' },
  { id: 'review', name: 'Code review', description: 'Reviews changes' },
  { id: 'broken', name: 'Broken', broken: 'D:/private/path: failed to import' },
];

function host({ assemble, tools = [] } = {}) {
  const leases = { acquired: 0, released: 0 };
  const ctx = {
    agentPresets: {
      list: async () => roster,
      acquireScope: async id => {
        leases.acquired++;
        return { key: { preset: id }, [Symbol.asyncDispose]: async () => { leases.released++; } };
      },
    },
    systemPrompt: { assemble: assemble ?? (async ({ scope }) => ({ sections: [{ text: `You are in ${scope.preset}.` }, { text: '' }, { text: 'Use {{model}}.' }] })) },
    tools: { schemas: scope => tools.map(name => ({ name, description: `${name} for ${scope.preset}` })) },
  };
  return { ctx, leases };
}

test('base modes are every other preset, without private loading diagnostics', async () => {
  const bases = await listBases(host().ctx.agentPresets);
  assert.deepEqual(bases, [
    { id: 'standard', available: true },
    { id: 'review', name: 'Code review', description: 'Reviews changes', available: true },
    { id: 'broken', name: 'Broken', available: false },
  ]);
  assert.doesNotMatch(JSON.stringify(bases), /private/);
  await assertBaseAvailable(host().ctx.agentPresets, 'review');
  for (const id of ['broken', 'missing', PRESET_ID]) {
    await assert.rejects(assertBaseAvailable(host().ctx.agentPresets, id), error => error.code === 'BASE_MODE_UNAVAILABLE');
  }
});

test('describing a base reads its raw prompt template and tools through a released lease', async () => {
  const f = host({ tools: ['read', 'run_code', 'bash'] });
  const result = await createBaseDescriber(f.ctx)('review', { signal: signal() });
  assert.deepEqual(result, {
    template: 'You are in review.\n\nUse {{model}}.',
    tools: [{ name: 'read', description: 'read for review' }, { name: 'bash', description: 'bash for review' }],
  });
  assert.deepEqual(f.leases, { acquired: 1, released: 1 });
});

test('a failed assembly still releases the lease', async () => {
  const f = host({ assemble: async () => { throw new Error('assembly failed'); } });
  await assert.rejects(createBaseDescriber(f.ctx)('standard', { signal: signal() }), /assembly failed/);
  assert.deepEqual(f.leases, { acquired: 1, released: 1 });
});

test('cancellation before acquisition does no work, and cancellation during it releases the lease', async () => {
  const stopped = new AbortController(); stopped.abort();
  const idle = host();
  await assert.rejects(createBaseDescriber(idle.ctx)('standard', { signal: stopped.signal }), error => error.code === 'ABORTED');
  assert.equal(idle.leases.acquired, 0);
  const later = new AbortController();
  const f = host({ assemble: async () => { later.abort(); return { sections: [] }; } });
  await assert.rejects(createBaseDescriber(f.ctx)('standard', { signal: later.signal }), error => error.code === 'ABORTED');
  assert.deepEqual(f.leases, { acquired: 1, released: 1 });
});

test('an unavailable base is reported without acquiring a lease', async () => {
  const f = host();
  await assert.rejects(createBaseDescriber(f.ctx)('broken', { signal: signal() }), error => error.code === 'BASE_MODE_UNAVAILABLE');
  assert.equal(f.leases.acquired, 0);
});
