import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the shipped self-registering artifact. The small renderer models React
// hooks, keyed unmounts, subscriptions and host events; it does not replace any
// plugin component, request handler, localization logic or slot registration.
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function hookRenderer() {
  let active, cursor, dirty = true, root, rootProps, tree, nextId = 0;
  let seen, seenHosts, queued;
  const frames = new Map(), hosts = new Map(), types = new WeakMap();
  let lateUpdates = 0;
  const typeId = type => { if (!types.has(type)) types.set(type, ++nextId); return types.get(type); };
  function slot(initial) {
    const frame = active, index = cursor++;
    if (!(index in frame.hooks)) frame.hooks[index] = initial();
    return [frame.hooks[index], frame, index];
  }
  const React = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) { return {type, props:{...props, children:children.flat(Infinity)}}; },
    useState(initial) {
      const [value, frame, index] = slot(() => typeof initial === 'function' ? initial() : initial);
      return [value, update => {
        if (!frame.mounted) { lateUpdates++; return; }
        const next = typeof update === 'function' ? update(frame.hooks[index]) : update;
        if (!Object.is(next, frame.hooks[index])) { frame.hooks[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { return slot(() => ({current:initial}))[0]; },
    useId() { return slot(() => 'test-id-' + ++nextId)[0]; },
    useEffect(effect, deps) {
      const [state] = slot(() => ({deps:undefined, cleanup:undefined}));
      if (!sameDeps(state.deps, deps)) queued.push(() => {
        state.cleanup?.(); state.deps = deps; state.cleanup = effect();
      });
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const [, refresh] = React.useState(0);
      React.useEffect(() => subscribe(() => refresh(n => n + 1)), [subscribe]);
      return getSnapshot();
    }
  };
  function walk(node, path) {
    if (node == null || typeof node === 'boolean') return null;
    if (typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, i) => walk(child, path + '.' + i));
    const {type, props} = node;
    const location = path + ':' + (props.key ?? '');
    if (type === React.Fragment) return props.children.map((child, i) => walk(child, location + '.' + i));
    if (typeof type === 'function') {
      const key = location + ':fn' + typeId(type);
      let frame = frames.get(key);
      if (!frame) { frame = {hooks:[], mounted:true}; frames.set(key, frame); }
      seen.add(key); active = frame; cursor = 0;
      return walk(type(props), key + '.out');
    }
    let host = hosts.get(location);
    if (!host) {
      host = {open:false, isConnected:true, showCalls:0, closeCalls:0, focusCalls:0,
        showModal() { this.open = true; this.showCalls++; },
        close() { this.open = false; this.closeCalls++; },
        focus() { this.focusCalls++; }};
      hosts.set(location, host);
    }
    host.isConnected = true; seenHosts.add(location);
    if (props.ref) props.ref.current = host;
    return {type, props:{...props, children:props.children.map((child, i) => walk(child, location + '.' + i))}, host};
  }
  function flush() {
    let rounds = 0;
    while (dirty) {
      assert.ok(++rounds < 30, 'hook harness did not settle');
      dirty = false; seen = new Set(); seenHosts = new Set(); queued = [];
      tree = root ? walk(React.createElement(root, rootProps), 'root') : null;
      for (const [key, frame] of frames) if (!seen.has(key)) {
        frame.mounted = false;
        for (const hook of frame.hooks) hook?.cleanup?.();
        frames.delete(key);
      }
      for (const [key, host] of hosts) if (!seenHosts.has(key)) { host.isConnected = false; hosts.delete(key); }
      for (const effect of queued) effect();
    }
    return tree;
  }
  return {React, flush,
    mount(component, props) {root = component; rootProps = props; dirty = true; return flush();},
    rerender(props = rootProps) {rootProps = props; dirty = true; return flush();},
    unmount() {root = null; dirty = true; flush();},
    get tree() {return tree;}, get lateUpdates() {return lateUpdates;}
  };
}

function store(value) {
  const listeners = new Set();
  return {getSnapshot:() => value, subscribe:listener => {listeners.add(listener); return () => listeners.delete(listener);},
    set(next) {value = next; for (const listener of listeners) listener();}, get size() {return listeners.size;}};
}
const CONFIG = {overridePrompt:false, prompt:'', allowedTools:null, includeRuntimeContext:true, includeTimeContext:true};
const TOOLS = [{name:'read', description:'Read a file'}, {name:'subagent', description:'Ask another agent'}];
const response = (overrides = {}) => ({ok:true, value:{protocol:'dsh-customize-mode/v1', revision:0, defaultsRevision:0,
  config:{...CONFIG}, defaultPrompt:'Default instructions for {{model}}', tools:TOOLS, warnings:[], ...overrides}});

function setup({locale = 'en', preset = 'customize-mode', rpc, refresh} = {}) {
  const renderer = hookRenderer(), dictionaries = {}, registrations = [], disposers = [], calls = [];
  const projection = store({revision:0});
  let language = locale, currentPreset = preset, running = false, refreshes = 0;
  let loaded;
  const globals = {window:{__ModuleLoader__:{load(value) {loaded = value;}}}, AbortController};
  vm.runInNewContext(source, globals, {filename:'client.js'});
  assert.equal(loaded.id, 'dsh-customize-mode');
  const plugin = loaded.factory(name => {assert.equal(name, 'react'); return renderer.React;});
  const ctx = {
    effect(effect) {const dispose = effect(); if (typeof dispose === 'function') disposers.push(dispose); return dispose;},
    locale:{register(namespace, id, dictionary) {assert.equal(namespace, 'dsh-customize-mode'); dictionaries[id] = dictionary; return () => {};},
      bind() {return key => {assert.ok(Object.hasOwn(dictionaries[language], key), 'missing translation: ' + key); return dictionaries[language][key];};}},
    slots:{inject(name, effect) {const dispose = effect(); disposers.push(dispose); return dispose;},
      register(options, component) {const registration = {options, component}; registrations.push(registration); return () => {const i = registrations.indexOf(registration); if (i >= 0) registrations.splice(i, 1);};}},
    sessions:{binding() {return {session:{projections:{faceOf(name) {assert.equal(name, 'customizeMode'); return projection;}}}};},
      async refreshProjections(id) {refreshes++; if (refresh) return refresh(id);}},
    connection:{rpc:{call(...args) {calls.push(args); return rpc ? rpc(...args) : Promise.resolve(response());}}}
  };
  plugin.apply(ctx);
  const settings = registrations.find(row => row.options.name === 'conversation.input.left');
  const props = {sessionId:'session-one', ...settings.options.inject('session-one'), t:ctx.locale.bind(),
    useSessions:select => select({byId:{'session-one':{projectionValues:{agentPreset:currentPreset}}}}),
    useSession:select => select({running})};
  renderer.mount(settings.component, props);
  return {renderer, calls, dictionaries, registrations, projection, plugin, ctx, props,
    setPreset(value) {currentPreset = value; renderer.rerender();},
    setRunning(value) {running = value; renderer.rerender();},
    setLocale(value) {language = value; renderer.rerender();},
    get refreshes() {return refreshes;},
    dispose() {renderer.unmount(); for (const dispose of disposers.reverse()) dispose?.();}
  };
}
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).filter(Boolean).join(' ');
  if (typeof tree !== 'object') return String(tree);
  return tree.type === 'style' ? '' : text(tree.props.children);
}
function find(app, predicate) {const node = nodes(app.renderer.tree).find(predicate); assert.ok(node, 'UI node not found'); return node;}
const button = (app, label) => find(app, node => node.type === 'button' && text(node) === label);
function inputFor(app, label) {
  const row = find(app, node => node.type === 'label' && text(node) === label);
  return nodes(row).find(node => node.type === 'input');
}
function click(app, node) {node.props.onClick(); app.renderer.flush();}
function change(app, node, value) {node.props.onChange({target:typeof value === 'boolean' ? {checked:value} : {value}}); app.renderer.flush();}
async function settle(app) {for (let i = 0; i < 8; i++) {await Promise.resolve(); app.renderer.flush();}}
async function open(app) {click(app, button(app, app.ctx.locale.bind()('settings'))); await settle(app);}

