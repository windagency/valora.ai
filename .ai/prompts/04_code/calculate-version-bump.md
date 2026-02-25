---
id: code.calculate-version-bump
version: 1.0.0
category: code
experimental: true
name: Calculate Version Bump
description: Determine semantic version bump based on commit type and breaking changes
tags:
  - semver
  - versioning
  - release-management
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-change-scope
inputs:
  - name: change_type
    description: Commit type (feat, fix, etc.)
    type: string
    required: true
  - name: breaking_changes
    description: Whether breaking changes detected
    type: boolean
    required: true
  - name: version_bump_arg
    description: User-specified version bump (auto, major, minor, patch)
    type: string
    required: false
outputs:
  - version_bump_type
  - current_version
  - next_version
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Calculate Version Bump

## Objective

Determine the appropriate semantic version bump based on change type and breaking changes.

## Instructions

### Step 1: Read Current Version

Check these locations for current version:

1. **package.json** (Node.js):
   ```json
   { "version": "1.2.3" }
   ```

2. **pyproject.toml** (Python):
   ```toml
   [project]
   version = "1.2.3"
   ```

3. **Cargo.toml** (Rust):
   ```toml
   [package]
   version = "1.2.3"
   ```

4. **Git tags**:
   ```bash
   git describe --tags --abbrev=0
   ```
   Extract version from tag (e.g., `v1.2.3` → `1.2.3`)

**Fallback**: If no version found, use `0.1.0` as starting point.

### Step 2: Parse Version

Parse semantic version:

```typescript
const version_regex = /^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(\+[\w.]+)?$/;
const [_, major, minor, patch, prerelease, buildmeta] = version.match(version_regex);

current_version = {
  major: parseInt(major),
  minor: parseInt(minor),
  patch: parseInt(patch),
  prerelease: prerelease || null,
  buildmeta: buildmeta || null
};
```

### Step 3: Determine Bump Type

**Decision logic**:

```typescript
let bump_type: "major" | "minor" | "patch" | "none";

// User override takes precedence
if (version_bump_arg && version_bump_arg !== "auto") {
  bump_type = version_bump_arg;
}
// Auto-detect based on change type
else if (version_bump_arg === "auto" || !version_bump_arg) {
  if (breaking_changes) {
    bump_type = "major";
  }
  else if (change_type === "feat") {
    bump_type = "minor";
  }
  else if (["fix", "perf", "refactor"].includes(change_type)) {
    bump_type = "patch";
  }
  else if (["docs", "style", "chore", "test", "build", "ci"].includes(change_type)) {
    bump_type = "none"; // No version bump for these
  }
}
```

**Semantic Versioning Rules**:

- **MAJOR** (x.0.0): Breaking changes - incompatible API changes
- **MINOR** (0.x.0): New features - backwards-compatible additions
- **PATCH** (0.0.x): Bug fixes - backwards-compatible fixes

**Special cases**:

- **Pre-1.0.0**: Breaking changes bump MINOR instead of MAJOR (0.x.0)
- **Pre-release**: Clear pre-release suffix on bump
- **Build metadata**: Preserve or remove based on project convention

### Step 4: Calculate Next Version

```typescript
next_version = { ...current_version };

// Remove pre-release/build metadata on bump
next_version.prerelease = null;
next_version.buildmeta = null;

if (bump_type === "major") {
  next_version.major += 1;
  next_version.minor = 0;
  next_version.patch = 0;
}
else if (bump_type === "minor") {
  next_version.minor += 1;
  next_version.patch = 0;
}
else if (bump_type === "patch") {
  next_version.patch += 1;
}
// else bump_type === "none": no change

// Special case: Pre-1.0.0 with breaking changes
if (current_version.major === 0 && bump_type === "major") {
  next_version.major = 0;  // Stay at 0
  next_version.minor += 1; // Bump minor instead
  next_version.patch = 0;
}
```

### Step 5: Format Version String

```typescript
function formatVersion(v) {
  let version = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) version += v.prerelease;
  if (v.buildmeta) version += v.buildmeta;
  return version;
}
```

### Step 6: Validate Version

Ensure version is valid:

1. **Forward progress**: next_version > current_version
2. **No downgrade**: Never decrease version numbers
3. **Semver compliance**: Matches `major.minor.patch` format

## Output Format

```json
{
  "version_bump_type": "minor",
  "current_version": "1.2.3",
  "next_version": "1.3.0",
  "version_source": "package.json",
  "bump_reason": "New feature (feat) without breaking changes",
  "version_breakdown": {
    "current": {
      "major": 1,
      "minor": 2,
      "patch": 3
    },
    "next": {
      "major": 1,
      "minor": 3,
      "patch": 0
    }
  }
}
```

**No version bump**:

```json
{
  "version_bump_type": "none",
  "current_version": "1.2.3",
  "next_version": "1.2.3",
  "version_source": "package.json",
  "bump_reason": "Documentation change (docs) does not affect version"
}
```

**Major version bump**:

```json
{
  "version_bump_type": "major",
  "current_version": "1.2.3",
  "next_version": "2.0.0",
  "version_source": "package.json",
  "bump_reason": "Breaking changes detected",
  "breaking_change_summary": "API endpoint signatures changed"
}
```

## Success Criteria

- ✅ Current version located and parsed
- ✅ Bump type determined correctly
- ✅ Next version calculated following semver
- ✅ Version validation passed
- ✅ Rationale provided

## Rules

**DO**:
- ✅ Follow semantic versioning strictly
- ✅ Bump MAJOR for breaking changes
- ✅ Bump MINOR for new features
- ✅ Bump PATCH for bug fixes
- ✅ Handle pre-1.0.0 versions specially

**DON'T**:
- ❌ Downgrade version numbers
- ❌ Skip version numbers
- ❌ Bump for docs/style/chore changes
- ❌ Ignore breaking changes in version bump

