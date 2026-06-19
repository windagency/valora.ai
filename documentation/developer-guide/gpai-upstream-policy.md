---
updated: 2026-05-07
---

# GPAI Upstream Provider Policy

> **Regulation:** EU AI Act Article 25(4) — Obligations for downstream providers using GPAI models.

## Valora's position

Valora is a **downstream system** that orchestrates calls to General Purpose AI (GPAI) models provided by third parties. It is **not** a GPAI Provider under Article 53. Valora does not train, fine-tune, or modify any GPAI model.

As a downstream deployer under Article 25(4), Valora:

1. Forwards prompts to upstream providers unmodified — there is **no local content moderation layer** between Valora and upstream models.
2. Inherits the upstream provider's usage policies and restrictions in full.
3. Must not configure or use any provider in ways that violate their terms of service.

## Supported providers

| Provider       | Model family                 | Commercial use       | Config key          |
| -------------- | ---------------------------- | -------------------- | ------------------- |
| Anthropic      | Claude (Opus, Sonnet, Haiku) | ✓ (API ToS)          | `ANTHROPIC_API_KEY` |
| OpenAI         | GPT family                   | ✓ (API ToS)          | `OPENAI_API_KEY`    |
| Google         | Gemini family                | ✓ (API ToS)          | `GOOGLE_API_KEY`    |
| Cursor         | Cursor subscription model    | ✓ (via subscription) | — (MCP sampling)    |
| Moonshot AI    | Kimi models                  | ✓ (API ToS)          | `MOONSHOT_API_KEY`  |
| xAI            | Grok                         | ✓ (API ToS)          | `XAI_API_KEY`       |
| Local / Ollama | Any local model              | ✓ (operator-managed) | `LOCAL_BASE_URL`    |

Configuration: `src/config/loader.ts:202-241`.

## Provider-specific notes

### Anthropic (Claude)

Anthropic's [usage policy](https://www.anthropic.com/legal/aup) prohibits use for: weapons of mass destruction, child sexual abuse material (CSAM), election manipulation, and cyberattacks. The SecOps agent prompts are reviewed against Anthropic's "high-stakes use" guidance. Valora's default provider.

### OpenAI (GPT)

OpenAI's [usage policy](https://openai.com/policies/usage-policies) similarly prohibits CBRN, CSAM, election interference, and malware generation. Valora does not use OpenAI Assistants or fine-tuning APIs.

### Google (Gemini)

Google's [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy) applies. Gemini is available as an alternative provider; Valora does not access any Google proprietary data beyond the standard API.

### Cursor

Cursor operates in "guided completion" mode via Valora — Valora constructs a structured prompt and Cursor's AI processes it via the user's subscription. The Cursor [Terms of Service](https://cursor.com/terms-of-service) govern this use.

### Local / Ollama

Operators running local models are responsible for compliance with any licensing terms of the underlying model weights (e.g. Llama community licence, Mistral Apache 2.0). Valora makes no claims about the safety properties of locally-hosted models.

## Deployer obligations under Article 25(4)

Deployers using Valora must:

1. Maintain valid API agreements with each provider they configure.
2. Not exceed rate limits or circumvent usage restrictions.
3. Ensure that prompts submitted through Valora comply with each provider's acceptable-use policy.
4. Not submit Article 9 GDPR special-category data (health, biometrics, ethnicity, etc.) to any upstream provider via Valora.
5. Report serious malfunctions or safety incidents involving upstream model outputs per the process in [SECURITY.md](../../SECURITY.md).

## No intermediate moderation

Valora does not perform content moderation of prompts or completions in transit. Downstream safety depends on:

- The upstream provider's own content filters.
- Valora's `PromptInjectionDetector` (detects injection attempts in tool results, not prompt content).
- Human review of all AI-generated outputs before action.

If a deployment context requires intermediate content moderation (e.g. a regulated sector or public-facing integration), this must be added as an organisational control layer outside Valora.

## Verification Summary

Verified 2026-05-06 against `src/config/loader.ts:202-241` and `src/llm/providers/cursor.provider.ts`.

- Claims checked: 9 (provider table rows × config keys, loader line range, PromptInjectionDetector reference)
- Confirmed: 7 (Anthropic `ANTHROPIC_API_KEY`, OpenAI `OPENAI_API_KEY`, Google `GOOGLE_API_KEY`, Moonshot `MOONSHOT_API_KEY`, xAI `XAI_API_KEY`, `loader.ts:202-241` range, `PromptInjectionDetector` class)
- Corrected: 2 — Cursor config key changed from `CURSOR_API_KEY` to `— (MCP sampling)` (Cursor uses MCP protocol, not an API key); Local/Ollama config key changed from `OLLAMA_BASE_URL` to `LOCAL_BASE_URL` (matches `loader.ts:222`)
- Unverifiable: 0
