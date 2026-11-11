# Development Guide

## Overview

`dsh-customize-mode` is a DSH Web/Desktop bundle providing a `customize-mode` preset, a settings RPC endpoint, and a bilingual settings UI.

- Target DSH version: `0.2.2-rc.1`, declared as `engines.dsh` `>=0.2.2-rc.1 <0.3.0-0`; development runtime: Node.js 24+.
- Runtime dependency: `zod`. React and host services are provided by DSH.
- Commands: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`.
- Keep source code, comments, tests, and documentation in English. Chinese is used in UI translations and localized test cases.
- Implement supported behavior directly. Do not add speculative fallback paths, silent degradation, or tests for unsupported hypothetical states. Keep authorization, external-input validation, transactional consistency, and normal cancellation/lifecycle requirements.

## Modules

| File | Purpose |
| --- | --- |
| [index.js](<index.js>) | Host plugin entry and lifecycle |
| [preset.js](<preset.js>) | `customize-mode` preset declaration and language-dependent display copy |
| [state.js](<state.js>) | Request and config schemas, session log projection |
| [policy.js](<policy.js>) | Scoped prompt, tool, and context registration |
| [controller.js](<controller.js>) | Agent lifecycle, base mode rebinding, default preset adoption, and settings commits |
| [presets.js](<presets.js>) | Profile-scoped preset collection and default preset |
| [bases.js](<bases.js>) | Base mode roster and prompt/tool catalog of a base mode |
| [settings.js](<settings.js>) | Authenticated Connection Fetch endpoint |
| [errors.js](<errors.js>) | Error codes and cancellation helpers |
| [protocol.js](<protocol.js>) | Connection request envelope schema |
| [client.js](<client.js>) | Client UI components, state hooks, and translations |
| [cordis.patch.yml](<cordis.patch.yml>) | Host plugin entry row |
| [build-runtime.mjs](<build-runtime.mjs>) | Versioned Host runtime builder |

## Architecture & Invariants

- **Activation**: Controlled solely by selecting the `customize-mode` preset in a main conversation.
- **Preset declaration**: Registered from [preset.js](<preset.js>) through `agentPresets.register()` and never declared as a YAML row, because DSH translates a preset's display copy only for the four presets it ships (`BUILT_IN_PRESET_KEYS` in `dsh-agent-preset-registry`); a YAML row would pin one language. The name and description follow the `locale.preference` settings field, rewritten in place on `settings/document-updated` so the mounted revision never changes. Languages other than `zh*` use the English copy. The browser caches the roster it reads (`agentPresets/list`) and re-reads it only on mount, a `agent-preset-registry` settings update, or `connection/reset`, so an already-mounted mode chip keeps the previous language until the next roster read; the Host copy itself is always current.
- **Base mode**: The preset composes no plugins. Each settings snapshot names a `baseMode` (any other roster preset), and the controller rebinds the conversation's agent to that composition with `agentPresets.recompose()`, so the conversation inherits that mode's tools, skills, and plugins. The session log keeps recording `customize-mode` as the selected preset; `agentPresets.presetForSession()` decides whether a conversation is in Custom mode, and `composedPreset()` reports the base. Rebinding happens only while no turn can start: inside the serial `agent/created` dispatch, or inside `agent.runMaintenance()`. The base can change only while the conversation is blank (no turn started); afterwards `set` rejects with `BASE_LOCKED`. A conversation whose composition does not match its base (for example, the base preset broke) blocks turns with `BASE_MODE_UNAVAILABLE`; the next idle settings read retries the rebind. Records written before base modes existed fold to `standard`.
- **Subagents**: Children are not main conversations and are never rebound; they join their parent's composition through DSH. Forked children inherit the parent's settings records and keep the same policy.
- **Session persistence**: Settings updates append paired `command/run` and `command/done` records to the session log and increment the revision synchronously. A hidden `commandview` renderer suppresses these internal records in the chat UI.
- **Turn isolation**: Settings saved during a running turn are persisted immediately, while the active turn keeps its pinned snapshot until `turn/end`. The new settings apply on the next `turn/start`; an idle conversation installs them at once.
- **Presets**: A profile-wide collection stored with `storageDomain`, namespaced by `profileContext.dir`. Titles are unique after NFC normalization and trimming; saving an existing title requires `overwrite: true`, which the UI asks the user to confirm. Writes are queued, re-authorized when their turn comes, and change memory only after the backend acknowledges them. One preset may be the default; deleting it clears the default. A blank Custom mode conversation without saved settings adopts the default preset once, when it is created, switched into Custom mode, or first read. Existing, started, resumed, and forked conversations never adopt it, and later preset changes never touch existing conversations. Earlier releases stored a single default config in another domain; it is not migrated.
- **Authorization**: Only the authenticated browser owner peer may read or write settings, and every action, including preset management, requires a live main Custom mode conversation and no agent initiator.
- **Prompts**: Stored as raw templates and registered with `interpolate: true` so DSH resolves variables (`{{model}}`, `{{provider}}`, etc.) at request time. The custom prompt shadows `deployment:persona-prefix` as the one complete section. The default prompt and tool catalog of a base mode are read through an isolated `agentPresets.acquireScope()` lease.
- **Tools & context**: Tool restrictions use `tools.restrict()` and a `tools.guard()`; tools registered in the agent's own scope cannot be restricted and stay allowed, and `run_code` (the PTC transport) is never restricted because each program call passes the guard. Runtime context is suppressed by shadowing `working-directory:current` as optional before calling `suppressRuntimeContext()`. Time context is filtered in `agent/pre-step`.

## Version Compatibility

The plugin requires DSH `0.2.2-rc.1` or newer. It reads the session projection through the retained registration handle, and the executor comes from the base mode's composition or, when the base mounts none, the deployment's native executor. Do not reintroduce per-scope executor selection (`tools.presentAs`), the registry-level `sessionProjections.stateOf(session, key)` read, or a separate `@deepseek-ai/dsh-tool-subagent-control/list-agents` row: DSH `0.2.2` removed the first two and folded the third into the control entry.

## Release Steps

1. Bump the version in [package.json](<package.json>) (`version`, `exports["."]`, `files`) and [cordis.patch.yml](<cordis.patch.yml>) (`./runtime/<version>/index.js`).
2. Run `pnpm test` and `pnpm build`.
3. Run `pnpm pack --pack-destination artifacts`.
4. Install into DSH via `plugin_manager`.
5. Commit, tag `v<version>`, and push the tag; [publish.yml](<.github/workflows/publish.yml>) runs the tests and publishes to npm with trusted publishing.

Publishing never uses a stored npm token. The workflow authenticates with the short-lived GitHub OIDC identity token, which npm exchanges for a publish token bound to this repository and the `publish.yml` workflow filename; rename or move the file only after updating the trusted publisher on npmjs.com. Do not add an `NPM_TOKEN` secret or a `.npmrc` with credentials.

