---
id: documentation.update-changelog
version: 1.0.0
category: documentation
experimental: true
name: Update Changelog
description: Automatically update CHANGELOG.md with structured release notes from commits
tags:
  - changelog
  - release-notes
  - documentation
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - context.use-modern-cli-tools
    - code.stage-and-commit
inputs:
  - name: commit_messages
    description: Array of commit messages
    type: array
    required: true
  - name: version
    description: Version number for this release
    type: string
    required: true
  - name: change_type
    description: Primary change type
    type: string
    required: true
outputs:
  - changelog_updated
  - changelog_entry
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Update Changelog

## Objective

Automatically update CHANGELOG.md with structured release notes based on conventional commits.

## Instructions

### Step 1: Locate or Create CHANGELOG.md

Check for existing changelog:

```bash
# Check root directory
[ -f CHANGELOG.md ]

# Check docs directory
[ -f docs/CHANGELOG.md ]
```

**If not found**, create new CHANGELOG.md:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

```

### Step 2: Read Existing Changelog

Load current CHANGELOG.md content:

```typescript
const changelog = readFile('CHANGELOG.md');
```

### Step 3: Parse Commits by Type

Group commits by conventional commit type:

```typescript
const grouped = {
  features: [],        // feat
  fixes: [],           // fix
  performance: [],     // perf
  refactors: [],       // refactor
  documentation: [],   // docs
  styles: [],          // style
  tests: [],           // test
  build: [],           // build
  ci: [],              // ci
  chores: [],          // chore
  breaking: []         // any with BREAKING CHANGE
};

for (const commit of commit_messages) {
  // Parse commit type
  const type = extractType(commit.subject);
  
  // Check for breaking changes
  if (commit.footer.includes('BREAKING CHANGE') || commit.subject.includes('!')) {
    grouped.breaking.push(commit);
  }
  
  // Group by type
  switch(type) {
    case 'feat': grouped.features.push(commit); break;
    case 'fix': grouped.fixes.push(commit); break;
    case 'perf': grouped.performance.push(commit); break;
    // ... etc
  }
}
```

### Step 4: Generate Changelog Entry

Format entry following Keep a Changelog structure:

**Template**:

```markdown
## [${version}] - ${date}

### ⚠️ BREAKING CHANGES
${breaking_changes}

### ✨ Features
${features}

### 🐛 Bug Fixes
${fixes}

### ⚡ Performance
${performance}

### ♻️ Refactoring
${refactors}

### 📝 Documentation
${documentation}

### 🧪 Tests
${tests}

### 🏗️ Build System
${build}

### 👷 CI/CD
${ci}

