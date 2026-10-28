import { PRESET_ID } from './state.js';
import { SettingsError, assertNotAborted } from './errors.js';

export function createDefaultPromptPreview(ctx) {
  return async (agent, { signal }) => {
    assertNotAborted(signal);
    if (ctx.agentPresets.composedPreset(agent.ctx) !== PRESET_ID) throw new SettingsError('SESSION_CHANGED');
    const lease = await ctx.agentPresets.acquireScope(PRESET_ID);
    try {
      assertNotAborted(signal);
      const assembly = await ctx.systemPrompt.assemble({ scope: lease.key, signal });
      assertNotAborted(signal);
      return assembly.sections.map(section => section.text).filter(text => text.length > 0).join('\n\n');
    } finally {
      await lease[Symbol.asyncDispose]();
    }
  };
}
