import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MESSAGES } from './errors.js';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

/** Minimal synchronous hook renderer: enough React to drive the real components and host elements. */
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
    useMemo(factory, deps) {
      const [state] = slot(() => ({deps:undefined, value:undefined}));
      if (!sameDeps(state.deps, deps)) { state.deps = deps; state.value = factory(); }
      return state.value;
    },
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
    if (typeof props.ref === 'function') props.ref(host);
    else if (props.ref) props.ref.current = host;
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
const CONFIG = {baseMode:'standard', overridePrompt:false, prompt:'', allowedTools:null, includeRuntimeContext:true, includeTimeContext:true};
const TOOLS = [{name:'read', description:'Read a file'}, {name:'subagent', description:'Ask another agent'}];
const BASES = [{id:'standard', available:true}, {id:'minimal', available:true}, {id:'review', name:'Code review', available:true}, {id:'cordis', available:false}];
const ok = value => Promise.resolve({ok:true, value});
const settings = (overrides = {}) => ({protocol:'dsh-customize-mode/v1', revision:0, baseLocked:false, warnings:[], config:{...CONFIG},
  bases:BASES, catalog:{template:'Default instructions for {{model}}', tools:TOOLS}, ...overrides});
const presetList = (presets = [], defaultTitle = null) => ({protocol:'dsh-customize-mode/v1', defaultTitle, presets});
const preset = (title, config = {}, extra = {}) => ({title, note:'', updatedAt:Date.UTC(2026, 10, 1), config:{...CONFIG, ...config}, ...extra});

/** Default Host: answers every action from simple state the test can inspect and change. */
function host(overrides = {}) {
  const state = {settings:settings(), presets:presetList()};
  return {state, rpc(_channel, _endpoint, payload) {
    const request = payload.request;
    if (overrides[request.action]) return overrides[request.action](request, state);
    switch (request.action) {
      case 'get': return ok(state.settings);
      case 'set': return ok({protocol:'dsh-customize-mode/v1', revision:request.expectedRevision + 1, config:request.config, baseLocked:false, warnings:[]});
      case 'describe-base': return ok({protocol:'dsh-customize-mode/v1', baseMode:request.baseMode, template:`Template of ${request.baseMode}`,
        tools:[{name:`${request.baseMode}-tool`, description:'Base tool'}]});
      case 'list-presets': return ok(state.presets);
      case 'save-preset': {
        const others = state.presets.presets.filter(item => item.title !== request.title);
        if (others.length !== state.presets.presets.length && !request.overwrite) return ok(undefined).then(() => ({ok:false, error:{code:'PRESET_EXISTS'}}));
        state.presets = presetList([...others, preset(request.title, request.config, {note:request.note})], state.presets.defaultTitle);
        return ok(state.presets);
      }
      case 'delete-preset':
        state.presets = presetList(state.presets.presets.filter(item => item.title !== request.title),
          state.presets.defaultTitle === request.title ? null : state.presets.defaultTitle);
        return ok(state.presets);
      case 'set-default-preset':
        state.presets = presetList(state.presets.presets, request.title);
        return ok(state.presets);
    }
  }};
}

