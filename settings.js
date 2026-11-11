import { createController } from './controller.js';
import { createBaseDescriber, listBases } from './bases.js';
import { clientRequestSchema } from './protocol.js';
import { PROTOCOL, MAX_SETTINGS_BYTES, projectionDefinition, validateSettingsPayload } from './state.js';
import { SettingsError, diagnostic, assertNotAborted, waitWithSignal } from './errors.js';

export const SETTINGS_CHANNEL = '/api';
export const SETTINGS_ENDPOINT = 'customize-mode-settings';
export const SETTINGS_PATH = `${SETTINGS_CHANNEL}/${SETTINGS_ENDPOINT}`;
const MAX_ENVELOPE_BYTES = MAX_SETTINGS_BYTES + 32768;
const failure = error => ({ ok: false, error: diagnostic(error) });
const respond = (rpcId, result, status = 200) => Response.json({ type: 'server-response', rpcId, result }, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const presetList = store => ({ protocol: PROTOCOL, defaultTitle: store.defaultTitle, presets: store.presets });

async function readEnvelope(request, signal, reportCleanupError) {
  if (Number(request.headers.get('content-length')) > MAX_ENVELOPE_BYTES) throw new SettingsError('REQUEST_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new SettingsError('INVALID_REQUEST');
  let complete = false;
  try {
    const parts = [];
    let total = 0;
    for (;;) {
      const { value, done } = await waitWithSignal(() => reader.read(), signal);
      if (done) { complete = true; break; }
      total += value.byteLength;
      if (total > MAX_ENVELOPE_BYTES) throw new SettingsError('REQUEST_TOO_LARGE');
      parts.push(value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, total))); }
    catch { throw Object.assign(new SettingsError('INVALID_REQUEST'), { httpStatus: 400 }); }
  } finally {
    if (!complete) reader.cancel().catch(reportCleanupError);
    try { reader.releaseLock(); } catch (error) { reportCleanupError(error); }
  }
}

/**
 * Serve the settings endpoint for the browser owner.
 * @param options.presets - Preset store of the current profile.
 * @param options.describeBase - Reads the prompt template and tools of a base mode; tests replace it.
 * @returns Disposer that detaches the route, drains requests, and removes every policy.
 */
