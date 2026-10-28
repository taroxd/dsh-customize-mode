import { randomUUID } from 'node:crypto';
import { SettingsError, diagnostic, assertNotAborted } from './errors.js';
import { PRESET_ID, PROJECTION_KEY, PROTOCOL, projectionDefinition, permits, deniedVisible } from './state.js';
import { installPolicy, filterTimeContext } from './policy.js';

export function createController(ctx, z) {
  const agents = new Map();
  const writes = new WeakSet();
  const inMode = agent => ctx.agentPresets.composedPreset(agent.ctx) === PRESET_ID;
  const snapshotOf = agent => {
    const state = ctx.sessionProjections.stateOf(agent.session, PROJECTION_KEY);
    if (!state) throw new SettingsError('UNAVAILABLE');
    return state.snapshot;
  };
  const report = error => ctx.logger.warn('customize-mode: settings operation failed', error);

  function refresh(agent, force = false) {
    const entry = agents.get(agent);
    if (!entry) return;
    const snapshot = snapshotOf(agent);
    const selected = inMode(agent);
    if (!force && entry.applied === snapshot && entry.inMode === selected) return;
    entry.policy?.();
    entry.policy = undefined;
    entry.applied = undefined;
    entry.error = undefined;
    entry.inMode = selected;
    if (!selected) {
      entry.catalog = [];
      entry.applied = snapshot;
      return;
    }
    entry.catalog = agent.ctx.tools.schemas(agent).filter(tool => tool.name !== 'run_code')
      .map(({ name, description }) => ({ name, description }));
    try {
      entry.policy = installPolicy(agent, snapshot.config, agent.ctx.tools, agent.ctx.systemPrompt);
      entry.applied = snapshot;
    } catch (error) {
      entry.error = diagnostic(error, 'POLICY_UNAVAILABLE');
      report(error);
    }
  }

  function attach(agent) {
    if (agents.has(agent)) return;
    const entry = {};
    agents.set(agent, entry);
    entry.dispose = agent.ctx.effect(() => {
      let guard, preStep;
      try {
        guard = agent.ctx.tools.guard(exec => {
          if (exec.agent !== agent || !inMode(agent)) return;
          return permits(snapshotOf(agent).config, exec.name) ? undefined : `Custom mode does not allow tool ${exec.name}.`;
        });
        preStep = agent.ctx.on('agent/pre-step', async (payload, next) => {
          if (payload.agent !== agent) return next();
          if (writes.has(agent)) throw new SettingsError('BUSY');
          const decision = await next();
          if (decision.kind !== 'enter') return decision;
          if (!inMode(agent)) { refresh(agent); return decision; }
          if (writes.has(agent)) throw new SettingsError('BUSY');
          // Assembly precedes this hook. A repaired registration requires a fresh
          // turn rather than admitting messages assembled under the old policy.
          const previouslyApplied = entry.applied;
          refresh(agent);
          if (entry.applied !== previouslyApplied) throw new SettingsError('POLICY_RECOVERED');
          if (entry.error) throw new SettingsError('POLICY_UNAVAILABLE', entry.error.details);
          const config = snapshotOf(agent).config;
          const leaked = deniedVisible(config, agent.ctx.tools.schemas(agent));
          if (leaked.length) throw new SettingsError('TOOL_VISIBILITY_CONFLICT', { tools: leaked });
          return filterTimeContext(decision, config);
        }, { prepend: true });
        refresh(agent);
      } catch (error) {
        preStep?.();
        guard?.();
        agents.delete(agent);
        throw error;
      }
      return () => {
        entry.policy?.();
        preStep();
        guard();
        agents.delete(agent);
        writes.delete(agent);
      };
    });
  }

  const subscriptions = [];
  let disposeProjection, disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const unsubscribe of subscriptions.reverse()) unsubscribe();
    for (const entry of [...agents.values()]) entry.dispose?.();
    agents.clear();
    disposeProjection?.();
  }
  try {
    disposeProjection = ctx.sessionProjections.register(projectionDefinition(z));
    subscriptions.push(ctx.sessionProjections.onChanged((session, key) => {
      if (key === PROJECTION_KEY) for (const agent of agents.keys()) if (agent.session === session) refresh(agent);
    }));
    subscriptions.push(ctx.on('agent/created', ({ agent }) => { attach(agent); }));
    subscriptions.push(ctx.on('agent/disposed', ({ agent }) => { agents.get(agent)?.dispose(); }));
    subscriptions.push(ctx.on('agent-preset/selected', id => {
      const agent = ctx.agents.get(id);
      if (agent) { attach(agent); refresh(agent, true); }
    }));
    for (const agent of ctx.agents.list()) attach(agent);
  } catch (error) {
    dispose();
    throw error;
  }

  function assertAccess(agent, signal) {
    assertNotAborted(signal);
    if (ctx.agents.get(agent.id) !== agent) throw new SettingsError('SESSION_NOT_FOUND');
    if (!ctx.agents.roots().includes(agent)) throw new SettingsError('ROOT_SESSION_REQUIRED');
    if (!inMode(agent)) throw new SettingsError('WRONG_PRESET');
    if (ctx.agents.currentInitiator()) throw new SettingsError('HUMAN_ONLY');
  }

  function valueOf(agent, action) {
    const entry = agents.get(agent);
    const warnings = [];
    if (entry.error) warnings.push(diagnostic(new SettingsError('POLICY_UNAVAILABLE', entry.error.details)));
    if (agent.status === 'running') warnings.push(diagnostic(new SettingsError('CATALOG_STALE')));
    return { ...snapshotOf(agent), action, running: agent.status === 'running', warnings };
  }

  function read(agent, signal) {
    assertAccess(agent, signal);
    attach(agent);
    if (agent.status === 'idle' && !writes.has(agent)) refresh(agent, true);
    const visible = new Set(agent.ctx.tools.schemas(agent).map(tool => tool.name));
    return { ...valueOf(agent, 'get'), tools: agents.get(agent).catalog.map(tool => ({ ...tool, visible: visible.has(tool.name) })) };
  }

  function set(agent, request, signal) {
    assertAccess(agent, signal);
    if (agent.status !== 'idle') throw new SettingsError('RUNNING');
    if (writes.has(agent)) throw new SettingsError('BUSY');
    const before = snapshotOf(agent);
    if (request.expectedRevision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
    if (request.config.allowedTools?.includes('run_code')) throw new SettingsError('RESERVED_TOOL');
    attach(agent);
    writes.add(agent);
    const commandId = `customize-settings-${randomUUID()}`;
    const cursor = agent.session.seq;
    const next = { protocol: PROTOCOL, revision: before.revision + 1, config: request.config, action: 'set' };
    try {
      // No await in this transaction. The guard handles synchronous reentrancy
      // from session/registry observers; it is not a second durable lock.
      agent.session.append('command/run', { commandId, name: PRESET_ID, source: { kind: 'user' } });
      assertAccess(agent, signal);
      if (agent.status !== 'idle') throw new SettingsError('RUNNING');
      if (snapshotOf(agent).revision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
      const entry = agents.get(agent);
      entry.policy?.();
      entry.policy = undefined;
      entry.applied = undefined;
      try { installPolicy(agent, request.config, agent.ctx.tools, agent.ctx.systemPrompt)(); }
      catch (error) {
        if (!(error instanceof SettingsError)) report(error);
        throw error instanceof SettingsError ? error : new SettingsError('UNSUPPORTED_POLICY');
      }
      finally { refresh(agent, true); }
      // Registry callbacks can cancel, recompose, or commit another log record.
      assertAccess(agent, signal);
      if (agent.status !== 'idle') throw new SettingsError('RUNNING');
      if (snapshotOf(agent).revision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
      agent.session.append('command/done', { commandId, kind: 'success', text: JSON.stringify(next) });
      return valueOf(agent, 'set');
    } catch (error) {
      // append() may throw from an observer after committing. Inspect only this
      // transaction's tail so a committed success never receives a failed done.
      if (!(error instanceof SettingsError)) report(error);
      const tail = agent.session.snapshotEvents(cursor);
      const settled = tail.find(event => event.type === 'command/done' && event.data.commandId === commandId);
      if (settled?.data.kind === 'success') return valueOf(agent, 'set');
      if (!settled && tail.some(event => event.type === 'command/run' && event.data.commandId === commandId)) {
        try {
          agent.session.append('command/done', { commandId, kind: 'error', text: JSON.stringify({ error: diagnostic(error, 'COMMIT_FAILED') }) });
        } catch (settleError) { report(settleError); }
      }
      throw error instanceof SettingsError ? error : new SettingsError('COMMIT_FAILED');
    } finally { writes.delete(agent); }
  }

  return { read, set, snapshotOf, assertAccess, dispose };
}