function setup({locale = 'en', preset: currentPresetId = 'customize-mode', rpc, refresh} = {}) {
  const renderer = hookRenderer(), dictionaries = {}, registrations = [], disposers = [], calls = [];
  const projection = store({revision:0});
  const localeListeners = new Set();
  let language = locale, currentPreset = currentPresetId, running = false, refreshes = 0;
  let loaded;
  const globals = {window:{__ModuleLoader__:{load(value) {loaded = value;}}}, AbortController, Intl, Date};
  vm.runInNewContext(source, globals, {filename:'client.js'});
  assert.equal(loaded.id, 'dsh-customize-mode');
  const plugin = loaded.factory(name => {assert.equal(name, 'react'); return renderer.React;});
  const backend = rpc ? {rpc} : host();
  const translate = (key, params) => {
    assert.ok(Object.hasOwn(dictionaries[language], key), 'missing translation: ' + key);
    const template = dictionaries[language][key];
    return params ? template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match) : template;
  };
  const ctx = {
    effect(effect) {const dispose = effect(); if (typeof dispose === 'function') disposers.push(dispose); return dispose;},
    locale:{register(namespace, id, dictionary) {assert.equal(namespace, 'dsh-customize-mode'); dictionaries[id] = dictionary; return () => {};},
      bind() {return translate;},
      subscribe(listener) {localeListeners.add(listener); return () => localeListeners.delete(listener);},
      getSnapshot() {return {active:language};}},
    slots:{inject(name, effect) {const dispose = effect(); disposers.push(dispose); return dispose;},
      register(options, component) {const registration = {options, component}; registrations.push(registration); return () => {const i = registrations.indexOf(registration); if (i >= 0) registrations.splice(i, 1);};}},
    sessions:{binding() {return {session:{projections:{faceOf(name) {assert.equal(name, 'customizeMode'); return projection;}}}};},
      async refreshProjections(id) {refreshes++; if (refresh) return refresh(id);}},
    connection:{rpc:{call(...args) {calls.push(args); return backend.rpc(...args);}}}
  };
  plugin.apply(ctx);
  const control = registrations.find(row => row.options.name === 'conversation.input.left');
  const props = {sessionId:'session-one', ...control.options.inject('session-one'), t:translate,
    useSessions:select => select({byId:{'session-one':{projectionValues:{agentPreset:currentPreset}}}}),
    useSession:select => select({running})};
  renderer.mount(control.component, props);
  return {renderer, calls, dictionaries, registrations, projection, plugin, ctx, props, backend, t:translate,
    actions:() => calls.map(call => call[2].request.action),
    setPreset(value) {currentPreset = value; renderer.rerender();},
    setRunning(value) {running = value; renderer.rerender();},
    setLocale(value) {language = value; for (const listener of localeListeners) listener(); renderer.rerender();},
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
function find(app, predicate, root = app.renderer.tree) {const node = nodes(root).find(predicate); assert.ok(node, 'UI node not found'); return node;}
const all = (app, predicate) => nodes(app.renderer.tree).filter(predicate);
const button = (app, label, root) => find(app, node => node.type === 'button' && text(node) === label, root);
const dialogs = app => all(app, node => node.type === 'dialog');
const mainDialog = app => dialogs(app)[0];
const dialogTitled = (app, title) => dialogs(app).find(dialog => text(find(app, node => node.props.id === dialog.props['aria-labelledby'])) === title);
const prompt = app => find(app, node => node.type === 'textarea' && node.props.className === 'dshcm-prompt');
function inputFor(app, label, root) {
  const row = find(app, node => node.type === 'label' && text(node) === label, root);
  return nodes(row).find(node => node.type === 'input');
}
function click(app, node) {node.props.onClick(); app.renderer.flush();}
function change(app, node, value) {node.props.onChange({target:typeof value === 'boolean' ? {checked:value} : {value}}); app.renderer.flush();}
function submit(app, form) {form.props.onSubmit({preventDefault() {}}); app.renderer.flush();}
async function settle(app) {for (let i = 0; i < 10; i++) {await Promise.resolve(); app.renderer.flush();}}
async function open(app) {click(app, button(app, app.t('settings'))); await settle(app);}
async function openPresets(app) {click(app, button(app, app.t('presetsButton'))); await settle(app); return dialogTitled(app, app.t('presetsTitle'));}

test('settings records stay hidden across presets without reading their contents', () => {
  for (const presetId of ['standard', 'ptc', 'minimal', 'cordis', 'customize-mode', undefined]) {
    const app = setup({preset:presetId});
    const records = app.registrations.filter(row => row.options.name === 'conversation.chat.commandview');
    assert.deepEqual(records.map(record => record.options.key), ['customize-mode']);
    const poison = new Proxy({}, {get() {throw new Error('Record contents must not be read or rendered');}});
    for (const record of records) assert.equal(record.component({node:poison, sessionId:'s', t:app.t, useSessions:() => presetId}), null);
    assert.equal(app.calls.length, 0);
    app.dispose();
  }
});

test('other modes never mount the control or send requests', () => {
  const app = setup({preset:'standard'});
  assert.equal(app.renderer.tree, null);
  assert.equal(app.projection.size, 0);
  app.setPreset('customize-mode');
  assert.ok(button(app, 'Custom settings'));
  assert.equal(app.calls.length, 0, 'mounting is not a settings read');
  app.setPreset('standard');
  assert.equal(app.renderer.tree, null);
  app.dispose();
});

test('opening reads the settings with a cancellable request and shows the base template as a placeholder', async () => {
  const app = setup(); await open(app);
  assert.deepEqual(plain(app.calls[0].slice(0, 3)), ['/api', 'customize-mode-settings', {sessionId:'session-one', request:{action:'get'}}]);
  assert.ok(app.calls[0][3] instanceof AbortSignal);
  assert.equal(prompt(app).props.value, '');
  assert.equal(prompt(app).props.placeholder, 'Default instructions for {{model}}');
  assert.equal(prompt(app).props.disabled, true);
  assert.equal(mainDialog(app).host.showCalls, 1);
  app.dispose();
});

test('the base mode list names built-in modes, keeps custom names, and marks unavailable ones', async () => {
  for (const [locale, standard] of [['en', 'Standard mode'], ['zh', '标准模式']]) {
    const app = setup({locale}); await open(app);
    const select = find(app, node => node.type === 'select');
    const options = nodes(select).filter(node => node.type === 'option');
    assert.deepEqual(options.map(option => [option.props.value, text(option), option.props.disabled]),
      [['standard', standard, false], ['minimal', locale === 'en' ? 'Minimal mode' : '极简模式', false], ['review', 'Code review', false],
        ['cordis', app.t('baseUnavailable', {name:locale === 'en' ? 'Creator mode' : '创造模式'}), true]]);
    assert.equal(select.props.disabled, false);
    app.dispose();
  }
});

test('changing the base mode loads that mode’s tools and template and saves the new base', async () => {
  const app = setup(); await open(app);
  change(app, find(app, node => node.type === 'select'), 'minimal');
  await settle(app);
  assert.deepEqual(plain(app.calls[1][2].request), {action:'describe-base', baseMode:'minimal'});
  assert.equal(prompt(app).props.placeholder, 'Template of minimal');
  assert.ok(inputFor(app, 'minimal-tool Base tool'));
  click(app, button(app, 'Apply')); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request), {action:'set', expectedRevision:0, config:{...CONFIG, baseMode:'minimal'}});
  assert.equal(mainDialog(app).host.open, false);
  app.dispose();
});

