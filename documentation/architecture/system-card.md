---
updated: 2026-05-06
---

# System Card — Valora

> **Annex IV reference:** EU AI Act Article 11 and Annex IV — Technical documentation requirements.

## 1. Identity

| Field           | Value                                   |
| --------------- | --------------------------------------- |
| System name     | Valora                                  |
| Version         | 2.5.0                                   |
| Provider entity | Wind Agency / Damien TIVELET            |
| Contact         | damien.tivelet@qodea.com                |
| Repository      | https://github.com/windagency/valora.ai |
| Licence         | MIT                                     |

## 2. Intended purpose and operational context

Valora is a TypeScript CLI and MCP orchestration platform for **developer-side** AI-assisted software development. It targets the Limited Risk tier under the EU AI Act.

**Typical workflow:** A developer runs `valora <command>` or invokes a Valora MCP tool from an IDE. Valora orchestrates a sequence of AI agents (each with a scoped persona and permitted tool set) to produce a result. Results are presented to the developer for review before any real action (file write, git operation, deployment step) is taken.

## 3. Architecture overview

See [system-architecture.md](system-architecture.md) for the full component diagram.

Key structural properties:

- **Two binaries:** `valora` (CLI) and `valora-mcp` (MCP server for IDE integration).
- **Layer direction enforced:** `Types → Config → Repo → Service → Runtime → UI`. Violations are caught at lint time.
- **Human escalation gates:** The `EscalationHandlerService` pauses the pipeline and presents structured choices (Proceed / Modify / Abort) whenever a risk threshold is crossed.
- **Session isolation:** Each command runs in an `ExecutionContext` with a scoped tool set; agents cannot access tools outside their declared capability set.

## 4. Agents catalogue

| Agent          | Scope                                     | Escalation threshold                                |
| -------------- | ----------------------------------------- | --------------------------------------------------- |
| `architect`    | High-level design and ADR authoring       | Any destructive schema change                       |
| `asserter`     | Output validation and compliance checking | Any claim that cannot be deterministically verified |
| `coder`        | Code generation and refactoring           | Any write to paths outside the project root         |
| `context`      | Specification and requirements loading    | Insufficient or contradictory inputs                |
| `document`     | Documentation generation                  | Always presents output for human review             |
| `orchestrator` | Pipeline coordination                     | Budget breach or repeated escalation                |
| `planner`      | Work decomposition                        | Ambiguous or conflicting requirements               |
| `reviewer`     | Code and architecture review              | Any finding above medium severity                   |
| `secops`       | Security analysis                         | Any high or critical finding                        |
| `tester`       | Test plan generation                      | Any plan with no negative-path coverage             |
| `explorer`     | Codebase exploration                      | No escalation; read-only                            |

Full agent definitions: `data/agents/`.

## 5. Upstream models used

Valora is a **downstream system** under EU AI Act Article 25(4). It does not train or fine-tune models. Supported upstream GPAI providers:

- Anthropic (Claude family) — default
- OpenAI (GPT family)
- Google (Gemini family)
- Cursor (subscription model, guided-completion mode)
- Local/Ollama (operator-managed)
- Moonshot AI
- xAI (Grok)

See [GPAI Upstream Policy](../developer-guide/gpai-upstream-policy.md) for provider-specific obligations.

## 6. Data inputs and outputs

| Data type           | Where it enters                            | Where it is stored                     | Retention                       |
| ------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------- |
| Source code context | Prompt construction                        | Not persisted beyond the session       | Session lifetime                |
| AI agent outputs    | Stage results                              | `.valora/sessions/` (configurable)     | Default: 30 days                |
| Memory entries      | `memory create` or automatic consolidation | `.valora/memory/vault/`                | Half-life decay (7–30d default) |
| Security events     | Security guards                            | In-memory only                         | Process lifetime                |
| Reasoning traces    | `reasoning-trace-recorder`                 | `.valora/traces/`                      | 90 days (configurable)          |
| Credentials         | Never intentionally                        | CredentialGuard redacts before logging | Never stored                    |