test('settings persistence records stay hidden across presets without reading their contents', () => {
  for (const preset of ['standard', 'ptc', 'minimal', 'cordis', 'customize-mode', undefined]) {
    const app = setup({preset});
    const records = app.registrations.filter(row => row.options.name === 'conversation.chat.commandview');
    assert.deepEqual(records.map(record => record.options.key), ['customize-mode']);
    const poison = new Proxy({}, {get() {throw new Error('Record contents must not be read or rendered');}});
    for (const record of records) {
      assert.equal(record.component({node:poison, sessionId:'s', t:app.ctx.locale.bind(), useSessions:() => preset}), null);
    }
    assert.equal(app.calls.length, 0);
    app.dispose();
  }
});

test('non-Custom sessions never mount controls or issue settings requests', () => {
  const app = setup({preset:'standard'});
  assert.equal(app.renderer.tree, null);
  assert.equal(app.projection.size, 0);
  app.setPreset('customize-mode');
  assert.ok(button(app, 'Custom settings'));
  assert.equal(app.calls.length, 0, 'mount is not a settings read');
  app.setPreset('standard');
  assert.equal(app.renderer.tree, null);
  assert.equal(app.projection.size, 0);
  app.dispose();
});

test('actual get request includes its AbortSignal and leaves the template as a placeholder', async () => {
  const app = setup(); await open(app);
  assert.deepEqual(plain(app.calls[0].slice(0, 3)), ['/api', 'customize-mode-settings', {sessionId:'session-one', request:{action:'get'}}]);
  assert.ok(app.calls[0][3] instanceof AbortSignal);
  const field = find(app, node => node.type === 'textarea');
  assert.equal(field.props.value, '');
  assert.equal(field.props.placeholder, 'Default instructions for {{model}}');
  assert.equal(field.props.disabled, true);
  assert.ok(field.props['aria-describedby']);
  assert.equal(find(app, node => node.type === 'dialog').host.showCalls, 1);
  app.dispose();
});