test('a started conversation shows its base mode as fixed', async () => {
  const {rpc, state} = host();
  state.settings = settings({baseLocked:true});
  const app = setup({rpc}); await open(app);
  assert.equal(find(app, node => node.type === 'select').props.disabled, true);
  assert.ok(text(app.renderer.tree).includes(app.t('baseLocked')));
  app.dispose();
});

test('input changes save the empty prompt, all-off tools, and independent context flags with the read revision', async () => {
  const {rpc, state} = host();
  state.settings = settings({revision:7});
  const app = setup({rpc}); await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, inputFor(app, 'Include environment info'), false);
  change(app, inputFor(app, 'Include the current time'), false);
  change(app, inputFor(app, 'Only the selected tools'), true);
  click(app, button(app, 'Clear all'));
  click(app, button(app, 'Apply'));
  await settle(app);
  assert.deepEqual(plain(app.calls[1][2].request), {action:'set', expectedRevision:7,
    config:{...CONFIG, overridePrompt:true, allowedTools:[], includeRuntimeContext:false, includeTimeContext:false}});
  assert.equal(mainDialog(app).host.open, false);
  assert.equal(app.refreshes, 1);
  assert.equal(button(app, 'Custom settings').host.focusCalls, 1);
  app.dispose();
});

test('tool selection keeps names from other base modes and search filters the list', async () => {
  const {rpc, state} = host();
  state.settings = settings({config:{...CONFIG, allowedTools:['read', 'bash']}});
  const app = setup({rpc}); await open(app);
  assert.match(text(app.renderer.tree), /1 of 2 selected/);
  assert.match(text(app.renderer.tree), /this mode does not have: bash/);
  change(app, inputFor(app, 'subagent Ask another agent'), true);
  change(app, find(app, node => node.type === 'input' && node.props.type === 'search'), 'subagent');
  assert.equal(all(app, node => node.type === 'code').length, 1);
  click(app, button(app, 'Apply')); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request.config.allowedTools), ['bash', 'read', 'subagent']);
  app.dispose();
});

