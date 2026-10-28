window.__ModuleLoader__.load({
  id: 'dsh-customize-mode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NAMESPACE = 'dsh-customize-mode';
    const PROTOCOL = 'dsh-customize-mode/v1';
    const EMPTY_PROJECTION = { revision: 0 };

    const dictionaries = {
      en: {
        settings: 'Custom settings', title: 'Custom mode settings',
        promptTitle: 'System prompt', override: 'Use a custom system prompt',
        promptHelp: 'Replaces the default system prompt (leave empty to send none). Supports {{model}} and {{provider}}.',
        promptVariables: 'Variables', promptVariablesTitle: 'Prompt variables',
        promptVariablesBuiltins: 'Built-in variables: {{model}} (model name) and {{provider}} (model provider). Variables registered by other plugins can also be used.',
        promptVariablesSyntax: 'Format: {{name}} with no spaces inside the braces. Names start with a lowercase letter and use only lowercase letters, digits, and underscores.',
        promptVariablesFailure: 'Variables are resolved when sending a message. Undefined or malformed variables will prevent the message from sending.',
        fillDefaultPrompt: 'Fill with default prompt', confirmOverwriteTitle: 'Replace current prompt?',
        confirmOverwritePrompt: 'This will replace your current prompt text with the default template.',
        confirm: 'Replace', cancel: 'Cancel',
        contextTitle: 'Extra context', runtimeContext: 'Include environment info', timeContext: 'Include current time',
        contextHistory: 'Applies to future messages. Existing messages in the conversation are not changed.',
        toolsTitle: 'Tools', allTools: 'All available tools', selectedTools: 'Selected tools only',
        newToolsIncluded: 'Newly added tools are enabled automatically.', newToolsExcluded: 'Only checked tools are available. Newly added tools stay off until checked.',
        selectAll: 'Select all', disableAll: 'Disable all', selectedCount: 'Selected',
        search: 'Search tools', noMatch: 'No matching tools.',
        save: 'Apply to session', close: 'Close', reload: 'Reload', loading: 'Loading…', saving: 'Applying…',
        saveDefaults: 'Save as default', savingDefaults: 'Saving…',
        defaultsHelp: 'Used as the initial settings for new Custom mode conversations.',
        defaultsSaved: 'Saved as default. Click "Apply to session" to also use these settings here.',
        sessionHelp: 'Applies to this conversation starting from the next turn.',
        running: 'A reply is in progress. Saved changes will take effect on the next turn.',
        stale: 'Settings were updated elsewhere. Reload before saving.', notLoaded: 'Failed to load settings.',
        error_NETWORK: 'Could not connect to the app. Please try again.',
        error_PROTOCOL: 'Unexpected response from the app. Refresh the page and try again.',
        error_FORBIDDEN: 'Permission denied.', error_UNAUTHORIZED: 'Session expired. Please reconnect.',
        error_WRONG_PRESET: 'Switch to Custom mode to change these settings.',
        error_SESSION_NOT_FOUND: 'Conversation not found. Reopen it and try again.',
        error_ROOT_SESSION_REQUIRED: 'Settings can only be changed in the main conversation.',
        error_SESSION_CHANGED: 'The conversation state changed. Reopen settings and try again.',
        error_HUMAN_ONLY: 'Settings can only be changed from the UI.',
        error_BUSY: 'Another save is in progress. Try again in a moment.',
        error_REVISION_CONFLICT: 'Settings were updated elsewhere. Reload before saving.',
        error_DEFAULTS_REVISION_CONFLICT: 'Default settings were updated elsewhere. Reload before saving.',
        error_DEFAULTS_SAVE_FAILED: 'Failed to save default settings.',
        error_INVALID_REQUEST: 'Invalid settings data. Reload and try again.',
        error_RESERVED_TOOL: 'A selected tool is not supported. Reload the tool list.',
        error_UNSUPPORTED_POLICY: 'Some selected tools cannot be restricted. Reload and try again.',
        error_TOOL_VISIBILITY_CONFLICT: 'Failed to update tool visibility. Reload and try again.',
        error_COMMIT_FAILED: 'Failed to save settings. Reload and try again.',
        error_PREVIEW_FAILED: 'Failed to load the default prompt.',
        error_ABORTED: 'Request cancelled.', error_UNAVAILABLE: 'Settings are temporarily unavailable.',
        error_NOT_FOUND: 'Settings endpoint not found. Refresh the page.',
        error_REQUEST_TOO_LARGE: 'System prompt is too long.',
        error_UNSUPPORTED_MEDIA_TYPE: 'Invalid request format.',
        error_SETTINGS_FAILED: 'Failed to update settings.',
        warning_POLICY_UNAVAILABLE: 'Current tool settings could not be applied. Reload and save again.',
        warning_CATALOG_STALE: 'A reply is in progress; the tool list may not be up to date.',
      },
      zh: {
        settings: '自定义设置', title: '自定义模式设置',
        promptTitle: '系统提示词', override: '使用自定义系统提示词',
        promptHelp: '替换默认系统提示词（留空则不发送），支持 {{model}} 和 {{provider}} 变量。',
        promptVariables: '变量说明', promptVariablesTitle: '提示词变量',
        promptVariablesBuiltins: '内置变量：{{model}}（模型名称）、{{provider}}（模型提供商）。也可以使用其他插件注册的变量。',
        promptVariablesSyntax: '写法为 {{name}}，花括号内不要有空格。变量名以小写字母开头，仅支持小写字母、数字和下划线。',
        promptVariablesFailure: '变量会在发送消息时替换。包含未定义或格式有误的变量会导致发送失败。',
        fillDefaultPrompt: '填入默认提示词', confirmOverwriteTitle: '覆盖当前提示词？',
        confirmOverwritePrompt: '将使用默认提示词模板替换当前输入框中的内容。',
        confirm: '覆盖', cancel: '取消',
        contextTitle: '附加信息', runtimeContext: '附加环境信息', timeContext: '附加当前时间',
        contextHistory: '仅对后续消息生效，不会修改已有的对话记录。',
        toolsTitle: '工具', allTools: '所有可用工具', selectedTools: '仅使用勾选的工具',
        newToolsIncluded: '后续新增的工具也会自动启用。', newToolsExcluded: '仅启用勾选的工具，后续新增的工具默认关闭。',
        selectAll: '全选', disableAll: '全部禁用', selectedCount: '已选',
        search: '搜索工具', noMatch: '未找到匹配的工具。',
        save: '应用至当前会话', close: '关闭', reload: '重新加载', loading: '加载中…', saving: '应用中…',
        saveDefaults: '存为默认', savingDefaults: '保存中…',
        defaultsHelp: '作为新建自定义模式会话的初始设置。',
        defaultsSaved: '已保存为默认设置。如需在当前会话生效，请点击“应用至当前会话”。',
        sessionHelp: '仅对当前会话生效，从下一轮对话开始应用。',
        running: '当前正在回复中，保存的更改将在下一轮对话生效。',
        stale: '设置已在别处更新，请重新加载后再保存。', notLoaded: '加载设置失败。',
        error_NETWORK: '无法连接到应用，请重试。',
        error_PROTOCOL: '响应格式异常，请刷新页面后重试。',
        error_FORBIDDEN: '没有权限修改设置。', error_UNAUTHORIZED: '连接已失效，请重新连接。',
        error_WRONG_PRESET: '请切换到自定义模式后再修改设置。',
        error_SESSION_NOT_FOUND: '会话不存在或已关闭，请重新打开。',
        error_ROOT_SESSION_REQUIRED: '仅支持在主会话中修改设置。',
        error_SESSION_CHANGED: '会话状态已变更，请重新打开设置。',
        error_HUMAN_ONLY: '仅支持在设置面板中手动修改。',
        error_BUSY: '正在保存其他更改，请稍后再试。',
        error_REVISION_CONFLICT: '设置已在别处更新，请重新加载后再保存。',
        error_DEFAULTS_REVISION_CONFLICT: '默认设置已在别处更新，请重新加载后再保存。',
        error_DEFAULTS_SAVE_FAILED: '保存默认设置失败，请重试。',
        error_INVALID_REQUEST: '设置数据无效，请重新加载后再试。',
        error_RESERVED_TOOL: '所选工具不受支持，请重新加载工具列表。',
        error_UNSUPPORTED_POLICY: '部分工具不支持禁用，请重新加载后再试。',
        error_TOOL_VISIBILITY_CONFLICT: '更新工具状态失败，请重新加载后再试。',
        error_COMMIT_FAILED: '保存失败，请重新加载后再试。',
        error_PREVIEW_FAILED: '加载默认提示词失败。',
        error_ABORTED: '操作已取消。', error_UNAVAILABLE: '设置暂不可用，请稍后再试。',
        error_NOT_FOUND: '未找到设置服务，请刷新页面。',
        error_REQUEST_TOO_LARGE: '系统提示词过长，请精简后再试。',
        error_UNSUPPORTED_MEDIA_TYPE: '请求格式无效。',
        error_SETTINGS_FAILED: '更新设置失败，请重试。',
        warning_POLICY_UNAVAILABLE: '当前工具设置未能生效，请重新加载并保存。',
        warning_CATALOG_STALE: '当前正在回复中，工具列表可能不是最新状态。',
      }
    };

    const css = `
.dshcm-trigger{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border:0;border-radius:8px;padding:5px 8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dshcm-trigger:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-dialog{box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;overflow:hidden}
.dshcm-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent)}
.dshcm-confirm{width:min(460px,calc(100vw - 32px))}
.dshcm-layout{display:flex;flex-direction:column;max-height:calc(100dvh - 42px)}
.dshcm-header,.dshcm-footer{flex:none;padding:16px 22px;display:flex;align-items:center;gap:12px}
.dshcm-header{border-bottom:1px solid var(--dsw-alias-border-l1);justify-content:space-between}
.dshcm-header h2{margin:0;font-size:18px;font-weight:600}
.dshcm-body{padding:18px 22px;overflow:auto;min-height:0}
.dshcm-footer{border-top:1px solid var(--dsw-alias-border-l1);justify-content:flex-end;flex-wrap:wrap}
.dshcm-default-action{margin-right:auto}
.dshcm-session-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}
.dshcm-section{border:0;padding:0;margin:0 0 22px;min-width:0}
.dshcm-section:last-child{margin-bottom:0}.dshcm-section legend{font-size:15px;font-weight:600;margin-bottom:10px}
.dshcm-row{display:flex;gap:9px;align-items:center;margin:8px 0;cursor:pointer}
.dshcm-help{color:var(--dsw-alias-label-secondary);font-size:12px;margin:8px 0}
.dshcm-help-link{border:0;padding:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.dshcm-help-link:hover{color:var(--dsw-alias-brand-primary)}
.dshcm-variable-guide{width:min(560px,calc(100vw - 32px))}
.dshcm-variable-guide .dshcm-body{line-height:1.6}
.dshcm-notice{border-radius:8px;padding:9px 12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;margin:10px 0}
.dshcm-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;overflow-wrap:anywhere}
.dshcm-dialog input[type=checkbox],.dshcm-dialog input[type=radio]{accent-color:var(--dsw-alias-brand-primary);width:16px;height:16px;flex:none;margin:0}
.dshcm-dialog textarea,.dshcm-search{box-sizing:border-box;width:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;font:inherit}
.dshcm-dialog textarea{min-height:150px;max-height:340px;resize:vertical;font-family:ui-monospace,monospace;font-size:13px;line-height:1.6}
.dshcm-dialog textarea:disabled{opacity:.55}.dshcm-search{font-size:13px;margin:8px 0}
.dshcm-button{font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}
.dshcm-button[data-primary=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}
.dshcm-button:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-dialog button:disabled{opacity:.5;cursor:not-allowed}
.dshcm-dialog :focus-visible,.dshcm-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshcm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.dshcm-tool-list{max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.dshcm-tool{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;overflow-wrap:anywhere}
.dshcm-tool:last-child{border-bottom:0}.dshcm-tool:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-tool input{margin-top:3px!important}.dshcm-tool code{font-size:12px}.dshcm-tool small{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media(max-width:520px){.dshcm-header,.dshcm-footer,.dshcm-body{padding:14px}.dshcm-dialog textarea{min-height:120px}}
`;

    function SettingsError(code) {
      return Object.assign(new Error(code), { code });
    }

    function errorCode(error) {
      if (error?.name === 'AbortError') return 'ABORTED';
      if (typeof error?.code === 'string' && Object.hasOwn(dictionaries.en, 'error_' + error.code)) return error.code;
      return 'NETWORK';
    }

    function readSettings(data, action) {
      const config = data?.config;
      const validConfig = config && typeof config.overridePrompt === 'boolean' && typeof config.prompt === 'string' &&
        (config.allowedTools === null || (Array.isArray(config.allowedTools) && config.allowedTools.every(name => typeof name === 'string'))) &&
        typeof config.includeRuntimeContext === 'boolean' && typeof config.includeTimeContext === 'boolean';
      const validWarnings = Array.isArray(data?.warnings) && data.warnings.every(warning =>
        typeof warning?.code === 'string' && Object.hasOwn(dictionaries.en, 'warning_' + warning.code));
      const validCatalog = action !== 'get' || (typeof data?.defaultPrompt === 'string' && Array.isArray(data.tools) &&
        data.tools.every(tool => typeof tool?.name === 'string' && typeof tool.description === 'string'));
      if (data?.protocol !== PROTOCOL || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
          !validConfig || !validWarnings || !validCatalog) throw SettingsError('PROTOCOL');
      const settings = {
        revision: data.revision,
        config: {
          overridePrompt: config.overridePrompt, prompt: config.prompt,
          allowedTools: config.allowedTools === null ? null : [...config.allowedTools],
          includeRuntimeContext: config.includeRuntimeContext,
          includeTimeContext: config.includeTimeContext
        },
        warnings: data.warnings.map(warning => warning.code)
      };
      if (action === 'get') {
        if (!Number.isSafeInteger(data.defaultsRevision) || data.defaultsRevision < 0) throw SettingsError('PROTOCOL');
        settings.defaultsRevision = data.defaultsRevision;
        settings.template = data.defaultPrompt;
        settings.tools = data.tools;
      }
      return settings;
    }

    async function requestSettings(ctx, sessionId, request, signal) {
      const reply = await ctx.connection.rpc.call('/api', 'customize-mode-settings', {sessionId, request}, signal);
      if (reply?.ok !== true) {
        const code = reply?.error?.code;
        if (typeof code !== 'string' || !Object.hasOwn(dictionaries.en, 'error_' + code)) throw SettingsError('PROTOCOL');
        throw SettingsError(code);
      }
      return readSettings(reply.value, request.action);
    }

    function useSettings(ctx, sessionId, source) {
      const projection = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot) ?? EMPTY_PROJECTION;
      const [open, setOpen] = React.useState(false);
      const [settings, setSettings] = React.useState(null);
      const [operation, setOperation] = React.useState(null);
      const [failure, setFailure] = React.useState(null);
      const [defaultsSaved, setDefaultsSaved] = React.useState(false);
      const pending = React.useRef(null);
      const isOpen = React.useRef(false);

      function cancelRequest() {
        const previous = pending.current;
        pending.current = null;
        previous?.abort();
      }
      React.useEffect(() => () => {
        isOpen.current = false;
        cancelRequest();
      }, [sessionId]);

      async function perform(kind, request) {
        cancelRequest();
        const controller = new AbortController();
        pending.current = controller;
        setOperation(kind);
        setFailure(null);
        setDefaultsSaved(false);
        try {
          const next = await requestSettings(ctx, sessionId, request, controller.signal);
          if (pending.current !== controller || !isOpen.current) return;
          if (kind === 'saving') {
            pending.current = null;
            close();
            Promise.resolve().then(() => ctx.sessions.refreshProjections(sessionId)).catch(() => {});
          } else if (kind === 'savingDefaults') {
            setSettings(previous => ({...previous, defaultsRevision:next.revision}));
            setDefaultsSaved(true);
          } else {
            setSettings(next);
          }
        } catch (error) {
          if (pending.current === controller && isOpen.current) setFailure(errorCode(error));
        } finally {
          if (pending.current === controller) {
            pending.current = null;
            setOperation(null);
          }
        }
      }
      function show() {
        isOpen.current = true;
        setOpen(true);
        setSettings(null);
        void perform('loading', {action:'get'});
      }
      function close() {
        if (!isOpen.current) return;
        isOpen.current = false;
        cancelRequest();
        setOpen(false);
        setOperation(null);
        setSettings(null);
      }
      function change(key, value) {
        if (pending.current) return;
        setSettings(previous => previous && ({...previous, config:{...previous.config, [key]:value}}));
        setDefaultsSaved(false);
        setFailure(null);
      }
      const stale = !!settings && projection.revision > settings.revision;
      function save() {
        if (!settings || pending.current || stale) return;
        void perform('saving', {action:'set', expectedRevision:settings.revision, config:settings.config});
      }
      function saveDefaults() {
        if (!settings || pending.current) return;
        void perform('savingDefaults', {action:'set-defaults', expectedRevision:settings.defaultsRevision, config:settings.config});
      }
      return {open, settings, operation, failure, defaultsSaved, stale, show, close, change, save, saveDefaults,
        reload: () => { if (isOpen.current) void perform('loading', {action:'get'}); }};
    }

    function Button({children, primary, ...props}) {
      return h('button', {type:'button', className:'dshcm-button', 'data-primary':primary || undefined, ...props}, children);
    }

    function Toggle({label, ...props}) {
      return h('label', {className:'dshcm-row'}, h('input', {type:'checkbox', ...props}), label);
    }

    function PromptOverwriteDialog({t, id, onConfirm, onCancel, trigger}) {
      const dialog = React.useRef(null);
      React.useEffect(() => {
        const element = dialog.current;
        element.showModal();
        return () => {
          if (element.open) element.close();
          if (trigger.current?.isConnected) trigger.current.focus();
        };
      }, []);
      return h('dialog', {ref:dialog, className:'dshcm-dialog dshcm-confirm', role:'alertdialog',
        'aria-labelledby':id + '-title', 'aria-describedby':id + '-message',
        onCancel:event => {event.preventDefault(); event.stopPropagation(); onCancel();},
        onClose:event => {event.stopPropagation(); onCancel();}, onKeyDown:event => event.stopPropagation()},
        h('div', {className:'dshcm-layout'},
          h('header', {className:'dshcm-header'}, h('h2', {id:id + '-title'}, t('confirmOverwriteTitle'))),
          h('div', {className:'dshcm-body', id:id + '-message'}, t('confirmOverwritePrompt')),
          h('footer', {className:'dshcm-footer'},
            h(Button, {onClick:onCancel, autoFocus:true}, t('cancel')),
            h(Button, {onClick:onConfirm, primary:true}, t('confirm')))));
    }

    function PromptVariablesDialog({t, id, onDismiss, trigger}) {
      const dialog = React.useRef(null);
      React.useEffect(() => {
        const element = dialog.current;
        element.showModal();
        return () => {
          if (element.open) element.close();
          if (trigger.current?.isConnected) trigger.current.focus();
        };
      }, []);
      return h('dialog', {ref:dialog, className:'dshcm-dialog dshcm-variable-guide',
        'aria-labelledby':id + '-title',
        onCancel:event => {event.preventDefault(); event.stopPropagation(); onDismiss();},
        onClose:event => {event.stopPropagation(); onDismiss();}, onKeyDown:event => event.stopPropagation()},
        h('div', {className:'dshcm-layout'},
          h('header', {className:'dshcm-header'}, h('h2', {id:id + '-title'}, t('promptVariablesTitle'))),
          h('div', {className:'dshcm-body'},
            ...['promptVariablesBuiltins', 'promptVariablesSyntax', 'promptVariablesFailure']
              .map(key => h('p', {key}, t(key)))),
          h('footer', {className:'dshcm-footer'}, h(Button, {onClick:onDismiss, autoFocus:true}, t('close')))));
    }

    function PromptSection({model, t, id}) {
      const {config, template} = model.settings;
      const [confirming, setConfirming] = React.useState(null);
      const [showVariables, setShowVariables] = React.useState(false);
      const fillButton = React.useRef(null);
      const variablesButton = React.useRef(null);
      React.useEffect(() => { setConfirming(null); setShowVariables(false); }, [model.settings, model.operation]);
      const canFill = config.overridePrompt && !model.operation;
      function fill() {
        if (!canFill) return;
        if (config.prompt.length > 0) setConfirming(model.settings);
        else model.change('prompt', template);
      }
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('promptTitle')),
        h(Toggle, {label:t('override'), checked:config.overridePrompt, onChange:event => model.change('overridePrompt', event.target.checked)}),
        h('p', {className:'dshcm-help', id:id + '-help'}, t('promptHelp'), ' ',
          h('button', {type:'button', className:'dshcm-help-link', ref:variablesButton,
            'aria-haspopup':'dialog', onClick:() => { if (!model.operation) setShowVariables(true); }}, t('promptVariables'))),
        showVariables && h(PromptVariablesDialog, {t, id:id + '-variables', trigger:variablesButton,
          onDismiss:() => setShowVariables(false)}),
        h('textarea', {
          'aria-label':t('promptTitle'), 'aria-describedby':id + '-help',
          value:config.prompt, placeholder:template, disabled:!config.overridePrompt,
          spellCheck:false, onChange:event => model.change('prompt', event.target.value)
        }),
        h('div', {className:'dshcm-actions'},
          h('button', {type:'button', className:'dshcm-button', ref:fillButton, disabled:!canFill,
            'aria-haspopup':'dialog', onClick:fill}, t('fillDefaultPrompt'))),
        confirming === model.settings && canFill && h(PromptOverwriteDialog, {t, id:id + '-overwrite', trigger:fillButton,
          onCancel:() => setConfirming(null),
          onConfirm:() => {
            if (canFill && confirming === model.settings) model.change('prompt', template);
            setConfirming(null);
          }}));
    }

    function ContextSection({model, t}) {
      const {config} = model.settings;
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('contextTitle')),
        h(Toggle, {label:t('runtimeContext'), checked:config.includeRuntimeContext, onChange:event => model.change('includeRuntimeContext', event.target.checked)}),
        h(Toggle, {label:t('timeContext'), checked:config.includeTimeContext, onChange:event => model.change('includeTimeContext', event.target.checked)}),
        h('p', {className:'dshcm-help'}, t('contextHistory')));
    }

    function ToolsSection({model, t, id}) {
      const [query, setQuery] = React.useState('');
      const {config, tools} = model.settings;
      const chosen = new Set(config.allowedTools ?? tools.map(tool => tool.name));
      const filtered = tools.filter(tool => (tool.name + ' ' + tool.description).toLowerCase().includes(query.trim().toLowerCase()));
      function toggle(name, checked) {
        const next = new Set(chosen);
        checked ? next.add(name) : next.delete(name);
        model.change('allowedTools', [...next]);
      }
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('toolsTitle')),
        h('label', {className:'dshcm-row'}, h('input', {type:'radio', name:id, checked:config.allowedTools === null,
          onChange:() => model.change('allowedTools', null)}), t('allTools')),
        h('label', {className:'dshcm-row'}, h('input', {type:'radio', name:id, checked:config.allowedTools !== null,
          onChange:() => model.change('allowedTools', tools.map(tool => tool.name))}), t('selectedTools')),
        h('p', {className:'dshcm-help'}, t(config.allowedTools === null ? 'newToolsIncluded' : 'newToolsExcluded')),
        h('div', {className:'dshcm-actions'},
          h(Button, {onClick:() => model.change('allowedTools', tools.map(tool => tool.name))}, t('selectAll')),
          h(Button, {onClick:() => model.change('allowedTools', [])}, t('disableAll')),
          h('span', {className:'dshcm-help', role:'status'}, t('selectedCount') + ': ' + chosen.size + ' / ' + tools.length)),
        h('input', {type:'search', className:'dshcm-search', 'aria-label':t('search'), placeholder:t('search'), value:query,
          onChange:event => setQuery(event.target.value)}),
        h('div', {className:'dshcm-tool-list'}, filtered.length ? filtered.map(tool =>
          h('label', {key:tool.name, className:'dshcm-tool', title:tool.description},
            h('input', {type:'checkbox', checked:chosen.has(tool.name), onChange:event => toggle(tool.name, event.target.checked)}),
            h('span', null, h('code', null, tool.name), h('small', null, tool.description)))) :
          h('p', {className:'dshcm-help'}, t('noMatch'))));
    }

    function Icon() {
      return h('svg', {width:14, height:14, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, 'aria-hidden':true},
        h('path', {d:'M3 6h18M3 12h18M3 18h18'}),
        ...[[8,6],[16,12],[10,18]].map(([cx, cy]) => h('circle', {key:cy, cx, cy, r:2.5, fill:'var(--dsw-alias-bg-layer-1)'})));
    }

    function createSettingsControl(ctx) {
      return function SettingsControl({sessionId, t, source, useSession}) {
        const model = useSettings(ctx, sessionId, source);
        const running = useSession(session => session?.running === true);
        const id = React.useId();
        const dialog = React.useRef(null);
        const trigger = React.useRef(null);
        const wasOpen = React.useRef(false);
        React.useEffect(() => {
          const element = dialog.current;
          if (model.open) {
            if (element && !element.open) element.showModal();
          } else {
            if (element?.open) element.close();
            if (wasOpen.current && trigger.current?.isConnected) trigger.current.focus();
          }
          wasOpen.current = model.open;
        }, [model.open]);
        React.useEffect(() => {
          const element = dialog.current;
          return () => { if (element?.open) element.close(); };
        }, []);
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
                !model.settings && h('p', {role:'status'}, t(model.operation === 'loading' ? 'loading' : 'notLoaded')),
                model.settings && h(React.Fragment, null,
                  h(PromptSection, {model, t, id:id + '-prompt'}),
                  h(ContextSection, {model, t}),
                  h(ToolsSection, {model, t, id:id + '-tools'}),
                  ...model.settings.warnings.map((code, index) => h('p', {key:index, className:'dshcm-notice', role:'status'}, t('warning_' + code)))),
                running && h('p', {className:'dshcm-notice', role:'status'}, t('running')),
                model.stale && h('p', {className:'dshcm-notice', role:'alert'}, t('stale')),
                model.failure && h('p', {className:'dshcm-error', role:'alert'}, t('error_' + model.failure)),
                model.defaultsSaved && h('p', {className:'dshcm-notice', role:'status'}, t('defaultsSaved'))),
              h('footer', {className:'dshcm-footer'},
                h('div', {className:'dshcm-default-action'},
                  h(Button, {onClick:model.saveDefaults, title:t('defaultsHelp'),
                    disabled:!model.settings || !!model.operation}, t(model.operation === 'savingDefaults' ? 'savingDefaults' : 'saveDefaults'))),
                h('div', {className:'dshcm-session-actions'},
                  h(Button, {onClick:model.reload, disabled:!!model.operation}, t('reload')),
                  h(Button, {onClick:model.save, primary:true, title:t('sessionHelp'),
                    disabled:!model.settings || !!model.operation || model.stale}, t(model.operation === 'saving' ? 'saving' : 'save')))))));
      };
    }

    // Hide internal settings persistence records from the chat timeline.
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
          return preset === 'customize-mode' ? h(SettingsControl, {...props, key:props.sessionId}) : null;
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
          name:'conversation.chat.commandview', key:'customize-mode'
        }, HiddenSettingsRecord));
      }
    };
  }
});
