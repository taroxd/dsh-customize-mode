# Development Guide

## Overview

`dsh-customize-mode` is a DSH Web/Desktop bundle providing a `customize-mode` preset, a settings RPC endpoint, and a bilingual settings UI.

- Target DSH versions: `0.2.1-rc.3` and `0.2.2-rc.1`, declared as `engines.dsh` `>=0.2.1-rc.3 <0.3.0-0`; development runtime: Node.js 24+.
- Dual-version support is temporary. Every version branch below is a deprecation window for `0.2.1`; delete it, the `engines.dsh` lower bound, and the matching tests once that window closes.
- Runtime dependency: `zod`. React and host services are provided by DSH.
- Commands: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`.
- Keep source code, comments, tests, and documentation in English. Chinese is used in UI translations and localized test cases.
- Implement supported behavior directly. Do not add speculative fallback paths, silent degradation, or tests for unsupported hypothetical states. Keep authorization, external-input validation, transactional consistency, and normal cancellation/lifecycle requirements.

## Modules

| File | Purpose |
| --- | --- |
| [index.js](<index.js>) | Host plugin entry and lifecycle |
| [state.js](<state.js>) | Config validation and session log projection |
| [policy.js](<policy.js>) | Scoped prompt, tool, and context registration |
| [controller.js](<controller.js>) | Agent lifecycle, default capture, and session settings commits |
| [defaults.js](<defaults.js>) | Profile-scoped persistent default settings |
| [settings.js](<settings.js>) | Authenticated Connection Fetch endpoint |
| [errors.js](<errors.js>) | Error codes and cancellation helpers |
| [protocol.js](<protocol.js>) | Connection request envelope schema |
| [preview.js](<preview.js>) | Default system prompt preview |
| [client.js](<client.js>) | Client UI components, state hooks, and translations |
| [cordis.patch.yml](<cordis.patch.yml>) | Host entry and `customize-mode` preset definition |
| [build-runtime.mjs](<build-runtime.mjs>) | Versioned Host runtime builder |

## Architecture & Invariants

- **Activation**: Controlled solely by selecting the `customize-mode` preset.
- **Session persistence**: Settings updates append paired `command/run` and `command/done` records to the session log and increment the revision synchronously. A hidden `commandview` renderer suppresses these internal records in the chat UI.
- **Turn isolation**: Settings saved during a running turn are persisted immediately, while the active turn keeps its pinned snapshot until `turn/end`. The new settings apply on the next `turn/start`.
- **Global defaults**: Stored per profile using `storageDomain` namespaced by `profileContext.dir`. Defaults are copied once when a fresh root session is created, and do not modify existing, resumed, or forked sessions.
- **Authorization**: Only the authenticated browser owner peer may read or write settings on root sessions.
- **Prompts**: Stored as raw templates and registered with `interpolate: true` so DSH resolves variables (`{{model}}`, `{{provider}}`, etc.) at request time. Default prompt preview uses an isolated `agentPresets.acquireScope()` lease.
- **Tools & context**: Tool restrictions use `tools.restrict()` and a `tools.guard()`; no executor selection is needed because DSH mounts the deployment's native executor in the host scope. Runtime context is suppressed by shadowing `working-directory:current` as optional before calling `suppressRuntimeContext()`. Time context is filtered in `agent/pre-step`.

## Version Compatibility

Each row is the minimum needed to run on both target versions. Remove it with the `0.2.1` window.

| Area | `0.2.1-rc.3` | `0.2.2-rc.1` | Handling |
| --- | --- | --- | --- |
| Executor selection | `tools.presentAs('native')` per scope | Removed; `tools.setExecutor()` is owned by the mounted executor plugin | [policy.js](<policy.js>) calls it only when the service still exposes it |
| Projection registration | `register()` returns the effect disposer | `register()` returns a callable thenable resolving to a retained handle | `openProjection()` in [controller.js](<controller.js>) branches on the thenable |
| Projection read | `sessionProjections.stateOf(session, key)` | Deprecated; `handle.stateOf(session)` | The same branch picks the reader |
| Delegation catalog | `list_agents` is its own subpath plugin | Folded into the `@deepseek-ai/dsh-tool-subagent-control` entry | [cordis.patch.yml](<cordis.patch.yml>) disables the extra row when `tools.presentAs` is gone |
| `tool-subagent` config | `modelSelectionSettings` | Renamed to `modelSelection`, default `false` | Neither row sets it, matching the previous effective value |
| Client projection refresh | `sessions.refreshProjections()` | Same call, now served by `@deepseek-ai/dsh-api-session-controller` | [client.js](<client.js>) needs no branch |

## Release Steps

1. Bump the version in [package.json](<package.json>) (`version`, `exports["."]`, `files`) and [cordis.patch.yml](<cordis.patch.yml>) (`./runtime/<version>/index.js`).
2. Run `pnpm test` and `pnpm build`.
3. Run `pnpm pack --pack-destination artifacts`.
4. Install into DSH via `plugin_manager`.
