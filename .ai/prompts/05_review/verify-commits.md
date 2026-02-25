---
id: review.verify-commits
version: 1.0.0
category: review
experimental: true
name: Verify Commits
description: Post-commit verification and comprehensive summary
tags:
  - verification
  - validation
  - commit-summary
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
    - code.stage-and-commit
inputs:
  - name: commits_created
    description: Number of commits created
    type: number
    required: true
  - name: commit_hashes
    description: Array of commit hashes
    type: array
    required: true
  - name: tag_created
    description: Whether version tag was created
    type: boolean
    required: false
outputs:
  - verification_status
  - commit_log
  - final_summary
tokens:
  avg: 2500
  max: 5000
  min: 1200
---

# Verify Commits

## Objective

Verify that commits were created successfully, validate format compliance, and provide comprehensive summary.

## Instructions

### Step 1: Verify Each Commit Exists

For each commit hash:

```bash
git show <hash> --stat
```

**Extract**:
- Commit hash (short and full)
- Author
- Date
- Subject line
- Body
- Files changed
- Insertions/deletions

**Verify**:
- Commit exists
- Hash matches expected
- Files match intended

### Step 2: Validate Commit Messages

For each commit, validate format:

**Check 1: Conventional Commits compliance**

```regex
^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+$
```

**Check 2: Subject line length**
- Warning if > 72 characters
- Error if > 100 characters

**Check 3: Breaking change consistency**
- If `!` in subject, verify `BREAKING CHANGE:` in footer
- If `BREAKING CHANGE:` in footer, suggest `!` in subject

**Check 4: Overall structure**
- Subject exists and non-empty
- Blank line between subject and body (if body exists)
- Blank line between body and footer (if footer exists)
- No trailing whitespace

### Step 3: Generate Commit Log

Create formatted commit log:

```bash
git log -${commits_created} --oneline
```

**Format**:
```plaintext
a3f8c2e feat(auth): implement OAuth2 refresh token rotation
9d4b1f7 test(auth): add OAuth2 refresh token tests
```

**Detailed log**:
```bash
git log -${commits_created} --stat
```

### Step 4: Verify Version Management (If Applicable)

If version bump and tagging enabled:

**Check tag**:
```bash
git tag -l "v${version}"
git show "v${version}"
```

**Verify**:
- Tag exists
- Tag points to correct commit
- Tag annotation includes release notes

**Check version files**:
- Verify package.json/pyproject.toml/Cargo.toml updated (if applicable)
- Version matches tag

### Step 5: Verify Changelog Updated (If Applicable)

If changelog update enabled:

```bash
git diff HEAD~1 CHANGELOG.md
```

**Verify**:
- CHANGELOG.md modified
- New version entry added
- Entries match commits
- Comparison link added

### Step 6: Calculate Statistics

Aggregate statistics:

```typescript
const stats = {
  commits_created: commit_hashes.length,
  total_files_changed: sum(commits.map(c => c.files_changed)),
  total_insertions: sum(commits.map(c => c.insertions)),
  total_deletions: sum(commits.map(c => c.deletions)),
  version_bumped: version_bump_enabled,
  tag_created: tag_created,
  changelog_updated: changelog_updated
};
```

### Step 7: Generate Comprehensive Summary

Create user-friendly summary:

```plaintext
✅ Successfully created ${commits_created} commit(s):

${commit_log_with_stats}

📦 Version Management:
${version_summary}

📝 Documentation:
${changelog_summary}

🔐 Security:
${signing_summary}

🎫 Issue Tracking:
${issue_links}

💡 Quality Assessment:
${quality_summary}

📋 Next Steps:
${recommended_actions}
```

### Step 8: Provide Next Steps

Recommend next actions:

**Standard next steps**:
1. Review commits: `git log --oneline -${n}`
2. Review changes: `git show HEAD`
3. Run tests: `npm test` or equivalent
4. Push changes: `git push origin <branch>`

**If tagged**:
5. Review tag: `git show ${tag_name}`
6. Push with tags: `git push origin <branch> --follow-tags`

**If changelog updated**:
7. Review changelog: `head -50 CHANGELOG.md`

**If breaking changes**:
8. Create migration guide
9. Notify stakeholders
10. Plan deployment strategy

## Output Format

**Success**:

```json
{
  "verification_status": "success",
  "commit_log": "a3f8c2e feat(auth): implement OAuth2 refresh token rotation\n9d4b1f7 test(auth): add OAuth2 refresh token tests",
  "commits_verified": [
    {
      "hash": "a3f8c2e",
      "subject": "feat(auth): implement OAuth2 refresh token rotation",
      "author": "John Doe <john@example.com>",
      "date": "2025-11-14T10:29:00Z",
      "files_changed": 2,
      "insertions": 145,
      "deletions": 23,
      "validation": {
        "format_valid": true,
        "subject_length_ok": true,
        "structure_valid": true
      }
    },
    {
      "hash": "9d4b1f7",
      "subject": "test(auth): add OAuth2 refresh token tests",
      "author": "John Doe <john@example.com>",
      "date": "2025-11-14T10:30:00Z",
      "files_changed": 1,
      "insertions": 120,
      "deletions": 0,
      "validation": {
        "format_valid": true,
        "subject_length_ok": true,
        "structure_valid": true
      }
    }
  ],
  "final_summary": {
    "commits_created": 2,
    "total_files_changed": 3,
    "total_insertions": 265,
    "total_deletions": 23,
    "version_bumped": true,
    "next_version": "1.3.0",
    "tag_created": true,
    "tag_name": "v1.3.0",
    "changelog_updated": true,
    "commits_signed": false,
    "quality_score": 8.5,
    "issues_linked": ["PROJ-123"],
    "breaking_changes": false
  },
  "next_steps": [
    "Review commits: git log --oneline -2",
    "Review changelog: head -50 CHANGELOG.md",
    "Run tests: npm test",
    "Push changes: git push origin feature/oauth2 --follow-tags"
  ],
  "display_summary": "✅ Successfully created 2 commits:\n\na3f8c2e feat(auth): implement OAuth2 refresh token rotation\n- 2 files changed, 145 insertions(+), 23 deletions(-)\n\n9d4b1f7 test(auth): add OAuth2 refresh token tests\n- 1 file changed, 120 insertions(+), 0 deletions(-)\n\n📦 Version: 1.2.3 → 1.3.0 (minor bump)\n🏷️  Tagged: v1.3.0\n📝 Changelog: Updated CHANGELOG.md\n🎫 Linked: PROJ-123\n\n💡 Quality Score: 8.5/10\n\nNext steps:\n1. Run tests: npm test\n2. Review commits: git log --oneline -2\n3. Push changes: git push origin feature/oauth2 --follow-tags"
}
```

**With warnings**:

```json
{
  "verification_status": "success_with_warnings",
  "commit_log": "...",
  "commits_verified": [...],
  "warnings": [
    {
      "type": "subject_length",
      "commit": "a3f8c2e",
      "message": "Subject line is 75 characters (recommended: < 72)",
      "severity": "low"
    },
    {
      "type": "no_tests",
      "commit": "a3f8c2e",
      "message": "New feature without tests",
      "severity": "medium"
    }
  ],
  "final_summary": {...},
  "next_steps": [...]
}
```

**Failure**:

```json
{
  "verification_status": "failed",
  "commit_log": null,
  "error": {
    "type": "commit_not_found",
    "commit_hash": "a3f8c2e",
    "message": "Commit a3f8c2e not found in repository"
  },
  "commits_verified": [],
  "final_summary": null
}
```

## Success Criteria

- ✅ All commits exist and verified
- ✅ Commit messages validated
- ✅ Commit log generated
- ✅ Statistics calculated
- ✅ Comprehensive summary provided
- ✅ Next steps recommended

## Rules

**DO**:
- ✅ Verify each commit individually
- ✅ Validate message format
- ✅ Provide detailed statistics
- ✅ Recommend actionable next steps
- ✅ Highlight warnings and issues

**DON'T**:
- ❌ Skip validation checks
- ❌ Ignore format violations
- ❌ Provide vague summaries
- ❌ Miss important warnings
- ❌ Omit next steps

## Display Format

Present summary in user-friendly format:

```plaintext
✅ Successfully created 2 commits:

a3f8c2e feat(auth): implement OAuth2 refresh token rotation
- src/auth/oauth.ts | 95 ++++++++++++++++++++++++
- src/auth/tokens.ts | 50 +++++++++++--
- 2 files changed, 145 insertions(+), 23 deletions(-)

9d4b1f7 test(auth): add OAuth2 refresh token tests
- tests/auth/oauth.test.ts | 120 ++++++++++++++++++++++++++++++
- 1 file changed, 120 insertions(+), 0 deletions(-)

📦 Version: 1.2.3 → 1.3.0 (minor bump)
🏷️  Tagged: v1.3.0
📝 Changelog: Updated CHANGELOG.md with release notes
🎫 Linked: PROJ-123

💡 Quality Score: 8.5/10
⚠️  Recommendations Applied:
- Added security implications to commit body
- Referenced migration guide

Next steps:
1. Run tests: npm test
2. Review commits: git log --oneline -2
3. Review changelog: head -50 CHANGELOG.md
4. Push changes: git push origin feature/oauth2 --follow-tags
5. Or continue implementation and commit again
```