test('actual input events preserve empty prompt, all-off tools, independent context and revision on save', async () => {
  const app = setup({rpc:(_channel, _endpoint, payload) => Promise.resolve(payload.request.action === 'get' ? response({revision:7}) :
    response({revision:8, config:payload.request.config}))});
  await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, inputFor(app, 'Include environment information'), false);
  assert.equal(inputFor(app, 'Include the current time').props.checked, true);
  change(app, inputFor(app, 'Include the current time'), false);
  click(app, button(app, 'Disable all'));
  click(app, button(app, 'Apply to session'));
  await settle(app);
  assert.deepEqual(plain(app.calls[1][2].request), {action:'set', expectedRevision:7,
    config:{...CONFIG, overridePrompt:true, allowedTools:[], includeRuntimeContext:false, includeTimeContext:false}});
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  assert.equal(app.refreshes, 1);
  assert.equal(button(app, 'Custom settings').host.focusCalls, 1);
  app.dispose();
});

test('typed custom instructions are saved verbatim, without substituting template variables', async () => {
  const app = setup({rpc:(_channel, _endpoint, payload) => Promise.resolve(payload.request.action === 'get' ? response() :
    response({revision:1, config:payload.request.config}))});
  await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, find(app, node => node.type === 'textarea'), 'Literal {{model}} instructions');
  click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(app.calls[1][2].request.config.prompt, 'Literal {{model}} instructions');
  app.dispose();
});

for (const locale of ['en', 'zh']) {
  test(`default prompt fill changes only the empty draft and saves verbatim in ${locale}`, async () => {
    const template = 'Default {{model}} instructions\nKeep formatting.\n';
    const app = setup({locale, rpc:(_c, _e, payload) => Promise.resolve(payload.request.action === 'get' ?
      response({defaultPrompt:template, revision:7, defaultsRevision:3}) : response({revision:8, config:payload.request.config}))});
    await open(app);
    const t = app.ctx.locale.bind();
    assert.equal(button(app, t('fillDefaultPrompt')).props.disabled, true);
    change(app, inputFor(app, t('override')), true);
    click(app, button(app, t('fillDefaultPrompt')));
    assert.equal(find(app, node => node.type === 'textarea').props.value, template);
    assert.equal(nodes(app.renderer.tree).filter(node => node.props.role === 'alertdialog').length, 0);
    assert.equal(app.calls.length, 1, 'filling is not a persistence operation');
    assert.equal(inputFor(app, t('override')).props.checked, true);
    click(app, button(app, t('save'))); await settle(app);
    assert.deepEqual(plain(app.calls[1][2].request), {action:'set', expectedRevision:7,
      config:{...CONFIG, overridePrompt:true, prompt:template}});
    app.dispose();
  });

  test(`nonempty prompt requires explicit confirmation and cancellation preserves it in ${locale}`, async () => {
    const app = setup({locale}); await open(app);
    const t = app.ctx.locale.bind();
    change(app, inputFor(app, t('override')), true);
    change(app, find(app, node => node.type === 'textarea'), 'My custom draft');
    const fill = button(app, t('fillDefaultPrompt'));
    click(app, fill);
    const dialog = find(app, node => node.props.role === 'alertdialog');
    assert.equal(dialog.host.open, true);
    assert.equal(dialog.host.showCalls, 1);
    assert.equal(text(find(app, node => node.props.id === dialog.props['aria-labelledby'])), t('confirmOverwriteTitle'));
    assert.equal(text(find(app, node => node.props.id === dialog.props['aria-describedby'])), locale === 'zh' ?
      '默认系统提示词会覆盖已填写的自定义提示词，是否确认覆盖' : t('confirmOverwritePrompt'));
    assert.equal(button(app, t('cancel')).props.autoFocus, true);
    assert.equal(find(app, node => node.type === 'textarea').props.value, 'My custom draft');
    click(app, button(app, t('cancel')));
    assert.equal(dialog.host.open, false);
    assert.equal(fill.host.focusCalls, 1);
    assert.equal(find(app, node => node.type === 'textarea').props.value, 'My custom draft');
    click(app, button(app, t('fillDefaultPrompt')));
    click(app, button(app, t('confirm')));
    assert.equal(find(app, node => node.type === 'textarea').props.value, response().value.defaultPrompt);
    assert.equal(nodes(app.renderer.tree).filter(node => node.props.role === 'alertdialog').length, 0);
    assert.equal(find(app, node => node.type === 'dialog').host.open, true);
    assert.equal(app.calls.length, 1);
    app.dispose();
  });
}

