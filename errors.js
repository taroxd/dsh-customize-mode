/**
 * Stable diagnostics. The browser translates each code; these English messages
 * reach users only as the stop reason of a blocked turn and in Host logs.
 */
export const MESSAGES = Object.freeze({
  INVALID_REQUEST: 'The settings request is invalid.',
  REQUEST_TOO_LARGE: 'The settings request exceeds the 4 MiB limit.',
  NOT_FOUND: 'Unknown settings endpoint.',
  UNAVAILABLE: 'Custom mode settings are unavailable right now.',
  UNAUTHORIZED: 'Browser authentication is required.',
  FORBIDDEN: 'Only the authenticated browser owner can access these settings.',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json.',
  ABORTED: 'The settings request was cancelled.',
  SESSION_NOT_FOUND: 'The conversation is not open.',
  ROOT_SESSION_REQUIRED: 'Settings can only be changed in a main conversation.',
  WRONG_PRESET: 'The conversation is not in Custom mode.',
  HUMAN_ONLY: 'Agents cannot change Custom mode settings.',
  BUSY: 'Custom mode was still applying a settings change. Send the message again.',
  REVISION_CONFLICT: 'The settings were changed elsewhere. Reload them first.',
  SESSION_CHANGED: 'The conversation changed during the update.',
  BASE_LOCKED: 'The base mode cannot change after the conversation starts.',
  BASE_MODE_UNAVAILABLE: 'The base mode of this Custom mode conversation could not be loaded. Open Custom settings for details.',
  PREVIEW_FAILED: 'The prompt and tools of the base mode could not be loaded.',
  POLICY_UNAVAILABLE: 'Custom mode settings could not be applied. Open Custom settings to fix them, then send the message again.',
  COMMIT_FAILED: 'The settings were not saved.',
  PRESET_EXISTS: 'A preset with this title already exists.',
  PRESET_NOT_FOUND: 'The preset no longer exists.',
  PRESETS_FULL: 'The preset limit has been reached.',
  PRESETS_SAVE_FAILED: 'The presets could not be saved.',
  SETTINGS_FAILED: 'The settings operation failed.',
});

export class SettingsError extends Error {
  constructor(code, details = {}) {
    super(MESSAGES[code]);
    this.name = 'SettingsError';
    this.code = code;
    this.details = details;
  }
}

export function diagnostic(error, fallback = 'SETTINGS_FAILED') {
  const code = error instanceof SettingsError ? error.code : fallback;
  return { code, message: MESSAGES[code], details: error instanceof SettingsError ? error.details : {} };
}

export function assertNotAborted(signal) {
  if (signal.aborted) throw new SettingsError('ABORTED');
}

/**
 * Settle with an operation, or reject as soon as the signal aborts. The
 * operation itself keeps running; owners that must drain it track it separately.
 */
export function waitWithSignal(operation, signal) {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new SettingsError('ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      assertNotAborted(signal);
      return operation();
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
