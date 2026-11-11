import { PRESET_ID } from './state.js';
import { SettingsError, assertNotAborted } from './errors.js';

/**
 * Modes that Custom mode can build on: every preset on the roster except itself.
 * @returns Roster rows without loading diagnostics, which can contain Host paths.
 */
export async function listBases(agentPresets) {
  return (await agentPresets.list()).filter(row => row.id !== PRESET_ID).map(row => ({
    id: row.id,
    ...(row.name === undefined ? {} : { name: row.name }),
    ...(row.description === undefined ? {} : { description: row.description }),
    available: row.broken === undefined,
  }));
}

/** Reject a base mode that is not on the roster or failed to load. */
export async function assertBaseAvailable(agentPresets, id) {
  const base = (await listBases(agentPresets)).find(row => row.id === id);
  if (!base?.available) throw new SettingsError('BASE_MODE_UNAVAILABLE', { baseMode: id });
}

/**
 * Read the default prompt template and the tool catalog of one base mode
 * through an isolated preset lease, without touching any live agent.
 */
export function createBaseDescriber(ctx) {
  return async (id, { signal }) => {
    assertNotAborted(signal);
    await assertBaseAvailable(ctx.agentPresets, id);
    const lease = await ctx.agentPresets.acquireScope(id);
    try {
      assertNotAborted(signal);
      const assembly = await ctx.systemPrompt.assemble({ scope: lease.key, signal });
      assertNotAborted(signal);
      return {
        template: assembly.sections.map(section => section.text).filter(text => text.length > 0).join('\n\n'),
        // run_code is the PTC transport, not a capability that can be turned off.
        tools: ctx.tools.schemas(lease.key).filter(tool => tool.name !== 'run_code')
          .map(({ name, description }) => ({ name, description: description ?? '' })),
      };
    } finally {
      await lease[Symbol.asyncDispose]();
    }
  };
}
