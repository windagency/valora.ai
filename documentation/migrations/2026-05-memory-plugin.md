# Migration: memory becomes a plugin (2026-05)

The memory subsystem has been extracted from the host into a replaceable
plugin (`@windagency/valora-plugin-memory-vault`). The host now owns only
_which_ memory provider is active; every tuning knob lives inside the
provider's own configuration namespace.

This migration is a **hard break**. The previous `memory.*` shape no longer
loads — the configuration loader rejects it at startup and points users
here.

## What changed

- `memory.backend` is gone. Use `memory.provider` instead. The default is
  `"vault"` and matches the previous default behaviour.
- Every vault tuning knob (half-lives, embedding settings, recall
  parameters, prune threshold, injection limits, …) moves from `memory.*`
  to `plugins.memory-vault.*`.
- The host's `memory` block now accepts only `{ enabled, provider }`. Any
  legacy key under `memory.*` triggers a `LegacyMemoryConfigError` at boot
  with a pointer to this note.

## Fix-it diff

```yaml
# Before — pre-2026-05
memory:
  enabled: true
  backend: vault
  episodic_half_life_days: 7
  semantic_half_life_days: 30
  decision_half_life_days: 21
  retrieval_boost_days: 2
  prune_threshold: 0.05
  max_entries_per_store: 500
  error_half_life_multiplier: 2
  injection_strength_threshold: 0.2
  injection_token_budget: 2000
  embedding:
    provider: ollama
    model: nomic-embed-text
    dim: 768
    batch_size: 32
  recall:
    seed_k: 12
    walk_depth: 2
    walk_decay: 0.6
    co_access_increment: 1
```

```yaml
# After — 2026-05 onward
memory:
  enabled: true
  provider: vault # selects which memory plugin is active

plugins:
  memory-vault: # every former memory.* knob moves under here
    episodic_half_life_days: 7
    semantic_half_life_days: 30
    decision_half_life_days: 21
    retrieval_boost_days: 2
    prune_threshold: 0.05
    max_entries_per_store: 500
    error_half_life_multiplier: 2
    injection_strength_threshold: 0.2
    injection_token_budget: 2000
    embedding:
      provider: ollama
      model: nomic-embed-text
      dim: 768
      batch_size: 32
    recall:
      seed_k: 12
      walk_depth: 2
      walk_decay: 0.6
      co_access_increment: 1
```

## Why this matters

Third-party memory providers can now ship as plugins and register
themselves via `api.memory.register(name, factory, descriptor)`. The host
no longer has any vault-specific schema baked in. To use a non-default
provider:

```yaml
memory:
  enabled: true
  provider: my-custom-memory # any name registered by a memory plugin

plugins:
  my-custom-memory: # the plugin's own config namespace
    # …whatever the plugin declares
```

## Removed keys reference

| Legacy key                            | New location                                        |
| ------------------------------------- | --------------------------------------------------- |
| `memory.backend`                      | superseded by `memory.provider`                     |
| `memory.episodic_half_life_days`      | `plugins.memory-vault.episodic_half_life_days`      |
| `memory.semantic_half_life_days`      | `plugins.memory-vault.semantic_half_life_days`      |
| `memory.decision_half_life_days`      | `plugins.memory-vault.decision_half_life_days`      |
| `memory.retrieval_boost_days`         | `plugins.memory-vault.retrieval_boost_days`         |
| `memory.prune_threshold`              | `plugins.memory-vault.prune_threshold`              |
| `memory.max_entries_per_store`        | `plugins.memory-vault.max_entries_per_store`        |
| `memory.error_half_life_multiplier`   | `plugins.memory-vault.error_half_life_multiplier`   |
| `memory.injection_strength_threshold` | `plugins.memory-vault.injection_strength_threshold` |
| `memory.injection_token_budget`       | `plugins.memory-vault.injection_token_budget`       |
| `memory.embedding.*`                  | `plugins.memory-vault.embedding.*`                  |
| `memory.recall.*`                     | `plugins.memory-vault.recall.*`                     |

## Error you may see

```
LegacyMemoryConfigError: Configuration uses legacy `memory.*` keys that were removed
in the memory-as-plugin migration:
  - memory.backend
  - memory.embedding
Move them under `plugins.memory-vault.*` and keep only `memory.{enabled, provider}`
at the top level.
See documentation/migrations/2026-05-memory-plugin.md for a fix-it diff.
```

Apply the diff above. The error disappears once the legacy keys are out of
the `memory.*` block.
