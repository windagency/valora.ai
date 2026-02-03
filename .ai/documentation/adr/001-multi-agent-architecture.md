# ADR-001: Multi-Agent Architecture

## Status

Accepted

## Context

VALORA needs to handle a wide variety of software development tasks, from product management and planning to implementation, testing, and security analysis. A single AI agent cannot effectively handle all these domains with the depth and expertise required for production-quality output.

Key challenges:

1. **Domain Specialisation**: Different tasks require different expertise (e.g., backend development vs. UI/UX design)
2. **Context Management**: A generalist agent struggles to maintain relevant context for specialised tasks
3. **Quality Optimisation**: Different tasks benefit from different prompting strategies and focus areas
4. **Scalability**: Adding new capabilities should not require modifying a monolithic agent

## Decision

We will implement a **multi-agent architecture** with 11 specialised AI agents, each with distinct roles, expertise areas, and selection criteria.

### Agent Categories

| Category    | Agents                           | Purpose                                      |
| ----------- | -------------------------------- | -------------------------------------------- |
| Leadership  | lead                             | Technical oversight, architecture, reviews   |
| Product     | product-manager                  | Requirements, prioritisation, specifications |
| Engineering | software-engineer-* (4 variants) | Implementation across domains                |
| Platform    | platform-engineer                | Infrastructure, DevOps, cloud                |
| Quality     | qa, asserter                     | Testing, validation                          |
| Security    | secops-engineer                  | Security, compliance                         |
| Design      | ui-ux-designer                   | UI/UX, accessibility                         |

### Agent Selection

Agents are selected based on:

1. **Task Description Analysis**: Keywords and intent matching
2. **Affected File Patterns**: File extensions and paths
3. **Domain Mapping**: Task domain to agent expertise
4. **Priority Rules**: When multiple agents match, highest priority wins

### Agent Structure

Each agent is defined with:

```yaml
name: agent-name
domains: [domain1, domain2]
expertise: [skill1, skill2, ...]
selectionCriteria: [pattern1, pattern2, ...]
priority: 0-100
```

## Consequences

### Positive

- **Better Quality**: Specialised agents produce higher-quality, domain-specific output
- **Clearer Responsibilities**: Each agent has well-defined boundaries
- **Easier Extension**: New agents can be added without modifying existing ones
- **Optimised Prompting**: Each agent can have tailored system prompts
- **Context Relevance**: Agents only receive context relevant to their domain

### Negative

- **Complexity**: More components to maintain and test
- **Selection Overhead**: Agent selection adds latency and potential for errors
- **Coordination**: Multi-agent tasks require coordination logic
- **Redundancy**: Some expertise overlaps between agents

### Neutral

- **Configuration Management**: Agent definitions stored as separate files
- **Registry Maintenance**: Selection criteria need ongoing refinement
- **Documentation**: Each agent requires its own documentation

## Alternatives Considered

### Alternative 1: Single Generalist Agent

A single agent handles all tasks with extensive system prompts.

**Rejected because**:

- System prompts become unwieldy
- Context pollution across domains
- Difficult to optimise for specific tasks
- Poor separation of concerns

### Alternative 2: Role-Based Prompting

Single agent with role switching based on task.

**Rejected because**:

- Complex prompt engineering
- Risk of role confusion
- Harder to extend
- No clear boundaries

### Alternative 3: Hierarchical Agents

Manager agent delegates to worker agents.

**Considered for future** but deferred because:

- Adds latency
- Complex coordination
- Current approach sufficient for v1

## Implementation Notes

- Agents defined in `.ai/agents/*.md`
- Registry in `.ai/agents/registry.json`
- Selection logic in `src/executor/agent-loader.ts`
- Dynamic selection for `implement` command

## References

- [Agent Registry](../../agents/registry.json)
- [Component Architecture](../architecture/components.md)
- [AGENTS.md](../../AGENTS.md)