[${version}]: ${compare_url}
```

**For each commit**, format as:

```markdown
- **${scope}**: ${description} ([#${issue}](${issue_url}))
```

**Example entry**:

```markdown
## [1.3.0] - 2025-11-14

### ✨ Features

- **auth**: implement OAuth2 refresh token rotation ([#456](https://github.com/org/repo/issues/456))
  - Add secure token rotation mechanism with configurable expiration
  - Tokens are automatically rotated on use
  - Expired tokens are invalidated
- **payments**: add Stripe webhook handlers ([#457](https://github.com/org/repo/issues/457))

### 🐛 Bug Fixes

- **api**: resolve race condition in cache ([#458](https://github.com/org/repo/issues/458))

### 🧪 Tests

- **auth**: add OAuth2 refresh token tests
  - Integration tests for token rotation
  - Edge case coverage for expiration scenarios

[1.3.0]: https://github.com/org/repo/compare/v1.2.3...v1.3.0
```

**With breaking changes**:

```markdown
## [2.0.0] - 2025-11-14

### ⚠️ BREAKING CHANGES

- **api**: redesign authentication endpoints
  - `/api/login` endpoint now requires JWT tokens instead of session cookies
  - Session-based authentication is no longer supported
  - **Migration guide**: See [docs/migration-v2.0.md](docs/migration-v2.0.md)
  - All API consumers must update their authentication implementation

### ✨ Features

- **api**: add JWT token authentication
- **api**: add token refresh endpoint
- **api**: add token revocation endpoint

[2.0.0]: https://github.com/org/repo/compare/v1.5.2...v2.0.0
```

### Step 5: Insert Entry in Changelog

Find insertion point and insert new entry:

**Strategy**:

1. **After "## [Unreleased]" section** (if exists)
2. **Before next version entry** (or at end if first version)
3. **Maintain reverse chronological order** (newest first)

**Regex patterns**:

```typescript
// Find unreleased section
const unreleasedPattern = /## \[Unreleased\][\s\S]*?(?=## \[|\z)/;

// Find insertion point (after unreleased, before next version)
const insertionPoint = changelog.search(/## \[\d+\.\d+\.\d+\]/);
```

**Insert logic**:

```typescript
let updated_changelog;

if (has_unreleased_section) {
  // Insert after unreleased section
  updated_changelog = changelog.replace(
    /(## \[Unreleased\][\s\S]*?)(\n## \[|$)/,
    `$1\n\n${new_entry}$2`
  );
} else {
  // Insert at beginning (after header)
  updated_changelog = changelog.replace(
    /(# Changelog[\s\S]*?\n\n)/,
    `$1${new_entry}\n\n`
  );
}
```

### Step 6: Update Version Comparison Links

Add comparison link at bottom:

**Format**:
```markdown
[${version}]: ${repo_url}/compare/v${prev_version}...v${version}
```

**Extract repo URL**:
```bash
git remote get-url origin
```

**Example**:
```markdown
[1.3.0]: https://github.com/owner/repo/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/owner/repo/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/owner/repo/compare/v1.2.1...v1.2.2
```

### Step 7: Write Updated Changelog

Save updated changelog:

```typescript
writeFile('CHANGELOG.md', updated_changelog);
```

### Step 8: Stage Changelog File

Add changelog to git staging:

```bash
git add CHANGELOG.md
```

**Option 1**: Amend to last commit
```bash
git commit --amend --no-edit
```

**Option 2**: Create separate commit
```bash
git commit -m "docs: update CHANGELOG for v${version}"
```

## Output Format

**Success**:

```json
{
  "changelog_updated": true,
  "changelog_entry": "## [1.3.0] - 2025-11-14\n\n### ✨ Features\n- **auth**: implement OAuth2 refresh token rotation\n...",
  "changelog_file": "CHANGELOG.md",
  "changes": {
    "features_added": 2,
    "fixes_added": 1,
    "breaking_changes": 0,
    "total_entries": 3
  },
  "version_link_added": true,
  "committed": true,
  "commit_strategy": "amend"
}
```

**No changes needed**:

```json
{
  "changelog_updated": false,
  "changelog_entry": null,
  "changelog_file": "CHANGELOG.md",
  "reason": "No user-facing changes (only chores/ci/build)"
}
```

## Success Criteria

- ✅ CHANGELOG.md located or created
- ✅ Commits grouped by type
- ✅ Entry formatted following Keep a Changelog
- ✅ Breaking changes prominently displayed
- ✅ Entry inserted in correct position
- ✅ Version comparison link added
- ✅ File saved and staged

## Rules

**DO**:
- ✅ Follow Keep a Changelog format strictly
- ✅ Group commits by type with emoji headers
- ✅ Highlight breaking changes at top
- ✅ Include issue/PR links when available
- ✅ Maintain reverse chronological order

**DON'T**:
- ❌ Include internal commits (chores, CI) in user-facing changelog
- ❌ Duplicate entries
- ❌ Break existing links
- ❌ Change previous entries
- ❌ Use inconsistent formatting

## Notes

**Keep a Changelog Categories**:
- **Added** for new features (feat)
- **Changed** for changes in existing functionality (refactor, perf)
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features (breaking)
- **Fixed** for any bug fixes (fix)
- **Security** for vulnerability fixes

**Emoji conventions** (optional):
- ✨ Features
- 🐛 Bug Fixes
- ⚡ Performance
- ♻️ Refactoring
- 📝 Documentation
- 🧪 Tests
- 🏗️ Build System
- 👷 CI/CD
- ⚠️ Breaking Changes

