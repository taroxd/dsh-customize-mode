# Development guide

## Scope

`dsh-customize-mode` is a DSH Web/Desktop bundle. It adds a session-scoped preset, an authenticated settings endpoint, and a bilingual settings panel. Read [README.md](<README.md>) for the user-facing behavior.

- Supported DSH contract: `0.2.1-rc.3`; development runtime: Node.js 24+.
- Runtime dependency: `zod`, declared in [package.json](<package.json>). React and DSH services are supplied by the host.
- Run `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm build` from this directory.
- Keep source, tests, comments, and documentation in English. Chinese belongs in UI translations and localized UI test data.

## Module map

| File | Responsibility |
| --- | --- |
| [index.js](<index.js>) | Host injections and lifecycle entry |
| [state.js](<state.js>) | Validated configuration, projection, and log replay |
| [policy.js](<policy.js>) | Scoped prompt, tool, and context registrations |
| [controller.js](<controller.js>) | Agent lifecycle, read operations, and synchronous settings commits |
| [settings.js](<settings.js>) | Authenticated, bounded Connection Fetch endpoint |
| [errors.js](<errors.js>) | Stable diagnostic codes and cancellation helpers |
| [protocol.js](<protocol.js>) | Connection request-envelope schema |
| [preview.js](<preview.js>) | Isolated default-prompt template preview |
| [client.js](<client.js>) | Client factory, translations, settings state, and components |
| [cordis.patch.yml](<cordis.patch.yml>) | Host entry and complete Standard-derived preset |
| [build-runtime.mjs](<build-runtime.mjs>) | Versioned Host runtime generation |

## Invariants

- The `customize-mode` preset is the sole activation authority; the settings panel has no separate mode switch.
- The session log is authoritative. Successful settings updates append paired `command/run` and `command/done` records, advance exactly one revision, and complete without an `await` inside the transaction. A synchronous reentrancy guard protects observer callbacks.
- Settings records are internal persistence, not chat content. Their keyed renderer must not show raw configuration JSON or let the generic command card appear.
- Only the exact authenticated browser-owner peer may read or change settings. Recheck root session, preset, running state, cancellation, and revision where asynchronous work or observer callbacks can change them.
- Settings may loosen a tool restriction, so the endpoint stays user-only. Do not add an agent setter tool or public slash command.
- An empty custom prompt is a real override. Preview text is a placeholder and never becomes the saved value.
- Preview uses `agentPresets.acquireScope()` and `systemPrompt.assemble()` without a live Agent. Always release the lease, including on failure or cancellation. Unload drains outstanding preview cleanup.
- Tool restrictions use the registry APIs, not edits to an assembled request. Keep native presentation, the execution guard, and the pre-step visibility check consistent. Session-local tools that cannot be hidden must fail closed.
- `subagent` stays in the inherited tool layer with `modelSelectionSettings: false` so it can be hidden.
- Runtime suppression shadows `working-directory:current` as optional before calling the official suppressor. Time filtering removes only fresh messages whose source is `time-context`, preserving decision metadata.
- Context switches affect future contributions; they do not rewrite committed history or change actual permissions.

## Host and Client integration

The exact Fetch route coexists with the shared API Gateway interceptor. In the supported DSH release, `connection.rpc.handle()` reads an uninjected provider-side `webServer`; use `connection.fetch.register()` and the published Connection envelope instead. Never import a DSH implementation package through a machine-specific installation path.

The Client keeps one self-registering artifact, requires only host-provided React, and owns its effects through Cordis or React. Gate the control before mounting it; abort obsolete requests on close, unmount, and replacement. Translate stable error codes rather than displaying raw server messages.

DSH renders custom preset names literally, unlike built-in preset names. Use Chinese for these non-localizable roster fields. The panel and package metadata follow the active locale with English and Chinese translations.

## Tests and release

Behavior tests cover projection replay, policy disposal, visibility conflicts, settings authorization and commits, preview cleanup, and the actual Client factory and handlers. The Client hook harness is not a browser renderer; it does not establish pixel layout or native focus trapping. [release.test.js](<release.test.js>) parses the real YAML, exercises shell selection for all supported platforms, verifies the build/import closure, and scans authored files for sensitive data.

1. Update the version, root export, and versioned Loader path together.
2. Run `pnpm test` and `pnpm build`.
3. Run `pnpm pack --pack-destination artifacts`; inspect the archive and import its Host entry with only production dependencies installed.
4. Use the DSH plugin manager for installation. Confirm its activation result and live Client registrations; test changed behavior in a fresh session.
5. Commit source and the lockfile. Generated runtime files, archives, dependencies, environment files, and local test evidence stay out of Git.

Generated Host modules use a versioned path to avoid module-cache reuse across releases. The build can be rerun during development; once a release is installed or published, make further changes under a new version. The package file allowlist includes only the current generated runtime, Client artifact, preset, localized metadata, icon, README, and license.

The CI matrix runs tests and packaging on Windows, macOS, and Linux. Local success on one platform does not establish that the matrix has run.