## 7. Known limitations

- **Hallucinations.** LLM outputs may contain factually incorrect statements. All outputs require human review.
- **Model drift.** Upstream provider model versions may change silently; the behavioural regression suite (Phase 4) detects this but requires periodic baseline refresh.
- **Prompt injection.** Malicious content in tool results (e.g. a compromised dependency README) could attempt to override agent instructions. The `PromptInjectionDetector` reduces but does not eliminate this risk.
- **Agent collusion.** Two agents exchanging information via shared memory could theoretically coordinate to bypass a policy. This is mitigated by the permission intersection rule (Phase 4) but warrants monitoring in high-assurance deployments.
- **No real-time content moderation.** Valora forwards prompts to upstream providers without an intermediate moderation layer. Deployers inherit upstream content policies in full.

## 8. Risk classification rationale

Valora is classified **Limited Risk** because:

- It operates exclusively in a developer toolchain context, not in a public-facing or consumer product.
- All outputs have a mandatory human review step before any real-world action is taken.
- It does not process biometric, medical, financial credit, or law-enforcement data.
- It does not make autonomous decisions in any Annex III domain.

Conditions that would tip to **High Risk:** using Valora to automate decisions in an Annex III domain (e.g. automated HR screening, clinical decision support) without additional conformity assessment and human oversight measures.

## 9. Safety and oversight controls

| Control                      | Implementation                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Human escalation gates       | `EscalationHandlerService` — required for all risk-level findings                                            |
| Credential redaction         | `CredentialGuard` — redacts before any log or trace output                                                   |
| Command injection prevention | `CommandGuard` — blocks dangerous shell patterns                                                             |
| Prompt injection detection   | `PromptInjectionDetector` — scores and flags suspicious tool results                                         |
| Tool integrity monitoring    | `ToolIntegrityMonitor` — detects tool-set drift (rug pull)                                                   |
| Permission intersection      | `PermissionPropagationService` (Phase 4) — child agents cannot exceed parent scope                           |
| Deterministic validation     | `StageValidationService` + validator registry (Phase 2) — LLM "all clear" cannot bypass a deterministic fail |

See [CLAUDE.md](../../.claude/CLAUDE.md) for developer-facing escalation rules.

## 10. Performance and evaluation

- Unit, integration, architecture, and security test suites: `pnpm test`.
- Architecture invariants enforced at CI time via `arch-unit-ts`.
- Behavioural regression suite (Phase 4) detects model drift against pinned baselines.
- Quality domain scores tracked in `docs/quality/grades.json`.

## 11. Change log

| Version | Date       | Key changes                                                                                                                                                                                                                                                    |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5.0   | 2026-05-06 | Phase 1–4 governance: knowledge base, disclosure footer, memory purge, audit exporter, SECURITY.md, session budget circuit-breaker, permission propagation (intersection rule), forensic reasoning traces, behavioural regression suite, drift detection panel |
| 2.4.x   | Prior      | See git log                                                                                                                                                                                                                                                    |

## Verification Summary

Verified 2026-05-06 against agent definitions, `src/security/`, `src/executor/`, `src/ui/dashboard/`, and `__tests__/regression/`.

- Claims checked: 14 (agent catalogue — 11 agents and their escalation thresholds; safety controls table — 7 controls with class names; data inputs table — 6 rows; changelog)
- Confirmed: 13 — all class names (`EscalationHandlerService`, `CredentialGuard`, `CommandGuard`, `PromptInjectionDetector`, `ToolIntegrityMonitor`, `PermissionPropagationService`, `StageValidationService`) exist; data flow descriptions match implementation
- Corrected: 1 — changelog v2.5.0 entry extended from "Phase 1–2" to "Phase 1–4" to reflect all governance items shipped in this version
- Unverifiable: 0