for (const locale of ['en', 'zh']) {
  test(`the variable guide opens and closes without touching the draft in ${locale}`, async () => {
    const app = setup({locale}); await open(app);
    const t = app.t;
    change(app, inputFor(app, t('override')), true);
    change(app, prompt(app), 'Use {{model}} from {{provider}}.');
    const trigger = button(app, t('promptVariables'));
    click(app, trigger);
    const guide = dialogTitled(app, t('promptVariablesTitle'));
    assert.equal(guide.host.open, true);
    for (const key of ['promptVariablesBuiltins', 'promptVariablesSyntax', 'promptVariablesFailure']) assert.ok(text(guide).includes(t(key)));
    let prevented = false, stopped = false;
    guide.props.onCancel({preventDefault() {prevented = true;}, stopPropagation() {stopped = true;}});
    app.renderer.flush();
    assert.equal(prevented, true); assert.equal(stopped, true);
    assert.equal(guide.host.open, false); assert.equal(mainDialog(app).host.open, true);
    assert.equal(trigger.host.focusCalls, 1);
    assert.equal(prompt(app).props.value, 'Use {{model}} from {{provider}}.');
    assert.deepEqual(app.actions(), ['get']);
    app.dispose();
  });

  test(`filling the default prompt asks before replacing text in ${locale}`, async () => {
    const app = setup({locale}); await open(app);
    const t = app.t;
    assert.equal(button(app, t('fillDefaultPrompt')).props.disabled, true);
    change(app, inputFor(app, t('override')), true);
    click(app, button(app, t('fillDefaultPrompt')));
    assert.equal(prompt(app).props.value, 'Default instructions for {{model}}');
    change(app, prompt(app), 'My draft');
    const fill = button(app, t('fillDefaultPrompt'));
    click(app, fill);
    const confirm = find(app, node => node.props.role === 'alertdialog');
    assert.equal(text(find(app, node => node.props.id === confirm.props['aria-labelledby'])), t('confirmOverwriteTitle'));
    assert.equal(button(app, t('cancel'), confirm).props.autoFocus, true);
    click(app, button(app, t('cancel'), confirm));
    assert.equal(confirm.host.open, false);
    assert.equal(fill.host.focusCalls, 1);
    assert.equal(prompt(app).props.value, 'My draft');
    click(app, button(app, t('fillDefaultPrompt')));
    click(app, button(app, t('replace'), find(app, node => node.props.role === 'alertdialog')));
    assert.equal(prompt(app).props.value, 'Default instructions for {{model}}');
    assert.deepEqual(app.actions(), ['get']);
    app.dispose();
  });
}

test('saving the current settings as a preset sends the draft, title, and note', async () => {
  const app = setup(); await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, prompt(app), 'Review the diff');
  const manager = await openPresets(app);
  assert.equal(manager.host.open, true);
  assert.deepEqual(app.actions(), ['get', 'list-presets']);
  assert.ok(text(manager).includes('No presets yet.'));
  change(app, find(app, node => node.type === 'input' && node.props.placeholder === app.t('presetNamePlaceholder')), '  Code review ');
  change(app, find(app, node => node.type === 'textarea' && node.props.placeholder === app.t('presetNotePlaceholder')), 'Checks diffs');
  submit(app, find(app, node => node.type === 'form'));
  await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request), {action:'save-preset', title:'Code review', note:'Checks diffs',
    config:{...CONFIG, overridePrompt:true, prompt:'Review the diff'}, overwrite:false});
  assert.match(text(app.renderer.tree), /Saved “Code review”\./);
  assert.match(text(app.renderer.tree), /Checks diffs/);
  assert.equal(mainDialog(app).host.open, true, 'saving a preset does not apply or close the settings');
  app.dispose();
});

test('saving under an existing title asks before replacing it', async () => {
  const backend = host();
  backend.state.presets = presetList([preset('Daily', {prompt:'old'})]);
  const app = setup({rpc:backend.rpc}); await open(app);
  await openPresets(app);
  change(app, find(app, node => node.type === 'input' && node.props.placeholder === app.t('presetNamePlaceholder')), 'Daily');
  submit(app, find(app, node => node.type === 'form'));
  const confirm = find(app, node => node.props.role === 'alertdialog');
  assert.equal(text(find(app, node => node.props.id === confirm.props['aria-labelledby'])), 'Replace “Daily”?');
  assert.deepEqual(app.actions(), ['get', 'list-presets'], 'nothing is written before confirming');
  click(app, button(app, 'Cancel', confirm));
  assert.deepEqual(app.actions(), ['get', 'list-presets']);
  submit(app, find(app, node => node.type === 'form'));
  click(app, button(app, 'Replace', find(app, node => node.props.role === 'alertdialog')));
  await settle(app);
  assert.equal(app.calls.at(-1)[2].request.overwrite, true);
  assert.equal(backend.state.presets.presets.length, 1);
  app.dispose();
});

