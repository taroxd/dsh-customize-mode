import { randomUUID } from 'node:crypto';
import { SettingsError, diagnostic, assertNotAborted } from './errors.js';
import { PRESET_ID, PROTOCOL, permits } from './state.js';
import { installPolicy, filterTimeContext } from './policy.js';
import { assertBaseAvailable } from './bases.js';

/**
 * Owns the Custom mode lifecycle of every live agent.
 *
 * - A main conversation recorded as Custom mode runs on the composition of the
 *   base mode its settings name. The composition is rebound only while the
 *   agent is reserved (during creation, or through `runMaintenance()`), so a
 *   turn never observes a half-switched composition.
 * - Its prompt, context, and tool policy is installed in the agent's own scope
 *   from the snapshot that the projection pins when each turn starts.
 * - Forked subagents inherit their parent's settings records and keep the same
 *   policy on their parent's composition.
 * - A blank conversation without saved settings adopts the default preset as
 *   soon as it becomes a Custom mode conversation.
 */
export function createController(ctx, { projection, presets }) {
  const entries = new Map();
  const writes = new WeakSet();
  let disposed = false, disposal;

  const report = (message, error) => ctx.logger.warn(`customize-mode: ${message}`, error);
  const stateOf = agent => projection.stateOf(agent.session);
  const snapshotOf = agent => stateOf(agent).snapshot;
  const isRoot = agent => ctx.agents.roots().includes(agent);
  const recordedPreset = agent => ctx.agentPresets.presetForSession(agent.session);
  const inMode = agent => isRoot(agent) && recordedPreset(agent) === PRESET_ID;
  const governs = agent => inMode(agent) || (!isRoot(agent) && snapshotOf(agent).revision > 0);
  const composition = agent => ctx.agentPresets.composedPreset(agent.ctx);
  const isBlank = agent => {
    const boundary = ctx.agents.turnBoundaryOf(agent.session);
    return boundary.openTurnStartSeq === null && boundary.lastTurn === 0;
  };
  const stop = (agent, error) => agent.cancel({ kind: 'hook', reason: error.message }, { keepInbox: true });
  const blockedError = entry => new SettingsError(entry.error?.code === 'BASE_MODE_UNAVAILABLE' ? 'BASE_MODE_UNAVAILABLE' : 'POLICY_UNAVAILABLE');

  /** Composition a main conversation should run on, or undefined when this plugin leaves it alone. */
  function desiredComposition(agent) {
    if (!isRoot(agent)) return undefined;
    const recorded = recordedPreset(agent);
    return recorded === PRESET_ID ? snapshotOf(agent).config.baseMode : recorded ?? undefined;
  }

  /** Replace the agent's policy with one built from `snapshot`, or remove it when the agent is not governed. */
  function install(agent, snapshot) {
    const entry = entries.get(agent);
    if (!entry || disposed) return;
    entry.applying = true;
    entry.error = undefined;
    try {
      entry.policy?.();
      entry.policy = undefined;
      entry.effective = undefined;
      if (!governs(agent)) return;
      entry.effective = snapshot;
      if (inMode(agent) && composition(agent) !== snapshot.config.baseMode) {
        throw new SettingsError('BASE_MODE_UNAVAILABLE', { baseMode: snapshot.config.baseMode });
      }
      entry.policy = installPolicy(agent, snapshot.config, agent.ctx.tools, agent.ctx.systemPrompt);
    } catch (error) {
      entry.error = diagnostic(error, 'POLICY_UNAVAILABLE');
      if (!(error instanceof SettingsError)) report('settings could not be applied', error);
    } finally {
      entry.applying = false;
    }
  }

  /** Rebind a reserved agent until its composition matches its recorded preset and saved base mode. */
  async function reconcile(agent) {
    for (let pass = 0; pass < 3 && !disposed; pass++) {
      const target = desiredComposition(agent);
      if (target === undefined || composition(agent) === target) return;
      await ctx.agentPresets.recompose(agent.ctx, target);
    }
  }

  function adoptDefault(agent) {
    const config = presets.defaultConfig();
    if (config) commit(agent, 0, config, () => { if (!inMode(agent) || !isBlank(agent)) throw new SettingsError('SESSION_CHANGED'); });
  }

  /** Bring a reserved agent in line with its settings: adopt the default preset, rebind the base, install the policy. */
  async function settle(agent) {
    try {
      if (inMode(agent) && isBlank(agent) && snapshotOf(agent).revision === 0) adoptDefault(agent);
      await reconcile(agent);
    } catch (error) {
      report('the base mode could not be loaded', error);
    }
    // A composition that still differs from the settings is recorded here and blocks turns.
    install(agent, snapshotOf(agent));
  }

  /**
   * Run `operation` while the idle agent is reserved, so no turn starts until
   * it finishes. Settle requests that arrive meanwhile run before the reservation ends.
   */
  function exclusive(agent, operation) {
    const entry = entries.get(agent);
    let job;
    try {
      job = agent.runMaintenance(async () => {
        // Leave the caller's stack first: preset selection reaches this code from inside a session append.
        await null;
        try { return await operation(); }
        finally {
          while (entry.dirty && !disposed) {
            entry.dirty = false;
            await settle(agent);
          }
        }
      });
    } catch {
      throw new SettingsError('BUSY');
    }
    const tracked = job.then(() => {}, () => {}).then(() => {
      if (entry.job === tracked) entry.job = undefined;
      // A request that arrived after the last settle pass still needs one.
      if (entry.dirty && !disposed && entries.get(agent) === entry) {
        entry.dirty = false;
        requestSettle(agent);
      }
    });
    entry.job = tracked;
    return job;
  }

  /** Settle when the agent can be reserved; a request during our own job is folded into it. */
  function requestSettle(agent) {
    const entry = entries.get(agent);
    if (!entry || disposed) return undefined;
    if (entry.job) {
      entry.dirty = true;
      return entry.job;
    }
    try { return exclusive(agent, () => settle(agent)).catch(() => {}); }
    catch {
      // Someone else holds the agent. Its next turn is stopped if the base mode is wrong, and the agent settles once idle.
      entry.needsSettle = true;
      return undefined;
    }
  }

  async function quiesce(entry) {
    while (entry.job) await entry.job;
  }

  function beginTurn(agent) {
    const entry = entries.get(agent);
    if (!governs(agent) && !entry.effective) return;
    if (entry.applying) {
      stop(agent, new SettingsError('BUSY'));
      return;
    }
    const turn = stateOf(agent).turn;
    install(agent, turn.snapshot);
    if (entry.error) {
      entry.needsSettle = true;
      stop(agent, blockedError(entry));
    }
  }

  function guard(agent, exec) {
    const entry = entries.get(agent);
    if (exec.agent !== agent || !entry || !governs(agent)) return;
    if (entry.applying || entry.error || !entry.effective) return blockedError(entry).message;
    // run_code carries PTC programs; each tool call inside a program passes this guard on its own.
    if (exec.name === 'run_code' || permits(entry.effective.config, exec.name)) return;
    // Tools registered in the agent's own scope cannot be hidden, so they stay available.
    if (agent.ctx.tools.schemas(agent).some(tool => tool.name === exec.name)) return;
    return `Custom mode does not allow the ${exec.name} tool.`;
  }

  async function preStep(agent, payload, next) {
    const entry = entries.get(agent);
    if (payload.agent !== agent || !entry || !governs(agent)) return next();
    const effective = entry.effective;
    if (entry.applying || entry.error || !effective) throw blockedError(entry);
    const decision = await next();
    if (decision.kind !== 'enter') return decision;
    const turn = stateOf(agent).turn;
    if (entry.error || entry.effective !== effective || (turn && turn.snapshot !== effective)) throw blockedError(entry);
    return filterTimeContext(decision, effective.config);
  }

  function attach(agent) {
    if (entries.has(agent)) return entries.get(agent);
    const entry = { applying: false, dirty: false, needsSettle: false };
    entries.set(agent, entry);
    entry.dispose = agent.ctx.effect(() => {
      const disposers = [];
      const cleanup = () => {
        entry.policy?.();
        entry.policy = undefined;
        for (const release of disposers.splice(0).reverse()) release();
        entries.delete(agent);
        writes.delete(agent);
      };
      try {
        disposers.push(agent.ctx.tools.guard(exec => guard(agent, exec)));
        disposers.push(agent.ctx.on('session/event', (session, event) => {
          if (session === agent.session && event.type === 'turn/start') beginTurn(agent);
        }));
        disposers.push(agent.ctx.on('agent/pre-step', (payload, next) => preStep(agent, payload, next), { prepend: true }));
        disposers.push(agent.ctx.on('agent/status', payload => {
          if (payload.agent !== agent || payload.status !== 'idle' || !entry.needsSettle) return;
          entry.needsSettle = false;
          requestSettle(agent);
        }));
      } catch (error) {
        cleanup();
        throw error;
      }
      return cleanup;
    });
    return entry;
  }

  function commit(agent, expectedRevision, config, verify) {
    if (writes.has(agent)) throw new SettingsError('BUSY');
    writes.add(agent);
    const commandId = `customize-settings-${randomUUID()}`;
    const cursor = agent.session.seq;
    const record = { protocol: PROTOCOL, action: 'set', revision: expectedRevision + 1, config };
    try {
      agent.session.append('command/run', { commandId, name: PRESET_ID, source: { kind: 'user' } });
      verify();
      if (snapshotOf(agent).revision !== expectedRevision) throw new SettingsError('REVISION_CONFLICT');
      agent.session.append('command/done', { commandId, kind: 'success', text: JSON.stringify(record) });
    } catch (error) {
      if (!(error instanceof SettingsError)) report('settings commit failed', error);
      const tail = agent.session.snapshotEvents(cursor);
      const settled = tail.find(event => event.type === 'command/done' && event.data.commandId === commandId);
      // An observer may throw after the success record is durable; the commit stands.
      if (settled?.data.kind === 'success') return;
      if (!settled && tail.some(event => event.type === 'command/run' && event.data.commandId === commandId)) {
        try {
          agent.session.append('command/done', { commandId, kind: 'error', text: JSON.stringify({ error: diagnostic(error, 'COMMIT_FAILED') }) });
        } catch (settleError) { report('the failed settings record could not be closed', settleError); }
      }
      throw error instanceof SettingsError ? error : new SettingsError('COMMIT_FAILED');
    } finally {
      writes.delete(agent);
    }
  }

  function assertAccess(agent, signal) {
    assertNotAborted(signal);
    if (ctx.agents.get(agent.id) !== agent) throw new SettingsError('SESSION_NOT_FOUND');
    if (!isRoot(agent)) throw new SettingsError('ROOT_SESSION_REQUIRED');
    if (recordedPreset(agent) !== PRESET_ID) throw new SettingsError('WRONG_PRESET');
    if (ctx.agents.currentInitiator()) throw new SettingsError('HUMAN_ONLY');
  }

  function view(agent) {
    const entry = attach(agent);
    return {
      ...snapshotOf(agent),
      baseLocked: !isBlank(agent),
      warnings: entry.error ? [diagnostic(blockedError(entry))] : [],
    };
  }

  /**
   * Current settings. An idle conversation is settled first when its settings are not in force,
   * which is also how it is repaired, or when a blank one can still adopt the default preset.
   */
  async function read(agent, signal) {
    assertAccess(agent, signal);
    const entry = attach(agent);
    await quiesce(entry);
    assertAccess(agent, signal);
    const snapshot = snapshotOf(agent);
    const adoptable = snapshot.revision === 0 && isBlank(agent) && presets.defaultConfig() !== undefined;
    if (agent.status === 'idle' && (entry.error || adoptable || composition(agent) !== snapshot.config.baseMode)) {
      await requestSettle(agent);
      await quiesce(entry);
      assertAccess(agent, signal);
    }
    return view(agent);
  }

  async function set(agent, { expectedRevision, config }, signal) {
    assertAccess(agent, signal);
    const entry = attach(agent);
    await quiesce(entry);
    assertAccess(agent, signal);
    const before = snapshotOf(agent);
    if (expectedRevision !== before.revision) throw new SettingsError('REVISION_CONFLICT');
    if (config.baseMode === before.config.baseMode) {
      commit(agent, expectedRevision, config, () => assertAccess(agent, signal));
      // An idle conversation takes the new policy right away; a running turn keeps its pinned one.
      if (agent.status === 'idle') install(agent, snapshotOf(agent));
      return view(agent);
    }
    if (!isBlank(agent)) throw new SettingsError('BASE_LOCKED');
    await assertBaseAvailable(ctx.agentPresets, config.baseMode);
    assertAccess(agent, signal);
    await quiesce(entry);
    await exclusive(agent, async () => {
      assertAccess(agent, signal);
      if (!isBlank(agent)) throw new SettingsError('BASE_LOCKED');
      commit(agent, expectedRevision, config, () => assertAccess(agent, signal));
      await settle(agent);
    });
    return view(agent);
  }

  const subscriptions = [];
  function releaseEntries() {
    for (const entry of [...entries.values()]) entry.dispose?.();
    entries.clear();
  }
  /** Stop observing, let reserved jobs finish, then remove every policy and the projection registration. */
  function dispose() {
    if (disposal) return disposal;
    disposed = true;
    for (const unsubscribe of subscriptions.splice(0).reverse()) unsubscribe();
    const jobs = [...entries.values()].map(entry => entry.job).filter(Boolean);
    if (jobs.length === 0) {
      releaseEntries();
      return disposal = projection.dispose();
    }
    return disposal = Promise.all(jobs).then(() => {
      releaseEntries();
      return projection.dispose();
    });
  }

  try {
    subscriptions.push(ctx.on('agent/created', async ({ agent }) => {
      // Creation keeps the agent reserved until every listener settles, so the base is rebound before its first turn.
      attach(agent);
      await settle(agent);
    }));
    subscriptions.push(ctx.on('agent/disposed', ({ agent }) => { entries.get(agent)?.dispose(); }));
    subscriptions.push(ctx.on('agent-preset/selected', (sessionId, preset) => {
      const agent = ctx.agents.get(sessionId);
      if (!agent || !isRoot(agent)) return;
      const entry = attach(agent);
      if (preset === PRESET_ID || entry.effective || entry.job || composition(agent) !== preset) requestSettle(agent);
    }));
    for (const agent of ctx.agents.list()) {
      const entry = attach(agent);
      if (!governs(agent)) continue;
      if (agent.status === 'running') {
        // The previous plugin instance removed its policy mid-turn; never let the turn continue under mixed settings.
        entry.error = diagnostic(new SettingsError('BUSY'));
        entry.needsSettle = true;
        stop(agent, new SettingsError('BUSY'));
      } else if (inMode(agent) && composition(agent) !== snapshotOf(agent).config.baseMode) requestSettle(agent);
      else install(agent, snapshotOf(agent));
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { read, set, view, snapshotOf, assertAccess, dispose };
}
