import { SettingsError } from './errors.js';

export const PROTOCOL = 'dsh-customize-mode/v1';
export const PROJECTION_KEY = 'customizeMode';
export const PRESET_ID = 'customize-mode';
export const MAX_SETTINGS_BYTES = 4 * 1024 * 1024;
export const DEFAULT_CONFIG = Object.freeze({
  overridePrompt: false,
  prompt: '',
  allowedTools: null,
  includeRuntimeContext: true,
  includeTimeContext: true,
});

const objectWithKeys = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const invalid = field => { throw new SettingsError('INVALID_REQUEST', { field }); };

export function validateConfig(value) {
  if (!objectWithKeys(value, Object.keys(DEFAULT_CONFIG))) invalid('config');
  if (typeof value.overridePrompt !== 'boolean') invalid('overridePrompt');
  if (typeof value.prompt !== 'string' || value.prompt.length > 1000000) invalid('prompt');
  if (value.allowedTools !== null && (!Array.isArray(value.allowedTools) || value.allowedTools.length > 10000 ||
      !value.allowedTools.every(name => typeof name === 'string' && name.length > 0 && name.length <= 256))) invalid('allowedTools');
  for (const field of ['includeRuntimeContext', 'includeTimeContext']) {
    if (typeof value[field] !== 'boolean') invalid(field);
  }
  return {
    overridePrompt: value.overridePrompt,
    prompt: value.prompt,
    allowedTools: value.allowedTools === null ? null : [...new Set(value.allowedTools)],
    includeRuntimeContext: value.includeRuntimeContext,
    includeTimeContext: value.includeTimeContext,
  };
}

export function validateRequest(request) {
  if (objectWithKeys(request, ['action']) && request.action === 'get') return { action: 'get' };
  if (!objectWithKeys(request, ['action', 'expectedRevision', 'config']) || request.action !== 'set' ||
      !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 ||
      request.expectedRevision >= Number.MAX_SAFE_INTEGER) invalid('request');
  return { action: 'set', expectedRevision: request.expectedRevision, config: validateConfig(request.config) };
}

export function validateSettingsPayload(payload) {
  if (!objectWithKeys(payload, ['sessionId', 'request']) || typeof payload.sessionId !== 'string' ||
      payload.sessionId.length === 0 || payload.sessionId.length > 256 || /[\u0000-\u001f]/u.test(payload.sessionId)) invalid('sessionId');
  const normalized = { sessionId: payload.sessionId, request: validateRequest(payload.request) };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_SETTINGS_BYTES) throw new SettingsError('REQUEST_TOO_LARGE');
  return normalized;
}

export function initialState() {
  return { snapshot: { protocol: PROTOCOL, revision: 0, config: { ...DEFAULT_CONFIG } }, pending: [] };
}

export function fold(state, event) {
  const data = event.data;
  if (event.type === 'command/run' && data.name === PRESET_ID && data.source?.kind === 'user' && typeof data.commandId === 'string') {
    return state.pending.includes(data.commandId) ? state : { ...state, pending: [...state.pending, data.commandId] };
  }
  if (event.type !== 'command/done' || !state.pending.includes(data.commandId)) return state;
  const pending = state.pending.filter(id => id !== data.commandId);
  let snapshot = state.snapshot;
  if (data.kind === 'success' && typeof data.text === 'string') {
    try {
      const value = JSON.parse(data.text);
      if (value.protocol === PROTOCOL && value.action === 'set' && Number.isSafeInteger(value.revision) && value.revision === snapshot.revision + 1) {
        snapshot = { protocol: PROTOCOL, revision: value.revision, config: validateConfig(value.config) };
      }
    } catch { /* Invalid or unrelated command output cannot change settings. */ }
  }
  return { snapshot, pending };
}

export function projectionDefinition(z) {
  const configSchema = z.object({
    overridePrompt: z.boolean(), prompt: z.string(), allowedTools: z.array(z.string()).nullable(),
    includeRuntimeContext: z.boolean(), includeTimeContext: z.boolean(),
  });
  const viewSchema = z.object({ protocol: z.literal(PROTOCOL), revision: z.number().int().nonnegative(), config: configSchema });
  return {
    key: PROJECTION_KEY,
    stateVersion: 1,
    stateSchema: z.object({ snapshot: viewSchema, pending: z.array(z.string()) }),
    init: initialState,
    apply: fold,
    wire: { viewSchema, view: state => state.snapshot },
  };
}

export const isRestricted = config => config.allowedTools !== null;
export const permits = (config, name) => !isRestricted(config) || config.allowedTools.includes(name);
export const deniedVisible = (config, schemas) => schemas.filter(tool => !permits(config, tool.name)).map(tool => tool.name);
