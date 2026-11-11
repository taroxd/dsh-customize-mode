window.__ModuleLoader__.load({
  id: 'dsh-customize-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NAMESPACE = 'dsh-customize-mode';
    const PROTOCOL = 'dsh-customize-mode/v1';
    const PRESET_ID = 'customize-mode';
    const MAX_TITLE_LENGTH = 80;
    const MAX_NOTE_LENGTH = 1000;
    const EMPTY_PROJECTION = { revision: 0 };
    // DSH names its shipped modes in its own dictionary; their roster rows carry no name.
    const BUILT_IN_NAMES = {
      en: { standard: 'Standard mode', ptc: 'PTC mode', minimal: 'Minimal mode', cordis: 'Creator mode' },
      zh: { standard: '标准模式', ptc: 'PTC 模式', minimal: '极简模式', cordis: '创造模式' },
    };

    const dictionaries = {
      en: {
        settings: 'Custom settings', title: 'Custom mode settings', close: 'Close', cancel: 'Cancel',
        loading: 'Loading…', notLoaded: 'Settings could not be loaded.',
        baseTitle: 'Base mode', baseLabel: 'Build on',
        baseHelp: 'Custom mode uses the tools, skills, and plugins of this mode, then applies the settings below.',
        baseLocked: 'The base mode is fixed once the conversation starts. To use a different one, start a new conversation.',
        baseUnavailable: '{name} (unavailable)', baseMissing: '{name} is unavailable. Choose another base mode.',
        baseDescribing: 'Loading the tools of this mode…',
        promptTitle: 'System prompt', override: 'Use a custom system prompt',
        promptHelp: 'Replaces the system prompt of the base mode. Leave it empty to send no system prompt.',
        promptVariables: 'Variables', promptVariablesTitle: 'Prompt variables',
        promptVariablesBuiltins: 'Built-in variables: {{model}} is the model name and {{provider}} is the model provider. Variables from other plugins work too.',
        promptVariablesSyntax: 'Write a variable as {{name}}, with no spaces inside the braces. Names start with a lowercase letter and contain only lowercase letters, digits, and underscores.',
        promptVariablesFailure: 'Variables are filled in when a message is sent. A message with an unknown or malformed variable is not sent.',
        fillDefaultPrompt: 'Use default prompt', confirmOverwriteTitle: 'Replace the current prompt?',
        confirmOverwritePrompt: 'The text in the prompt box will be replaced with the default prompt of the base mode.',
        replace: 'Replace',
        contextTitle: 'Extra context', runtimeContext: 'Include environment info', timeContext: 'Include the current time',
        contextHelp: 'Applies to new messages only. Earlier messages stay as they are.',
        toolsTitle: 'Tools', allTools: 'All tools of the base mode', selectedTools: 'Only the selected tools',
        allToolsHelp: 'Tools added to the base mode later are turned on automatically.',
        selectedToolsHelp: 'Tools added later stay off until you select them.',
        selectAll: 'Select all', selectNone: 'Clear all', selectedCount: '{count} of {total} selected',
        search: 'Search tools', noMatch: 'No tools match your search.', noTools: 'This mode has no tools to choose from.',
        unknownTools: 'Selected tools that this mode does not have: {names}. They are kept in case you switch back.',
        save: 'Apply', saving: 'Applying…', reload: 'Reload',
        saveHelp: 'Applies to this conversation from the next message.',
        running: 'A reply is in progress. Changes take effect from the next message.',
        stale: 'These settings were changed elsewhere. Reload them to continue.',
        presetsButton: 'Presets', presetsTitle: 'Presets',
        presetsIntro: 'Save the current settings for later, or load a saved preset into this window.',
        presetSaveTitle: 'Save the current settings', presetName: 'Title', presetNote: 'Note (optional)',
        presetNamePlaceholder: 'For example: Code review', presetNotePlaceholder: 'What is this preset for?',
        presetSave: 'Save', presetSaving: 'Saving…', presetSaved: 'Saved “{title}”.',
        presetListTitle: 'Saved presets', presetEmpty: 'No presets yet.',
        presetLoad: 'Load', presetDelete: 'Delete', presetMakeDefault: 'Set as default', presetUnsetDefault: 'Remove default',
        presetDefaultBadge: 'Default', presetBase: 'Base: {name}', presetUpdated: 'Updated {time}',
        presetDefaultHelp: 'New Custom mode conversations start with the default preset. Without one, they start with Standard mode settings.',
        presetLoadHint: 'Loading fills in the settings window. Click “Apply” to use them.',
        presetLoaded: 'Loaded “{title}”. Click “Apply” to use it in this conversation.',
        presetBaseKept: 'Loaded “{title}”. Its base mode, {name}, was not applied because this conversation has already started.',
        confirmReplaceTitle: 'Replace “{title}”?',
        confirmReplaceMessage: 'A preset with this title already exists. Its settings and note will be replaced.',
        confirmDeleteTitle: 'Delete “{title}”?',
        confirmDeleteMessage: 'This preset will be removed. Conversations that already use its settings are not affected.',
        confirmDeleteDefault: 'This is the default preset. New conversations will start with Standard mode settings.',
        delete: 'Delete',
        error_NETWORK: 'Could not reach DSH. Check the connection and try again.',
        error_PROTOCOL: 'DSH sent an unexpected response. Refresh the page and try again.',
        error_FORBIDDEN: 'You don’t have permission to change these settings.', error_UNAUTHORIZED: 'Your sign-in has expired. Reconnect and try again.',
        error_WRONG_PRESET: 'This conversation is no longer in Custom mode.',
        error_SESSION_NOT_FOUND: 'This conversation is closed. Reopen it and try again.',
        error_ROOT_SESSION_REQUIRED: 'Settings can only be changed in a main conversation.',
        error_SESSION_CHANGED: 'The conversation changed. Reopen the settings and try again.',
        error_HUMAN_ONLY: 'Agents can’t change these settings.',
        error_BUSY: 'Another change is still being applied. Try again in a moment.',
        error_REVISION_CONFLICT: 'These settings were changed elsewhere. Reload them and try again.',
        error_BASE_LOCKED: 'The base mode can’t change after the conversation starts.',
        error_BASE_MODE_UNAVAILABLE: 'This base mode can’t be loaded. Choose another one.',
        error_PREVIEW_FAILED: 'The prompt and tools of this mode couldn’t be loaded.',
        error_POLICY_UNAVAILABLE: 'These settings couldn’t be applied. Adjust them and try again.',
        error_INVALID_REQUEST: 'Some settings are invalid. Reload and try again.',
        error_COMMIT_FAILED: 'The settings weren’t saved. Try again.',
        error_PRESET_EXISTS: 'A preset with this title already exists.',
        error_PRESET_NOT_FOUND: 'This preset no longer exists.',
        error_PRESETS_FULL: 'You’ve reached the preset limit. Delete a preset and try again.',
        error_PRESETS_SAVE_FAILED: 'The presets couldn’t be saved. Try again.',
        error_ABORTED: 'The request was cancelled.', error_UNAVAILABLE: 'Settings are unavailable right now. Try again later.',
        error_NOT_FOUND: 'The settings service is missing. Refresh the page.',
        error_REQUEST_TOO_LARGE: 'The settings are too large. Shorten the system prompt and try again.',
        error_UNSUPPORTED_MEDIA_TYPE: 'The request format is invalid. Refresh the page.',
        error_SETTINGS_FAILED: 'Something went wrong. Try again.',
        warning_POLICY_UNAVAILABLE: 'These settings couldn’t be applied, so messages are blocked. Adjust them and click “Apply”.',
        warning_BASE_MODE_UNAVAILABLE: 'The base mode couldn’t be loaded, so messages are blocked. Reload, or start a new conversation with another base mode.',
      },
      zh: {
        settings: '自定义设置', title: '自定义模式设置', close: '关闭', cancel: '取消',
        loading: '加载中…', notLoaded: '无法加载设置。',
        baseTitle: '基础模式', baseLabel: '基于',
        baseHelp: '自定义模式会沿用此模式的工具、技能和插件，再叠加下方的设置。',
        baseLocked: '对话开始后无法更换基础模式。如需使用其他模式，请新建对话。',
        baseUnavailable: '{name}（不可用）', baseMissing: '{name}不可用，请换一个基础模式。',
        baseDescribing: '正在读取此模式的工具…',
        promptTitle: '系统提示词', override: '使用自定义系统提示词',
        promptHelp: '替换基础模式的系统提示词。留空则不发送系统提示词。',
        promptVariables: '变量说明', promptVariablesTitle: '提示词变量',
        promptVariablesBuiltins: '内置变量：{{model}} 表示模型名称，{{provider}} 表示模型提供商。其他插件注册的变量也可以使用。',
        promptVariablesSyntax: '变量写作 {{name}}，花括号内不留空格。变量名以小写字母开头，只能包含小写字母、数字和下划线。',
        promptVariablesFailure: '变量会在发送消息时替换。如果包含未定义或格式错误的变量，消息将无法发送。',
        fillDefaultPrompt: '填入默认提示词', confirmOverwriteTitle: '替换当前提示词？',
        confirmOverwritePrompt: '提示词框中的内容将被替换为基础模式的默认提示词。',
        replace: '替换',
        contextTitle: '附加信息', runtimeContext: '附加环境信息', timeContext: '附加当前时间',
        contextHelp: '仅对之后的消息生效，已有消息不受影响。',
        toolsTitle: '工具', allTools: '使用基础模式的全部工具', selectedTools: '仅使用勾选的工具',
        allToolsHelp: '基础模式之后新增的工具会自动启用。',
        selectedToolsHelp: '之后新增的工具默认关闭，勾选后才会启用。',
        selectAll: '全选', selectNone: '全部取消', selectedCount: '已选 {count} / {total}',
        search: '搜索工具', noMatch: '没有匹配的工具。', noTools: '此模式没有可选择的工具。',
        unknownTools: '以下已勾选的工具在此模式中不存在：{names}。切换回原模式时仍会保留。',
        save: '应用', saving: '应用中…', reload: '重新加载',
        saveHelp: '从下一条消息开始对当前对话生效。',
        running: '正在回复中，修改将从下一条消息开始生效。',
        stale: '设置已在其他地方修改，请重新加载后继续。',
        presetsButton: '预设管理', presetsTitle: '预设管理',
        presetsIntro: '把当前设置保存为预设，或把已保存的预设载入设置窗口。',
        presetSaveTitle: '保存当前设置', presetName: '标题', presetNote: '备注（可选）',
        presetNamePlaceholder: '例如：代码审查', presetNotePlaceholder: '这个预设用来做什么？',
        presetSave: '保存', presetSaving: '保存中…', presetSaved: '已保存「{title}」。',
        presetListTitle: '已保存的预设', presetEmpty: '还没有预设。',
        presetLoad: '载入', presetDelete: '删除', presetMakeDefault: '设为默认', presetUnsetDefault: '取消默认',
        presetDefaultBadge: '默认', presetBase: '基于：{name}', presetUpdated: '更新于 {time}',
        presetDefaultHelp: '新建的自定义模式对话会使用默认预设。未设置默认预设时，使用标准模式的设置。',
        presetLoadHint: '载入后会填入设置窗口，点击「应用」后生效。',
        presetLoaded: '已载入「{title}」，点击「应用」后在当前对话生效。',
        presetBaseKept: '已载入「{title}」。当前对话已经开始，因此未采用其基础模式「{name}」。',
        confirmReplaceTitle: '覆盖「{title}」？',
        confirmReplaceMessage: '已有同名预设。它的设置和备注将被替换。',
        confirmDeleteTitle: '删除「{title}」？',
        confirmDeleteMessage: '该预设将被删除，已经使用其设置的对话不受影响。',
        confirmDeleteDefault: '这是默认预设。删除后，新对话将使用标准模式的设置。',
        delete: '删除',
        error_NETWORK: '无法连接到 DSH，请检查连接后重试。',
        error_PROTOCOL: 'DSH 返回了无法识别的响应，请刷新页面后重试。',
        error_FORBIDDEN: '你没有修改这些设置的权限。', error_UNAUTHORIZED: '登录状态已失效，请重新连接后重试。',
        error_WRONG_PRESET: '当前对话已不是自定义模式。',
        error_SESSION_NOT_FOUND: '对话已关闭，请重新打开后重试。',
        error_ROOT_SESSION_REQUIRED: '只能在主对话中修改设置。',
        error_SESSION_CHANGED: '对话状态已变化，请重新打开设置后重试。',
        error_HUMAN_ONLY: 'Agent 无法修改这些设置。',
        error_BUSY: '另一项修改仍在应用，请稍后再试。',
        error_REVISION_CONFLICT: '设置已在其他地方修改，请重新加载后重试。',
        error_BASE_LOCKED: '对话开始后无法更换基础模式。',
        error_BASE_MODE_UNAVAILABLE: '无法加载此基础模式，请换一个。',
        error_PREVIEW_FAILED: '无法读取此模式的提示词和工具。',
        error_POLICY_UNAVAILABLE: '这些设置未能生效，请调整后重试。',
        error_INVALID_REQUEST: '部分设置无效，请重新加载后重试。',
        error_COMMIT_FAILED: '设置未能保存，请重试。',
        error_PRESET_EXISTS: '已有同名预设。',
        error_PRESET_NOT_FOUND: '该预设已不存在。',
        error_PRESETS_FULL: '预设数量已达上限，请删除一些后重试。',
        error_PRESETS_SAVE_FAILED: '预设未能保存，请重试。',
        error_ABORTED: '操作已取消。', error_UNAVAILABLE: '设置暂时不可用，请稍后再试。',
        error_NOT_FOUND: '找不到设置服务，请刷新页面。',
        error_REQUEST_TOO_LARGE: '设置内容过大，请缩短系统提示词后重试。',
        error_UNSUPPORTED_MEDIA_TYPE: '请求格式无效，请刷新页面。',
        error_SETTINGS_FAILED: '操作失败，请重试。',
        warning_POLICY_UNAVAILABLE: '这些设置未能生效，消息暂时无法发送。请调整设置后点击「应用」。',
        warning_BASE_MODE_UNAVAILABLE: '无法加载基础模式，消息暂时无法发送。请重新加载，或新建对话并选择其他基础模式。',
      }
    };

    const css = `
.dshcm-trigger{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border:0;border-radius:8px;padding:5px 8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dshcm-trigger:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-dialog{box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;overflow:hidden}
.dshcm-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent)}
.dshcm-dialog[data-size=small]{width:min(460px,calc(100vw - 32px))}
.dshcm-dialog[data-size=medium]{width:min(640px,calc(100vw - 32px))}
.dshcm-layout{display:flex;flex-direction:column;max-height:calc(100dvh - 42px)}
.dshcm-header,.dshcm-footer{flex:none;padding:16px 22px;display:flex;align-items:center;gap:12px}
.dshcm-header{border-bottom:1px solid var(--dsw-alias-border-l1);justify-content:space-between}
.dshcm-header h2{margin:0;font-size:18px;font-weight:600}
.dshcm-body{padding:18px 22px;overflow:auto;min-height:0}
.dshcm-body p{margin:0 0 10px}.dshcm-body p:last-child{margin-bottom:0}
.dshcm-footer{border-top:1px solid var(--dsw-alias-border-l1);justify-content:flex-end;flex-wrap:wrap}
.dshcm-footer-start{margin-right:auto;display:flex;gap:8px}
.dshcm-section{border:0;padding:0;margin:0 0 22px;min-width:0}
.dshcm-section:last-child{margin-bottom:0}.dshcm-section legend,.dshcm-subtitle{font-size:15px;font-weight:600;margin:0 0 10px;padding:0}
.dshcm-row{display:flex;gap:9px;align-items:center;margin:8px 0;cursor:pointer}
.dshcm-help{color:var(--dsw-alias-label-secondary);font-size:12px;margin:8px 0}
.dshcm-help-link{border:0;padding:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.dshcm-help-link:hover{color:var(--dsw-alias-brand-primary)}
.dshcm-notice{border-radius:8px;padding:9px 12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;margin:10px 0}
.dshcm-notice[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
.dshcm-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.dshcm-dialog input[type=checkbox],.dshcm-dialog input[type=radio]{accent-color:var(--dsw-alias-brand-primary);width:16px;height:16px;flex:none;margin:0}
.dshcm-dialog textarea,.dshcm-input,.dshcm-select{box-sizing:border-box;width:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;font:inherit;font-size:13px}
.dshcm-select{width:auto;min-width:220px;max-width:100%}
.dshcm-prompt{min-height:150px;max-height:340px;resize:vertical;font-family:ui-monospace,monospace!important;line-height:1.6!important}
.dshcm-note{min-height:64px;resize:vertical}
.dshcm-dialog textarea:disabled{opacity:.55}.dshcm-input{margin:0}
.dshcm-field{display:flex;flex-direction:column;gap:6px;margin:0 0 12px;font-size:13px}
.dshcm-field-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dshcm-button{font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.dshcm-button[data-primary=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}
.dshcm-button[data-danger=true]{color:var(--dsw-alias-state-error-primary)}
.dshcm-button:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-dialog button:disabled{opacity:.5;cursor:not-allowed}
.dshcm-dialog :focus-visible,.dshcm-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshcm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.dshcm-list{max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);margin:0;padding:0;list-style:none}
.dshcm-tool{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;overflow-wrap:anywhere}
.dshcm-tool:last-child,.dshcm-preset:last-child{border-bottom:0}.dshcm-tool:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-tool input{margin-top:3px!important}.dshcm-tool code{font-size:12px}.dshcm-tool small{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dshcm-preset{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshcm-preset-main{min-width:0;flex:1}
.dshcm-preset-title{font-weight:600;overflow-wrap:anywhere;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dshcm-preset-note{margin:4px 0 0;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.dshcm-preset-meta{margin:4px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dshcm-preset-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:none;max-width:55%}
.dshcm-badge{font-size:11px;font-weight:600;border-radius:999px;padding:1px 8px;border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dshcm-divider{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:18px 0}
@media(max-width:520px){.dshcm-header,.dshcm-footer,.dshcm-body{padding:14px}.dshcm-prompt{min-height:120px}.dshcm-preset{flex-direction:column}.dshcm-preset-actions{max-width:none;justify-content:flex-start}}
`;

    function SettingsError(code) {
      return Object.assign(new Error(code), { code });
    }

    function errorCode(error) {
      if (error?.name === 'AbortError') return 'ABORTED';
      if (typeof error?.code === 'string' && Object.hasOwn(dictionaries.en, 'error_' + error.code)) return error.code;
      return 'NETWORK';
    }

    // ---- Response validation -------------------------------------------------

    const isString = value => typeof value === 'string';
    const isNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

    function readConfig(config) {
      if (!config || !isString(config.baseMode) || typeof config.overridePrompt !== 'boolean' || !isString(config.prompt) ||
          !(config.allowedTools === null || (Array.isArray(config.allowedTools) && config.allowedTools.every(isString))) ||
          typeof config.includeRuntimeContext !== 'boolean' || typeof config.includeTimeContext !== 'boolean') throw SettingsError('PROTOCOL');
      return {
        baseMode: config.baseMode, overridePrompt: config.overridePrompt, prompt: config.prompt,
        allowedTools: config.allowedTools === null ? null : [...config.allowedTools],
        includeRuntimeContext: config.includeRuntimeContext, includeTimeContext: config.includeTimeContext,
      };
    }

    function readCatalog(data) {
      if (!isString(data?.template) || !Array.isArray(data.tools) ||
          !data.tools.every(tool => isString(tool?.name) && isString(tool.description))) throw SettingsError('PROTOCOL');
      return { template: data.template, tools: data.tools.map(({ name, description }) => ({ name, description })) };
    }

    function readSnapshot(data) {
      if (data?.protocol !== PROTOCOL || !isNonNegativeInteger(data.revision) || typeof data.baseLocked !== 'boolean' ||
          !Array.isArray(data.warnings) || !data.warnings.every(warning => isString(warning?.code) && Object.hasOwn(dictionaries.en, 'warning_' + warning.code))) {
        throw SettingsError('PROTOCOL');
      }
      return { revision: data.revision, config: readConfig(data.config), baseLocked: data.baseLocked, warnings: data.warnings.map(warning => warning.code) };
    }

    function readSettings(data) {
      const snapshot = readSnapshot(data);
      if (!Array.isArray(data.bases) || !data.bases.every(base => isString(base?.id) && typeof base.available === 'boolean' &&
          (base.name === undefined || isString(base.name)) && (base.description === undefined || isString(base.description)))) {
        throw SettingsError('PROTOCOL');
      }
      return {
        ...snapshot,
        bases: data.bases.map(({ id, name, description, available }) => ({ id, name, description, available })),
        catalog: data.catalog === null ? null : readCatalog(data.catalog),
      };
    }

    function readPresets(data) {
      if (data?.protocol !== PROTOCOL || !(data.defaultTitle === null || isString(data.defaultTitle)) || !Array.isArray(data.presets) ||
          !data.presets.every(preset => isString(preset?.title) && isString(preset.note) && isNonNegativeInteger(preset.updatedAt))) {
        throw SettingsError('PROTOCOL');
      }
      return {
        defaultTitle: data.defaultTitle,
        presets: data.presets.map(preset => ({ title: preset.title, note: preset.note, updatedAt: preset.updatedAt, config: readConfig(preset.config) })),
      };
    }

    const readers = {
      'get': readSettings,
      'set': readSnapshot,
      'describe-base': data => {
        if (data?.protocol !== PROTOCOL || !isString(data.baseMode)) throw SettingsError('PROTOCOL');
        return { baseMode: data.baseMode, ...readCatalog(data) };
      },
      'list-presets': readPresets,
      'save-preset': readPresets,
      'delete-preset': readPresets,
      'set-default-preset': readPresets,
    };

    async function requestSettings(ctx, sessionId, request, signal) {
      const reply = await ctx.connection.rpc.call('/api', 'customize-mode-settings', {sessionId, request}, signal);
      if (reply?.ok !== true) {
        const code = reply?.error?.code;
        if (!isString(code) || !Object.hasOwn(dictionaries.en, 'error_' + code)) throw SettingsError('PROTOCOL');
        throw SettingsError(code);
      }
      return readers[request.action](reply.value);
    }

    // ---- Shared helpers ------------------------------------------------------

    function useLatest(value) {
      const ref = React.useRef(value);
      ref.current = value;
      return ref;
    }

    /** Requests owned by one component; starting another or unmounting cancels the previous one. */
    function useRequests() {
      const pending = React.useRef(null);
      React.useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
      return React.useMemo(() => ({
        get busy() { return pending.current !== null; },
        cancel() { pending.current?.abort(); pending.current = null; },
        async run(operation, { onSuccess, onError, onSettled }) {
          pending.current?.abort();
          const controller = new AbortController();
          pending.current = controller;
          try {
            const value = await operation(controller.signal);
            if (pending.current === controller) onSuccess(value);
          } catch (error) {
            if (pending.current === controller) onError(errorCode(error));
          } finally {
            if (pending.current === controller) {
              pending.current = null;
              onSettled?.();
            }
          }
        },
      }), []);
    }

    function baseName(locale, bases, id) {
      const row = bases.find(base => base.id === id);
      return row?.name ?? (BUILT_IN_NAMES[locale] ?? BUILT_IN_NAMES.en)[id] ?? BUILT_IN_NAMES.en[id] ?? id;
    }

    function formatTime(locale, value) {
      try { return new Intl.DateTimeFormat(locale, {dateStyle:'medium', timeStyle:'short'}).format(value); }
      catch { return new Date(value).toISOString(); }
    }

    // ---- Settings state ------------------------------------------------------

    function useSettings(ctx, sessionId, source) {
      const projection = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot) ?? EMPTY_PROJECTION;
      const [open, setOpen] = React.useState(false);
      const [settings, setSettings] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [catalogs, setCatalogs] = React.useState({});
      const [operation, setOperation] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const requests = useRequests();
      const describing = React.useRef(new Map());
      const isOpen = React.useRef(false);

      React.useEffect(() => () => {
        isOpen.current = false;
        for (const controller of describing.current.values()) controller.abort();
        describing.current.clear();
      }, [sessionId]);

      function describe(baseMode) {
        if (catalogs[baseMode] !== undefined || describing.current.has(baseMode)) return;
        const controller = new AbortController();
        describing.current.set(baseMode, controller);
        requestSettings(ctx, sessionId, {action:'describe-base', baseMode}, controller.signal).then(
          catalog => { if (isOpen.current) setCatalogs(previous => ({...previous, [baseMode]: catalog})); },
          error => { if (isOpen.current && !controller.signal.aborted) setCatalogs(previous => ({...previous, [baseMode]: {error: errorCode(error)}})); },
        ).finally(() => { if (describing.current.get(baseMode) === controller) describing.current.delete(baseMode); });
      }

      function load() {
        setOperation('loading');
        setFailure(null);
        setNotice(null);
        void requests.run(signal => requestSettings(ctx, sessionId, {action:'get'}, signal), {
          onSuccess: next => {
            if (!isOpen.current) return;
            setSettings(next);
            setDraft(next.config);
            setCatalogs({[next.config.baseMode]: next.catalog ?? {error:'BASE_MODE_UNAVAILABLE'}});
          },
          onError: code => { if (isOpen.current) setFailure(code); },
          onSettled: () => setOperation(null),
        });
      }
      function show() {
        isOpen.current = true;
        setOpen(true);
        setSettings(null);
        setDraft(null);
        load();
      }
      function close() {
        if (!isOpen.current) return;
        isOpen.current = false;
        requests.cancel();
        for (const controller of describing.current.values()) controller.abort();
        describing.current.clear();
        setOpen(false);
        setOperation(null);
        setSettings(null);
        setDraft(null);
        setCatalogs({});
        setFailure(null);
        setNotice(null);
      }
      function change(key, value) {
        if (requests.busy) return;
        setDraft(previous => previous && ({...previous, [key]: value}));
        setFailure(null);
        setNotice(null);
        if (key === 'baseMode') describe(value);
      }
      /** Replace the whole draft from a preset; a started conversation keeps its base mode. */
      function loadPreset(preset) {
        if (!settings || requests.busy) return;
        const config = settings.baseLocked ? {...preset.config, baseMode: settings.config.baseMode} : preset.config;
        setDraft(config);
        setFailure(null);
        setNotice(settings.baseLocked && preset.config.baseMode !== settings.config.baseMode ?
          {key:'presetBaseKept', params:{title:preset.title, baseMode:preset.config.baseMode}} : {key:'presetLoaded', params:{title:preset.title}});
        describe(config.baseMode);
      }
      const stale = !!settings && projection.revision > settings.revision;
      function save() {
        if (!settings || !draft || requests.busy || stale) return;
        setOperation('saving');
        setFailure(null);
        void requests.run(signal => requestSettings(ctx, sessionId, {action:'set', expectedRevision:settings.revision, config:draft}, signal), {
          onSuccess: () => {
            if (!isOpen.current) return;
            close();
            Promise.resolve().then(() => ctx.sessions.refreshProjections(sessionId)).catch(() => {});
          },
          onError: code => { if (isOpen.current) setFailure(code); },
          onSettled: () => setOperation(null),
        });
      }
      const catalog = draft ? catalogs[draft.baseMode] : undefined;
      return {open, settings, draft, catalog, operation, failure, notice, stale, show, close, change, save, loadPreset,
        reload: () => { if (isOpen.current && !requests.busy) load(); }};
    }

    // ---- Components ----------------------------------------------------------

    function Button({children, primary, danger, ...props}) {
      return h('button', {type:'button', className:'dshcm-button', 'data-primary':primary || undefined, 'data-danger':danger || undefined, ...props}, children);
    }

    function Toggle({label, ...props}) {
      return h('label', {className:'dshcm-row'}, h('input', {type:'checkbox', ...props}), label);
    }

    /**
     * Nested modal. It opens on mount, closes on unmount, and returns focus to
     * its trigger; Escape and the native close event dismiss only this layer.
     */
    function Modal({id, title, size, role, describedBy, trigger, onDismiss, children, footer}) {
      const dialog = React.useRef(null);
      const dismiss = useLatest(onDismiss);
      React.useEffect(() => {
        const element = dialog.current;
        element.showModal();
        return () => {
          if (element.open) element.close();
          if (trigger?.current?.isConnected) trigger.current.focus();
        };
      }, []);
      return h('dialog', {ref:dialog, className:'dshcm-dialog', 'data-size':size, role, 'aria-labelledby':id + '-title', 'aria-describedby':describedBy,
        onCancel:event => {event.preventDefault(); event.stopPropagation(); dismiss.current();},
        onClose:event => {event.stopPropagation(); dismiss.current();}, onKeyDown:event => event.stopPropagation()},
        h('div', {className:'dshcm-layout'},
          h('header', {className:'dshcm-header'}, h('h2', {id:id + '-title'}, title)),
          h('div', {className:'dshcm-body', id:id + '-body'}, children),
          h('footer', {className:'dshcm-footer'}, footer)));
    }

    function ConfirmDialog({t, id, title, messages, confirmLabel, danger, trigger, onConfirm, onCancel}) {
      return h(Modal, {id, title, size:'small', role:'alertdialog', describedBy:id + '-body', trigger, onDismiss:onCancel,
        footer:[
          h(Button, {key:'cancel', onClick:onCancel, autoFocus:true}, t('cancel')),
          h(Button, {key:'confirm', onClick:onConfirm, primary:!danger, danger}, confirmLabel),
        ]}, messages.map(message => h('p', {key:message}, message)));
    }

    function BaseSection({model, t, locale, id}) {
      const {settings, draft, catalog} = model;
      const bases = settings.bases;
      const current = bases.find(base => base.id === draft.baseMode);
      const options = current ? bases : [...bases, {id:draft.baseMode, available:false}];
      const name = baseId => baseName(locale, bases, baseId);
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('baseTitle')),
        h('div', {className:'dshcm-field-row'},
          h('label', {htmlFor:id}, t('baseLabel')),
          h('select', {id, className:'dshcm-select', value:draft.baseMode, disabled:settings.baseLocked, 'aria-describedby':id + '-help',
            onChange:event => model.change('baseMode', event.target.value)},
            options.map(base => h('option', {key:base.id, value:base.id, disabled:!base.available && base.id !== draft.baseMode},
              base.available ? name(base.id) : t('baseUnavailable', {name:name(base.id)}))))),
        h('p', {className:'dshcm-help', id:id + '-help'}, t(settings.baseLocked ? 'baseLocked' : 'baseHelp')),
        current?.available === false || !current ? h('p', {className:'dshcm-notice', 'data-tone':'warn', role:'status'}, t('baseMissing', {name:name(draft.baseMode)})) :
          catalog === undefined ? h('p', {className:'dshcm-help', role:'status'}, t('baseDescribing')) :
          catalog.error ? h('p', {className:'dshcm-error', role:'alert'}, t('error_' + catalog.error)) : null);
    }

    function PromptSection({model, t, id}) {
      const {draft, catalog} = model;
      const template = catalog && !catalog.error ? catalog.template : '';
      const [confirming, setConfirming] = React.useState(false);
      const [showVariables, setShowVariables] = React.useState(false);
      const fillButton = React.useRef(null);
      const variablesButton = React.useRef(null);
      React.useEffect(() => { setConfirming(false); setShowVariables(false); }, [model.settings, model.operation]);
      const canFill = draft.overridePrompt && !model.operation && !!template;
      function fill() {
        if (!canFill) return;
        if (draft.prompt.length > 0) setConfirming(true);
        else model.change('prompt', template);
      }
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('promptTitle')),
        h(Toggle, {label:t('override'), checked:draft.overridePrompt, onChange:event => model.change('overridePrompt', event.target.checked)}),
        h('p', {className:'dshcm-help', id:id + '-help'}, t('promptHelp'), ' ',
          h('button', {type:'button', className:'dshcm-help-link', ref:variablesButton,
            'aria-haspopup':'dialog', onClick:() => { if (!model.operation) setShowVariables(true); }}, t('promptVariables'))),
        showVariables && h(Modal, {id:id + '-variables', title:t('promptVariablesTitle'), size:'medium', trigger:variablesButton,
          onDismiss:() => setShowVariables(false), footer:h(Button, {onClick:() => setShowVariables(false), autoFocus:true}, t('close'))},
          ['promptVariablesBuiltins', 'promptVariablesSyntax', 'promptVariablesFailure'].map(key => h('p', {key}, t(key)))),
        h('textarea', {
          className:'dshcm-prompt', 'aria-label':t('promptTitle'), 'aria-describedby':id + '-help',
          value:draft.prompt, placeholder:template, disabled:!draft.overridePrompt,
          spellCheck:false, onChange:event => model.change('prompt', event.target.value)
        }),
        h('div', {className:'dshcm-actions'},
          h('button', {type:'button', className:'dshcm-button', ref:fillButton, disabled:!canFill,
            'aria-haspopup':'dialog', onClick:fill}, t('fillDefaultPrompt'))),
        confirming && canFill && h(ConfirmDialog, {t, id:id + '-overwrite', trigger:fillButton,
          title:t('confirmOverwriteTitle'), messages:[t('confirmOverwritePrompt')], confirmLabel:t('replace'),
          onCancel:() => setConfirming(false),
          onConfirm:() => { model.change('prompt', template); setConfirming(false); }}));
    }

    function ContextSection({model, t}) {
      const {draft} = model;
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('contextTitle')),
        h(Toggle, {label:t('runtimeContext'), checked:draft.includeRuntimeContext, onChange:event => model.change('includeRuntimeContext', event.target.checked)}),
        h(Toggle, {label:t('timeContext'), checked:draft.includeTimeContext, onChange:event => model.change('includeTimeContext', event.target.checked)}),
        h('p', {className:'dshcm-help'}, t('contextHelp')));
    }

    function ToolsSection({model, t, id}) {
      const [query, setQuery] = React.useState('');
      const {draft, catalog} = model;
      const tools = catalog && !catalog.error ? catalog.tools : [];
      const names = new Set(tools.map(tool => tool.name));
      const chosen = new Set(draft.allowedTools ?? names);
      // Names this base does not offer are kept, so switching the base back restores them.
      const foreign = draft.allowedTools ? draft.allowedTools.filter(name => !names.has(name)) : [];
      const count = tools.filter(tool => chosen.has(tool.name)).length;
      const needle = query.trim().toLowerCase();
      const filtered = tools.filter(tool => (tool.name + ' ' + tool.description).toLowerCase().includes(needle));
      const ready = !!catalog && !catalog.error;
      function setTools(next) { model.change('allowedTools', [...foreign, ...next]); }
      function toggle(name, checked) {
        setTools(tools.map(tool => tool.name).filter(tool => tool === name ? checked : chosen.has(tool)));
      }
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation || !ready},
        h('legend', null, t('toolsTitle')),
        h('label', {className:'dshcm-row'}, h('input', {type:'radio', name:id, checked:draft.allowedTools === null,
          onChange:() => model.change('allowedTools', null)}), t('allTools')),
        h('label', {className:'dshcm-row'}, h('input', {type:'radio', name:id, checked:draft.allowedTools !== null,
          onChange:() => model.change('allowedTools', tools.map(tool => tool.name))}), t('selectedTools')),
        h('p', {className:'dshcm-help'}, t(draft.allowedTools === null ? 'allToolsHelp' : 'selectedToolsHelp')),
        draft.allowedTools !== null && h(React.Fragment, null,
          h('div', {className:'dshcm-actions'},
            h(Button, {onClick:() => setTools(tools.map(tool => tool.name))}, t('selectAll')),
            h(Button, {onClick:() => setTools([])}, t('selectNone')),
            h('span', {className:'dshcm-help', role:'status'}, t('selectedCount', {count, total:tools.length}))),
          foreign.length > 0 && h('p', {className:'dshcm-help'}, t('unknownTools', {names:foreign.join(', ')}))),
        h('input', {type:'search', className:'dshcm-input', 'aria-label':t('search'), placeholder:t('search'), value:query,
          onChange:event => setQuery(event.target.value), style:{margin:'8px 0'}}),
        h('div', {className:'dshcm-list'}, !ready ? null : tools.length === 0 ? h('p', {className:'dshcm-help', style:{padding:'0 12px'}}, t('noTools')) :
          filtered.length ? filtered.map(tool =>
            h('label', {key:tool.name, className:'dshcm-tool', title:tool.description},
              h('input', {type:'checkbox', checked:chosen.has(tool.name), disabled:draft.allowedTools === null,
                onChange:event => toggle(tool.name, event.target.checked)}),
              h('span', null, h('code', null, tool.name), h('small', null, tool.description)))) :
          h('p', {className:'dshcm-help', style:{padding:'0 12px'}}, t('noMatch'))));
    }

    /** Save, list, load, delete, and choose the default preset. */
    function PresetManager({ctx, sessionId, model, t, locale, id, trigger, onDismiss}) {
      const [store, setStore] = React.useState(null);
      const [title, setTitle] = React.useState('');
      const [note, setNote] = React.useState('');
      const [busy, setBusy] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [status, setStatus] = React.useState(null);
      const [confirm, setConfirm] = React.useState(null);
      const requests = useRequests();
      const saveButton = React.useRef(null);
      const deleteButtons = React.useRef(new Map());
      const bases = model.settings.bases;

      function send(kind, request, onSuccess) {
        setBusy(kind);
        setFailure(null);
        setStatus(null);
        return requests.run(signal => requestSettings(ctx, sessionId, request, signal), {
          onSuccess: value => { setStore(value); onSuccess?.(value); },
          onError: setFailure,
          onSettled: () => setBusy(null),
        });
      }
      React.useEffect(() => { void send('loading', {action:'list-presets'}); }, []);

      const trimmed = title.normalize('NFC').trim();
      const existing = store?.presets.find(preset => preset.title === trimmed);
      function save(overwrite) {
        if (!trimmed || busy) return;
        setConfirm(null);
        void send('saving', {action:'save-preset', title:trimmed, note, config:model.draft, overwrite}, () => {
          setStatus(t('presetSaved', {title:trimmed}));
        });
      }
      function requestSave() {
        if (!trimmed || busy) return;
        if (existing) setConfirm({kind:'replace', title:trimmed});
        else save(false);
      }
      function remove(preset) {
        setConfirm(null);
        void send('deleting', {action:'delete-preset', title:preset.title});
      }
      function load(preset) {
        if (busy) return;
        model.loadPreset(preset);
        onDismiss();
      }
      const name = baseId => baseName(locale, bases, baseId);

      return h(Modal, {id, title:t('presetsTitle'), size:'medium', trigger, onDismiss,
        footer:h(Button, {onClick:onDismiss, autoFocus:true}, t('close'))},
        h('p', {className:'dshcm-help', style:{marginTop:0}}, t('presetsIntro')),
        h('form', {onSubmit:event => { event.preventDefault(); requestSave(); }},
          h('h3', {className:'dshcm-subtitle'}, t('presetSaveTitle')),
          h('label', {className:'dshcm-field'}, t('presetName'),
            h('input', {className:'dshcm-input', value:title, maxLength:MAX_TITLE_LENGTH, placeholder:t('presetNamePlaceholder'),
              disabled:!!busy, onChange:event => { setTitle(event.target.value); setStatus(null); setFailure(null); }})),
          h('label', {className:'dshcm-field'}, t('presetNote'),
            h('textarea', {className:'dshcm-input dshcm-note', value:note, maxLength:MAX_NOTE_LENGTH, placeholder:t('presetNotePlaceholder'),
              disabled:!!busy, onChange:event => { setNote(event.target.value); setStatus(null); }})),
          h('div', {className:'dshcm-actions'},
            h('button', {type:'submit', className:'dshcm-button', 'data-primary':true, ref:saveButton, disabled:!trimmed || !!busy || !store},
              t(busy === 'saving' ? 'presetSaving' : 'presetSave')))),
        status && h('p', {className:'dshcm-notice', role:'status'}, status),
        failure && h('p', {className:'dshcm-error', role:'alert'}, t('error_' + failure)),
        h('hr', {className:'dshcm-divider'}),
        h('h3', {className:'dshcm-subtitle'}, t('presetListTitle')),
        h('p', {className:'dshcm-help'}, t('presetDefaultHelp'), ' ', t('presetLoadHint')),
        !store ? h('p', {className:'dshcm-help', role:'status'}, busy === 'loading' ? t('loading') : null) :
          store.presets.length === 0 ? h('p', {className:'dshcm-help'}, t('presetEmpty')) :
          h('ul', {className:'dshcm-list', 'aria-busy':!!busy},
            store.presets.map(preset => {
              const isDefault = store.defaultTitle === preset.title;
              return h('li', {key:preset.title, className:'dshcm-preset'},
                h('div', {className:'dshcm-preset-main'},
                  h('div', {className:'dshcm-preset-title'}, preset.title, isDefault && h('span', {className:'dshcm-badge'}, t('presetDefaultBadge'))),
                  preset.note && h('p', {className:'dshcm-preset-note'}, preset.note),
                  h('p', {className:'dshcm-preset-meta'}, t('presetBase', {name:name(preset.config.baseMode)}), ' · ',
                    t('presetUpdated', {time:formatTime(locale, preset.updatedAt)}))),
                h('div', {className:'dshcm-preset-actions'},
                  h(Button, {primary:true, disabled:!!busy, onClick:() => load(preset), 'aria-label':t('presetLoad') + ' ' + preset.title}, t('presetLoad')),
                  h(Button, {disabled:!!busy, onClick:() => void send('defaulting', {action:'set-default-preset', title:isDefault ? null : preset.title})},
                    t(isDefault ? 'presetUnsetDefault' : 'presetMakeDefault')),
                  h('button', {type:'button', className:'dshcm-button', 'data-danger':true, disabled:!!busy,
                    ref:element => { if (element) deleteButtons.current.set(preset.title, element); else deleteButtons.current.delete(preset.title); },
                    onClick:() => setConfirm({kind:'delete', title:preset.title, isDefault})}, t('presetDelete'))));
            })),
        confirm?.kind === 'replace' && h(ConfirmDialog, {t, id:id + '-replace', trigger:saveButton,
          title:t('confirmReplaceTitle', {title:confirm.title}), messages:[t('confirmReplaceMessage')], confirmLabel:t('replace'),
          onCancel:() => setConfirm(null), onConfirm:() => save(true)}),
        confirm?.kind === 'delete' && h(ConfirmDialog, {t, id:id + '-delete', danger:true,
          trigger:{get current() { return deleteButtons.current.get(confirm.title) ?? saveButton.current; }},
          title:t('confirmDeleteTitle', {title:confirm.title}),
          messages:confirm.isDefault ? [t('confirmDeleteMessage'), t('confirmDeleteDefault')] : [t('confirmDeleteMessage')], confirmLabel:t('delete'),
          onCancel:() => setConfirm(null), onConfirm:() => remove(confirm)}));
    }

    function Icon() {
      return h('svg', {width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, 'aria-hidden':true},
        h('path', {d:'M3 6h18M3 12h18M3 18h18'}),
        ...[[8,6],[16,12],[10,18]].map(([cx, cy]) => h('circle', {key:cy, cx, cy, r:2.5, fill:'var(--dsw-alias-bg-layer-1)'})));
    }

    function createSettingsControl(ctx) {
      const subscribeLocale = listener => ctx.locale.subscribe(listener);
      const readLocale = () => ctx.locale.getSnapshot().active;
      return function SettingsControl({sessionId, t, source, useSession}) {
        const model = useSettings(ctx, sessionId, source);
        const running = useSession(session => session?.running === true);
        const locale = React.useSyncExternalStore(subscribeLocale, readLocale);
        const id = React.useId();
        const dialog = React.useRef(null);
        const trigger = React.useRef(null);
        const presetsButton = React.useRef(null);
        const wasOpen = React.useRef(false);
        const [managing, setManaging] = React.useState(false);
        React.useEffect(() => {
          const element = dialog.current;
          if (model.open) {
            if (element && !element.open) element.showModal();
          } else {
            setManaging(false);
            if (element?.open) element.close();
            if (wasOpen.current && trigger.current?.isConnected) trigger.current.focus();
          }
          wasOpen.current = model.open;
        }, [model.open]);
        React.useEffect(() => {
          const element = dialog.current;
          return () => { if (element?.open) element.close(); };
        }, []);
        const ready = !!model.draft;
        const lang = String(locale).toLowerCase().startsWith('zh') ? 'zh' : 'en';
        const notice = model.notice && t(model.notice.key, model.notice.params.baseMode === undefined ? model.notice.params :
          {...model.notice.params, name:baseName(lang, model.settings.bases, model.notice.params.baseMode)});
        return h(React.Fragment, null,
          h('style', null, css),
          h('button', {ref:trigger, type:'button', className:'dshcm-trigger', 'aria-haspopup':'dialog',
            'aria-expanded':model.open, 'aria-controls':id, onClick:model.show}, h(Icon), t('settings')),
          h('dialog', {ref:dialog, id, className:'dshcm-dialog', 'aria-labelledby':id + '-title',
            onCancel:event => {event.preventDefault(); model.close();}, onClose:model.close, onKeyDown:event => event.stopPropagation()},
            model.open && h('div', {className:'dshcm-layout'},
              h('header', {className:'dshcm-header'}, h('h2', {id:id + '-title'}, t('title')),
                h(Button, {onClick:model.close, autoFocus:true}, t('close'))),
              h('div', {className:'dshcm-body', 'aria-busy':!!model.operation},
                !ready && h('p', {role:'status'}, t(model.operation === 'loading' ? 'loading' : 'notLoaded')),
                ready && h(React.Fragment, null,
                  ...model.settings.warnings.map(code => h('p', {key:code, className:'dshcm-notice', 'data-tone':'warn', role:'status'}, t('warning_' + code))),
                  h(BaseSection, {model, t, locale:lang, id:id + '-base'}),
                  h(PromptSection, {model, t, id:id + '-prompt'}),
                  h(ContextSection, {model, t}),
                  h(ToolsSection, {model, t, id:id + '-tools'})),
                running && h('p', {className:'dshcm-notice', role:'status'}, t('running')),
                model.stale && h('p', {className:'dshcm-notice', role:'alert'}, t('stale')),
                notice && h('p', {className:'dshcm-notice', role:'status'}, notice),
                model.failure && h('p', {className:'dshcm-error', role:'alert'}, t('error_' + model.failure))),
              h('footer', {className:'dshcm-footer'},
                h('div', {className:'dshcm-footer-start'},
                  h('button', {type:'button', className:'dshcm-button', ref:presetsButton, 'aria-haspopup':'dialog',
                    disabled:!ready || !!model.operation, onClick:() => setManaging(true)}, t('presetsButton'))),
                h(Button, {onClick:model.reload, disabled:!!model.operation}, t('reload')),
                h(Button, {onClick:model.save, primary:true, title:t('saveHelp'),
                  disabled:!ready || !!model.operation || model.stale}, t(model.operation === 'saving' ? 'saving' : 'save'))),
              managing && ready && h(PresetManager, {ctx, sessionId, model, t, locale:lang, id:id + '-presets', trigger:presetsButton,
                onDismiss:() => setManaging(false)}))));
      };
    }

    // Hide internal settings records from the chat timeline.
    function HiddenSettingsRecord() { return null; }

    return {
      inject: ['slots', 'locale', 'sessions', 'connection'],
      apply(ctx) {
        for (const [locale, dictionary] of Object.entries(dictionaries)) {
          ctx.effect(() => ctx.locale.register(NAMESPACE, locale, dictionary));
        }
        const SettingsControl = createSettingsControl(ctx);
        function CustomizeModeOnly(props) {
          const preset = props.useSessions(state => state.byId[props.sessionId]?.projectionValues?.agentPreset);
          return preset === PRESET_ID ? h(SettingsControl, {...props, key:props.sessionId}) : null;
        }
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name:'conversation.input.left', id:'customize-mode-settings', order:-100, locale:NAMESPACE,
          label:() => ctx.locale.bind(NAMESPACE)('settings'),
          inject(sessionId) {
            const face = ctx.sessions.binding(sessionId)?.session.projections.faceOf('customizeMode');
            return {source:{
              subscribe:callback => face ? face.subscribe(callback) : () => {},
              getSnapshot:() => face?.getSnapshot()
            }};
          }
        }, CustomizeModeOnly));
        ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
          name:'conversation.chat.commandview', key:PRESET_ID
        }, HiddenSettingsRecord));
      }
    };
  }
});
