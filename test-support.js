import { initialState, fold, PRESET_ID } from './state.js';

export function registry() {
  const inherited = new Map(['read', 'write', 'subagent'].map(name => [name, { name, description: name }]));
  const local = new Map(), restrictions = new Set(), guards = new Set(), sections = new Set();
  const contexts = new Map(), suppressors = new Set();
  let mode;
  const tools = {
    schemas: () => [...inherited.values()].filter(tool => [...restrictions].every(rule => rule.allow.includes(tool.name)))
      .concat([...local.values()], mode === 'native' ? [] : [{ name: 'run_code', description: 'transport' }]),
    presentAs(next) { if (mode) throw new Error('mode conflict'); mode = next; return () => { mode = undefined; }; },
    restrict(rule) {
      if (rule.allow.some(name => !inherited.has(name) || name === 'run_code')) throw new Error('unknown inherited tool');
      restrictions.add(rule); return () => restrictions.delete(rule);
    },
    guard(fn) { guards.add(fn); return () => guards.delete(fn); },
  };
  const prompt = {
    section(value) { sections.add(value); return () => sections.delete(value); },
    context(value) { if (contexts.has(value.name)) throw new Error('duplicate context'); contexts.set(value.name, value); return () => contexts.delete(value.name); },
    getContextOrder: () => 100,
    suppressRuntimeContext() { const token = {}; suppressors.add(token); return () => suppressors.delete(token); },
  };
  return { inherited, local, restrictions, guards, sections, contexts, suppressors, tools, prompt };
}

export function fixture() {
  const listeners = new Map(), changes = new Set(), cells = new Map(), live = new Map(), roots = new Set();
  let definition, initiator;
  const on = (map, name, fn, options = {}) => {
    if (!map.has(name)) map.set(name, []);
    const list = map.get(name); options.prepend ? list.unshift(fn) : list.push(fn);
    return () => { const index = list.indexOf(fn); if (index >= 0) list.splice(index, 1); };
  };
  const emit = (name, ...args) => { for (const fn of [...listeners.get(name) ?? []]) fn(...args); };
  const stateOf = session => {
    if (!cells.has(session)) cells.set(session, session.events.reduce(fold, initialState()));
    return cells.get(session);
  };
  function agent(id, { seed = [], preset = PRESET_ID, root = true, clock = false } = {}) {
    const r = registry(), handlers = new Map(), effects = new Set();
    const a = { id, status: 'idle', preset, registry: r, beforeAppend: undefined, afterAppend: undefined };
    a.session = {
      events: [...seed],
      get seq() { return this.events.length; },
      snapshotEvents(from = 0) { return this.events.slice(from); },
      append(type, data) {
        a.beforeAppend?.(type, data);
        const old = stateOf(this), event = { type, data, seq: this.seq, time: Date.now() };
        this.events.push(event);
        const next = definition.apply(old, event); cells.set(this, next);
        if (old.snapshot !== next.snapshot) for (const fn of changes) fn(this, definition.key);
        a.afterAppend?.(type, data);
        return event;
      },
    };
    a.ctx = {
      tools: r.tools, systemPrompt: r.prompt,
      on: (name, fn, options) => on(handlers, name, fn, options),
      effect(fn) {
        const cleanup = fn(); let active = true;
        const dispose = () => { if (active) { active = false; cleanup(); effects.delete(dispose); } };
        effects.add(dispose); return dispose;
      },
    };
    if (clock) on(handlers, 'agent/pre-step', async (_payload, next) => {
      const decision = await next();
      return decision.kind === 'enter' ? { ...decision, messages: [...decision.messages, { source: { kind: 'time-context' }, content: [] }] } : decision;
    }, { prepend: true });
    a.step = (messages = [], subject = a) => {
      let next = async () => ({ kind: 'enter', messages, startsRequestSeries: true });
      for (const fn of [...handlers.get('agent/pre-step') ?? []].reverse()) { const previous = next; next = () => fn({ agent: subject }, previous); }
      return next();
    };
    a.dispose = () => { for (const dispose of [...effects]) dispose(); live.delete(id); roots.delete(a); emit('agent/disposed', { agent: a }); };
    live.set(id, a); if (root) roots.add(a);
    if (definition) emit('agent/created', { agent: a });
    return a;
  }
  const ctx = {
    logger: { warn() {} }, on: (name, fn) => on(listeners, name, fn),
    agents: { get: id => live.get(id), list: () => [...live.values()], roots: () => [...roots], currentInitiator: () => initiator },
    agentPresets: { composedPreset: context => [...live.values()].find(a => a.ctx === context)?.preset },
    sessionProjections: {
      register(value) { definition = value; return () => { definition = undefined; cells.clear(); }; },
      stateOf,
      onChanged(fn) { changes.add(fn); return () => changes.delete(fn); },
    },
  };
  return {
    ctx, agent, stateOf,
    select(a, preset) { a.preset = preset; emit('agent-preset/selected', a.id, preset); },
    setInitiator(value) { initiator = value; },
    remove(a) { live.delete(a.id); roots.delete(a); },
  };
}