export async function createHost(ctx, { presets, describeBase = createBaseDescriber(ctx) }) {
  const projection = await ctx.sessionProjections.register(projectionDefinition);
  let controller;
  try {
    controller = createController(ctx, { projection, presets });
  } catch (error) {
    await projection.dispose();
    throw error;
  }
  const closing = new AbortController();
  const active = new Set();
  const background = new Set();
  let disposal;

  /** Describe a base mode. Teardown waits for the lease even when the request that started it was cancelled. */
  async function describe(baseMode, signal) {
    const operation = Promise.resolve().then(() => describeBase(baseMode, { signal }));
    background.add(operation);
    operation.then(() => background.delete(operation), () => background.delete(operation));
    try {
      return await waitWithSignal(() => operation, signal);
    } catch (error) {
      if (signal.aborted) throw new SettingsError('ABORTED');
      if (error instanceof SettingsError) throw error;
      ctx.logger.warn('customize-mode: base mode details could not be loaded', error);
      throw new SettingsError('PREVIEW_FAILED');
    }
  }

  async function read(agent, signal) {
    const { config: { baseMode } } = await controller.read(agent, signal);
    const [bases, catalog] = await Promise.all([
      waitWithSignal(() => listBases(ctx.agentPresets), signal),
      // The dialog still opens for an unavailable base, so the user can see the problem and pick another one.
      describe(baseMode, signal).catch(error => {
        if (error.code === 'BASE_MODE_UNAVAILABLE') return null;
        throw error;
      }),
    ]);
    controller.assertAccess(agent, signal);
    const value = controller.view(agent);
    if (value.config.baseMode !== baseMode) throw new SettingsError('REVISION_CONFLICT');
    return { protocol: PROTOCOL, ...value, bases, catalog };
  }

  function perform(agent, operation, authorize, signal) {
    switch (operation.action) {
      case 'get': return read(agent, signal);
      case 'set': return controller.set(agent, operation, signal).then(value => ({ protocol: PROTOCOL, ...value }));
      case 'describe-base':
        controller.assertAccess(agent, signal);
        return describe(operation.baseMode, signal).then(catalog => ({ protocol: PROTOCOL, baseMode: operation.baseMode, ...catalog }));
      case 'list-presets':
        controller.assertAccess(agent, signal);
        return presetList(presets.current());
      case 'save-preset':
        controller.assertAccess(agent, signal);
        return presets.save(operation, authorize).then(presetList);
      case 'delete-preset':
        controller.assertAccess(agent, signal);
        return presets.remove(operation.title, authorize).then(presetList);
      case 'set-default-preset':
        controller.assertAccess(agent, signal);
        return presets.setDefault(operation.title, authorize).then(presetList);
    }
  }

  async function fetchSettings(request) {
    let rpcId = 'invalid-request';
    if (request.method !== 'POST' || new URL(request.url).pathname !== SETTINGS_PATH) return respond(rpcId, failure(new SettingsError('NOT_FOUND')), 404);
    if (closing.signal.aborted) return respond(rpcId, failure(new SettingsError('UNAVAILABLE')), 503);
    const admission = ctx.connection.admit(request);
    if ('rejection' in admission) return respond(rpcId, failure(new SettingsError(admission.rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN')), admission.rejection);
    const peer = admission.peer;
    const isOwner = () => peer === ctx.connection.browserPeer && peer.principal.kind === 'owner' && !peer.signal.aborted;
    if (!isOwner()) return respond(rpcId, failure(new SettingsError('FORBIDDEN')), 403);
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return respond(rpcId, failure(new SettingsError('UNSUPPORTED_MEDIA_TYPE')), 415);
    const signal = AbortSignal.any([request.signal, peer.signal, closing.signal]);
    try {
      assertNotAborted(signal);
      const body = await readEnvelope(request, signal, error => ctx.logger.warn('customize-mode: request body cleanup failed', error));
      if (typeof body?.rpcId === 'string') rpcId = body.rpcId;
      const parsed = clientRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.method !== SETTINGS_ENDPOINT) throw new SettingsError('INVALID_REQUEST');
      const { sessionId, request: operation } = validateSettingsPayload(parsed.data.payload);
      const agent = ctx.agents.get(sessionId);
      if (!agent) throw new SettingsError('SESSION_NOT_FOUND');
      // Preset writes queue behind each other, so each one checks access again when its turn comes.
      const authorize = () => {
        if (!isOwner()) throw new SettingsError('FORBIDDEN');
        controller.assertAccess(agent, signal);
      };
      return respond(rpcId, { ok: true, value: await perform(agent, operation, authorize, signal) });
    } catch (error) {
      if (!(error instanceof SettingsError)) ctx.logger.warn('customize-mode: settings request failed', error);
      const status = error instanceof SettingsError ? (error.code === 'REQUEST_TOO_LARGE' ? 413 : error.httpStatus ?? 200) : 200;
      return respond(rpcId, failure(error), status);
    }
  }

  let detach;
  try {
    detach = ctx.connection.fetch.register({ path: SETTINGS_PATH, methods: ['POST'], requestBody: 'buffered', fetch: request => {
      const pending = fetchSettings(request).catch(error => {
        ctx.logger.warn('customize-mode: settings transport failed', error);
        return respond('invalid-request', failure(new SettingsError('SETTINGS_FAILED')), 500);
      });
      active.add(pending);
      pending.finally(() => active.delete(pending));
      return pending;
    } });
  } catch (error) {
    await controller.dispose();
    throw error;
  }
  return () => disposal ??= (async () => {
    closing.abort();
    try {
      await detach();
      await Promise.allSettled([...active]);
      await Promise.allSettled([...background]);
    }
    finally { await controller.dispose(); }
  })();
}
