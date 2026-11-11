import { createHost } from './settings.js';
import { openPresets } from './presets.js';
import { openPreset } from './preset.js';

export const name = 'customize-mode';
export const inject = ['agents', 'agentPresets', 'connection', 'sessionProjections', 'tools', 'systemPrompt', 'storageDomain', 'profileContext'];

export async function apply(ctx) {
  await ctx.effect(async () => {
    // The preset registers first: the settings host below assumes it exists.
    const closePreset = await openPreset(ctx);
    let presets;
    try {
      presets = await openPresets(ctx);
      const closeHost = await createHost(ctx, { presets });
      return async () => {
        try { await closeHost(); }
        finally {
          try { await presets.close(); }
          finally { await closePreset(); }
        }
      };
    } catch (error) {
      // A failed activation must not leave the preset store or the preset behind.
      try { await presets?.close(); }
      finally { await closePreset(); }
      throw error;
    }
  });
}
