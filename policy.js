import { SettingsError } from './errors.js';
import { deniedVisible, isRestricted } from './state.js';

export function filterTimeContext(decision, config) {
  if (decision.kind !== 'enter' || config.includeTimeContext) return decision;
  const messages = decision.messages.filter(message => message.source?.kind !== 'time-context');
  return messages.length === decision.messages.length ? decision : { ...decision, messages };
}

export function installPolicy(agent, config, tools, prompt) {
  const disposers = [];
  const own = disposer => disposers.push(disposer);
  const dispose = () => { for (const release of disposers.splice(0).reverse()) release(); };
  try {
    if (!config.includeRuntimeContext) {
      // Shadow working-directory:current as optional so suppressRuntimeContext() can remove it.
      own(prompt.context({ name: 'working-directory:current', order: prompt.getContextOrder('WORKING_DIRECTORY'),
        text: '', interpolate: false, required: false }));
      own(prompt.suppressRuntimeContext());
    }
    if (config.overridePrompt) own(prompt.section({
      name: 'local:customize-mode:complete', order: 0, complete: true, interpolate: true, text: config.prompt,
    }));
    if (isRestricted(config)) {
      own(tools.presentAs('native'));
      const probe = tools.restrict({ allow: [] });
      let local;
      try { local = tools.schemas(agent); } finally { probe(); }
      const conflicts = deniedVisible(config, local);
      if (conflicts.length) throw new SettingsError('UNSUPPORTED_POLICY', { tools: conflicts });
      const localNames = new Set(local.map(tool => tool.name));
      const available = new Set(tools.schemas(agent).map(tool => tool.name));
      own(tools.restrict({ allow: config.allowedTools.filter(name => available.has(name) && !localNames.has(name) && name !== 'run_code') }));
      const leaked = deniedVisible(config, tools.schemas(agent));
      if (leaked.length) throw new SettingsError('TOOL_VISIBILITY_CONFLICT', { tools: leaked });
    }
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
