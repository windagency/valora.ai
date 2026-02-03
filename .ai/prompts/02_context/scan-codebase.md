---
id: context.scan-codebase
version: 1.0.0
category: context
experimental: true
name: Scan Codebase
description: Analyze codebase structure, tech stack, and entry points
tags:
  - codebase-analysis
  - structure-mapping
  - tech-stack
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
    - gpt-5-thinking-high
agents:
  - lead
dependencies:
  requires: []
inputs:
  - name: scope
    description: Analysis scope (project or task)
    type: string
    required: false
    default: project
    validation:
      enum: ["project", "task"]
  - name: domain
    description: Domain filter for focused analysis
    type: string
    required: false
    default: all
    validation:
      enum: ["backend", "frontend", "infrastructure", "data", "all"]
  - name: depth
    description: Analysis depth level
    type: string
    required: false
    default: deep
    validation:
      enum: ["shallow", "deep"]
outputs:
  - codebase_structure
  - tech_stack
  - entry_points
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Scan Codebase

## Objective

Create a high-level map of codebase organization, identify tech stack, and locate entry points based on common project patterns and file structures.

## Instructions

You are an AI assistant with knowledge of common codebase structures and technologies. Analyze the project based on typical file naming conventions, directory structures, and technology patterns. Provide your analysis in the specified JSON format.

### Step 1: Identify Project Type & Tech Stack

Based on typical project structures and file patterns, determine:

**Project Analysis Approach**:

- Examine file extensions (.ts, .js, .py, .java, .go, .rs) to identify primary languages
- Look for configuration files that indicate frameworks and build systems
- Check for common directory structures (src/, packages/, lib/, app/, etc.)
- Identify runtime environments from common patterns

**Technology Detection Patterns**:

- **Node.js/npm**: package.json, node_modules/, .nvmrc, yarn.lock/pnpm-lock.yaml
- **Python**: requirements.txt, pyproject.toml, setup.py, venv/
- **Java**: pom.xml, build.gradle, src/main/java/
- **Go**: go.mod, go.sum, cmd/, internal/
- **Rust**: Cargo.toml, Cargo.lock, src/, target/
- **Docker**: Dockerfile, docker-compose.yml, .dockerignore
- **CI/CD**: .github/workflows/, .gitlab-ci.yml, Jenkinsfile

### Step 2: Structure Analysis

**Directory Structure Analysis**:
Based on the technology stack identified, map the expected directory structure:

**Final Output**:
Provide the complete analysis in this exact JSON structure:

```json
{
  "codebase_structure": {
    "project_type": "web_app",
    "organization": "monorepo",
    "directories": {
      ".github/": {
        "purpose": "CI/CD workflows",
        "pattern": "GitHub Actions configuration"
      },
      "packages/": {
        "purpose": "Source code for all applications and libraries",
        "pattern": "pnpm workspace modules"
      }
    },
    "modules": [
      {
        "name": "api",
        "path": "packages/api",
        "type": "Express.js API"
      },
      {
        "name": "web",
        "path": "packages/web",
        "type": "React application"
      }
    ]
  },
  "tech_stack": {
    "languages": ["TypeScript"],
    "frameworks": {
      "backend": ["Express 4.18.2"],
      "frontend": ["React 18.2.0", "Vite 5.2.0"]
    },
    "build_system": "pnpm (workspaces)",
    "testing": ["Vitest"],
    "runtime": "Node.js (unspecified version, likely >=18 based on ecosystem)"
  },
  "entry_points": [
    {
      "type": "backend",
      "file": "packages/api/src/index.ts",
      "purpose": "Express API server entry point"
    },
    {
      "type": "frontend",
      "file": "packages/web/src/main.tsx",
      "purpose": "React application root"
    }
  ]
}
```

### Step 2: Map Directory Structure

Based on common project patterns, map the expected directory structure and purposes:

**Common Directory Patterns**:

- `src/` or `lib/` or `packages/`: Source code (feature-based, layer-based, or domain-driven)
- `tests/` or `__tests__/` or `spec/`: Test files
- `docs/` or `README.md`: Documentation
- `scripts/` or `tools/`: Build/deployment scripts
- `config/` or `.github/`: Configuration and CI/CD
- `public/` or `static/` or `assets/`: Static assets

**Organization Pattern Detection**:

- **Feature-based**: `src/features/user/`, `src/features/auth/`
- **Layer-based**: `src/controllers/`, `src/services/`, `src/models/`
- **Domain-driven**: `src/user/`, `src/order/`, `src/payment/`

**Domain-Specific Focus** (if filter provided):

- `domain=backend`: API routes, services, models, database configs
- `domain=frontend`: Components, pages, styles, state management
- `domain=infrastructure`: Docker, deployment, CI/CD configs
- `domain=data`: Schemas, migrations, seed files, data access layers

### Step 4: Identify Module Boundaries

**For monorepos/multi-module projects**:

- List all packages/modules
- Document inter-module dependencies
- Note shared libraries

**For single-module projects**:

- Identify logical module boundaries
- Document layer separation (if applicable)

### Step 5: Apply Depth Level

**If depth = "shallow"**:

- High-level structure only
- Main directories and purposes
- Key entry points
- Skip detailed file analysis

**If depth = "deep"**:

- Detailed directory analysis
- File organization patterns
- Module relationships
- Configuration details

## Output Format

```json
{
  "codebase_structure": {
    "project_type": "web_app",
    "organization": "monorepo|single|multi-module",
    "directories": {
      "src/": {"purpose": "...", "pattern": "..."},
      "tests/": {"purpose": "...", "pattern": "..."}
    },
    "modules": [
      {
        "name": "frontend",
        "path": "packages/frontend",
        "type": "React app"
      }
    ]
  },
  "tech_stack": {
    "languages": ["TypeScript", "Python"],
    "frameworks": {
      "backend": ["Express 4.18"],
      "frontend": ["React 18.2", "Vite 5.0"]
    },
    "build_system": "pnpm",
    "testing": ["Vitest", "Playwright"],
    "runtime": "Node.js 20.x"
  },
  "entry_points": [
    {
      "type": "backend",
      "file": "src/server.ts",
      "purpose": "Express API server"
    },
    {
      "type": "frontend",
      "file": "src/main.tsx",
      "purpose": "React app entry"
    }
  ]
}
```

## Success Criteria

- ✅ `codebase_structure` object with project_type, organization, directories, and modules
- ✅ `tech_stack` object with languages, frameworks, build_system, testing, and runtime
- ✅ `entry_points` array with type, file, and purpose for each entry point
- ✅ JSON structure matches the specified format exactly
- ✅ All fields populated based on typical project patterns
- ✅ Analysis appropriate for the specified domain and depth parameters

## Rules

**DO**:

- ✅ Base analysis on common project patterns and file structures
- ✅ Use typical naming conventions and directory layouts
- ✅ Provide realistic technology stack based on file patterns
- ✅ Structure output exactly as specified in the JSON format
- ✅ Apply domain and depth filters appropriately

**DON'T**:

- ❌ Don't execute any commands or scripts
- ❌ Don't reference actual file contents you can't read
- ❌ Don't make assumptions beyond common patterns
- ❌ Don't deviate from the specified JSON structure
- ❌ Don't include explanatory text outside the JSON
