import { initialState, fold, PRESET_ID } from './state.js';

/** Tool catalogs of the presets the fake roster offers; each base mode exposes different inherited tools. */
export const BASE_TOOLS = Object.freeze({
  standard: ['read', 'write', 'subagent'],
  ptc: ['read', 'write', 'subagent', 'run_code'],
  minimal: ['bash'],
});

/** Per-agent tool and prompt registries with the restriction semantics of `dsh-tools`. */
export function registry(base = 'standard') {
  const inherited = new Map();
  const local = new Map(), restrictions = new Set(), guards = new Set(), sections = new Map();
  const contexts = new Map(), suppressors = new Set();
  const setBase = id => {
    inherited.clear();
    for (const name of BASE_TOOLS[id] ?? []) inherited.set(name, { name, description: `${name} tool` });
  };
  setBase(base);
  const tools = {
    schemas: () => [...inherited.values()]
      .filter(tool => [...restrictions].every(rule => rule.allow.includes(tool.name)))
      .concat([...local.values()]),
    restrict(rule) {
      if (rule.allow.some(name => !inherited.has(name) || name === 'run_code')) throw new Error('unknown inherited tool');
      restrictions.add(rule); return () => restrictions.delete(rule);
    },
    guard(fn) { guards.add(fn); return () => guards.delete(fn); },
  };
  const prompt = {
    section(value) {
      if (sections.has(value.name)) throw new Error('duplicate section');
      sections.set(value.name, value); return () => sections.delete(value.name);
    },
    context(value) { if (contexts.has(value.name)) throw new Error('duplicate context'); contexts.set(value.name, value); return () => contexts.delete(value.name); },
    getContextOrder: () => 100,
    getSectionOrder: () => 0,
    suppressRuntimeContext() { const token = {}; suppressors.add(token); return () => suppressors.delete(token); },
  };
  return { inherited, local, restrictions, guards, sections, contexts, suppressors, tools, prompt, setBase };
}

/** Roster rows the fake `agentPresets.list()` returns. */
export const ROSTER = [
  { id: 'standard' }, { id: 'ptc' }, { id: 'minimal' },
  { id: 'cordis', broken: 'D:/private/path failed to load' },
  { id: PRESET_ID, name: 'Custom mode' },
];

/**
 * Host fixture with live agents, a session projection registry, and a preset
 * registry that records which composition each agent is bound to.
 */
