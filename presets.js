import { createHash } from 'node:crypto';
import { z } from 'zod';
import { presetSchema, MAX_SETTINGS_BYTES } from './state.js';
import { SettingsError } from './errors.js';

export const MAX_PRESETS = 100;
/** The whole collection is rewritten on every change, so its size is bounded as well. */
export const MAX_STORE_BYTES = 4 * MAX_SETTINGS_BYTES;

const storeSchema = z.strictObject({
  defaultTitle: z.string().nullable(),
  presets: z.array(presetSchema).max(MAX_PRESETS),
}).refine(store => new Set(store.presets.map(preset => preset.title)).size === store.presets.length, 'duplicate preset title')
  .refine(store => store.defaultTitle === null || store.presets.some(preset => preset.title === store.defaultTitle), 'unknown default preset');

const EMPTY_STORE = Object.freeze({ defaultTitle: null, presets: Object.freeze([]) });

function freeze(store) {
  for (const preset of store.presets) {
    if (preset.config.allowedTools) Object.freeze(preset.config.allowedTools);
    Object.freeze(preset.config);
    Object.freeze(preset);
  }
  Object.freeze(store.presets);
  return Object.freeze(store);
}

/**
 * Profile-wide collection of named settings presets, one of which may be the
 * default that new Custom mode conversations start with. Writes are queued so
 * each change is computed from the last durable collection, and memory changes
 * only after the backend acknowledges the write.
 */
export function createPresetStore(domain, report, now = Date.now) {
  let current = freeze(storeSchema.parse(domain.global.get()));
  let tail = Promise.resolve(), closing = false, disposal;

  function enqueue(authorize, change) {
    if (closing) throw new SettingsError('UNAVAILABLE');
    const operation = tail.then(async () => {
      authorize();
      const next = change(current);
      if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_STORE_BYTES) throw new SettingsError('PRESETS_FULL');
      const stored = freeze(storeSchema.parse(next));
      try { await domain.global.set(stored); }
      catch (error) { report(error); throw new SettingsError('PRESETS_SAVE_FAILED'); }
      current = stored;
      return current;
    });
    tail = operation.catch(() => {});
    return operation;
  }

  const find = (store, title) => store.presets.find(preset => preset.title === title);
  function assertExists(store, title) {
    if (!find(store, title)) throw new SettingsError('PRESET_NOT_FOUND', { title });
  }

  return {
    current: () => current,
    /** Settings of the default preset, or undefined when none is chosen. */
    defaultConfig: () => current.defaultTitle === null ? undefined : find(current, current.defaultTitle).config,
    save({ title, note, config, overwrite }, authorize) {
      return enqueue(authorize, store => {
        const preset = { title, note, config, updatedAt: now() };
        if (!find(store, title)) {
          if (store.presets.length >= MAX_PRESETS) throw new SettingsError('PRESETS_FULL');
          return { ...store, presets: [...store.presets, preset] };
        }
        if (!overwrite) throw new SettingsError('PRESET_EXISTS', { title });
        return { ...store, presets: store.presets.map(existing => existing.title === title ? preset : existing) };
      });
    },
    remove(title, authorize) {
      return enqueue(authorize, store => {
        assertExists(store, title);
        return {
          defaultTitle: store.defaultTitle === title ? null : store.defaultTitle,
          presets: store.presets.filter(preset => preset.title !== title),
        };
      });
    },
    setDefault(title, authorize) {
      return enqueue(authorize, store => {
        if (title !== null) assertExists(store, title);
        return { ...store, defaultTitle: title };
      });
    },
    close() {
      closing = true;
      return disposal ??= tail.then(() => domain.close());
    },
  };
}

/** Open the preset collection of the current profile. */
export async function openPresets(ctx) {
  const name = 'dsh_customize_mode_presets_' + createHash('sha256').update(ctx.profileContext.dir).digest('hex');
  const domain = await ctx.storageDomain.open({
    name, version: 1, tables: {},
    global: { schema: storeSchema, initial: EMPTY_STORE },
  });
  try { return createPresetStore(domain, error => ctx.logger.warn('customize-mode: preset write failed', error)); }
  catch (error) { await domain.close(); throw error; }
}
