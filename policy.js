import { isRestricted } from './state.js';

/** Section that the persona plugin of every shipped mode registers; a scoped section of this name replaces it. */
const PERSONA_SECTION = 'deployment:persona-prefix';

export function filterTimeContext(decision, config) {
  if (decision.kind !== 'enter' || config.includeTimeContext) return decision;
  const messages = decision.messages.filter(message => message.source?.kind !== 'time-context');
  return messages.length === decision.messages.length ? decision : { ...decision, messages };
}

/**
 * Names visible to the agent that come from its own scope. `tools.restrict()`
 * never hides them, so they stay available whatever the allowlist says.
 */
function scopeLocalTools(agent, tools) {
  const probe = tools.restrict({ allow: [] });
  try { return new Set(tools.schemas(agent).map(tool => tool.name)); }
  finally { probe(); }
}

/**
 * Register one agent's prompt, context, and tool policy in its own scope.
 * @returns Disposer that removes every registration; a failure removes the partial set before throwing.
 */
export function installPolicy(agent, config, tools, prompt) {
  const disposers = [];
  const dispose = () => { for (const release of disposers.splice(0).reverse()) release(); };
  try {
    if (!config.includeRuntimeContext) {
      // Shadow working-directory:current as optional so suppressRuntimeContext() can remove it.
      disposers.push(prompt.context({ name: 'working-directory:current', order: prompt.getContextOrder('WORKING_DIRECTORY'),
        text: '', interpolate: false, required: false }));
      disposers.push(prompt.suppressRuntimeContext());
    }
    if (config.overridePrompt) {
      // Shadowing the base persona by name keeps exactly one complete section, even when the base mode's own persona is complete.
      disposers.push(prompt.section({
        name: PERSONA_SECTION, order: prompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'), complete: true, interpolate: true, text: config.prompt,
      }));
    }
    if (isRestricted(config)) {
      const local = scopeLocalTools(agent, tools);
      const allowed = new Set(config.allowedTools);
      const allow = tools.schemas(agent).map(tool => tool.name).filter(name => allowed.has(name) && !local.has(name) && name !== 'run_code');
      disposers.push(tools.restrict({ allow }));
    }
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
