# ADR-014: Plugin Capability Gating

> **Decision**: Valora will close the manifest-vs-runtime trust gap left open by ADR-012 by isolating code plugins in per-plugin Worker threads with a proxied `fs`/`net` API surface gated on the manifest's `permissions` field. Until the Worker model lands, the unenforced permission tokens (`fs-read`, `fs-write`, `network`) remain informational and are surfaced via `valora doctor` for audit.

## Status

Proposed

## Consequences

### Positive

- **Manifest becomes a real contract** — once the Worker boundary is in place, declaring `permissions: ["fs-write"]` actually grants the capability, and omitting it actually denies it. The schema's enum stops being a documentation lie.
- **Per-plugin blast radius** — a misbehaving plugin can corrupt only what its declared permissions allow. Today a single plugin can compromise the entire Valora process and any data it touches.
- **Trust path for third-party plugins** — once enforcement is live, Valora can credibly recommend installing plugins from outside the first-party `@windagency` scope. Today the README's recommendation is "trust like any npm dependency", which is honest but limiting.
- **Predictable failure mode** — a plugin attempting `fs.writeFileSync` without `fs-write` gets a thrown `PermissionDeniedError` with a clear message instead of either silently succeeding (today) or crashing the host.

### Negative

- **Significant engineering scope** — proxied fs/net APIs are non-trivial. Worker bootstrap cost, IPC latency, the proxied surface design, error mapping, and lifecycle integration are weeks of work.
- **Public API churn for code plugins** — `register(api: PluginAPI)` becomes Worker-side. The factory in `plugin-api.factory.ts` becomes a host-side proxy. Existing first-party plugins (`compression-*`, `obsidian`, `openrouter`) need re-validation against the new surface. Backwards compatibility is achievable but not free.
- **Loss of direct host-state access** — `api.config.extend` and `api.providers.register` currently return host-scoped values directly. In the Worker model they become async message-passing calls. Existing synchronous return contracts must change (`extend(schema)` returning a sync accessor becomes `extend(schema)` returning a Promise-returning accessor or a hydrated snapshot).
- **No native module capability** — Workers cannot block `require('fs')` from a native module (e.g. a transitive dep that links to libuv directly). The Worker boundary defends against the JS-level attack surface but not against deliberate native escape. Document the residual gap clearly.

### Neutral

- **Phased rollout** — Phase A (this ADR) keeps the unenforced tokens informational and adds Node-level optional hardening guidance. Phase B introduces the Worker model behind an opt-in feature flag. Phase C makes the Worker model the default. Each phase ships independently and is reversible.
- **Node 20 Permission Model is process-wide, not per-plugin** — `node --permission --allow-fs-read=...` cannot express "plugin A can read /tmp; plugin B cannot". It still raises the floor for paranoid deployments and is recommended in the interim, but it is not a substitute for per-plugin enforcement.

<details>
<summary><strong>Context</strong></summary>

ADR-012 introduced six permission tokens in the manifest schema:

```ts
type PluginPermission = 'code-exec' | 'fs-read' | 'fs-write' | 'mcp-connect' | 'network' | 'shell-hooks';
```

Three are enforced by the loader (`code-exec`, `shell-hooks`, `mcp-connect` — the loader refuses to register the corresponding contributions when the permission is missing). Three are not (`fs-read`, `fs-write`, `network`). A code plugin runs via `await import(plugin.codeEntrypoint)` in the host Node process and inherits the host's full file-system, network, and process capability.

The 2026-05 hardening pass closed the install-time surface (sha256 integrity, tarslip rejection, manifest-name path-traversal, consent-by-default for both plugin and binary installs) and made the unenforced tokens **honest** (warned at load, surfaced on `LoadedPlugin.unenforcedPermissions`, displayed by `valora doctor`). What it did not do is make them **enforceable**. That is the gap ADR-014 closes.

The threat model is asymmetric:

- **Trusted first-party plugins** (`@windagency/valora-plugin-*`) — the integrity check pins the bytes. The risk reduces to "the maintainer's GitHub account is compromised", which is the same risk Valora itself runs.
- **Third-party plugins** — the integrity check is moot if the registry entry is the malicious plugin's own. A plugin author who declares `permissions: ["code-exec"]` and excludes `network` should not be able to silently exfiltrate session data. Today, they can.

