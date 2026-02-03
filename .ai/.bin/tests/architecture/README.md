# Architecture Tests

This directory contains architecture tests using [arch-unit-ts](https://github.com/arch-unit-ts/arch-unit-ts) to enforce architectural constraints and coding standards.

## Overview

Architecture tests help maintain clean architecture by automatically validating:

- **Layering Rules**: Ensuring proper dependency directions between layers
- **Module Boundaries**: Preventing tight coupling between modules
- **Naming Conventions**: Enforcing consistent naming patterns
- **Dependency Rules**: Maintaining clean dependency graphs
- **File Organization**: Ensuring consistent project structure
- **Circular Dependencies**: Detecting and preventing circular dependencies that cause initialization issues

## Running Architecture Tests

```bash
# Run all architecture tests
pnpm test:suite:architecture

# Run all test suites including architecture
pnpm test

# Run architecture tests in watch mode
vitest tests/architecture --watch
```

## Test Files

- **architecture.test.ts**: Core layering and dependency rules
- **module-boundaries.test.ts**: Module isolation and boundaries
- **file-organization.test.ts**: File and directory organization
- **dependency-rules.test.ts**: Dependency direction and patterns
- **circular-dependencies.test.ts**: Circular dependency detection and prevention

## Architecture Principles

### Layering

The project follows a layered architecture:

```
┌─────────────────────────────────────┐
│   Presentation (CLI, MCP, UI)       │
├─────────────────────────────────────┤
│   Application (Executor, DI)        │
├─────────────────────────────────────┤
│   Domain (Services, Session)        │
├─────────────────────────────────────┤
│   Infrastructure (LLM, Config,      │
│   Output, Utils)                    │
├─────────────────────────────────────┤
│   Types (Shared Type Definitions)   │
└─────────────────────────────────────┘
```

### Key Rules

1. **Types Layer**: Must remain independent - no dependencies on implementation layers
2. **Infrastructure**: Should not depend on domain or application layers
3. **Domain**: Should not depend on presentation layers (CLI, MCP, UI)
4. **Application**: Coordinates between domain and presentation
5. **Presentation**: Can depend on all other layers through proper channels
6. **No Circular Dependencies**: Package dependency graph must be acyclic (ADP - Acyclic Dependencies Principle)

### Cross-Cutting Concerns

Some concerns are allowed to cross layers:
- **Logging (output)**: Can be used by most layers as it's a cross-cutting concern
- **DI Container**: Is the composition root and knows about all layers
- **Utilities**: Should remain generic and reusable

## Adjusting Rules

Architecture tests are living documentation. As the architecture evolves:

1. Update the test files to reflect intentional architectural changes
2. Document exceptions and their rationale in comments
3. Consider whether violations indicate technical debt or legitimate design decisions

## Known Exceptions

Some legitimate architectural exceptions exist:

- **DI Container**: Depends on all layers as the composition root
- **Logging**: Used across layers as a cross-cutting concern
- **Executor**: Has limited CLI dependencies for workflow utilities

## Troubleshooting

If tests fail:

1. **Understand the violation**: Read the error message carefully
2. **Assess if it's valid**: Is this a real architectural problem?
3. **Fix or adjust**: Either fix the code or update the rule if the dependency is intentional
4. **Document**: Add comments explaining any exceptional dependencies

## Further Reading

- [arch-unit-ts Documentation](https://github.com/arch-unit-ts/arch-unit-ts)
- [Clean Architecture Principles](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
