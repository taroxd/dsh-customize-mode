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
        promptHelp: 'Your text replaces the default instructions exactly as written.',
        promptEmpty: 'Leave this empty to send no system prompt.',
        promptPlaceholder: 'Write your instructions here…',
        contextTitle: 'Extra context', runtimeContext: 'Include environment information', timeContext: 'Include the current time',
        contextHistory: 'Earlier messages stay in the conversation. For a clean start, turn these off before the first message.',
        toolsTitle: 'Tools', allTools: 'All available tools', selectedTools: 'Only selected tools',
        newToolsIncluded: 'New tools are included automatically.', newToolsExcluded: 'Unselected tools cannot be used. New tools stay off until you select them.',
        selectAll: 'Select all', disableAll: 'Disable all', selectedCount: 'Selected',
        search: 'Search tools', noMatch: 'No tools match your search.', noTools: 'No tools selected. The model can only chat.',
        save: 'Apply to session', close: 'Close', reload: 'Reload settings', loading: 'Loading settings…', saving: 'Applying…',
        saveDefaults: 'Save as default', savingDefaults: 'Saving default…', defaultsScope: 'Global default · New conversations only',
        defaultsHelp: 'For future Custom mode conversations in every workspace. Existing conversations stay unchanged.',
        defaultsSaved: 'Default saved. To use these changes in this conversation too, select Apply to session.',
        sessionHelp: 'Only this conversation. Changes apply from the next turn.',
        running: 'Changes saved now apply from the next turn. The current reply keeps its existing settings.',
        stale: 'These settings changed elsewhere. Reload them before saving.', notLoaded: 'Settings could not be loaded. Try again.',
        error_GENERIC: 'Something went wrong. Please try again.', error_NETWORK: 'Could not reach the app. Check your connection and try again.',
        error_PROTOCOL: 'The app returned an unexpected response. Reload the page and try again.',
        error_FORBIDDEN: 'You do not have permission to change these settings.', error_UNAUTHORIZED: 'Your connection has expired. Reconnect to the app.',
        error_WRONG_PRESET: 'Select Custom mode in a new conversation to change these settings.',
        error_SESSION_NOT_FOUND: 'This conversation is no longer open. Open it again and retry.',
        error_ROOT_SESSION_REQUIRED: 'Open the main conversation to change these settings.',
        error_SESSION_CHANGED: 'The conversation changed. Close these settings and open them again.',
        error_HUMAN_ONLY: 'Change these settings from the settings panel.',
        error_BUSY: 'Another change is being saved. Try again in a moment.',
        error_REVISION_CONFLICT: 'These settings changed elsewhere. Reload them before saving.',
        error_DEFAULTS_REVISION_CONFLICT: 'The global default changed elsewhere. Reload settings before saving it again.',
        error_DEFAULTS_SAVE_FAILED: 'The global default could not be saved. Please try again.',
        error_INVALID_REQUEST: 'These settings could not be saved. Reload them and try again.',
        error_RESERVED_TOOL: 'One of the selected tools is unavailable. Reload the tool list.',
        error_UNSUPPORTED_POLICY: 'Some selected tool restrictions cannot be applied. Reload the tool list and try again.',
        error_TOOL_VISIBILITY_CONFLICT: 'Some tools cannot be hidden right now. Reload the tool list and try again.',
        error_COMMIT_FAILED: 'Changes were not saved. Reload the settings before trying again.',
        error_PREVIEW_FAILED: 'The default prompt could not be loaded. Try reloading the settings.',
        error_ABORTED: 'The request was cancelled. Please try again.', error_UNAVAILABLE: 'Custom settings are unavailable right now. Try again shortly.',
        error_NOT_FOUND: 'Custom settings are unavailable. Reload the page and try again.',
        error_REQUEST_TOO_LARGE: 'The system prompt is too long. Shorten it and try again.',
        error_UNSUPPORTED_MEDIA_TYPE: 'The request could not be read. Reload the page and try again.',
        error_SETTINGS_FAILED: 'Settings could not be updated. Reload them and try again.',
        warning_POLICY_UNAVAILABLE: 'Some tool restrictions could not be applied. Reload the settings before continuing.',
        warning_CATALOG_STALE: 'The tool list may be out of date while a reply is running. Reload it when the reply finishes.',
        warning_GENERIC: 'Some settings may need attention. Reload the settings to check them.'
      },
      zh: {
        settings: '自定义设置', title: '自定义模式设置',
        promptTitle: '系统提示词', override: '使用自定义系统提示词',
        promptHelp: '用你填写的内容替换默认指令，文字会按原样使用。',
        promptEmpty: '保持为空，即不发送系统提示词。',
        promptPlaceholder: '在这里填写指令…',
        contextTitle: '附加信息', runtimeContext: '附加环境信息', timeContext: '附加当前时间',
        contextHistory: '之前的消息仍会保留。需要干净的对话时，请在首次发送前关闭这些选项。',
        toolsTitle: '工具', allTools: '所有可用工具', selectedTools: '仅使用勾选的工具',
        newToolsIncluded: '以后新增的工具也会自动启用。', newToolsExcluded: '未勾选的工具不能使用。新增工具需手动勾选后才能使用。',
        selectAll: '全选', disableAll: '全部禁用', selectedCount: '已选',
        search: '搜索工具', noMatch: '没有找到匹配的工具。', noTools: '未选择工具，模型只能进行对话。',
        save: '应用至会话', close: '关闭', reload: '重新加载', loading: '正在加载设置…', saving: '正在应用…',
        saveDefaults: '保存为默认', savingDefaults: '正在保存默认…', defaultsScope: '全局默认 · 仅用于新会话',
        defaultsHelp: '用于所有工作区以后新建的自定义模式会话，不改变已有会话。',
        defaultsSaved: '默认设置已保存。如需当前会话也使用这些更改，请点击“应用至会话”。',
        sessionHelp: '仅影响当前会话，从下一轮对话起生效。',
        running: '现在保存的更改将从下一轮对话起生效，当前回复继续使用原设置。',
        stale: '设置已在其他位置更改，请重新加载后再保存。', notLoaded: '未能加载设置，请重试。',
        error_GENERIC: '操作未完成，请重试。', error_NETWORK: '无法连接到应用，请检查连接后重试。',
        error_PROTOCOL: '应用返回了无法识别的结果，请刷新页面后重试。',
        error_FORBIDDEN: '你没有修改这些设置的权限。', error_UNAUTHORIZED: '连接已过期，请重新连接应用。',
        error_WRONG_PRESET: '请在新会话中选择自定义模式后再修改设置。',
        error_SESSION_NOT_FOUND: '此会话已关闭，请重新打开后再试。',
        error_ROOT_SESSION_REQUIRED: '请在主会话中修改这些设置。',
        error_SESSION_CHANGED: '会话已发生变化，请关闭设置后重新打开。',
        error_HUMAN_ONLY: '请通过设置面板修改这些选项。',
        error_BUSY: '另一项更改正在保存，请稍后重试。',
        error_REVISION_CONFLICT: '设置已在其他位置更改，请重新加载后再保存。',
        error_DEFAULTS_REVISION_CONFLICT: '全局默认已在其他位置更改，请重新加载后再保存默认。',
        error_DEFAULTS_SAVE_FAILED: '全局默认未能保存，请重试。',
        error_INVALID_REQUEST: '无法保存这些设置，请重新加载后再试。',
        error_RESERVED_TOOL: '所选工具中有不可用的项目，请重新加载工具列表。',
        error_UNSUPPORTED_POLICY: '部分工具限制无法应用，请重新加载工具列表后再试。',
        error_TOOL_VISIBILITY_CONFLICT: '部分工具暂时无法隐藏，请重新加载工具列表后再试。',
        error_COMMIT_FAILED: '更改未能保存，请重新加载设置后再试。',
        error_PREVIEW_FAILED: '未能加载默认提示词，请重新加载设置。',
        error_ABORTED: '请求已取消，请重试。', error_UNAVAILABLE: '自定义设置暂时不可用，请稍后重试。',
        error_NOT_FOUND: '自定义设置不可用，请刷新页面后重试。',
        error_REQUEST_TOO_LARGE: '系统提示词过长，请缩短后再试。',
        error_UNSUPPORTED_MEDIA_TYPE: '无法读取请求，请刷新页面后重试。',
        error_SETTINGS_FAILED: '未能更新设置，请重新加载后再试。',
        warning_POLICY_UNAVAILABLE: '部分工具限制未能应用，请重新加载设置后再继续。',
        warning_CATALOG_STALE: '回复期间工具列表可能不是最新的，请在回复结束后重新加载。',
        warning_GENERIC: '部分设置可能需要检查，请重新加载设置。'
      }
    };

    const css = `
.dshcm-trigger{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border:0;border-radius:8px;padding:5px 8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dshcm-trigger:hover{background:var(--dsw-alias-bg-layer-2)}
.dshcm-dialog{box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;overflow:hidden}
.dshcm-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 65%,transparent)}
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

    // Never display arbitrary server or transport text. Codes are translated at render time.
    function errorCode(error) {
      if (error?.name === 'AbortError') return 'ABORTED';
      if (typeof error?.code === 'string') return Object.hasOwn(dictionaries.en, 'error_' + error.code) ? error.code : 'GENERIC';
      return 'NETWORK';
    }

    function translatedCode(t, kind, code) {
      const key = kind + '_' + code;
      return t(Object.hasOwn(dictionaries.en, key) ? key : kind + '_GENERIC');
    }

    function readSettings(data, action) {
      const config = data?.config;
      const validConfig = config && typeof config.overridePrompt === 'boolean' && typeof config.prompt === 'string' &&
        (config.allowedTools === null || (Array.isArray(config.allowedTools) && config.allowedTools.every(name => typeof name === 'string'))) &&
        typeof config.includeRuntimeContext === 'boolean' && typeof config.includeTimeContext === 'boolean';
      const validWarnings = Array.isArray(data?.warnings) && data.warnings.every(warning => typeof warning?.code === 'string');
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
      if (reply?.ok !== true) throw SettingsError(reply?.error?.code ?? 'GENERIC');
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
            // The write is committed. Close without waiting for the projection refresh.
            pending.current = null;
            close();
            Promise.resolve().then(() => ctx.sessions.refreshProjections(sessionId)).catch(() => {});
          } else if (kind === 'savingDefaults') {
            // Global defaults do not change this session or replace its unsaved draft.
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

    function PromptSection({model, t, id}) {
      const {config, template} = model.settings;
      return h('fieldset', {className:'dshcm-section', disabled:!!model.operation},
        h('legend', null, t('promptTitle')),
        h(Toggle, {label:t('override'), checked:config.overridePrompt, onChange:event => model.change('overridePrompt', event.target.checked)}),
        h('p', {className:'dshcm-help', id:id + '-help'}, t('promptHelp')),
        h('textarea', {
          'aria-label':t('promptTitle'), 'aria-describedby':id + '-help' + (config.overridePrompt ? ' ' + id + '-empty' : ''),
          value:config.prompt, placeholder:template || t('promptPlaceholder'), disabled:!config.overridePrompt,
          spellCheck:false, onChange:event => model.change('prompt', event.target.value)
        }),
        config.overridePrompt && h('p', {className:'dshcm-help', id:id + '-empty'}, t('promptEmpty')));
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
          h('p', {className:'dshcm-help'}, t('noMatch'))),
        config.allowedTools?.length === 0 && h('p', {className:'dshcm-notice'}, t('noTools')));
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
                  ...model.settings.warnings.map((code, index) => h('p', {key:index, className:'dshcm-notice', role:'status'}, translatedCode(t, 'warning', code)))),
                running && h('p', {className:'dshcm-notice', role:'status'}, t('running')),
                model.stale && h('p', {className:'dshcm-notice', role:'alert'}, t('stale')),
                model.failure && h('p', {className:'dshcm-error', role:'alert'}, translatedCode(t, 'error', model.failure)),
                model.defaultsSaved && h('p', {className:'dshcm-notice', role:'status'}, t('defaultsSaved'))),
              h('footer', {className:'dshcm-footer'},
                h('div', {className:'dshcm-default-action'},
                  h(Button, {onClick:model.saveDefaults, title:t('defaultsHelp'), 'aria-describedby':id + '-defaults-scope',
                    disabled:!model.settings || !!model.operation}, t(model.operation === 'savingDefaults' ? 'savingDefaults' : 'saveDefaults')),
                  h('div', {className:'dshcm-help', id:id + '-defaults-scope'}, t('defaultsScope'))),
                h('div', {className:'dshcm-session-actions'},
                  h(Button, {onClick:model.reload, disabled:!!model.operation}, t('reload')),
                  h(Button, {onClick:model.save, primary:true, title:t('sessionHelp'),
                    disabled:!model.settings || !!model.operation || model.stale}, t(model.operation === 'saving' ? 'saving' : 'save')))))));
      };
    }

    // These are configuration persistence events, not conversation content. Keeping
    // their keyed renderer registered also prevents the generic command fallback.
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
