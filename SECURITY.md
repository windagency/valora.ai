---
updated: 2026-05-06
---

# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues by e-mail to **damien@wind-agency.com** with the subject line `[Valora Security] <brief description>`.

We follow a **90-day coordinated disclosure** window. You will receive an acknowledgement within 48 hours and a status update within 7 days.

### What to include

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept (redact any real credentials or tokens before sending).
- Your preferred contact channel for follow-up.

### Categories worth reporting

- Silent agent failures (an agent takes an action it should not without escalating to the human).
- Prompt injection bypass (a crafted tool result causes an agent to override safety constraints).
- Credential leakage (API keys, tokens, or secrets appearing in logs, traces, or outputs).
- Unintended destructive action (file deletion, branch force-push, schema migration) taken without the required human approval gate.
- Any vulnerability that would allow an attacker to escalate permissions between agents beyond the intersection rule documented in the architecture.

## AI Office Reference

If Valora is ever incorporated into a **High Risk AI system** as defined by EU AI Act Annex III, serious malfunctions must additionally be reported to the relevant national market surveillance authority and, where applicable, to the AI Office under Article 73 of the EU AI Act.

At present Valora operates at the **Limited Risk** tier and this pathway does not apply, but is documented here for future compliance readiness.

## Audit Export

A snapshot of in-process security events can be exported at any time:

```bash
valora security audit-export --out /tmp/audit.json
```

This covers events from: command guard, credential guard, prompt injection detector, tool definition validator, and tool integrity monitor.

## Verification Summary

Verified 2026-05-06 against `src/security/audit-exporter.ts`.

- Claims checked: 2 (`valora security audit-export --out` flag, five event source names)
- Confirmed: 2 — exporter collects from exactly those five guards; `--out` flag wired in `security.command.ts`
- Corrected: 0
- Unverifiable: 0
