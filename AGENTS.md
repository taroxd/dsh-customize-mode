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
| [state.js](<state.js>) | Config validation and session log projection |
| [policy.js](<policy.js>) | Scoped prompt, tool, and context registration |
| [controller.js](<controller.js>) | Agent lifecycle, default capture, and session settings commits |
| [defaults.js](<defaults.js>) | Profile-scoped persistent default settings |
| [settings.js](<settings.js>) | Authenticated Connection Fetch endpoint |
| [errors.js](<errors.js>) | Error codes and cancellation helpers |
| [protocol.js](<protocol.js>) | Connection request envelope schema |
| [preview.js](<preview.js>) | Default system prompt preview |
| [client.js](<client.js>) | Client UI components, state hooks, and translations |
| [cordis.patch.yml](<cordis.patch.yml>) | Host plugin entry row |
| [build-runtime.mjs](<build-runtime.mjs>) | Versioned Host runtime builder |

## Architecture & Invariants

- **Activation**: Controlled solely by selecting the `customize-mode` preset.
- **Preset declaration**: Registered from [preset.js](<preset.js>) through `agentPresets.register()` and never declared as a YAML row, because DSH translates a preset's display copy only for the four presets it ships (`BUILT_IN_PRESET_KEYS` in `dsh-agent-preset-registry`); a YAML row would pin one language. The name and description follow the `locale.preference` settings field, rewritten in place on `settings/document-updated` so the mounted revision never changes. Languages other than `zh*` use the English copy. The browser caches the roster it reads (`agentPresets/list`) and re-reads it only on mount, a `agent-preset-registry` settings update, or `connection/reset`, so an already-mounted mode chip keeps the previous language until the next roster read; the Host copy itself is always current.
- **Session persistence**: Settings updates append paired `command/run` and `command/done` records to the session log and increment the revision synchronously. A hidden `commandview` renderer suppresses these internal records in the chat UI.
- **Turn isolation**: Settings saved during a running turn are persisted immediately, while the active turn keeps its pinned snapshot until `turn/end`. The new settings apply on the next `turn/start`.
- **Global defaults**: Stored per profile using `storageDomain` namespaced by `profileContext.dir`. Defaults are copied once when a fresh root session is created, and do not modify existing, resumed, or forked sessions.
- **Authorization**: Only the authenticated browser owner peer may read or write settings on root sessions.
- **Prompts**: Stored as raw templates and registered with `interpolate: true` so DSH resolves variables (`{{model}}`, `{{provider}}`, etc.) at request time. Default prompt preview uses an isolated `agentPresets.acquireScope()` lease.
- **Tools & context**: Tool restrictions use `tools.restrict()` and a `tools.guard()`; no executor selection is needed because DSH mounts the deployment's native executor in the host scope. Runtime context is suppressed by shadowing `working-directory:current` as optional before calling `suppressRuntimeContext()`. Time context is filtered in `agent/pre-step`.

## Version Compatibility

The plugin requires DSH `0.2.2-rc.1` or newer. It reads the session projection through the retained registration handle and relies on the deployment's mounted native tool executor. Do not reintroduce per-scope executor selection (`tools.presentAs`), the registry-level `sessionProjections.stateOf(session, key)` read, or a separate `@deepseek-ai/dsh-tool-subagent-control/list-agents` row: DSH `0.2.2` removed the first two and folded the third into the control entry.

## Release Steps

1. Bump the version in [package.json](<package.json>) (`version`, `exports["."]`, `files`) and [cordis.patch.yml](<cordis.patch.yml>) (`./runtime/<version>/index.js`).
2. Run `pnpm test` and `pnpm build`.
3. Run `pnpm pack --pack-destination artifacts`.
4. Install into DSH via `plugin_manager`.
5. Commit, tag `v<version>`, and push the tag; [publish.yml](<.github/workflows/publish.yml>) runs the tests and publishes to npm with trusted publishing.

Publishing never uses a stored npm token. The workflow authenticates with the short-lived GitHub OIDC identity token, which npm exchanges for a publish token bound to this repository and the `publish.yml` workflow filename; rename or move the file only after updating the trusted publisher on npmjs.com. Do not add an `NPM_TOKEN` secret or a `.npmrc` with credentials.

