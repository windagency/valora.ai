# AI Orchestration Engine - Demo Guide

> **Objective:** Demonstrate the complete AI Orchestration workflow from specification to code review, building a cloud-native microservice from scratch.

> **Target Audience:** Software Engineers + Platform Engineers

> **Duration:** 1 hour

---

## Quick Reference Commands

```bash
# Phase 1: Specification
# valora refine-specs "Build a cloud-native health aggregator service for Cloud Run"
valora refine-specs --session-id=demo-20260130 --concept-file=./THOUGHTS.md

valora create-prd --session-id=demo-20260130 --specs-file=./knowledge-base/FUNCTIONAL.md

valora generate-docs --session-id=demo-20260130

# Phase 2: Backlog & Task
valora create-backlog --session-id=demo-20260130 --prd-file=./knowledge-base/PRD.md --granularity=fine

# Phase 3: Task Refinement
valora refine-task --session-id=demo-20260130 --backlog-file=./knowledge-base/BACKLOG.md --task-id=<TASK_ID>

# Phase 4: Planning
valora plan --session-id=demo-20260130 --backlog-file=./knowledge-base/BACKLOG.md --task-id=<TASK_ID>

valora review-plan ./knowledge-base/PLAN-<TASK_ID>.md --strict-mode  --session-id=demo-20260130

# Phase 5: Implementation
valora implement ./knowledge-base/PLAN-<TASK_ID>.md --session-id=demo-20260130

# Phase 6: Code Review
valora assert --session-id=demo-20260130

valora review-code --session-id=demo-20260130 --focus=security

# Phase 7: Documentation completion
valora generate-docs --session-id=demo-20260130
```