test('whitespace is protected and Escape dismisses only the overwrite confirmation', async () => {
  const app = setup(); await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, find(app, node => node.type === 'textarea'), ' \n\t');
  click(app, button(app, 'Fill with default system prompt'));
  const dialog = find(app, node => node.props.role === 'alertdialog');
  let prevented = false, stopped = false;
  dialog.props.onCancel({preventDefault() {prevented = true;}, stopPropagation() {stopped = true;}});
  app.renderer.flush();
  assert.equal(prevented, true); assert.equal(stopped, true);
  assert.equal(dialog.host.open, false);
  assert.equal(find(app, node => node.type === 'dialog').host.open, true);
  assert.equal(find(app, node => node.type === 'textarea').props.value, ' \n\t');
  assert.equal(app.calls.length, 1);
  app.dispose();
});

test('an empty default is copied as empty text, never as the fallback placeholder', async () => {
  const app = setup({rpc:() => Promise.resolve(response({defaultPrompt:'', config:{...CONFIG, overridePrompt:true, prompt:'My draft'}}))});
  await open(app);
  click(app, button(app, 'Fill with default system prompt'));
  click(app, button(app, 'Confirm'));
  assert.equal(find(app, node => node.type === 'textarea').props.value, '');
  assert.equal(inputFor(app, 'Use a custom system prompt').props.checked, true);
  app.dispose();
});

test('reload and unmount dispose outstanding overwrite confirmations without changing drafts', async () => {
  const reload = deferred(); let reads = 0;
  const app = setup({rpc:() => ++reads === 1 ? Promise.resolve(response({config:{...CONFIG, overridePrompt:true, prompt:'My draft'}})) : reload.promise});
  await open(app);
  click(app, button(app, 'Fill with default system prompt'));
  const dialog = find(app, node => node.props.role === 'alertdialog');
  click(app, button(app, 'Reload settings'));
  assert.equal(dialog.host.open, false);
  assert.equal(button(app, 'Fill with default system prompt').props.disabled, true);
  click(app, button(app, 'Fill with default system prompt'));
  assert.equal(find(app, node => node.type === 'textarea').props.value, 'My draft');
  assert.equal(nodes(app.renderer.tree).filter(node => node.props.role === 'alertdialog').length, 0);
  reload.resolve(response({config:{...CONFIG, overridePrompt:true, prompt:'New draft'}})); await settle(app);
  assert.equal(nodes(app.renderer.tree).filter(node => node.props.role === 'alertdialog').length, 0);
  click(app, button(app, 'Fill with default system prompt'));
  const next = find(app, node => node.props.role === 'alertdialog');
  app.setPreset('standard');
  assert.equal(next.host.open, false);
  assert.equal(app.renderer.lateUpdates, 0);
  app.dispose();
});

