---
id: plan.assess-complexity
version: 1.0.0
category: plan
experimental: true
name: Assess Complexity
description: Evaluate task complexity and determine appropriate implementation mode
tags:
  - complexity-analysis
  - risk-assessment
  - planning
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-task-context
inputs:
  - name: task_scope
    description: Task scope from analyze-task-context
    type: object
    required: true
  - name: affected_components
    description: List of affected components
    type: array
    required: true
  - name: complexity_threshold
    description: Threshold for incremental mode (1-10)
    type: number
    required: false
    default: 5
    validation:
      min: 1
      max: 10
outputs:
  - complexity_score
  - complexity_factors
  - implementation_mode
  - confidence_level
tokens:
  avg: 2500
  max: 5000
  min: 1500
---

# Assess Complexity

## Objective

Evaluate task complexity across multiple dimensions and determine whether to use standard or incremental implementation mode.

## Context

Complexity assessment helps:
1. Choose appropriate implementation strategy
2. Set realistic effort estimates
3. Identify high-risk areas early
4. Allocate appropriate resources

## Complexity Dimensions

Evaluate on a 1-10 scale for each dimension:

### 1. Code Volume (1-10)

**Measure**: Lines of code to change/add

- **1-2 (Trivial)**: < 50 lines, single file
- **3-4 (Small)**: 50-200 lines, 2-3 files
- **5-6 (Medium)**: 200-500 lines, 3-5 files
- **7-8 (Large)**: 500-1000 lines, 5-10 files
- **9-10 (Very Large)**: > 1000 lines, > 10 files

**Consider**:
- New code vs. modifications
- Test code (typically 1.5x production code)
- Documentation updates

### 2. Component Coupling (1-10)

**Measure**: Number of components affected and their interconnections

- **1-2 (Isolated)**: 1 component, no dependencies
- **3-4 (Loosely coupled)**: 2-3 components, simple interactions
- **5-6 (Moderate)**: 4-6 components, some coupling
- **7-8 (Tightly coupled)**: 7-10 components, significant coupling
- **9-10 (Highly coupled)**: > 10 components, complex web of dependencies

**Consider**:
- Direct dependencies
- Transitive dependencies
- Circular dependencies
- Shared state

### 3. Data Complexity (1-10)

**Measure**: Schema changes, data migrations, state management

- **1-2 (None)**: No data changes
- **3-4 (Simple)**: Add field, simple validation
- **5-6 (Moderate)**: New table, foreign keys, backfill data
- **7-8 (Complex)**: Schema refactor, data migration, multiple tables
- **9-10 (Very Complex)**: Major schema changes, complex migrations, data integrity concerns

**Consider**:
- Breaking changes to schema
- Data migration requirements
- Backward compatibility
- Data volume to migrate

### 4. Integration Complexity (1-10)

**Measure**: External services, APIs, third-party integrations

- **1-2 (None)**: No integrations
- **3-4 (Simple)**: Single well-documented API
- **5-6 (Moderate)**: 2-3 APIs, standard patterns
- **7-8 (Complex)**: Multiple APIs, webhooks, async patterns
- **9-10 (Very Complex)**: Many integrations, event-driven, complex orchestration

**Consider**:
- Number of external dependencies
- API stability and documentation quality
- Rate limits and quotas
- Authentication complexity
- Error handling and retry logic

### 5. Business Logic Complexity (1-10)

**Measure**: Algorithm sophistication, business rules

- **1-2 (Trivial)**: CRUD operations, simple validation
- **3-4 (Simple)**: Basic conditionals, simple calculations
- **5-6 (Moderate)**: Multiple business rules, moderate algorithms
- **7-8 (Complex)**: Complex workflows, state machines, intricate logic
- **9-10 (Very Complex)**: Advanced algorithms, ML/AI, complex optimization

**Consider**:
- Number of business rules
- Decision tree complexity
- Edge cases and special conditions
- Domain knowledge requirements

### 6. Testing Complexity (1-10)

**Measure**: Test scenarios, edge cases, mocking requirements

