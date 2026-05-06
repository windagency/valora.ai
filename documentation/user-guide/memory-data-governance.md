---
updated: 2026-05-06
---

# Memory Data Governance

> **Regulation:** EU AI Act Article 10 — Data and data governance.

## What is stored

Valora maintains a local memory vault at `.valora/memory/vault/` (or `~/.valora/memory/vault/` when not in a project context). Memory entries are plain Markdown files with YAML frontmatter. No data is sent to any server; all memory is local to the machine running Valora.

| Store       | Purpose                                                                      | Default half-life |
| ----------- | ---------------------------------------------------------------------------- | ----------------- |
| `episodic`  | Short-term observations from a session (bugs seen, decisions taken, context) | 7 days            |
| `semantic`  | Promoted long-term knowledge (architectural patterns, team conventions)      | 30 days           |
| `decisions` | Architectural decisions and rationale                                        | 21 days           |

Half-life values are configured in `src/config/constants.ts:254-272` and can be overridden via `config.memory.*_half_life_days`.

## Decay and automatic pruning

Memory entries decay exponentially over time using a configurable half-life. Entries below the `prune_threshold` (default: strength < 0.05) are removed when `valora memory prune` is run or during automatic consolidation.

## How to inspect memory

```bash
valora memory info          # entry counts, edge counts, embedding coverage
valora memory verify        # verify all entries are readable
```

## How to purge memory

The `valora memory purge` command allows targeted deletion:

```bash
# Report what would be deleted (no changes)
valora memory purge --store=episodic --dry-run

# Delete all episodic entries older than 14 days (with confirmation prompt)
valora memory purge --store=episodic --older-than=14d

# Delete all memory entries without confirmation
valora memory purge --all --yes

# Accepted duration formats: 7d (7 days), 24h (24 hours), 30m (30 minutes)
```

A `memory_purged` security audit event is emitted for every purge operation. This event is included in the output of `valora security audit-export`.

## Data minimisation

Valora applies the following data minimisation measures:

- Credentials detected in content are redacted by `CredentialGuard` before any entry is written to the vault.
- Memory entries contain only the content explicitly provided via agent outputs or `memory create` calls — Valora does not automatically capture code or file contents into memory.
- Special-category personal data (Article 9 GDPR) must not be placed into prompts or memory. See the [EU AI Act Compliance](eu-ai-act-compliance.md) guide for the full prohibition.

## No cloud synchronisation

All memory data remains on the local machine. Valora does not sync, back up, or transmit memory data to any external service.

## Related documentation

- [EU AI Act Compliance](eu-ai-act-compliance.md)
- [SECURITY.md](../../SECURITY.md)
- [System Card](../architecture/system-card.md)

## Verification Summary

Verified 2026-05-06 against `src/config/constants.ts` and `src/cli/commands/memory.command.ts`.

- Claims checked: 6
- Confirmed: 5 (store names and half-lives, purge flags, security audit event emission, `valora security audit-export` command)
- Corrected: 1 — `prune_threshold` default changed from `< 0.1` to `< 0.05` to match `DEFAULT_MEMORY_PRUNE_THRESHOLD = 0.05` at `constants.ts:259`
- Unverifiable: 0