test('loading a preset fills the settings window and closes the preset manager at once', async () => {
  const backend = host();
  backend.state.presets = presetList([preset('Minimal review', {baseMode:'minimal', overridePrompt:true, prompt:'Be brief', allowedTools:['bash']})]);
  const app = setup({rpc:backend.rpc}); await open(app);
  const manager = await openPresets(app);
  const trigger = button(app, 'Presets');
  click(app, button(app, 'Load', manager));
  assert.equal(manager.host.open, false);
  assert.equal(trigger.host.focusCalls, 1);
  assert.equal(mainDialog(app).host.open, true);
  await settle(app);
  assert.equal(prompt(app).props.value, 'Be brief');
  assert.equal(find(app, node => node.type === 'select').props.value, 'minimal');
  assert.match(text(app.renderer.tree), /Loaded “Minimal review”\. Click “Apply”/);
  assert.equal(app.actions().filter(action => action === 'set').length, 0, 'loading does not apply anything by itself');
  click(app, button(app, 'Apply')); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request.config), {...CONFIG, baseMode:'minimal', overridePrompt:true, prompt:'Be brief', allowedTools:['bash']});
  app.dispose();
});

test('loading a preset into a started conversation keeps the current base mode', async () => {
  const backend = host();
  backend.state.settings = settings({baseLocked:true});
  backend.state.presets = presetList([preset('Minimal review', {baseMode:'minimal', prompt:'x'})]);
  const app = setup({rpc:backend.rpc}); await open(app);
  click(app, button(app, 'Load', await openPresets(app)));
  await settle(app);
  assert.equal(find(app, node => node.type === 'select').props.value, 'standard');
  assert.match(text(app.renderer.tree), /Its base mode, Minimal mode, was not applied/);
  app.dispose();
});

test('the default preset can be set, removed, and deleted with a warning', async () => {
  const backend = host();
  backend.state.presets = presetList([preset('A'), preset('B')]);
  const app = setup({rpc:backend.rpc}); await open(app);
  let manager = await openPresets(app);
  const rows = () => all(app, node => node.type === 'li');
  click(app, button(app, 'Set as default', rows()[1])); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request), {action:'set-default-preset', title:'B'});
  assert.ok(text(rows()[1]).includes('Default'));
  click(app, button(app, 'Remove default', rows()[1])); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request), {action:'set-default-preset', title:null});
  click(app, button(app, 'Set as default', rows()[0])); await settle(app);
  const deleteButton = button(app, 'Delete', rows()[0]);
  click(app, deleteButton);
  const confirm = find(app, node => node.props.role === 'alertdialog');
  assert.match(text(confirm), /This is the default preset/);
  click(app, button(app, 'Delete', confirm)); await settle(app);
  assert.deepEqual(plain(app.calls.at(-1)[2].request), {action:'delete-preset', title:'A'});
  assert.deepEqual(rows().map(row => text(row).split(' ')[0]), ['B']);
  manager = dialogTitled(app, 'Presets');
  assert.equal(manager.host.open, true, 'deleting keeps the manager open');
  app.dispose();
});

test('preset errors are translated and keep the manager open', async () => {
  const app = setup({rpc:host({'save-preset': () => Promise.resolve({ok:false, error:{code:'PRESETS_FULL', message:'PRIVATE_SERVER_TEXT'}})}).rpc});
  await open(app); await openPresets(app);
  change(app, find(app, node => node.type === 'input' && node.props.placeholder === app.t('presetNamePlaceholder')), 'One more');
  submit(app, find(app, node => node.type === 'form'));
  await settle(app);
  assert.match(text(app.renderer.tree), /reached the preset limit/);
  assert.doesNotMatch(text(app.renderer.tree), /PRIVATE_SERVER_TEXT/);
  assert.equal(dialogTitled(app, 'Presets').host.open, true);
  app.dispose();
});

test('closing the settings window also closes the preset manager', async () => {
  const app = setup(); await open(app);
  const manager = await openPresets(app);
  click(app, button(app, 'Close', mainDialog(app)));
  assert.equal(manager.host.open, false);
  assert.equal(mainDialog(app).host.open, false);
  assert.equal(app.renderer.lateUpdates, 0);
  app.dispose();
});