- **1-2 (Simple)**: Few happy path tests
- **3-4 (Moderate)**: Happy path + basic error cases
- **5-6 (Comprehensive)**: Multiple scenarios, edge cases, some mocking
- **7-8 (Complex)**: Extensive scenarios, complex mocking, integration tests
- **9-10 (Very Complex)**: E2E flows, performance tests, complex test data setup

**Consider**:
- Number of test scenarios
- Mocking complexity (external services, database)
- Test data setup requirements
- E2E test needs

### 7. Risk Level (1-10)

**Measure**: Potential for breaking changes, production impact

- **1-2 (Low)**: New feature, no existing dependencies
- **3-4 (Low-Medium)**: Modifies non-critical paths
- **5-6 (Medium)**: Affects core features, backward compatible
- **7-8 (High)**: Breaking changes, critical paths affected
- **9-10 (Critical)**: Core system changes, high production impact, data loss risk

**Consider**:
- Blast radius (how many users/systems affected)
- Reversibility (can we rollback easily?)
- Data integrity risks
- Security implications
- Performance impact on critical paths

## Complexity Score Calculation

```
Complexity Score = (
  Code Volume × 0.15 +
  Component Coupling × 0.20 +
  Data Complexity × 0.15 +
  Integration Complexity × 0.15 +
  Business Logic × 0.20 +
  Testing Complexity × 0.10 +
  Risk Level × 0.05
) / 10
```

**Result**: Score from 1-10

## Implementation Mode Determination

Based on complexity score and threshold:

### Standard Mode (Single-pass)
**When**: `complexity_score ≤ complexity_threshold`

**Characteristics**:
- Implement entire task in one go
- Single PR with all changes
- Standard testing and review
- Typical for straightforward tasks

**Best for**:
- Well-understood problems
- Limited scope
- Low coupling
- Experienced team

### Incremental Mode (Step-by-step)
**When**: `complexity_score > complexity_threshold`

**Characteristics**:
- Break into sequential steps
- Multiple PRs (one per step)
- Validate after each step
- Allows course correction

**Best for**:
- High complexity
- Uncertainty or exploration needed
- Learning new patterns
- High-risk changes

### Auto Mode
**When**: `--mode=auto` (default)

**Logic**:
```
if complexity_score > complexity_threshold:
    mode = "incremental"
else:
    mode = "standard"
```

## Complexity Factors Analysis

Identify **key drivers** of complexity:

**For each dimension scoring ≥ 7**:
- Identify specific factor
- Explain why it's complex
- Suggest mitigation if possible

**Example**:
```json
{
  "dimension": "Component Coupling",
  "score": 8,
  "factor": "Changes affect 12 components across frontend and backend",
  "mitigation": "Use feature flags to decouple frontend/backend rollout"
}
```

## Pattern Detection (Optimization)

**Purpose**: Identify common patterns to use pre-built templates and reduce planning time.

### Pattern Detection Logic

Check task description and affected files for pattern keywords:

```json
{
  "pattern_detection": {
    "rest_api": {
      "keywords": ["api", "endpoint", "rest", "crud", "http", "route", "handler", "controller"],
      "file_patterns": ["src/routes/", "src/controllers/", "*.routes.ts", "*.controller.ts"],
      "confidence": 0.0,
      "matched_keywords": [],
      "matched_files": []
    },
    "react_component": {
      "keywords": ["component", "react", "ui", "form", "page", "view", "modal", "tsx"],
      "file_patterns": ["src/components/", "*.tsx", "*.jsx", "src/pages/"],
      "confidence": 0.0,
      "matched_keywords": [],
      "matched_files": []
    },
    "database_migration": {
      "keywords": ["migration", "schema", "database", "table", "column", "index", "prisma", "typeorm"],
      "file_patterns": ["prisma/schema.prisma", "migrations/", "*.sql"],
      "confidence": 0.0,
      "matched_keywords": [],
      "matched_files": []
    }
  }
}
```

### Pattern Matching Algorithm