export function fixture({ roster = ROSTER } = {}) {
  const listeners = new Map(), cells = new Map(), live = new Map(), roots = new Set();
  let definition, initiator;
  const on = (map, name, fn, options = {}) => {
    if (!map.has(name)) map.set(name, []);
    const list = map.get(name); options.prepend ? list.unshift(fn) : list.push(fn);
    return () => { const index = list.indexOf(fn); if (index >= 0) list.splice(index, 1); };
  };
  const handlersOf = (map, name) => [...map.get(name) ?? []];
  const emit = (name, ...args) => { for (const fn of handlersOf(listeners, name)) fn(...args); };
  const serial = async (name, ...args) => { for (const fn of handlersOf(listeners, name)) await fn(...args); };
  const stateOf = session => {
    if (!cells.has(session)) cells.set(session, session.events.reduce(definition?.apply ?? fold, initialState()));
    return cells.get(session);
  };
  const recompositions = [];
  const agentPresets = {
    rows: roster.map(row => ({ ...row })),
    async list() { return this.rows.map(row => ({ ...row })); },
    presetForSession: session => {
      const selections = session.events.filter(event => event.type === 'agent-preset/selected');
      return selections.length ? selections.at(-1).data.agentPreset : session.header.agentPreset ?? null;
    },
    composedPreset: context => [...live.values()].find(a => a.ctx === context)?.composition,
    async recompose(context, id) {
      const a = [...live.values()].find(candidate => candidate.ctx === context);
      recompositions.push({ agent: a.id, id, status: a.status });
      await a.beforeRecompose?.(id);
      const row = this.rows.find(entry => entry.id === id);
      if (!row || row.broken) throw new Error(`agent-preset/invalid ${id}`);
      a.composition = id;
      a.registry.setBase(id);
      return { id };
    },
    async acquireScope(id) {
      const row = this.rows.find(entry => entry.id === id);
      if (!row || row.broken) throw new Error(`agent-preset/invalid ${id}`);
      return { key: { preset: id }, async [Symbol.asyncDispose]() {} };
    },
  };
  const sessions = {
    register(value) {
      definition = value;
      cells.clear();
      const handle = { stateOf, async dispose() { definition = undefined; cells.clear(); } };
      return Object.assign(() => {}, { then: (ok, fail) => Promise.resolve(handle).then(ok, fail) });
    },
  };

  function agent(id, { seed = [], preset = PRESET_ID, composition, root = true, running = false, source = 'startup',
    isSeeded = seed.length > 0, parentSession, origin, inheritedEventCount = 0, announce = true } = {}) {
    const handlers = new Map(), effects = new Set();
    const a = { id, status: running ? 'running' : 'idle', registry: undefined, composition,
      beforeAppend: undefined, afterAppend: undefined, abort: new AbortController(), maintenance: null,
      turn: seed.reduce((last, event) => event.type === 'turn/start' ? event.data.turn : last, 0),
      cancellations: [], assemblies: [] };
    a.cancel = (cause, options) => { a.cancellations.push({ cause, options }); if (a.status === 'running') a.abort.abort(cause); };
    a.session = {
      id, header: { agentPreset: preset, isSeeded, parentSession, origin }, inheritedEventCount,
      events: [...seed],
      get seq() { return this.events.length; },
      snapshotEvents(from = 0) { return this.events.slice(from); },
      append(type, data) {
        a.beforeAppend?.(type, data);
        const old = stateOf(this), event = { type, data, seq: this.seq, time: Date.now() };
        this.events.push(event);
        if (definition) cells.set(this, definition.apply(old, event));
        a.afterAppend?.(type, data);
        for (const listener of handlersOf(handlers, 'session/event')) listener(this, event);
        if (type === 'agent-preset/selected') emit('agent-preset/selected', id, data.agentPreset);
        return event;
      },
    };
    a.ctx = {
      on: (name, fn, options) => on(handlers, name, fn, options),
      effect(fn) {
        const cleanup = fn(); let active = true;
        const dispose = () => { if (active) { active = false; cleanup(); effects.delete(dispose); } };
        effects.add(dispose); return dispose;
      },
    };
    a.registry = registry(composition ?? 'standard');
    a.composition = composition ?? (preset === PRESET_ID ? 'standard' : preset);
    a.registry.setBase(a.composition);
    a.ctx.tools = a.registry.tools;
    a.ctx.systemPrompt = a.registry.prompt;
    a.setStatus = status => {
      a.status = status;
      for (const fn of handlersOf(handlers, 'agent/status')) fn({ agent: a, status });
    };
    a.runMaintenance = job => {
      if (a.status !== 'idle' || a.maintenance) throw new Error(`agent "${id}" already has active work`);
      const done = (async () => {
        try { return await job(new AbortController().signal); }
        finally { a.maintenance = null; }
      })();
      a.maintenance = done;
      return done;
    };
    a.startTurn = (number = a.turn + 1) => {
      if (a.maintenance) throw new Error('turn during maintenance');
      a.setStatus('running'); a.turn = number; a.abort = new AbortController();
      a.session.append('turn/start', { turn: number });
      a.abort.signal.throwIfAborted();
    };
    a.endTurn = ({ idle = true } = {}) => {
      a.session.append('turn/end', { turn: a.turn, reason: { kind: a.abort.signal.aborted ? 'aborted' : 'completed' } });
      if (idle) a.setStatus('idle');
    };
    a.step = async (messages = [], subject = a) => {
      a.abort.signal.throwIfAborted();
      a.assemblies.push({ sections: [...a.registry.sections.values()], tools: a.registry.tools.schemas(), runtimeSuppressed: a.registry.suppressors.size > 0 });
      let next = async () => ({ kind: 'enter', messages, startsRequestSeries: true });
      for (const fn of handlersOf(handlers, 'agent/pre-step').reverse()) { const previous = next; next = () => fn({ agent: subject }, previous); }
      return next();
    };
    a.select = presetId => a.session.append('agent-preset/selected', { agentPreset: presetId });
    a.dispose = () => { for (const dispose of [...effects]) dispose(); live.delete(id); roots.delete(a); emit('agent/disposed', { agent: a }); };
    live.set(id, a); if (root) roots.add(a);
    a.created = announce && definition ? serial('agent/created', { agent: a, source }) : Promise.resolve();
    return a;
  }

  const turnBoundaryOf = session => {
    let open = null, last = 0;
    for (const event of session.events) {
      if (event.type === 'turn/start') { open = event.seq; last = event.data.turn; }
      if (event.type === 'turn/end') open = null;
    }
    return { openTurnStartSeq: open, lastTurn: last };
  };
  const ctx = {
    logger: { warn() {} },
    on: (name, fn) => on(listeners, name, fn),
    agents: { get: id => live.get(id), list: () => [...live.values()], roots: () => [...roots], currentInitiator: () => initiator, turnBoundaryOf },
    agentPresets,
    sessionProjections: sessions,
  };
  return {
    ctx, agent, stateOf, recompositions,
    setInitiator(value) { initiator = value; },
    remove(a) { live.delete(a.id); roots.delete(a); },
  };
}

/** In-memory preset store with the interface the controller and endpoint use. */
export function memoryPresets(initial = { defaultTitle: null, presets: [] }) {
  let current = initial;
  return {
    current: () => current,
    defaultConfig: () => current.defaultTitle === null ? undefined : current.presets.find(preset => preset.title === current.defaultTitle).config,
    set(next) { current = next; },
  };
}

export const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve)); };