test('transport failures are translated without exposing raw messages', async () => {
  const app = setup({rpc:() => Promise.reject(new Error('transport failure: HTTP 403 RAW_不要显示'))});
  await open(app);
  assert.match(text(app.renderer.tree), /Could not reach DSH/);
  assert.doesNotMatch(text(app.renderer.tree), /RAW_|不要显示|HTTP 403/);
  app.setLocale('zh'); assert.match(text(app.renderer.tree), /无法连接到 DSH/);
  app.dispose();
});

test('closing during a read aborts it and ignores its late result', async () => {
  const pending = deferred(); const app = setup({rpc:() => pending.promise});
  click(app, button(app, 'Custom settings'));
  const signal = app.calls[0][3];
  click(app, button(app, 'Close'));
  assert.equal(signal.aborted, true);
  pending.resolve({ok:true, value:settings({config:{...CONFIG, prompt:'STALE CONTENT'}})}); await settle(app);
  assert.equal(mainDialog(app).host.open, false);
  assert.equal(button(app, 'Custom settings').host.focusCalls, 1);
  assert.doesNotMatch(text(app.renderer.tree), /STALE CONTENT/);
  assert.equal(app.renderer.lateUpdates, 0);
  app.dispose();
});

test('reopening does not let an earlier read overwrite the newer one', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const app = setup({rpc:() => ++count === 1 ? first.promise : second.promise});
  click(app, button(app, 'Custom settings')); click(app, button(app, 'Close')); click(app, button(app, 'Custom settings'));
  second.resolve({ok:true, value:settings({config:{...CONFIG, prompt:'NEW'}})}); await settle(app);
  first.resolve({ok:true, value:settings({config:{...CONFIG, prompt:'OLD'}})}); await settle(app);
  assert.equal(prompt(app).props.value, 'NEW');
  assert.equal(button(app, 'Apply').props.disabled, false);
  app.dispose();
});

test('leaving Custom mode aborts a pending save and late results cannot update the unmounted window', async () => {
  const save = deferred();
  const app = setup({rpc:host({set: () => save.promise}).rpc});
  await open(app); click(app, button(app, 'Apply'));
  app.setPreset('standard');
  assert.equal(app.calls[1][3].aborted, true);
  save.resolve({ok:true, value:{protocol:'dsh-customize-mode/v1', revision:1, config:CONFIG, baseLocked:false, warnings:[]}}); await settle(app);
  assert.equal(app.renderer.tree, null); assert.equal(app.renderer.lateUpdates, 0); assert.equal(app.refreshes, 0);
  app.dispose();
});

test('a failed save keeps the window and draft for a retry', async () => {
  let attempts = 0;
  const app = setup({rpc:host({set: request => ++attempts === 1 ? Promise.reject(new Error('network unavailable')) :
    ok({protocol:'dsh-customize-mode/v1', revision:1, config:request.config, baseLocked:false, warnings:[]})}).rpc});
  await open(app);
  change(app, inputFor(app, 'Use a custom system prompt'), true);
  change(app, prompt(app), 'Keep my draft');
  click(app, button(app, 'Apply')); await settle(app);
  assert.equal(mainDialog(app).host.open, true);
  assert.equal(prompt(app).props.value, 'Keep my draft');
  assert.match(text(app.renderer.tree), /Could not reach DSH/);
  click(app, button(app, 'Apply')); await settle(app);
  assert.equal(app.calls.at(-1)[2].request.config.prompt, 'Keep my draft');
  assert.equal(mainDialog(app).host.open, false);
  app.dispose();
});

test('double clicks send one save, and saving while a reply runs is allowed', async () => {
  const save = deferred();
  const app = setup({rpc:host({set: () => save.promise}).rpc});
  await open(app); app.setRunning(true);
  assert.match(text(app.renderer.tree), /Changes take effect from the next message/);
  const onClick = button(app, 'Apply').props.onClick;
  onClick(); onClick(); app.renderer.flush();
  assert.deepEqual(app.actions(), ['get', 'set']);
  assert.equal(button(app, 'Applying…').props.disabled, true);
  save.resolve({ok:true, value:{protocol:'dsh-customize-mode/v1', revision:1, config:CONFIG, baseLocked:false, warnings:[]}}); await settle(app);
  assert.equal(mainDialog(app).host.open, false);
  app.dispose();
});

