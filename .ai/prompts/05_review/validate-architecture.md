---
id: review.validate-architecture
version: 1.0.0
category: review
experimental: true
name: Validate Architecture
description: Verify implementation follows architectural patterns, respects boundaries, and avoids anti-patterns
tags:
  - validation
  - architecture
  - design-patterns
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - asserter
dependencies:
  requires:
    - context.gather-validation-context
inputs:
  - name: architectural_guidelines
    description: Design patterns, layer rules, and module boundaries
    type: object
    required: true
outputs:
  - architectural_violations
  - pattern_violations
  - boundary_breaches
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Validate Architecture

## Objective

Verify implementation adheres to architectural patterns, respects module boundaries, and avoids anti-patterns.

## Validation Steps

### Step 1: Check Design Pattern Adherence

Review documented patterns from architectural_guidelines:

**For each required pattern** (e.g., Repository, Factory, Dependency Injection):
1. Check if pattern is correctly implemented
2. Verify pattern usage is consistent
3. Identify deviations or misuse

**Common Pattern Checks**:
- **Repository Pattern**: Data access isolated to repositories
- **Factory Pattern**: Object creation delegated to factories
- **Dependency Injection**: Dependencies injected, not instantiated
- **Observer Pattern**: Event-driven communication where specified

### Step 2: Validate Module Boundaries

Check layer and module separation:

**Layer Rules** (e.g., UI → Services → Repository → Data):
- UI components don't directly access data layer
- Services don't contain UI logic
- Repositories encapsulate all data access
- No layer skipping (UI → Repository directly)

**Module Boundaries**:
- Frontend doesn't import backend code
- Shared utilities properly organized
- No circular dependencies between modules

**Detection**:
```bash
# Check for circular dependencies
pnpm exec madge --circular src/

# Check imports violating layers
# Example: search for data imports in UI
grep -r "import.*from.*data" src/components/
```

### Step 3: Detect Architectural Anti-Patterns

Look for common anti-patterns:

**God Objects/Classes**:
- Classes > 500 lines
- Classes with > 20 methods
- Classes responsible for too many concerns

**Circular Dependencies**:
- Module A imports Module B imports Module A
- Detected by tools like madge or dependency-cruiser

**Tight Coupling**:
- Direct instantiation instead of DI
- Hardcoded dependencies
- Excessive method chaining

**Inappropriate Intimacy**:
- Modules accessing internal details of others
- Public APIs exposing internals

**Feature Envy**:
- Methods operating primarily on data from other classes

### Step 4: Verify API Consistency

Check API design consistency:

**REST APIs**:
- Consistent resource naming (plural nouns)
- HTTP method usage follows REST semantics
- Status codes appropriate (200, 201, 404, 500, etc.)
- Versioning strategy followed

**GraphQL**:
- Schema follows naming conventions
- Resolver patterns consistent
- Error handling uniform

**Error Responses**:
- Consistent error response format
- Proper status codes
- Meaningful error messages

### Step 5: Check Dependency Management

Verify dependency organization:

**Dependency Flow**:
- Dependencies point inward (toward domain)
- No reversed dependencies
- External dependencies isolated

**Circular Dependencies**:
- No circular imports detected
- Module graph is acyclic

**Cohesion & Coupling**:
- High cohesion within modules
- Loose coupling between modules

## Output Format

```json
{
  "architectural_violations": {
    "status": "fail",
    "total_violations": 3,
    "violations": [
      {
        "type": "layer_violation",
        "severity": "high",
        "location": "src/components/UserList.tsx:45",
        "description": "UI component directly imports database repository",
        "guideline_violated": "UI layer must not access data layer directly",
        "remediation": "Use service layer to access data: UserService → UserRepository"
      },
      {
        "type": "boundary_breach",
        "severity": "medium",
        "location": "src/frontend/utils/api.ts:12",
        "description": "Frontend code imports backend type",
        "guideline_violated": "Frontend must not import backend code",
        "remediation": "Move shared types to common/shared package"
      }
    ],
    "commands_run": [
      "pnpm exec madge --circular src/"
    ]
  },
  "pattern_violations": {
    "status": "warn",
    "violations": [
      {
        "pattern": "Dependency Injection",
        "location": "src/services/UserService.ts:23",
        "issue": "Direct instantiation of repository instead of injection",
        "severity": "medium",
        "code_snippet": "this.userRepo = new UserRepository();",
        "expected": "constructor(private userRepo: UserRepository) {}"
      }
    ]
  },
  "boundary_breaches": {
    "layer_violations": 1,
    "module_boundary_violations": 1,
    "circular_dependencies": [
      {
        "cycle": ["src/services/UserService.ts", "src/services/AuthService.ts", "src/services/UserService.ts"],
        "severity": "critical"
      }
    ]
  },
  "anti_patterns": {
    "god_classes": [
      {
        "file": "src/utils/Helpers.ts",
        "lines": 850,
        "methods": 45,
        "severity": "medium",
        "recommendation": "Split into focused utility modules"
      }
    ],
    "tight_coupling": 2,
    "feature_envy": 1
  },
  "summary": {
    "total_issues": 7,
    "critical": 1,
    "high": 1,
    "medium": 4,
    "low": 1,
    "blocking": true
  }
}
```

## Success Criteria

- ✅ Design patterns validated
- ✅ Module boundaries checked
- ✅ Anti-patterns detected
- ✅ API consistency verified
- ✅ Dependency flow validated
- ✅ Circular dependencies identified
- ✅ Commands documented for reproducibility

## Rules

**Blocking Issues**:
- Critical circular dependencies
- Major layer violations (UI → Data direct access)
- Fundamental pattern violations affecting system integrity

**Warning Issues**:
- Minor pattern deviations
- God classes (can be refactored later)
- Moderate coupling issues

**Note**: Architectural violations can have long-term impact. Critical issues must be addressed to prevent technical debt.

