---
id: onboard.analyze-patterns
version: 1.0.0
category: onboard
experimental: true
name: Analyze Patterns
description: Identify architectural patterns, design patterns, and coding conventions
tags:
  - architecture
  - design-patterns
  - conventions
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - lead
dependencies:
  requires:
    - context.scan-codebase
inputs:
  - name: structure
    description: Codebase structure from scan-codebase
    type: object
    required: true
  - name: tech_stack
    description: Tech stack information from scan-codebase
    type: object
    required: true
  - name: domain
    description: Domain filter for focused analysis
    type: string
    required: false
    validation:
      enum: ["backend", "frontend", "infrastructure", "data", "all"]
outputs:
  - coding_patterns
  - architectural_style
  - conventions
tokens:
  avg: 5000
  max: 10000
  min: 2500
---

# Analyze Patterns

## Objective

Document architectural style, design patterns, and coding conventions used in the codebase.

## Instructions

### Step 1: Determine Architectural Style

Based on directory structure and tech stack, identify primary architecture:

**Backend Architectures**:
- Layered (Controller → Service → Repository → Model)
- Clean/Hexagonal (Domain-centric with ports/adapters)
- Microservices (Independent services)
- Event-Driven (Message queues, event sourcing)
- MVC/MTV

**Frontend Architectures**:
- Component-Based (React, Vue, Angular)
- Atomic Design (Atoms → Molecules → Organisms → Pages)
- Feature-Based (Features contain all related logic)
- Layer-Based (UI → State → Services → API)

**Evidence**: Point to specific files/directories that demonstrate the pattern

**Output**:
```json
{
  "backend_architecture": "Layered",
  "frontend_architecture": "Component-Based",
  "evidence": [
    "src/controllers/", "src/services/", "src/repositories/"
  ]
}
```

### Step 2: Identify Design Patterns

Search for common design patterns in the codebase:

**Creational**: Factory, Builder, Singleton  
**Structural**: Adapter, Decorator, Facade, Proxy  
**Behavioral**: Observer, Strategy, Command, Middleware

**For each pattern found**:
- Pattern name
- File paths where used
- Purpose/reason for use
- Example implementation reference

**Output**:
```json
{
  "patterns": [
    {
      "name": "Factory",
      "files": ["src/factories/UserFactory.ts"],
      "purpose": "Create different user types",
      "example": "UserFactory.create(type)"
    }
  ]
}
```

### Step 3: Document Coding Conventions

**Naming Conventions**:
- Files: `kebab-case`, `PascalCase`, `snake_case`
- Functions: `camelCase`, `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_CASE`
- Components: `PascalCase` (React)
- Test files: `*.test.*`, `*.spec.*`, `test_*`

**Code Organization**:
- File structure (one class per file, multiple exports)
- Import order (external first, then internal)
- Error handling (try-catch, error boundaries, middleware)
- Async patterns (promises, async/await)
- Type safety (TypeScript strict, PropTypes, Zod)

**Testing Conventions**:
- Test structure (AAA, Given-When-Then)
- Test organization (co-located, separate directories)
- Mocking strategy (manual, auto-mocking)
- Coverage targets

**Output**:
```json
{
  "conventions": {
    "naming": {
      "files": "kebab-case",
      "functions": "camelCase",
      "classes": "PascalCase",
      "tests": "*.test.ts"
    },
    "testing": {
      "structure": "AAA (Arrange-Act-Assert)",
      "location": "co-located with source",
      "framework": "Vitest"
    }
  }
}
```

### Step 4: Identify State Management Patterns

**Backend State**:
- Session management (cookies, JWT)
- Caching strategy (Redis, in-memory)
- Transaction handling

**Frontend State**:
- Global state (Redux, Zustand, Pinia, Context)
- Server state (React Query, SWR, Apollo)
- Local state (useState, refs)
- State flow (unidirectional, bidirectional)

**Output**: Document which patterns are used and where

### Step 5: Document Data Flow

Map how data flows through the application:

```plaintext
Request → [Middleware] → [Controller] → [Service] → [Repository] → [Database]
                                                                   ↓
                   [Response] ← [Serializer/Mapper] ← [Entity/Model]
```

Include:
- Request/response flow
- Data transformation points
- Validation layers
- Error propagation

## Output Format

```json
{
  "coding_patterns": {
    "design_patterns": [
      {
        "name": "Factory",
        "usage": "User type creation",
        "files": ["src/factories/UserFactory.ts"]
      }
    ],
    "state_management": {
      "backend": {
        "sessions": "JWT tokens",
        "caching": "Redis for API responses"
      },
      "frontend": {
        "global": "Zustand",
        "server": "React Query",
        "local": "useState hooks"
      }
    },
    "data_flow": {
      "description": "Layered architecture with clear separation",
      "layers": ["Controller", "Service", "Repository", "Model"],
      "transformation_points": ["Controller (validation)", "Service (business logic)"]
    }
  },
  "architectural_style": {
    "backend": {
      "pattern": "Layered Architecture",
      "evidence": ["src/controllers/", "src/services/", "src/repositories/"],
      "description": "Clear separation of concerns with controller-service-repository pattern"
    },
    "frontend": {
      "pattern": "Component-Based with Feature Modules",
      "evidence": ["src/features/", "src/components/"],
      "description": "Features contain all related components, hooks, and logic"
    }
  },
  "conventions": {
    "naming": {
      "files": "kebab-case",
      "functions": "camelCase",
      "classes": "PascalCase",
      "constants": "UPPER_CASE",
      "components": "PascalCase",
      "tests": "*.test.ts"
    },
    "code_organization": {
      "file_structure": "One main export per file",
      "import_order": "External dependencies first, then internal",
      "error_handling": "Try-catch with custom error classes",
      "async": "async/await preferred over promises"
    },
    "testing": {
      "structure": "AAA (Arrange-Act-Assert)",
      "organization": "Co-located with source files",
      "mocking": "Vitest auto-mocking for unit tests",
      "coverage_target": "80% line coverage"
    }
  }
}
```

## Success Criteria

- ✅ Architectural style identified and documented
- ✅ Design patterns cataloged with examples
- ✅ Naming conventions documented
- ✅ Code organization patterns described
- ✅ Testing conventions captured
- ✅ State management patterns identified
- ✅ Data flow documented
- ✅ Evidence provided for all claims

## Rules

**DO**:
- ✅ Provide file path evidence for patterns
- ✅ Document WHY patterns are used
- ✅ Capture actual conventions (not ideal ones)
- ✅ Show data flow with examples

**DON'T**:
- ❌ Don't assume conventions without evidence
- ❌ Don't describe ideal state (document reality)
- ❌ Don't skip state management patterns
- ❌ Don't forget to check test conventions

