import { PRESET_ID } from './state.js';

/**
 * The `customize-mode` preset is declared here rather than in
 * `cordis.patch.yml`: DSH translates a preset's display copy only for the four
 * presets it ships (`BUILT_IN_PRESET_KEYS` in `dsh-agent-preset-registry`), so a
 * YAML row would pin one language forever. Registering from the Host lets the
 * name and description follow the interface language.
 *
 * The preset composes no plugins of its own. Every Custom mode conversation is
 * rebound to the base mode its settings name, so it inherits that mode's
 * tools, skills, and plugins.
 */

export const PRESET_ORDER = 10;

/** Settings entry and field carrying the web GUI language preference. */
export const LOCALE_NAMESPACE = 'locale';
export const LOCALE_PREFERENCE_FIELD = 'preference';

const COPY = Object.freeze({
  en: Object.freeze({
    name: 'Custom mode',
    description: 'Build on any mode and customize its system prompt, tools, and extra context for each conversation.',
  }),
  zh: Object.freeze({
    name: '自定义模式',
    description: '以任意模式为基础，为每个对话自定义系统提示词、可用工具和附加信息。',
  }),
});

/**
 * Display copy for one interface language. Only English and Chinese ship
 * dictionaries; every other language resolves through the English baseline,
 * matching the GUI's own fallback.
 * @param locale - BCP 47-style language id, or undefined when no preference is stored.
 * @returns Frozen name and description.
 */
export function presetCopy(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? COPY.zh : COPY.en;
}

/**
 * Read the stored interface language.
 * @param settings - Settings service, or undefined when the profile mounts none.
 * @returns The BCP 47-style preference, or undefined when the GUI has none stored.
 */
export function localePreference(settings) {
  const value = settings?.describe().find(row => row.ns === LOCALE_NAMESPACE)?.value;
  const preference = value?.[LOCALE_PREFERENCE_FIELD];
  return typeof preference === 'string' ? preference : undefined;
}

/**
 * Register the preset under the current interface language and keep its display
 * copy in step with later language changes.
 *
 * The declaration object is registered once and then rewritten in place:
 * `agentPresets.register` keeps the caller's object as the record's config, and
 * every registration mounts a fresh revision, which would retire the one that
 * blank Custom mode conversations are still bound to.
 * @param ctx - Host plugin context.
 * @returns Disposer that unregisters the preset.
 */
export async function openPreset(ctx) {
  const copy = presetCopy(localePreference(ctx.get('settings')));
  const definition = { id: PRESET_ID, order: PRESET_ORDER, name: copy.name, description: copy.description, plugins: [] };
  let stopped = false, scheduled = false;

  function apply() {
    if (stopped) return;
    const next = presetCopy(localePreference(ctx.get('settings')));
    definition.name = next.name;
    definition.description = next.description;
  }

  // `settings.describe()` emits while it reads, so the refresh is deferred out
  // of the emit stack instead of re-entering the document read.
  function schedule() {
    if (stopped || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  }

  const release = await ctx.agentPresets.register(definition);
  // The settings service may mount after this plugin, so the subscription owns
  // the first read as well: `ctx.inject` runs its callback once the dependency
  // is available, which also covers a profile that mounts no settings at all.
  const tracked = ctx.inject(['settings'], child => child.effect(() => {
    apply();
    return child.on('settings/document-updated', namespace => {
      if (namespace === LOCALE_NAMESPACE) schedule();
    });
  }, 'customize-mode: preset copy'));
  return async () => {
    stopped = true;
    await tracked?.dispose?.();
    await release();
  };
}
