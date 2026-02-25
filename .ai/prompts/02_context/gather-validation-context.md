---
id: context.gather-validation-context
version: 1.0.0
category: context
experimental: true
name: Gather Validation Context
description: Collect all necessary context for assertion validation including standards, requirements, and quality gates
tags:
  - context-gathering
  - validation
  - quality-assurance
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
    - gpt-5-mini
agents:
  - asserter
dependencies:
  requires:
    - context.use-modern-cli-tools
inputs:
  - name: implementation_details
    description: Recent changes, modified files, commit context
    type: object
    required: true
  - name: requirements
    description: User stories, acceptance criteria, technical specifications
    type: object
    required: false
outputs:
  - coding_standards
  - architectural_guidelines
  - quality_gates
  - acceptance_criteria
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Gather Validation Context

## Objective

Collect all necessary context to perform comprehensive assertion validation, including coding standards, architectural guidelines, quality gates, and acceptance criteria.

## Context Collection Strategy

### Step 1: Identify Implementation Scope

Analyze the implementation details to understand what needs to be validated:

**IMPORTANT: Exclude Infrastructure Paths**

VALORA is a tool for building projects, not for updating itself. Always exclude the following paths from validation scope:
- `.ai/` - VALORA infrastructure (agents, prompts, commands, tooling)
- `.git/` - Git internal state
- `node_modules/` - Package dependencies

These paths are considered **infrastructure** and should never be included in project validation.

1. **Modified files and components**
   - List all changed files from implementation_details
   - **Filter out** any files in `.ai/`, `.git/`, or `node_modules/`
   - Identify component types (UI, API, utilities, tests)
   - Determine validation scope (frontend, backend, full-stack)

2. **Implementation approach**
   - Review commit messages and change descriptions
   - Identify patterns used (e.g., hooks, services, components)
   - Note any architectural decisions made

3. **Features added/changed**
   - Extract feature descriptions from commits
   - Map to requirements if available
   - Identify critical vs. non-critical changes

### Step 2: Load Project Standards

Gather all quality standards and configurations:

1. **Coding standards**
   - Read `.eslintrc*`, `prettier.config.*`, or similar
   - Extract key rules and conventions
   - Note any custom or overridden rules

2. **TypeScript configuration**
   - Read `tsconfig.json`
   - Check strict mode settings
   - Identify compiler options

3. **Build configuration**
   - Check build tool config (vite.config, webpack.config, etc.)
   - Note build targets and environments
   - Identify optimization settings

4. **Package dependencies**
   - Read `package.json` for dependency list
   - Check for security-sensitive packages
   - Note version constraints

### Step 3: Load Architectural Guidelines

If available in knowledge base:

1. **Architecture documentation**
   - System architecture patterns
   - Module boundaries and layer rules
   - API design standards

2. **Design patterns**
   - Preferred patterns (Repository, Factory, etc.)
   - Anti-patterns to avoid
   - Dependency injection guidelines

3. **Architectural Decision Records (ADRs)**
   - Recent architectural decisions
   - Constraints and trade-offs
   - Rationale for patterns

### Step 4: Load Quality Gates

Extract quality thresholds:

1. **Coverage thresholds**
   - From Jest/Vitest config or package.json
   - Line, branch, function coverage targets
   - Critical path coverage requirements

2. **Complexity limits**
   - Cyclomatic complexity thresholds
   - Cognitive complexity limits
   - File/function size limits

3. **Bundle size limits**
   - Maximum bundle sizes
   - Code splitting requirements
   - Asset optimization targets

4. **Security policies**
   - OWASP compliance requirements
   - Secrets management policies
   - Authentication/authorization patterns

5. **Accessibility requirements**
   - WCAG level target (A, AA, or AAA)
   - ARIA usage guidelines
   - Semantic HTML requirements

### Step 5: Extract Acceptance Criteria

From requirements input:

1. **User stories**
   - Parse user story format
   - Extract "As a... I want... So that..."
   - Identify actors and goals

2. **Acceptance criteria**
   - Extract Given-When-Then scenarios
   - List must-have vs. nice-to-have criteria
   - Identify edge cases and error scenarios

3. **Non-functional requirements**
   - Performance requirements
   - Security requirements
   - Accessibility requirements
   - Scalability requirements

### Step 6: Check for Frontend Changes

Determine if accessibility validation is needed:

```javascript
const hasFrontendChanges = modifiedFiles.some(file => 
  file.match(/\.(tsx?|jsx?|vue|svelte)$/) && 
  file.includes('component') || file.includes('page') || file.includes('ui')
);
```

Set `frontend_changes` flag for conditional accessibility validation.

## Output Format

Return a structured context object:

```json
{
  "implementation_scope": {
    "modified_files": ["src/components/Button.tsx", "src/api/users.ts"],
    "component_types": ["ui", "api"],
    "frontend_changes": true,
    "backend_changes": true,
    "test_changes": true
  },
  "coding_standards": {
    "linter": "eslint",
    "linter_config": ".eslintrc.json",
    "formatter": "prettier",
    "key_rules": {
      "max_line_length": 100,
      "quote_style": "single",
      "indent": 2
    },
    "custom_rules": ["no-console: error", "no-unused-vars: error"]
  },
  "architectural_guidelines": {
    "patterns": ["Repository", "Dependency Injection", "Factory"],
    "layer_rules": "UI -> Services -> Repository -> Data",
    "module_boundaries": ["No direct database access from UI", "Services must be stateless"],
    "api_standards": "RESTful with versioning",
    "adrs": [
      {
        "id": "ADR-001",
        "title": "Use Repository Pattern",
        "constraints": ["All data access must go through repositories"]
      }
    ]
  },
  "quality_gates": {
    "coverage": {
      "lines": 80,
      "branches": 75,
      "functions": 80,
      "statements": 80
    },
    "complexity": {
      "cyclomatic": 10,
      "cognitive": 15
    },
    "bundle_size": {
      "max_js": "500kb",
      "max_css": "100kb"
    },
    "security": {
      "owasp_compliance": true,
      "no_secrets": true,
      "dependency_scan": true
    },
    "accessibility": {
      "wcag_level": "AA",
      "target_version": "2.1"
    }
  },
  "acceptance_criteria": [
    {
      "story": "US-123",
      "title": "User login with email/password",
      "criteria": [
        "Given valid credentials, when user submits login form, then user is authenticated",
        "Given invalid credentials, when user submits login form, then error message is displayed",
        "Given missing fields, when user submits login form, then validation errors are shown"
      ],
      "nfrs": ["Response time < 500ms", "WCAG AA compliant", "Secure password handling"]
    }
  ]
}
```

## Success Criteria

- ✅ All coding standards files identified and parsed
- ✅ Quality gates extracted with numeric thresholds
- ✅ Architectural guidelines documented (or noted as missing)
- ✅ Acceptance criteria mapped from requirements
- ✅ Frontend/backend changes correctly identified
- ✅ Output is structured and complete for validation stages

## Notes

- If configuration files are missing, use sensible defaults and note in output
- If requirements are unavailable, set acceptance_criteria to empty array
- Always set frontend_changes flag to determine accessibility validation need
- Keep output concise - don't duplicate entire config files, just extract key rules
- **CRITICAL**: Never include files from `.ai/`, `.git/`, or `node_modules/` in the validation scope. VALORA validates the project being built, NOT its own infrastructure
- If no project files are modified (only infrastructure files), report an empty scope with a message indicating no project files to validate

