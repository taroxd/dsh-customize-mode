import { randomUUID } from 'node:crypto';
import { SettingsError, diagnostic, assertNotAborted } from './errors.js';
import { PRESET_ID, PROJECTION_KEY, PROTOCOL, projectionDefinition, permits, deniedVisible } from './state.js';
import { installPolicy, filterTimeContext } from './policy.js';

export function createController(ctx, z, defaults) {
  const agents = new Map();
  const writes = new WeakSet();
  const inMode = agent => ctx.agentPresets.composedPreset(agent.ctx) === PRESET_ID;
  const stateOf = agent => {
    const state = ctx.sessionProjections.stateOf(agent.session, PROJECTION_KEY);
    if (!state) throw new SettingsError('UNAVAILABLE');
    return state;
  };
  const snapshotOf = agent => stateOf(agent).snapshot;
  const report = error => ctx.logger.warn('customize-mode: settings operation failed', error);
  const stop = (agent, error) => agent.cancel({ kind: 'hook', reason: error.message }, { keepInbox: true });

  function applySnapshot(agent, snapshot) {
    const entry = agents.get(agent);
    entry.applying = true;
    entry.effective = snapshot;
    entry.error = undefined;
    try {
      entry.policy?.();
      entry.policy = undefined;
      entry.catalog = agent.ctx.tools.schemas(agent).filter(tool => tool.name !== 'run_code')
        .map(({ name, description }) => ({ name, description }));
      if (inMode(agent)) entry.policy = installPolicy(agent, snapshot.config, agent.ctx.tools, agent.ctx.systemPrompt);
    } catch (error) {
      entry.error = diagnostic(error, 'POLICY_UNAVAILABLE');
      report(error);
    } finally { entry.applying = false; }
  }

  function beginTurn(agent) {
    const entry = agents.get(agent);
    if (!inMode(agent)) return;
    // Session observers cannot veto an append. Abort synchronously on failure:
    // AgentLoop checks this signal before claiming messages or assembling prompts.
    if (entry.applying) {
      stop(agent, new SettingsError('BUSY'));
      return;
    }
    try {
      const turn = stateOf(agent).turn;
      if (!turn) throw new SettingsError('POLICY_UNAVAILABLE');
      applySnapshot(agent, turn.snapshot);
      if (entry.error) stop(agent, new SettingsError('POLICY_UNAVAILABLE', entry.error.details));
    } catch (error) {
      entry.error = diagnostic(error, 'POLICY_UNAVAILABLE');
      report(error);
      stop(agent, new SettingsError('POLICY_UNAVAILABLE'));
    }
  }

  function attach(agent) {
    if (agents.has(agent)) return;
    const entry = { catalog: [], applying: false };
    agents.set(agent, entry);
    entry.dispose = agent.ctx.effect(() => {
      const disposers = [];
      const cleanup = () => {
        entry.policy?.();
        for (const dispose of disposers.reverse()) dispose();
        agents.delete(agent);
        writes.delete(agent);
      };
      try {
        disposers.push(agent.ctx.tools.guard(exec => {
          if (exec.agent !== agent || !inMode(agent)) return;
          if (entry.applying || entry.error || !entry.effective) return new SettingsError('POLICY_UNAVAILABLE').message;
          return permits(entry.effective.config, exec.name) ? undefined : `Custom mode does not allow tool ${exec.name}.`;
        }));
        disposers.push(agent.ctx.on('session/event', (session, event) => {
          if (session === agent.session && event.type === 'turn/start') beginTurn(agent);
        }));
        disposers.push(agent.ctx.on('agent/pre-step', async (payload, next) => {
          if (payload.agent !== agent || !inMode(agent)) return next();
          const effective = entry.effective;
          if (entry.applying || entry.error || !effective) throw new SettingsError('POLICY_UNAVAILABLE');
          const decision = await next();
          if (decision.kind !== 'enter') return decision;
          const turn = stateOf(agent).turn;
          if (entry.error || entry.effective !== effective || (turn && turn.snapshot !== effective)) {
            throw new SettingsError('POLICY_UNAVAILABLE');
          }
          const leaked = deniedVisible(effective.config, agent.ctx.tools.schemas(agent));
          if (leaked.length) throw new SettingsError('TOOL_VISIBILITY_CONFLICT', { tools: leaked });
          return filterTimeContext(decision, effective.config);
        }, { prepend: true }));
        if (agent.status === 'running' && inMode(agent)) {
          // An already assembled turn cannot safely adopt registrations mid-flight.
          // Preserve its inbox and require a fresh turn rather than leak policy.
          entry.error = diagnostic(new SettingsError('POLICY_UNAVAILABLE'));
          entry.catalog = agent.ctx.tools.schemas(agent).filter(tool => tool.name !== 'run_code')
            .map(({ name, description }) => ({ name, description }));
          stop(agent, new SettingsError('POLICY_UNAVAILABLE'));
        } else applySnapshot(agent, snapshotOf(agent));
      } catch (error) {
        cleanup();
        throw error;
      }
      return cleanup;
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
    subscriptions.push(ctx.on('agent/created', ({ agent, source }) => {
      const header = agent.session.header;
      const eligible = () => source === 'startup' && ctx.agents.get(agent.id) === agent &&
        ctx.agents.roots().includes(agent) && header?.isSeeded === false &&
        !header.parentSession && !header.origin && agent.session.inheritedEventCount === 0;
      if (defaults && eligible() && snapshotOf(agent).revision === 0) {
        // Capture once at creation, even before a blank session selects its preset.
        // These records stay inert in every other preset and replay without global reads.
        commit(agent, snapshotOf(agent), defaults.current().config, () => {
          if (!eligible()) throw new SettingsError('SESSION_CHANGED');
        });
      }
      attach(agent);
    }));
    subscriptions.push(ctx.on('agent/disposed', ({ agent }) => { agents.get(agent)?.dispose(); }));
    subscriptions.push(ctx.on('agent-preset/selected', id => {
      const agent = ctx.agents.get(id);
      if (agent) {
        attach(agent);
        if (agent.status === 'idle') applySnapshot(agent, snapshotOf(agent));
      }
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
    const entry = agents.get(agent);
    // Refresh the catalog only outside a running turn; never lift its live mask.
    if (agent.status === 'idle' && !entry.applying) applySnapshot(agent, snapshotOf(agent));
    const visible = new Set(agent.ctx.tools.schemas(agent).map(tool => tool.name));
    return { ...valueOf(agent, 'get'), tools: agents.get(agent).catalog.map(tool => ({ ...tool, visible: visible.has(tool.name) })) };
  }

  function set(agent, request, signal) {
    assertAccess(agent, signal);
    if (writes.has(agent)) throw new SettingsError('BUSY');
    const before = snapshotOf(agent);
    if (request.expectedRevision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
    if (request.config.allowedTools?.includes('run_code')) throw new SettingsError('RESERVED_TOOL');
    attach(agent);
    commit(agent, before, request.config, () => assertAccess(agent, signal));
    return valueOf(agent, 'set');
  }

  function commit(agent, before, config, verify) {
    if (writes.has(agent)) throw new SettingsError('BUSY');
    writes.add(agent);
    const commandId = `customize-settings-${randomUUID()}`;
    const cursor = agent.session.seq;
    const next = { protocol: PROTOCOL, revision: before.revision + 1, config, action: 'set' };
    try {
      // Persist only: neither a running turn nor an observer-started turn may
      // see provisional settings. Runtime validation belongs to turn/start.
      agent.session.append('command/run', { commandId, name: PRESET_ID, source: { kind: 'user' } });
      verify();
      if (snapshotOf(agent).revision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
      agent.session.append('command/done', { commandId, kind: 'success', text: JSON.stringify(next) });
      return snapshotOf(agent);
    } catch (error) {
      if (!(error instanceof SettingsError)) report(error);
      const tail = agent.session.snapshotEvents(cursor);
      const settled = tail.find(event => event.type === 'command/done' && event.data.commandId === commandId);
      if (settled?.data.kind === 'success') return snapshotOf(agent);
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
