import { z } from 'zod';
import { createHost } from './settings.js';
import { openDefaults } from './defaults.js';
import { openPreset } from './preset.js';

export const name = 'customize-mode';
export const inject = ['agents', 'agentPresets', 'connection', 'sessionProjections', 'tools', 'systemPrompt', 'storageDomain', 'profileContext'];

export async function apply(ctx) {
  await ctx.effect(async () => {
    // The preset registers first: its display copy follows the interface
    // language, and the settings host below assumes the preset exists.
    const closePreset = await openPreset(ctx);
    let defaults;
    try {
      defaults = await openDefaults(ctx, z);
      const closeHost = await createHost(ctx, z, { defaults });
      return async () => {
        try { await closeHost(); }
        finally {
          try { await defaults.close(); }
          finally { await closePreset(); }
        }
      };
    } catch (error) {
      // A failed activation must not leave the defaults domain or the preset behind.
      await defaults?.close();
      await closePreset();
      throw error;
    }
  });
}
