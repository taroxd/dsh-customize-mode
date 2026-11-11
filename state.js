import { z } from 'zod';
import { SettingsError } from './errors.js';

export const PROTOCOL = 'dsh-customize-mode/v1';
export const PROJECTION_KEY = 'customizeMode';
export const PRESET_ID = 'customize-mode';
/** Base mode of new conversations without a default preset, and of records saved before base modes existed. */
export const DEFAULT_BASE_MODE = 'standard';
export const MAX_SETTINGS_BYTES = 4 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 80;
export const MAX_NOTE_LENGTH = 1000;

export const DEFAULT_CONFIG = Object.freeze({
  baseMode: DEFAULT_BASE_MODE,
  overridePrompt: false,
  prompt: '',
  allowedTools: null,
  includeRuntimeContext: true,
  includeTimeContext: true,
});

const controlCharacters = /[\u0000-\u001f\u007f]/u;
const text = (max, label) => z.string().max(max).refine(value => !controlCharacters.test(value), `${label} contains control characters`);

export const baseModeSchema = z.string().min(1).max(128)
  .refine(value => !controlCharacters.test(value) && value.trim() === value, 'invalid preset id')
  .refine(value => value !== PRESET_ID, 'Custom mode cannot be its own base mode');

export const configSchema = z.strictObject({
  baseMode: baseModeSchema,
  overridePrompt: z.boolean(),
  prompt: z.string().max(1_000_000),
  allowedTools: z.array(text(256, 'tool name').min(1)).max(10_000).nullable(),
  includeRuntimeContext: z.boolean(),
  includeTimeContext: z.boolean(),
}).transform(config => ({ ...config, allowedTools: config.allowedTools && [...new Set(config.allowedTools)] }));

const titleSchema = z.string().transform(value => value.normalize('NFC').trim())
  .pipe(text(MAX_TITLE_LENGTH, 'title').min(1));
const noteSchema = z.string().transform(value => value.normalize('NFC').trim())
  .pipe(z.string().max(MAX_NOTE_LENGTH));
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);

export const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('get') }),
  z.strictObject({ action: z.literal('describe-base'), baseMode: baseModeSchema }),
  z.strictObject({ action: z.literal('set'), expectedRevision: revisionSchema, config: configSchema }),
  z.strictObject({ action: z.literal('list-presets') }),
  z.strictObject({ action: z.literal('save-preset'), title: titleSchema, note: noteSchema, config: configSchema, overwrite: z.boolean() }),
  z.strictObject({ action: z.literal('delete-preset'), title: titleSchema }),
  z.strictObject({ action: z.literal('set-default-preset'), title: titleSchema.nullable() }),
]);

const payloadSchema = z.strictObject({
  sessionId: text(256, 'session id').min(1),
  request: requestSchema,
});

export const presetSchema = z.strictObject({
  title: titleSchema,
  note: noteSchema,
  config: configSchema,
  updatedAt: z.number().int().nonnegative(),
});

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new SettingsError('INVALID_REQUEST', { field: result.error.issues[0]?.path.join('.') ?? '' });
  return result.data;
}

export const validateConfig = value => parse(configSchema, value);

export function validateSettingsPayload(payload) {
  const normalized = parse(payloadSchema, payload);
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_SETTINGS_BYTES) throw new SettingsError('REQUEST_TOO_LARGE');
  return normalized;
}

/** Records written before base modes existed ran on the Standard mode composition. */
function recordConfig(config) {
  const legacy = config !== null && typeof config === 'object' && !Array.isArray(config) && !Object.hasOwn(config, 'baseMode');
  return validateConfig(legacy ? { baseMode: DEFAULT_BASE_MODE, ...config } : config);
}

export function initialState() {
  return { snapshot: { protocol: PROTOCOL, revision: 0, config: { ...DEFAULT_CONFIG } }, pending: [], turn: null };
}

export function fold(state, event) {
  const data = event.data;
  // Pin the snapshot when a turn starts so saves during the turn only affect later turns.
  if (event.type === 'turn/start') return { ...state, turn: { number: data.turn, snapshot: state.snapshot } };
  if (event.type === 'turn/end' && state.turn?.number === data.turn) return { ...state, turn: null };
  if (event.type === 'command/run' && data.name === PRESET_ID && data.source?.kind === 'user' && typeof data.commandId === 'string') {
    return state.pending.includes(data.commandId) ? state : { ...state, pending: [...state.pending, data.commandId] };
  }
  if (event.type !== 'command/done' || !state.pending.includes(data.commandId)) return state;
  const pending = state.pending.filter(id => id !== data.commandId);
  let snapshot = state.snapshot;
  if (data.kind === 'success' && typeof data.text === 'string') {
    try {
      const value = JSON.parse(data.text);
      if (value.protocol === PROTOCOL && value.action === 'set' && value.revision === snapshot.revision + 1) {
        snapshot = { protocol: PROTOCOL, revision: value.revision, config: recordConfig(value.config) };
      }
    } catch {}
  }
  return { ...state, snapshot, pending };
}

const stateConfigSchema = z.object({
  baseMode: z.string(), overridePrompt: z.boolean(), prompt: z.string(), allowedTools: z.array(z.string()).nullable(),
  includeRuntimeContext: z.boolean(), includeTimeContext: z.boolean(),
});
const viewSchema = z.object({ protocol: z.literal(PROTOCOL), revision: z.number().int().nonnegative(), config: stateConfigSchema });

export const projectionDefinition = Object.freeze({
  key: PROJECTION_KEY,
  // Version 3 adds the base mode to every snapshot.
  stateVersion: 3,
  stateSchema: z.object({
    snapshot: viewSchema,
    pending: z.array(z.string()),
    turn: z.object({ number: z.number().int().nonnegative(), snapshot: viewSchema }).nullable(),
  }),
  init: initialState,
  apply: fold,
  wire: { viewSchema, view: state => state.snapshot },
});

export const isRestricted = config => config.allowedTools !== null;
export const permits = (config, name) => !isRestricted(config) || config.allowedTools.includes(name);