test('HTTP failures are translated without exposing transport messages', async () => {
  const app = setup({rpc:() => Promise.reject(new Error('transport failure: HTTP 403 RAW_不要显示'))});
  await open(app);
  assert.match(text(app.renderer.tree), /Could not reach the app/);
  assert.doesNotMatch(text(app.renderer.tree), /RAW_|不要显示|HTTP 403/);
  app.setLocale('zh'); assert.match(text(app.renderer.tree), /无法连接到应用/);
  app.dispose();
});

test('tool selection and search use real handlers and preserve new-tool mode semantics', async () => {
  const app = setup(); await open(app);
  change(app, inputFor(app, 'Only selected tools'), true);
  change(app, inputFor(app, 'subagent Ask another agent'), false);
  assert.equal(inputFor(app, 'read Read a file').props.checked, true);
  change(app, find(app, node => node.type === 'input' && node.props.type === 'search'), 'subagent');
  assert.equal(nodes(app.renderer.tree).filter(node => node.type === 'code').length, 1);
  assert.match(text(app.renderer.tree), /New tools stay off/);
  change(app, inputFor(app, 'All available tools'), true);
  assert.match(text(app.renderer.tree), /New tools are included automatically/);
  app.dispose();
});

test('closing an in-flight read aborts it, restores closed state, and ignores its late completion', async () => {
  const pending = deferred(); const app = setup({rpc:() => pending.promise});
  click(app, button(app, 'Custom settings'));
  const signal = app.calls[0][3];
  const close = button(app, 'Close'); assert.notEqual(close.props.disabled, true);
  click(app, close);
  assert.equal(signal.aborted, true);
  pending.resolve(response({config:{...CONFIG, prompt:'STALE CONTENT'}})); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  assert.equal(button(app, 'Custom settings').host.focusCalls, 1);
  assert.doesNotMatch(text(app.renderer.tree), /STALE CONTENT/);
  assert.equal(app.renderer.lateUpdates, 0);
  app.dispose();
});

test('reopening does not let an earlier read overwrite the newer response or busy state', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const app = setup({rpc:() => ++count === 1 ? first.promise : second.promise});
  click(app, button(app, 'Custom settings')); click(app, button(app, 'Close')); click(app, button(app, 'Custom settings'));
  second.resolve(response({config:{...CONFIG, prompt:'NEW'}})); await settle(app);
  first.resolve(response({config:{...CONFIG, prompt:'OLD'}})); await settle(app);
  assert.equal(find(app, node => node.type === 'textarea').props.value, 'NEW');
  assert.equal(button(app, 'Apply to session').props.disabled, false);
  app.dispose();
});

test('leaving Custom mode aborts a pending save and late callbacks cannot update an unmounted panel', async () => {
  const save = deferred(); const app = setup({rpc:(_channel, _endpoint, payload) => payload.request.action === 'get' ? Promise.resolve(response()) : save.promise});
  await open(app); click(app, button(app, 'Apply to session'));
  app.setPreset('standard');
  assert.equal(app.calls[1][3].aborted, true);
  save.resolve(response({revision:1})); await settle(app);
  assert.equal(app.renderer.tree, null); assert.equal(app.renderer.lateUpdates, 0); assert.equal(app.refreshes, 0);
  app.dispose();
});

test('successful save closes immediately without waiting for projection refresh', async () => {
  const save = deferred(), refresh = deferred();
  const app = setup({refresh:() => refresh.promise, rpc:(_c, _e, payload) =>
    payload.request.action === 'get' ? Promise.resolve(response()) : save.promise});
  await open(app);
  click(app, button(app, 'Apply to session'));
  assert.equal(find(app, node => node.type === 'dialog').host.open, true);
  assert.equal(button(app, 'Applying…').props.disabled, true);
  save.resolve(response({revision:1})); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  assert.equal(app.calls[1][3].aborted, false, 'do not cancel a completed save');
  assert.equal(button(app, 'Custom settings').host.focusCalls, 1);
  assert.equal(app.refreshes, 1);
  await open(app);
  refresh.reject(new Error('late refresh failure')); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, true);
  assert.equal(button(app, 'Apply to session').props.disabled, false);
  app.dispose();
});

