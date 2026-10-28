import { z } from 'zod';
import { createHost } from './settings.js';

export const name = 'customize-mode';
export const inject = ['agents', 'agentPresets', 'connection', 'sessionProjections', 'tools', 'systemPrompt'];

export function apply(ctx) {
  ctx.effect(() => createHost(ctx, z));
}
