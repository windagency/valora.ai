# @windagency/valora-plugin-obsidian

Bridges the Valora memory vault to Obsidian — sets up vault config and opens it.

## Install

```bash
valora plugin add obsidian
```

The plugin depends on the Obsidian binary. On first run Valora will prompt you before running the platform-appropriate install command (brew on macOS; AppImage / .deb on Linux). The flag `requiresBinary.autoInstall: true` is informational since 2026-05 — the prompt always appears.

## What it contributes

Three `PluginAPI` surfaces:

- `api.config.extend(obsidianConfigSchema)` — adds an `obsidian` section to `.valora/config.json` with a typed accessor.
- `api.lifecycle.onActivate(...)` — runs vault setup on every Valora startup.
- `api.cli.addSubcommand('obsidian open', ...)` — exposes `valora obsidian open` to sync vault config and launch Obsidian.

## Vault behaviour

The plugin scaffolds `.obsidian/{app,core-plugins,graph,workspace}.json` **once** per vault. Subsequent activations leave existing config files untouched, so customisations made through Obsidian's settings UI are preserved. To regenerate a config from the template, delete the file and re-run any Valora command.

The plugin shares the same vault directory as the Valora memory module: it walks up from `process.cwd()` looking for a `.valora/` ancestor, falling back to `~/.valora/memory`. Both surfaces resolve to the same path for the same cwd — see `__tests__/integration/memory/memory-obsidian-vault-parity.test.ts`.

If you edit a memory's body in Obsidian, the next Valora boot detects the drift via the `content_hash` frontmatter field and marks that entry as `embeddingStale`. Cosine recall skips stale entries until a future `valora memory reembed` regenerates their vector.

## Privacy and sensitive data

Opening the vault in Obsidian gives a third-party application full read/write access to your accumulated agent memory. The vault may contain:

- Code snippets and command output captured during agent runs.
- Error messages and stack traces (which can include paths, hostnames, and occasionally tokens that leaked from misconfigured tools).
- Notes the agent extracted from your repository, including private comments and TODOs.

If your Obsidian setup syncs the vault elsewhere — Obsidian Sync, iCloud / Dropbox / Google Drive, the Git plugin, or any community sync plugin — the contents leave your machine on the sync layer's terms. **Review what your Obsidian configuration actually syncs before opening the vault**, particularly if you also use Obsidian for personal notes that share the same sync target.

The plugin itself never copies the vault elsewhere — every byte that leaves the machine via this integration leaves through Obsidian, not Valora.

## Permissions

- `code-exec` — required by the loader.
- `fs-write` — used by `obsidian-setup.ts` to write Obsidian config files into the vault.
- `network` — informational; not enforced today (see [ADR-014](../../documentation/adr/014-plugin-capability-gating.md)).

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
- [ADR-013: Memory Vault — Per-Memory Markdown Files with Embeddings](../../documentation/adr/013-vault-and-embeddings.md)
- [ADR-014: Plugin Capability Gating](../../documentation/adr/014-plugin-capability-gating.md)