test('failed save keeps the dialog and draft available for retry', async () => {
  let attempts = 0;
  const app = setup({rpc:(_c, _e, payload) => {
    if (payload.request.action === 'get') return Promise.resolve(response());
    return ++attempts === 1 ? Promise.reject(new Error('network unavailable')) :
      Promise.resolve(response({revision:1, config:payload.request.config}));
  }});
  await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, find(app, node => node.type === 'textarea'), 'Keep my draft');
  click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, true);
  assert.equal(find(app, node => node.type === 'textarea').props.value, 'Keep my draft');
  assert.match(text(app.renderer.tree), /Could not reach the app/);
  assert.equal(button(app, 'Apply to session').props.disabled, false);
  assert.equal(app.refreshes, 0);
  click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(app.calls[2][2].request.config.prompt, 'Keep my draft');
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  app.dispose();
});

for (const locale of ['en', 'zh']) {
  test(`default action is separated and saves only the global draft in ${locale}`, async () => {
    const app = setup({locale, rpc:(_c, _e, payload) => {
      if (payload.request.action === 'get') return Promise.resolve(response({revision:7, defaultsRevision:3}));
      return Promise.resolve(response({revision:payload.request.action === 'set-defaults' ? 4 : 8, config:payload.request.config}));
    }});
    await open(app); app.setRunning(true);
    const t = app.ctx.locale.bind();
    const defaults = button(app, t('saveDefaults'));
    const group = find(app, node => node.props.className === 'dshcm-default-action');
    assert.ok(nodes(group).some(node => node === defaults));
    assert.equal(defaults.props['data-primary'], undefined);
    assert.equal(button(app, t('save')).props['data-primary'], true);
    assert.ok(defaults.props.title);
    assert.equal(text(find(app, node => node.props.id === defaults.props['aria-describedby'])), t('defaultsScope'));
    change(app, inputFor(app, t('override')), true);
    change(app, find(app, node => node.type === 'textarea'), 'Global draft');
    click(app, button(app, t('disableAll')));
    click(app, button(app, t('saveDefaults'))); await settle(app);
    assert.deepEqual(plain(app.calls[1][2].request), {action:'set-defaults', expectedRevision:3,
      config:{...CONFIG, overridePrompt:true, prompt:'Global draft', allowedTools:[]}});
    assert.equal(app.refreshes, 0);
    assert.equal(find(app, node => node.type === 'dialog').host.open, true);
    assert.equal(find(app, node => node.type === 'textarea').props.value, 'Global draft');
    assert.ok(text(app.renderer.tree).includes(t('defaultsSaved')));
    click(app, button(app, t('save'))); await settle(app);
    assert.equal(app.calls[2][2].request.action, 'set');
    assert.equal(app.calls[2][2].request.expectedRevision, 7, 'global revision must not replace the session revision');
    assert.equal(app.refreshes, 1);
    assert.equal(find(app, node => node.type === 'dialog').host.open, false);
    app.dispose();
  });
}

test('global revisions advance independently and a stale session does not block saving defaults', async () => {
  let revision = 20;
  const app = setup({rpc:(_c, _e, payload) => Promise.resolve(payload.request.action === 'get' ?
    response({revision:2, defaultsRevision:revision}) : response({revision:++revision, config:payload.request.config}))});
  await open(app);
  app.projection.set({revision:9}); app.renderer.flush();
  assert.equal(button(app, 'Apply to session').props.disabled, true);
  assert.equal(button(app, 'Save as default').props.disabled, false);
  click(app, button(app, 'Save as default')); await settle(app);
  click(app, button(app, 'Save as default')); await settle(app);
  assert.deepEqual(app.calls.slice(1).map(call => call[2].request.expectedRevision), [20,21]);
  assert.equal(app.refreshes, 0);
  assert.equal(button(app, 'Apply to session').props.disabled, true);
  app.dispose();
});

test('default save errors retain the draft and use localized diagnostics', async () => {
  const app = setup({rpc:(_c, _e, payload) => Promise.resolve(payload.request.action === 'get' ? response() :
    {ok:false, error:{code:'DEFAULTS_REVISION_CONFLICT', message:'PRIVATE_SERVER_TEXT'}})});
  await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, find(app, node => node.type === 'textarea'), 'Keep this draft');
  click(app, button(app, 'Save as default')); await settle(app);
  assert.match(text(app.renderer.tree), /global default changed elsewhere/);
  assert.doesNotMatch(text(app.renderer.tree), /PRIVATE_SERVER_TEXT/);
  assert.equal(find(app, node => node.type === 'textarea').props.value, 'Keep this draft');
  assert.equal(find(app, node => node.type === 'dialog').host.open, true);
  app.setLocale('zh'); assert.match(text(app.renderer.tree), /全局默认已在其他位置更改/);
  app.dispose();
});

