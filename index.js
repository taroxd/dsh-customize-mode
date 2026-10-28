import { z } from 'zod';
import { createHost } from './settings.js';
import { openDefaults } from './defaults.js';

export const name = 'customize-mode';
export const inject = ['agents', 'agentPresets', 'connection', 'sessionProjections', 'tools', 'systemPrompt', 'storageDomain', 'profileContext'];

export async function apply(ctx) {
  await ctx.effect(async () => {
    const defaults = await openDefaults(ctx, z);
    try {
      const closeHost = createHost(ctx, z, { defaults });
      return async () => {
        try { await closeHost(); }
        finally { await defaults.close(); }
      };
    } catch (error) {
      await defaults.close();
      throw error;
    }
  });
}
