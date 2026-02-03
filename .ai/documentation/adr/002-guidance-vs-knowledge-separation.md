# ADR-002: Guidance vs Knowledge Separation

## Status

Accepted

## Context

VALORA was loading all knowledge-base files (FUNCTIONAL.md, PRD.md) as "project guidance" alongside actual guidance files (AGENTS.md, CLAUDE.md). This approach had several problems:

1. **Token Waste**: Every command loaded all knowledge files regardless of whether they were needed
2. **Context Pollution**: Unrelated knowledge files added noise to the AI's reasoning
3. **Misclassification**: Knowledge files were labelled as "guidance" when they serve a different purpose
4. **Scalability**: As the knowledge-base grows, loading everything becomes increasingly expensive

### Distinction Between Types

| Category      | Examples                                     | Purpose                                   | When Loaded             |
| ------------- | -------------------------------------------- | ----------------------------------------- | ----------------------- |
| **Guidance**  | AGENTS.md, CLAUDE.md, .cursorrules           | Instructions for how the AI should behave | Always                  |
| **Knowledge** | FUNCTIONAL.md, PRD.md, BACKLOG.md, PLAN-*.md | Information about the project             | Selectively per command |

## Decision

We implement a separation between **guidance files** and **project knowledge files**:

### 1. Guidance Files (Always Loaded)

Files that instruct the AI on how to behave, loaded for every command:

- `AGENTS.md`
- `CLAUDE.md`
- `COPILOT.md`
- `AI-GUIDELINES.md`
- `AI-INSTRUCTIONS.md`
- `.cursorrules`
- `.github/copilot-instructions.md`

### 2. Project Knowledge (Selectively Loaded)

Files from `knowledge-base/` directory, loaded based on command configuration:

- `FUNCTIONAL.md` - Functional specifications
- `PRD.md` - Product Requirements Document
- `BACKLOG.md` - Task backlog
- `PLAN-*.md` - Implementation plans (glob pattern, sorted by modification time)

### 3. Command Configuration

Each command specifies which knowledge files it needs via `knowledge_files` in `registry.json`:

```json
{
  "create-prd": {
    "knowledge_files": ["FUNCTIONAL.md"]
  },
  "create-backlog": {
    "knowledge_files": ["PRD.md"]
  },
  "implement": {
    "knowledge_files": ["PLAN-*.md"]
  },
  "review-functional": {
    "knowledge_files": ["PRD.md", "FUNCTIONAL.md"]
  }
}
```

### 4. Loading Order

System message construction follows this priority:

1. **Project Guidance** (AGENTS.md, CLAUDE.md) - AI behaviour instructions
2. **Agent Profile** - Role-specific instructions
3. **Prompt Content** - Task-specific instructions
4. **Project Knowledge** (knowledge-base/*) - Context for this task
5. **Output Format Instructions** - Expected response structure
6. **Escalation Instructions** - When to escalate

## Consequences

### Positive

- **Token Efficiency**: Commands only load knowledge they need
- **Cleaner Context**: AI receives relevant information only
- **Correct Classification**: Knowledge is now properly labelled
- **Flexibility**: Commands can specify exactly what knowledge they need
- **Glob Support**: Patterns like `PLAN-*.md` load the most recent plan

### Negative

- **Configuration Overhead**: Each command must specify its knowledge requirements
- **Potential Gaps**: A command might miss needed knowledge if misconfigured

### Neutral

- **Breaking Change**: Old behaviour of loading all knowledge-base files is removed
- **Cache Separation**: Guidance and knowledge now have separate caches

## Implementation

### Files Modified

- `project-guidance-loader.ts` - Added `loadProjectKnowledge()` function
- `stage-executor.ts` - Loads both guidance and knowledge separately
- `execution-context.ts` - Added `knowledgeFiles` property
- `command.types.ts` - Added `knowledge_files` to `CommandMetadata`
- `registry.json` - Added `knowledge_files` to each command
- `execution-coordinator.ts` - Passes `knowledge_files` to context

### New API

```typescript
// Load guidance files (always)
const guidance = await loadProjectGuidance();

// Load knowledge files (selectively)
const knowledge = await loadProjectKnowledge(['PRD.md', 'FUNCTIONAL.md']);
```

## References

- [ADR-001: Multi-Agent Architecture](./001-multi-agent-architecture.md)
- [Command Registry](../../commands/registry.json)
- [Project Guidance Loader](../../.bin/src/executor/project-guidance-loader.ts)
