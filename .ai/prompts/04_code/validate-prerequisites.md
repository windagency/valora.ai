---
id: code.validate-prerequisites
version: 1.0.0
category: code
experimental: true
name: Validate Implementation Prerequisites
description: Verify environment readiness before code execution
tags:
  - validation
  - prerequisites
  - environment-check
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - platform-engineer
  - secops-engineer
dependencies:
  requires:
    - context.load-implementation-context
inputs:
  - name: plan_summary
    description: Summary from load-implementation-context
    type: object
    required: true
  - name: dependencies
    description: Dependencies from load-implementation-context
    type: object
    required: true
outputs:
  - prerequisites_met
  - missing_dependencies
  - environment_ready
  - blockers
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Validate Implementation Prerequisites

## Objective

Verify that all prerequisites are met before starting implementation: dependencies installed, environment configured, and no blockers present.

## Instructions

### Step 1: Check Technical Dependencies

For each dependency in `dependencies.technical`:

**Actions**:
1. Check if package/library exists in project
2. Verify version compatibility
3. Check installation status

**Check methods**:
- Node.js: Check `package.json` and `node_modules/`
- Python: Check `requirements.txt`, `pyproject.toml`, or `pip list`
- System: Use `which <tool>` or similar

**Output per dependency**:
```json
{
  "name": "nodemailer",
  "required_version": "^6.9.0",
  "status": "installed|missing|version_mismatch",
  "installed_version": "6.9.7",
  "resolution": null
}
```

### Step 2: Check Environment Configuration

Verify required environment setup:

**Check**:
- [ ] Environment variables defined (if required)
- [ ] Configuration files present (if required)
- [ ] Feature flags configured (if applicable)
- [ ] API keys/credentials available (if needed)

**Output**:
```json
{
  "environment": {
    "env_vars_ready": true,
    "missing_env_vars": [],
    "config_files_ready": true,
    "missing_configs": [],
    "credentials_ready": true
  }
}
```

### Step 3: Validate Codebase State

**Check**:
- [ ] Git status is clean or has expected uncommitted changes
- [ ] On correct branch (or can create implementation branch)
- [ ] No merge conflicts
- [ ] Base branch is up to date (optional check)

**Output**:
```json
{
  "codebase_state": {
    "git_status": "clean|dirty",
    "uncommitted_changes": 0,
    "current_branch": "feature/email-verification",
    "conflicts": false,
    "ready": true
  }
}
```

### Step 4: Check Tool Availability

Verify development tools are functional:

**Check**:
- [ ] Linter available and configured
- [ ] Type checker available (if TypeScript/typed language)
- [ ] Test runner available and functional
- [ ] Build tools available (if needed)

**Methods**:
- Check for config files (`.eslintrc`, `tsconfig.json`, etc.)
- Verify tool executables exist
- Check tool versions if critical

**Output**:
```json
{
  "tools": {
    "linter": {"available": true, "tool": "eslint", "version": "8.50.0"},
    "type_checker": {"available": true, "tool": "tsc", "version": "5.2.0"},
    "test_runner": {"available": true, "tool": "jest", "version": "29.7.0"},
    "build_tool": {"available": true, "tool": "vite", "version": "4.5.0"}
  }
}
```

### Step 5: Verify Data Dependencies

For dependencies in `dependencies.data`:

**Check**:
- [ ] Database accessible (if database changes)
- [ ] Required tables/collections exist
- [ ] Migration system available
- [ ] Backup strategy in place (for schema changes)

**Output**:
```json
{
  "data_dependencies": {
    "database_accessible": true,
    "migration_ready": true,
    "backup_available": true,
    "blockers": []
  }
}
```

### Step 6: Verify External Services

For dependencies in `dependencies.external`:

**Check**:
- [ ] Service documentation accessible
- [ ] API credentials configured (if applicable)
- [ ] Service availability (optional ping/health check)
- [ ] Rate limits understood

**Note**: Don't make actual API calls, just verify readiness

**Output**:
```json
{
  "external_services": {
    "services_ready": true,
    "credentials_configured": true,
    "documentation_available": true,
    "blockers": []
  }
}
```

### Step 7: Check Prerequisite Steps

If implementing in step-by-step mode:

**Check**:
- [ ] Previous steps completed
- [ ] Required files from previous steps exist
- [ ] No rollback of previous steps needed

**Output**:
```json
{
  "prerequisite_steps": {
    "completed_steps": [1, 2],
    "current_step": 3,
    "prerequisites_met": true,
    "blockers": []
  }
}
```

### Step 8: Identify Blockers

Aggregate all issues:

**Blocker categories**:
1. **Critical**: Must resolve before implementation
2. **Warning**: Can proceed with caution
3. **Info**: Note for awareness

**Examples**:
- Critical: Missing required dependency
- Warning: Tool version mismatch (might work)
- Info: Git working directory has uncommitted changes

**Output**:
```json
{
  "blockers": [
    {
      "category": "critical",
      "type": "missing_dependency",
      "message": "nodemailer not installed",
      "resolution": "Run: npm install nodemailer@^6.9.0"
    },
    {
      "category": "warning",
      "type": "version_mismatch",
      "message": "jest version 28.1.0 installed, 29.x recommended",
      "resolution": "Consider upgrading: npm install jest@^29.7.0"
    }
  ]
}
```

### Step 9: Determine Overall Readiness

**Decision logic**:
```
IF any critical blockers THEN
  prerequisites_met = false
  environment_ready = false
ELSE IF any warning blockers THEN
  prerequisites_met = true
  environment_ready = true (with warnings)
ELSE
  prerequisites_met = true
  environment_ready = true
END
```

**Provide resolutions**:
- For missing dependencies: Exact install commands
- For config issues: Which files to check/create
- For git issues: Suggested git commands
- For tool issues: Installation/upgrade commands

## Output Format

```json
{
  "prerequisites_met": true,
  "environment_ready": true,
  "missing_dependencies": [],
  "blockers": [
    {
      "category": "warning",
      "type": "version_mismatch",
      "message": "...",
      "resolution": "..."
    }
  ],
  "validation_summary": {
    "technical_dependencies": "ready",
    "environment": "ready",
    "codebase_state": "ready",
    "tools": "ready",
    "data_dependencies": "ready",
    "external_services": "ready",
    "prerequisite_steps": "ready"
  },
  "recommended_actions": [
    "Consider upgrading jest to version 29.x"
  ]
}
```

## Success Criteria

- ✅ All dependencies checked
- ✅ Environment configuration validated
- ✅ Codebase state verified
- ✅ Tools availability confirmed
- ✅ Blockers identified with resolutions
- ✅ Clear readiness decision provided

## Rules

**DO**:
- ✅ Check actual file/package existence
- ✅ Provide specific resolution commands
- ✅ Distinguish critical vs warning issues
- ✅ Be thorough but efficient

**DON'T**:
- ❌ Don't install dependencies automatically
- ❌ Don't modify git state
- ❌ Don't make external API calls
- ❌ Don't assume tools exist without checking
- ❌ Don't proceed if critical blockers exist

