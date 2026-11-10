import { PRESET_ID } from './state.js';

/**
 * The `customize-mode` preset is declared here rather than in
 * `cordis.patch.yml`: DSH translates a preset's display copy only for the four
 * presets it ships (`BUILT_IN_PRESET_KEYS` in `dsh-agent-preset-registry`), so a
 * YAML row would pin one language forever. Registering from the Host lets the
 * name and description follow the interface language.
 */

/** Loader `!!js` node; the preset registry evaluates it against its own Loader context. */
const js = expression => ({ __jsExpr: expression });

export const PRESET_ORDER = 10;

/** Settings entry and field carrying the web GUI language preference. */
export const LOCALE_NAMESPACE = 'locale';
export const LOCALE_PREFERENCE_FIELD = 'preference';

const COPY = Object.freeze({
  en: Object.freeze({
    name: 'Custom mode',
    description: 'Customize the system prompt, enabled tools, and extra context for each conversation.',
  }),
  zh: Object.freeze({
    name: '自定义模式',
    description: '自定义系统提示词、可用工具和附加信息。',
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

const PLAN_MODE = `You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.
`;

/** Child plugin list the preset composes. */
export const plugins = [
  {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: { prefix: 'You are a coding agent powered by the {{model}} model.' },
  },
  {
    id: 'agent-instructions',
    name: '@deepseek-ai/dsh-agent-instructions',
    config: { maxBytes: 65536 },
  },
  { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
  {
    id: 'tool-bash',
    name: '@deepseek-ai/dsh-tool-bash',
    disabled: js("process.platform === 'win32'"),
  },
  {
    id: 'tool-pwsh',
    name: '@deepseek-ai/dsh-tool-pwsh',
    disabled: js("process.platform !== 'win32'"),
  },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  {
    id: 'tool-fs-search',
    name: '@deepseek-ai/dsh-tool-fs-search',
    config: { sampleOverCapGlobResults: false },
  },
  { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
  { id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' },
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
  { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
  {
    id: 'planning',
    name: 'cordis:group',
    group: true,
    isolate: { planMode: true },
    config: [
      {
        id: 'plan-mode',
        name: '@deepseek-ai/dsh-plan-mode',
        config: { section: PLAN_MODE },
      },
    ],
  },
  {
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      {
        id: 'tool-result-pruner',
        name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
        config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
      },
    ],
  },
  {
    id: 'delegation',
    name: 'cordis:group',
    group: true,
    isolate: { workflowEngine: true },
    config: [
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
      {
        id: 'tool-subagent',
        name: '@deepseek-ai/dsh-tool-subagent',
        // Keep subagent in the inherited tool layer so it can be hidden when disabled.
        config: { provider: 'spawn', toolName: 'subagent', modelSelection: false },
      },
      {
        id: 'tool-subagent-fork',
        name: '@deepseek-ai/dsh-tool-subagent',
        config: { provider: 'fork', toolName: 'subagent_fork' },
      },
      {
        id: 'workflow-ptc',
        name: '@deepseek-ai/dsh-workflow-ptc',
        config: { provider: 'spawn' },
      },
      { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
    ],
  },
  { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
  {
    id: 'tool-todo',
    name: '@deepseek-ai/dsh-tool-todo',
    config: { allowParallelInProgress: true },
  },
  {
    id: 'tool-web',
    name: '@deepseek-ai/dsh-tool-web',
    config: { fetch: true, searchTimeoutMs: 60000 },
  },
  { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
  {
    id: 'tool-plugin-manager',
    name: '@deepseek-ai/dsh-plugin-manager/tools',
    disabled: true,
  },
  {
    id: 'tool-plugin-market',
    name: '@deepseek-ai/dsh-plugin-market/tools',
    disabled: true,
  },
];

/**
 * Build one declaration. Display copy is rewritten in place when the interface
 * language changes, so the registry keeps a single mounted revision: presets
 * are re-mounted on every registration, and a language switch must not drop the
 * preset from the roster or re-import its plugin tree.
 * @param copy - Display copy resolved from the interface language.
 * @returns Preset definition for `agentPresets.register`.
 */
function createDefinition(copy) {
  return { id: PRESET_ID, order: PRESET_ORDER, name: copy.name, description: copy.description, plugins };
}

/**
 * Register the preset under the current interface language and keep its display
 * copy in step with later language changes.
 *
 * The declaration object is registered once and then rewritten in place:
 * `agentPresets.register` keeps the caller's object as the record's config, and
 * every registration mounts a fresh plugin tree. Re-registering on a language
 * switch would therefore re-import the whole composition for a two-word change.
 * @param ctx - Host plugin context.
 * @returns Disposer that unregisters the preset.
 */
export async function openPreset(ctx) {
  const definition = createDefinition(presetCopy(localePreference(ctx.get('settings'))));
  let stopped = false, scheduled = false;

  function apply() {
    if (stopped) return;
    const copy = presetCopy(localePreference(ctx.get('settings')));
    definition.name = copy.name;
    definition.description = copy.description;
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