test('a newer revision elsewhere blocks applying until the settings are reloaded', async () => {
  const app = setup(); await open(app);
  app.projection.set({revision:2}); app.renderer.flush();
  assert.equal(button(app, 'Apply').props.disabled, true);
  assert.match(text(app.renderer.tree), /changed elsewhere/);
  assert.equal(button(app, 'Presets').props.disabled, false, 'presets can still be managed');
  app.dispose();
});

test('a committed save stays successful when the projection refresh fails', async () => {
  const app = setup({refresh:() => Promise.reject(new Error('refresh failed'))});
  await open(app); click(app, button(app, 'Apply')); await settle(app);
  assert.equal(mainDialog(app).host.open, false);
  assert.equal(all(app, node => node.props.role === 'alert').length, 0);
  app.dispose();
});

for (const locale of ['en', 'zh']) {
  test(`warnings and errors are translated by code in ${locale}`, async () => {
    const backend = host({set: () => Promise.resolve({ok:false, error:{code:'BASE_LOCKED', message:'RAW_SERVER_TEXT_不要显示'}})});
    backend.state.settings = settings({warnings:[{code:'BASE_MODE_UNAVAILABLE', message:'OTHER_RAW'}]});
    const app = setup({locale, rpc:backend.rpc});
    await open(app);
    assert.ok(text(app.renderer.tree).includes(app.t('warning_BASE_MODE_UNAVAILABLE')));
    click(app, button(app, app.t('save'))); await settle(app);
    assert.ok(text(app.renderer.tree).includes(app.t('error_BASE_LOCKED')));
    assert.doesNotMatch(text(app.renderer.tree), /RAW_SERVER_TEXT|OTHER_RAW|不要显示/);
    app.dispose();
  });
}

test('every Host diagnostic has English and Chinese text, and both dictionaries have the same keys', () => {
  const app = setup();
  const warningCodes = new Set(['BASE_MODE_UNAVAILABLE', 'POLICY_UNAVAILABLE']);
  for (const code of Object.keys(MESSAGES)) {
    const keys = ['error_' + code, ...(warningCodes.has(code) ? ['warning_' + code] : [])];
    for (const locale of ['en', 'zh']) for (const key of keys) {
      assert.equal(typeof app.dictionaries[locale][key], 'string', `${locale}: ${key}`);
      assert.ok(app.dictionaries[locale][key].trim(), `${locale}: ${key} must not be blank`);
    }
  }
  assert.deepEqual(Object.keys(app.dictionaries.en).sort(), Object.keys(app.dictionaries.zh).sort());
  for (const [key, value] of Object.entries(app.dictionaries.en)) {
    const placeholders = template => [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(app.dictionaries.zh[key]), placeholders(value), `placeholders of ${key}`);
  }
  app.dispose();
});

test('malformed responses are rejected instead of rendered', async () => {
  const broken = [
    settings({bases:undefined}), settings({catalog:{template:1, tools:[]}}), settings({baseLocked:'no'}),
    settings({warnings:['invalid warning shape']}), settings({config:{...CONFIG, prompt:42}}), settings({config:{...CONFIG, baseMode:undefined}}),
  ];
  for (const value of broken) {
    const app = setup({rpc:() => ok(value)});
    await open(app);
    assert.match(text(app.renderer.tree), /unexpected response/);
    assert.equal(all(app, node => node.type === 'textarea').length, 0);
    assert.equal(button(app, 'Apply').props.disabled, true);
    app.dispose();
  }
});

test('Escape cancels loading, and every dialog title resolves to a heading', () => {
  const pending = deferred(); const app = setup({rpc:() => pending.promise});
  click(app, button(app, 'Custom settings'));
  const dialog = mainDialog(app);
  assert.equal(find(app, node => node.props.id === dialog.props['aria-labelledby']).type, 'h2');
  let prevented = false;
  dialog.props.onCancel({preventDefault() {prevented = true;}}); app.renderer.flush();
  assert.equal(prevented, true); assert.equal(app.calls[0][3].aborted, true);
  app.dispose();
});

test('plugin disposal removes the control and the hidden-record registration', () => {
  const app = setup(); app.dispose(); assert.equal(app.registrations.length, 0); assert.equal(app.projection.size, 0);
});