The supply-chain stance from ADR-009 (`onlyBuiltDependencies: []`, frozen lockfile) explicitly rejects "code from random packages can run unconstrained". Code plugins are the inverse case: they are first-class extension code, but the same constraint applies.

</details>

## Decision

### Phase A — Interim hardening (this ADR, ship today)

1. **Document the gap explicitly.** This ADR plus the existing `valora doctor` audit surface are the contract: declared but unenforced permissions are informational, the user sees them, and the trust decision is theirs. No silent claim.
2. **Recommend the Node 20 Permission Model in the deployment guide** as a host-level floor for security-sensitive teams. A wrapper script can launch Valora with `node --permission --allow-fs-read=$VALORA_HOME --allow-fs-write=$VALORA_HOME` to deny all other fs writes process-wide. This applies uniformly to all plugins (no per-plugin granularity) but materially reduces the attack surface for installations that opt in.
3. **Freeze the permission token set.** No new permissions enter the schema until Phase B can enforce them. Adding more unenforceable tokens compounds the trust-by-deception problem.

### Phase B — Worker-thread isolation (next major milestone, behind a flag)

The strategic direction. Each code plugin runs in a dedicated `worker_threads.Worker` instance. The host injects a proxy `PluginAPI` over `MessagePort` IPC; the proxy mediates all fs and net access through the manifest's permission set.

Key design points:

- **Worker bootstrap** — the host spawns one Worker per plugin at activation time. The Worker entry point is a Valora-controlled bootloader that imports `codeEntrypoint` and binds the proxy.
- **Proxied API surface** — `fs`, `node:fs`, `node:fs/promises`, `node:net`, `node:http`, `node:https`, `node:dns`, and the `fetch` global are replaced inside the Worker with proxies that consult the manifest. Calls without the corresponding permission throw `PermissionDeniedError` synchronously (matching Node's existing `--permission` error semantics).
- **Native module ceiling** — a plugin that loads a native module that bypasses the proxy (e.g. `node-ffi-napi` calling libc directly) escapes enforcement. Document this as a residual gap; Worker isolation defends against the JS-level attack surface, not against deliberate native escape. To go further, combine with Phase A's Node Permission Model.
- **PluginAPI changes** — the existing namespaces (`cli`, `compression`, `config`, `lifecycle`, `logger`, `providers`) are re-implemented as message-passing facades. Synchronous accessors (e.g. `api.config.extend`'s returned function) become async or are hydrated up-front into a snapshot. The `register(api)` contract stays the same shape; the implementation moves.
- **Lifecycle** — Worker creation, `register()` invocation, and `lifecycle.onActivate`/`onDeactivate` dispatch happen through the same IPC. Errors in the Worker are caught at the host and logged scoped to the plugin; the host process never crashes from a plugin error.
- **Performance** — Worker startup is ~30 ms; one-shot per plugin at activation. Per-call IPC latency is ~50 µs for small payloads, dwarfed by typical plugin work. A Worker pool per host process is sized to plugin count, not request rate.
- **Opt-in flag** — initial release ships behind `plugins.isolation: 'worker' | 'inline'` (default `'inline'` for backwards compatibility). Once the feature has been exercised by first-party plugins, the default flips to `'worker'` in a major release.

### Phase C — Default-deny

Flip the default to `'worker'`. Mark `'inline'` as deprecated with a warning at load. Eventually remove `'inline'` in a follow-up major.

<details>
<summary><strong>Alternatives considered</strong></summary>

### Alternative A — Node Permission Model only (process-wide)

Run Valora itself under `node --permission --allow-fs-read=... --allow-fs-write=...` and rely on the OS-level kernel for enforcement. This is the simplest hardening.

**Rejected as the sole strategy because:** it cannot express per-plugin granularity, and the Valora binary itself needs broad fs and network access to function (config files, session storage, LLM API calls). Any restriction strict enough to gate a malicious plugin would also break the host. **Adopted as a Phase A recommendation** — it is a useful floor, not a sufficient ceiling.

### Alternative B — `vm.runInContext` / SES (Secure ECMAScript)

Run plugin code in a separate JavaScript realm with a curated global scope. SES (Hardened JavaScript, used by Endo and Agoric) goes further by hardening the realm against prototype pollution and providing a compartmentalised module loader.

**Rejected because:** neither blocks `require('fs')` from a transitive dependency. Realms isolate language-level state, not native module access. SES is a strong defence against malicious JS but does not enforce capability gates on Node built-ins. The Worker boundary subsumes the realm boundary for our purposes.

### Alternative C — Run code plugins in a subprocess

Spawn each plugin as a child Node process with its own `--permission` flags. Communicate via stdio or a Unix domain socket.

**Rejected because:** subprocess overhead is 10-50× higher than Worker threads (~150 ms boot vs ~3 ms; OS process table pressure; per-process memory overhead). Worker threads give equivalent isolation for JavaScript-level threats with much better economics for the typical plugin count (5-20).

### Alternative D — Static analysis + ESLint rule

Lint plugin code at build time to forbid `fs`/`net` imports unless the manifest declares the permission.

**Rejected because:** static analysis can be defeated trivially (`require('f' + 's')`, dynamic imports, transitive deps). It is a contributor-side hint, not a runtime enforcement, and provides no defence against published malicious plugins.

### Alternative E — Just remove the unenforced tokens

Drop `fs-read`, `fs-write`, `network` from the schema entirely so manifests cannot declare them.

**Rejected because:** the tokens carry useful documentary intent (`valora doctor` output, plugin-author signalling). Removing them deletes a pre-existing forward-compatibility commitment. Phase A keeps them informational and explicit; Phase B makes them enforced.

</details>

## Open questions

1. **Provider plugins** — `api.providers.register` returns a class or factory. In the Worker model, the host needs the `LLMProvider` instance to live host-side (so the chat loop can call it without crossing IPC per token). Does the provider class get serialised to host-side, or does the host invoke methods cross-Worker per request? Initial design proposal: provider classes are statically registered host-side via a synchronous bootstrap ("static" plugins), Worker hosts `lifecycle` only. To be revisited in the prototype.
2. **CLI subcommand handlers** — `api.cli.addSubcommand(name, fn)` registers `fn` to run on a CLI invocation. The handler is plugin code; under Worker isolation it must run in the Worker. Cold-start latency (~30 ms to spawn the Worker on first invocation) is acceptable for an interactive CLI but should be measured.
3. **Validators** — the `validators` contribution loads modules separately from `register()` (see `di/container.ts:loadPluginValidators`). They run synchronously inside the pipeline. Either they too move to Workers (with their own isolation cost on the hot path) or they remain inline with a documented elevated-trust requirement (effectively keeping the current trust-the-author model, but only for this surface). Decide in the prototype.
4. **Memory and CPU limits** — `worker_threads.Worker` accepts `resourceLimits`. Pick values that prevent runaway plugins from OOM-ing the host without strangling legitimate workloads. Defaults: 256 MiB max old-space, 1 thread per Worker.
5. **MCP servers** — `mcps` contributions register external servers (separate processes). The connection layer already lives outside the host. Re-validate that the existing `mcp-connect` permission gate still holds after the Worker model.

## Implementation milestones

| Milestone     | Deliverable                                                                                            | Acceptance criterion                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| M0 (this ADR) | Documentation of gap + design + Phase A                                                                | Status: Proposed; doctor surfaces unenforced perms; Node Permission Model documented in user guide          |
| M1            | Worker bootloader + proxy harness                                                                      | First-party `valora-plugin-compression-*` runs unchanged inside a Worker; tests + benchmark vs inline       |
| M2            | `fs`/`net` proxy with permission gating                                                                | A test plugin that violates `fs-write` throws `PermissionDeniedError`; passing plugin works                 |
| M3            | `plugins.isolation` flag opt-in                                                                        | Users can set `'worker'` per-plugin or globally; CI passes against all first-party plugins under both modes |
| M4            | Migrate `api.providers.register`, `api.cli.addSubcommand`, `api.config.extend` to Worker-aware proxies | OpenRouter + Obsidian first-party plugins pass under Worker mode                                            |
| M5            | Default flip + ADR status → Accepted                                                                   | One major version after M4 with no opened regressions                                                       |

## References

- [ADR-009: Supply Chain Hardening](./009-supply-chain-hardening.md) — the stance against arbitrary dependency code execution
- [ADR-012: Plugin Architecture](./012-plugin-architecture.md) — the gap this ADR closes
- [Node.js Worker Threads documentation](https://nodejs.org/api/worker_threads.html)
- [Node.js Permission Model](https://nodejs.org/api/permissions.html)
- [Endo / SES — Hardened JavaScript](https://github.com/endojs/endo) — alternative JS-level isolation considered