test('in-flight default save blocks both actions and closing ignores its late result', async () => {
  const save = deferred();
  const app = setup({rpc:(_c, _e, payload) => payload.request.action === 'get' ? Promise.resolve(response()) : save.promise});
  await open(app);
  const defaults = button(app, 'Save as default').props.onClick;
  const apply = button(app, 'Apply to session').props.onClick;
  defaults(); defaults(); apply(); app.renderer.flush();
  assert.equal(app.calls.length, 2);
  assert.equal(button(app, 'Saving default…').props.disabled, true);
  assert.equal(button(app, 'Apply to session').props.disabled, true);
  click(app, button(app, 'Close'));
  assert.equal(app.calls[1][3].aborted, true);
  save.resolve(response({revision:1})); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  assert.equal(app.refreshes, 0);
  assert.equal(app.renderer.lateUpdates, 0);
  await open(app);
  assert.doesNotMatch(text(app.renderer.tree), /Default saved/);
  app.dispose();
});

test('double save is blocked synchronously, not only by the next disabled render', async () => {
  const save = deferred(); const app = setup({rpc:(_channel, _endpoint, payload) => payload.request.action === 'get' ? Promise.resolve(response()) : save.promise});
  await open(app); const onClick = button(app, 'Apply to session').props.onClick;
  onClick(); onClick(); app.renderer.flush(); assert.equal(app.calls.length, 2);
  save.resolve(response({revision:1})); await settle(app); app.dispose();
});

test('running saves are enabled with next-turn guidance, but stale revisions still block saves', async () => {
  const app = setup(); await open(app);
  app.setRunning(true); assert.equal(button(app, 'Apply to session').props.disabled, false);
  assert.match(text(app.renderer.tree), /apply from the next turn/);
  click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(app.calls.length, 2);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  await open(app);
  app.projection.set({revision:2}); app.renderer.flush();
  assert.equal(button(app, 'Apply to session').props.disabled, true);
  assert.match(text(app.renderer.tree), /changed elsewhere/); app.dispose();
});

test('a committed save remains successful if projection refresh fails', async () => {
  const app = setup({refresh:() => Promise.reject(new Error('refresh failed')), rpc:(_c, _e, payload) => Promise.resolve(payload.request.action === 'get' ? response() : response({revision:1, config:payload.request.config}))});
  await open(app); click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  assert.equal(nodes(app.renderer.tree).filter(node => node.props.role === 'alert').length, 0);
  app.dispose();
});

for (const locale of ['en', 'zh']) {
  test(`backend errors and warnings are localized by stable code in ${locale}`, async () => {
    const app = setup({locale, rpc:(_c, _e, payload) => Promise.resolve(payload.request.action === 'get' ? response({warnings:[
      {code:'CATALOG_STALE', message:'RAW_SERVER_TEXT_不要显示'}, {code:'POLICY_UNAVAILABLE', message:'OTHER_RAW'}]}) :
      {ok:false, error:{code:'REVISION_CONFLICT', message:'RAW_SERVER_TEXT_不要显示'}})});
    await open(app);
    assert.match(text(app.renderer.tree), locale === 'en' ? /tool list may be out of date/ : /工具列表可能不是最新/);
    click(app, button(app, app.dictionaries[locale].save)); await settle(app);
    assert.match(text(app.renderer.tree), locale === 'en' ? /changed elsewhere/ : /其他位置更改/);
    assert.doesNotMatch(text(app.renderer.tree), /RAW_SERVER_TEXT|OTHER_RAW|不要显示/);
    app.setLocale(locale === 'en' ? 'zh' : 'en');
    assert.match(text(app.renderer.tree), locale === 'en' ? /其他位置更改/ : /changed elsewhere/);
    app.dispose();
  });
}

