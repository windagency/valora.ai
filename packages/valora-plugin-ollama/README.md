# @windagency/valora-plugin-ollama

Self-managed Ollama LLM provider — runs models locally via the Ollama binary.

## Install

```bash
valora plugin add ollama
```

The plugin depends on the `ollama` binary. On first run Valora prompts before running the install command. After install, the plugin manages the `ollama serve` lifecycle (start on activate, stop on deactivate) and lazily pulls any model that is requested but not yet local.

## What it contributes

- `api.providers.register('ollama', ...)` — an LLM provider with `validateModel` that lists locally pulled models via `/api/tags`.
- `api.lifecycle.onDeactivate(...)` — gracefully stops the Ollama process.

## Permissions

- `code-exec` — required by the loader; also justified by `spawn('ollama', ['serve'])`.
- `fs-write` — informational (the plugin's runtime code writes nothing; the install script does).
- `network` — informational; the plugin polls `http://localhost:11434/api/tags` and pulls models.

## Configuration

| Env var                | Effect                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `OLLAMA_DEFAULT_MODEL` | Default model when none is specified. Defaults to `llama3.1`. |

The plugin requires no API key. `peerDependencies` includes `openai@^4.67.0` — Valora's host already provides this.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
