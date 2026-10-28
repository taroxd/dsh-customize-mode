import { createController } from './controller.js';
import { createDefaultPromptPreview } from './preview.js';
import { clientRequestSchema } from './protocol.js';
import { PRESET_ID, PROTOCOL, MAX_SETTINGS_BYTES, validateSettingsPayload } from './state.js';
import { SettingsError, diagnostic, assertNotAborted, waitWithSignal } from './errors.js';

export const SETTINGS_CHANNEL = '/api';
export const SETTINGS_ENDPOINT = 'customize-mode-settings';
export const SETTINGS_PATH = `${SETTINGS_CHANNEL}/${SETTINGS_ENDPOINT}`;
const MAX_ENVELOPE_BYTES = MAX_SETTINGS_BYTES + 32768;
const failure = error => ({ ok: false, error: diagnostic(error) });
const respond = (rpcId, result, status = 200) => Response.json({ type: 'server-response', rpcId, result }, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

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

export function createHost(ctx, z, options) {
  const defaults = options.defaults;
  const controller = createController(ctx, z, defaults);
  const preview = options.previewDefaultPrompt ?? createDefaultPromptPreview(ctx);
  const closing = new AbortController();
  const active = new Set();
  const previews = new Set();
  let disposal;

  async function fetchSettings(request) {
    let rpcId = 'invalid-request';
    if (request.method !== 'POST' || new URL(request.url).pathname !== SETTINGS_PATH) return respond(rpcId, failure(new SettingsError('NOT_FOUND')), 404);
    if (closing.signal.aborted) return respond(rpcId, failure(new SettingsError('UNAVAILABLE')), 503);
    const admission = ctx.connection.admit(request);
    if ('rejection' in admission) return respond(rpcId, failure(new SettingsError(admission.rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN')), admission.rejection);
    const peer = admission.peer;
    if (peer !== ctx.connection.browserPeer || peer.principal.kind !== 'owner' || peer.signal.aborted) return respond(rpcId, failure(new SettingsError('FORBIDDEN')), 403);
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
      if (operation.action === 'set') return respond(rpcId, { ok: true, value: controller.set(agent, operation, signal) });
      controller.assertAccess(agent, signal);
      if (operation.action === 'set-defaults') {
        const saved = await defaults.set(operation, () => {
          if (peer !== ctx.connection.browserPeer || peer.principal.kind !== 'owner') throw new SettingsError('FORBIDDEN');
          controller.assertAccess(agent, signal);
        });
        return respond(rpcId, { ok: true, value: { protocol: PROTOCOL, ...saved, action: 'set-defaults', warnings: [] } });
      }
      const revision = controller.snapshotOf(agent).revision;
      let defaultPrompt;
      try {
        const operation = Promise.resolve().then(() => {
          assertNotAborted(signal);
          return preview(agent, { signal });
        });
        previews.add(operation);
        operation.then(() => previews.delete(operation), () => previews.delete(operation));
        defaultPrompt = await waitWithSignal(() => operation, signal);
      }
      catch (error) {
        if (signal.aborted) throw new SettingsError('ABORTED');
        ctx.logger.warn('customize-mode: default prompt preview failed', error);
        throw new SettingsError('PREVIEW_FAILED');
      }
      assertNotAborted(signal);
      if (ctx.agents.get(sessionId) !== agent || ctx.agentPresets.composedPreset(agent.ctx) !== PRESET_ID) throw new SettingsError('SESSION_CHANGED');
      const value = controller.read(agent, signal);
      if (value.revision !== revision) throw new SettingsError('REVISION_CONFLICT');
      return respond(rpcId, { ok: true, value: { ...value, defaultPrompt, defaultsRevision: defaults.current().revision } });
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
    controller.dispose();
    throw error;
  }
  return () => disposal ??= (async () => {
    closing.abort();
    try {
      await detach();
      await Promise.allSettled([...active]);
      await Promise.allSettled([...previews]);
    }
    finally { controller.dispose(); }
  })();
}
