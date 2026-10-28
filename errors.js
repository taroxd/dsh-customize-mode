export const MESSAGES = Object.freeze({
  INVALID_REQUEST: 'Invalid settings request.',
  REQUEST_TOO_LARGE: 'Settings payload exceeds the 4 MiB limit.',
  NOT_FOUND: 'Unknown settings endpoint.',
  UNAVAILABLE: 'Custom mode settings are unavailable.',
  UNAUTHORIZED: 'Browser authentication is required.',
  FORBIDDEN: 'Only the authenticated browser owner may access these settings.',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json.',
  ABORTED: 'The settings request was cancelled.',
  SESSION_NOT_FOUND: 'The session is not open.',
  ROOT_SESSION_REQUIRED: 'Settings are only available for root sessions.',
  WRONG_PRESET: 'Select the Custom mode preset first.',
  HUMAN_ONLY: 'Agent-initiated settings requests are not allowed.',
  BUSY: 'Another settings update is being committed.',
  REVISION_CONFLICT: 'Settings changed. Reload before saving.',
  DEFAULTS_REVISION_CONFLICT: 'Global defaults changed. Reload before saving defaults.',
  DEFAULTS_SAVE_FAILED: 'The global defaults were not saved.',
  RESERVED_TOOL: 'The run_code transport cannot be included in a native tool allowlist.',
  UNSUPPORTED_POLICY: 'The requested policy cannot hide one or more session-local tools.',
  TOOL_VISIBILITY_CONFLICT: 'The requested tool visibility policy could not be applied.',
  POLICY_UNAVAILABLE: 'The saved policy could not be applied. Model requests are blocked until it is repaired.',
  CATALOG_STALE: 'The running session uses the last known tool catalog. Reload after it becomes idle.',
  COMMIT_FAILED: 'The settings update was not committed.',
  PREVIEW_FAILED: 'The default prompt template could not be loaded.',
  SESSION_CHANGED: 'The session or its preset changed. Reopen the settings.',
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