test('all published backend error codes have matching English and Chinese messages, unknown codes stay generic', async () => {
  const app = setup({rpc:() => Promise.resolve({ok:false, error:{code:'FUTURE_ERROR', message:'SECRET_RAW_ERROR'}})});
  const codes = ['FORBIDDEN','UNAUTHORIZED','WRONG_PRESET','SESSION_NOT_FOUND','ROOT_SESSION_REQUIRED','SESSION_CHANGED','HUMAN_ONLY','BUSY','REVISION_CONFLICT','DEFAULTS_REVISION_CONFLICT','DEFAULTS_SAVE_FAILED','INVALID_REQUEST','RESERVED_TOOL','UNSUPPORTED_POLICY','TOOL_VISIBILITY_CONFLICT','COMMIT_FAILED','PREVIEW_FAILED','ABORTED','UNAVAILABLE','NOT_FOUND','REQUEST_TOO_LARGE','UNSUPPORTED_MEDIA_TYPE','SETTINGS_FAILED'];
  for (const code of codes) for (const locale of ['en','zh']) assert.equal(typeof app.dictionaries[locale]['error_' + code], 'string');
  assert.deepEqual(Object.keys(app.dictionaries.en).sort(), Object.keys(app.dictionaries.zh).sort());
  await open(app);
  assert.match(text(app.renderer.tree), /Something went wrong/);
  assert.doesNotMatch(text(app.renderer.tree), /SECRET_RAW_ERROR|FUTURE_ERROR/);
  app.dispose();
});

test('get requires its complete catalog, template, warnings and normalized context flags', async () => {
  for (const field of ['tools', 'defaultPrompt', 'defaultsRevision', 'warnings', 'includeRuntimeContext', 'includeTimeContext']) {
    const reply = response();
    if (field.startsWith('include')) delete reply.value.config[field];
    else delete reply.value[field];
    const app = setup({rpc:() => Promise.resolve(reply)});
    await open(app);
    assert.match(text(app.renderer.tree), /unexpected response/, field);
    assert.equal(nodes(app.renderer.tree).filter(node => node.type === 'textarea').length, 0, field);
    app.dispose();
  }
  for (const overrides of [{tools:[{name:'read'}]}, {warnings:['invalid warning shape']}, {defaultPrompt:42}]) {
    const app = setup({rpc:() => Promise.resolve(response(overrides))});
    await open(app); assert.match(text(app.renderer.tree), /unexpected response/); app.dispose();
  }
});

test('set response may omit catalog and template; reopening fetches a fresh form', async () => {
  const app = setup({rpc:(_channel, _endpoint, payload) => {
    if (payload.request.action === 'get') return Promise.resolve(response());
    return Promise.resolve({ok:true, value:{protocol:'dsh-customize-mode/v1', revision:1, config:payload.request.config, warnings:[]}});
  }});
  await open(app); click(app, button(app, 'Apply to session')); await settle(app);
  assert.equal(find(app, node => node.type === 'dialog').host.open, false);
  await open(app);
  assert.equal(app.calls.length, 3);
  assert.equal(app.calls[2][2].request.action, 'get');
  assert.equal(find(app, node => node.type === 'textarea').props.placeholder, 'Default instructions for {{model}}');
  assert.equal(nodes(app.renderer.tree).filter(node => node.type === 'code').length, 2);
  app.dispose();
});

test('malformed responses produce a localized protocol error instead of a broken editable form', async () => {
  const app = setup({rpc:() => Promise.resolve(response({config:{...CONFIG, prompt:42}}))});
  await open(app); assert.match(text(app.renderer.tree), /unexpected response/);
  assert.equal(nodes(app.renderer.tree).filter(node => node.type === 'textarea').length, 0);
  assert.equal(button(app, 'Apply to session').props.disabled, true); app.dispose();
});

test('Escape cancels loading, and every modal label resolves to visible text', () => {
  const pending = deferred(); const app = setup({rpc:() => pending.promise});
  click(app, button(app, 'Custom settings'));
  const dialog = find(app, node => node.type === 'dialog');
  assert.equal(find(app, node => node.props.id === dialog.props['aria-labelledby']).type, 'h2');
  let prevented = false;
  dialog.props.onCancel({preventDefault() {prevented = true;}}); app.renderer.flush();
  assert.equal(prevented, true); assert.equal(app.calls[0][3].aborted, true); app.dispose();
});

test('plugin disposal removes both its controls and hidden-record registration', () => {
  const app = setup(); app.dispose(); assert.equal(app.registrations.length, 0); assert.equal(app.projection.size, 0);
});

test('user-facing copy contains no transport jargon, record dumps or unused mode toggles', () => {
  const app = setup();
  for (const dictionary of Object.values(app.dictionaries)) {
    assert.doesNotMatch(Object.values(dictionary).join('\n'), /PTC|run_code|配置操作记录|Settings operation record|兼容性说明|占位内容不会发送|finish before saving|回复结束后再保存/);
    for (const key of ['off','on','enable','scope','compatibility','permissions']) assert.equal(Object.hasOwn(dictionary, key), false);
  }
  app.dispose();
});
