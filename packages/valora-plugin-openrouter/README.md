# @windagency/valora-plugin-openrouter

OpenRouter LLM provider — connects to openrouter.ai for unified access to hundreds of models via an OpenAI-compatible API.

## Install

```bash
valora plugin add openrouter
```

Then set `OPENROUTER_API_KEY` in your environment.

## What it contributes

- `api.providers.register('openrouter', ...)` — an LLM provider with a real `validateModel` that calls `/v1/models` and caches the catalogue per session.

## Permissions

- `code-exec` — required by the loader.
- `network` — justified by HTTPS calls to `openrouter.ai` via the OpenAI client.

## Configuration

| Env var                    | Effect                                       |
| -------------------------- | -------------------------------------------- |
| `OPENROUTER_API_KEY`       | Required. Auth token for the OpenRouter API. |
| `OPENROUTER_DEFAULT_MODEL` | Default model when none is specified.        |

The plugin uses a model prefix of `openrouter:`, e.g. `openrouter:anthropic/claude-sonnet-4.5`. `peerDependencies` includes `openai@^4.67.0` — Valora's host already provides this.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