For each pattern:
1. Check task description for keywords (case-insensitive)
2. Check affected files for file patterns
3. Calculate confidence:
   ```
   confidence = (
     (matched_keywords_count × 0.6) +
     (matched_files_count × 0.4)
   ) / (total_possible_matches)
   ```
4. If confidence ≥ 0.6 → recommend template

### Template Recommendation

```json
{
  "recommended_template": {
    "pattern": "rest-api",
    "confidence": 0.85,
    "template_file": "PATTERN_REST_API.md",
    "reason": "Task matches REST API pattern (keywords: 'api', 'endpoint', 'crud'; files: 'src/routes/')",
    "time_savings": "8-10 minutes",
    "should_use_template": true
  }
}
```

**Decision Logic**:
```plaintext
IF complexity_score <= 6 AND pattern_confidence >= 0.6:
  → RECOMMEND template
  → Planning time: 3-5 min (vs 13-15 min)

ELSE IF complexity_score > 6:
  → NO template (complexity too high)
  → Use full planning process

ELSE:
  → NO clear pattern detected
  → Use full planning process
```

## Output Format

```json
{
  "complexity_score": 6.5,
  "pattern_detected": "rest-api",
  "template_recommended": true,
  "template_file": "PATTERN_REST_API.md",
  "breakdown": {
    "code_volume": {"score": 5, "estimate": "~400 lines"},
    "component_coupling": {"score": 7, "count": 8},
    "data_complexity": {"score": 6, "changes": "New table + migration"},
    "integration_complexity": {"score": 4, "integrations": ["Email API"]},
    "business_logic": {"score": 7, "description": "Complex workflow with state machine"},
    "testing_complexity": {"score": 6, "scenarios": "Multiple paths, some mocking"},
    "risk_level": {"score": 5, "impact": "Medium - affects core feature but backward compatible"}
  },
  "complexity_factors": [
    {
      "dimension": "Component Coupling",
      "score": 7,
      "description": "Changes span 8 components across API, service, and data layers",
      "mitigation": "Use interface abstraction to limit coupling"
    },
    {
      "dimension": "Business Logic",
      "score": 7,
      "description": "Implements multi-step verification workflow with state transitions",
      "mitigation": "Consider state machine library (XState) for clearer logic"
    }
  ],
  "implementation_mode": "incremental",
  "recommendation": {
    "mode": "incremental",
    "reason": "Complexity score (6.5) exceeds threshold (5.0). High coupling and complex logic warrant step-by-step approach.",
    "confidence": "high"
  },
  "thresholds": {
    "configured": 5.0,
    "standard_range": "≤ 5.0",
    "incremental_range": "> 5.0"
  },
  "confidence_level": "high"
}
```

## Success Criteria

- ✅ All 7 dimensions evaluated with scores
- ✅ Complexity score calculated using weighted formula
- ✅ Implementation mode determined based on threshold
- ✅ Key complexity factors identified (score ≥ 7)
- ✅ Mitigation strategies suggested where applicable
- ✅ Confidence level assessed

## Rules

**DO**:
- ✅ Be objective - use the scoring rubric
- ✅ Consider all dimensions, even if some are 1-2
- ✅ Flag high-scoring dimensions (≥ 7) as complexity drivers
- ✅ Provide mitigation suggestions for high complexity
- ✅ Be honest about uncertainty (affects confidence)

**DON'T**:
- ❌ Don't lowball scores to avoid incremental mode
- ❌ Don't ignore dimensions (score all 7)
- ❌ Don't skip mitigation suggestions for high scores
- ❌ Don't be overconfident with high complexity

## Edge Cases

**Scenario: Score is near threshold (±0.5)**
- Present both options
- Explain trade-offs
- Let complexity factors guide decision
- Consider team experience

**Scenario: High risk but low complexity**
- May still recommend incremental mode
- Risk level can override other factors
- Suggest additional validation steps

**Scenario: Greenfield vs. modification**
- Greenfield: Typically lower coupling, higher business logic
- Modification: Higher coupling, more risk
- Adjust scoring accordingly

