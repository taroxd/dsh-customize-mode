import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG, validateConfig, validateSettingsPayload } from './state.js';
import { SettingsError } from './errors.js';

function snapshot(value) {
  if (!Number.isSafeInteger(value?.revision) || value.revision < 0) throw new SettingsError('INVALID_REQUEST');
  const config = validateConfig(value.config);
  if (config.allowedTools?.includes('run_code')) throw new SettingsError('RESERVED_TOOL');
  validateSettingsPayload({ sessionId: 'defaults', request: { action: 'set-defaults', expectedRevision: 0, config } });
  if (config.allowedTools) Object.freeze(config.allowedTools);
  return Object.freeze({ revision: value.revision, config: Object.freeze(config) });
}

// The domain handle is already hydrated. Its lifetime belongs to this store.
export function createDefaultsStore(domain, report = () => {}) {
  let current = snapshot(domain.global.get());
  let tail = Promise.resolve(), closing = false, disposal;
  return {
    current: () => current,
    set(request, authorize) {
      if (closing) throw new SettingsError('UNAVAILABLE');
      authorize();
      const normalized = validateSettingsPayload({ sessionId: 'defaults', request }).request;
      if (normalized.action !== 'set-defaults') throw new SettingsError('INVALID_REQUEST');
      const config = snapshot({ revision: 0, config: normalized.config }).config;
      const operation = tail.then(async () => {
        authorize();
        if (normalized.expectedRevision !== current.revision) throw new SettingsError('DEFAULTS_REVISION_CONFLICT');
        const next = snapshot({ revision: current.revision + 1, config });
        try { await domain.global.set(next); }
        catch (error) { report(error); throw new SettingsError('DEFAULTS_SAVE_FAILED'); }
        // Durability wins over a late cancellation; never claim a committed write failed.
        current = next;
        return current;
      });
      tail = operation.catch(() => {});
      return operation;
    },
    close() {
      closing = true;
      return disposal ??= tail.then(() => domain.close());
    },
  };
}

export async function openDefaults(ctx, z) {
  // The shipped storage root is shared across profiles, unlike workspace settings.
  const identity = ctx.profileContext.dir;
  if (typeof identity !== 'string' || !identity) throw new SettingsError('UNAVAILABLE');
  const name = 'dsh_customize_mode_defaults_' + createHash('sha256').update(identity).digest('hex');
  const schema = z.custom(value => { try { snapshot(value); return true; } catch { return false; } });
  const domain = await ctx.storageDomain.open({
    name, version: 1, tables: {},
    global: { schema, initial: { revision: 0, config: { ...DEFAULT_CONFIG } } },
  });
  try { return createDefaultsStore(domain, error => ctx.logger.warn('customize-mode: default settings write failed', error)); }
  catch (error) { await domain.close(); throw error; }
}
