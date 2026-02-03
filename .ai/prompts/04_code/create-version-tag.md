---
id: code.create-version-tag
version: 1.0.0
category: code
experimental: true
name: Create Version Tag
description: Create annotated git tag with version number after successful commit
tags:
  - git
  - tagging
  - versioning
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
  - software-engineer
dependencies:
  requires:
    - code.calculate-version-bump
    - code.stage-and-commit
inputs:
  - name: next_version
    description: Next version number from version bump calculation
    type: string
    required: true
  - name: commit_hashes
    description: Commit hashes to tag
    type: array
    required: true
outputs:
  - tag_created
  - tag_name
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Create Version Tag

## Objective

Create an annotated git tag with the calculated version number, referencing the commit(s) just created.

## Instructions

### Step 1: Format Tag Name

Format version as git tag:

```typescript
tag_name = `v${next_version}`;
// Example: "v1.3.0"
```

**Rules**:
- Prefix with `v` (standard convention)
- Use semantic version format: `vMAJOR.MINOR.PATCH`
- No additional suffixes unless pre-release

### Step 2: Check if Tag Already Exists

Verify tag doesn't already exist:

```bash
git tag -l "v${next_version}"
```

**If tag exists**:
```plaintext
❌ Tag v1.3.0 already exists

Options:
1. Use a different version number
2. Delete existing tag (if not pushed): git tag -d v1.3.0
3. Force overwrite (dangerous): git tag -f v1.3.0
```

### Step 3: Generate Tag Annotation

Create annotation message with release notes:

**Format**:
```plaintext
Release version <version>

<commit_summaries>

<optional_changelog_preview>
```

**Example**:

```plaintext
Release version 1.3.0

- feat(auth): implement OAuth2 refresh token rotation
- test(auth): add OAuth2 refresh token tests

This release adds OAuth2 refresh token support with automatic rotation
for improved security.
```

**Extended annotation with changelog**:

```plaintext
Release version 1.3.0

### ✨ Features
- **auth**: implement OAuth2 refresh token rotation
  - Add secure token rotation mechanism
  - Configurable token expiration

### 🧪 Tests
- **auth**: add OAuth2 refresh token tests
  - Integration tests for token rotation
  - Edge case coverage for expiration scenarios

### 📝 Documentation
- Update OAuth2 setup guide

For full changelog, see CHANGELOG.md
```

### Step 4: Create Annotated Tag

Use the last commit hash (most recent) as the tag target:

```bash
git tag -a "v${next_version}" "${commit_hashes[-1]}" -m "<annotation>"
```

**Example**:
```bash
git tag -a "v1.3.0" "9d4b1f7" -m "Release version 1.3.0

- feat(auth): implement OAuth2 refresh token rotation
- test(auth): add OAuth2 refresh token tests"
```

**Flags**:
- `-a` : Annotated tag (includes tagger name, email, date)
- `-m` : Annotation message
- `-s` : Sign tag with GPG (if signing enabled)

### Step 5: Verify Tag Created

Confirm tag was created:

```bash
git tag -l "v${next_version}"
```

**Show tag details**:
```bash
git show "v${next_version}"
```

**Expected output**:
```plaintext
tag v1.3.0
Tagger: John Doe <john@example.com>
Date:   Thu Nov 14 10:30:00 2025 -0800

Release version 1.3.0

- feat(auth): implement OAuth2 refresh token rotation
- test(auth): add OAuth2 refresh token tests

commit 9d4b1f7... (tag: v1.3.0)
Author: John Doe <john@example.com>
Date:   Thu Nov 14 10:29:00 2025 -0800

    test(auth): add OAuth2 refresh token tests
    ...
```

### Step 6: Provide Push Instructions

Inform user how to push tag:

```plaintext
🏷️  Tag created: v1.3.0

To push tag to remote:
  git push origin v1.3.0

To push all tags:
  git push origin --tags

To push commits with tag:
  git push origin <branch> --follow-tags
```

### Step 7: Optional - Update Version Files

If version files need updating:

**package.json**:
```bash
npm version ${next_version} --no-git-tag-version
```

**pyproject.toml**:
```bash
poetry version ${next_version}
```

**Cargo.toml**:
```bash
cargo pkgid | sed "s/.*#/version = \"${next_version}\"/"
```

**Note**: This step may require a follow-up commit to save version file changes.

## Output Format

**Success**:

```json
{
  "tag_created": true,
  "tag_name": "v1.3.0",
  "tag_annotation": "Release version 1.3.0\n\n- feat(auth): implement OAuth2 refresh token rotation\n- test(auth): add OAuth2 refresh token tests",
  "tagged_commit": "9d4b1f7",
  "tagger": {
    "name": "John Doe",
    "email": "john@example.com",
    "date": "2025-11-14T10:30:00Z"
  },
  "push_command": "git push origin main --follow-tags",
  "verification": {
    "tag_exists": true,
    "points_to_correct_commit": true
  }
}
```

**Tag already exists**:

```json
{
  "tag_created": false,
  "tag_name": "v1.3.0",
  "error": {
    "type": "tag_exists",
    "message": "Tag v1.3.0 already exists",
    "resolution": "Use different version or delete existing tag"
  }
}
```

**Failure**:

```json
{
  "tag_created": false,
  "tag_name": "v1.3.0",
  "error": {
    "type": "git_error",
    "message": "Failed to create tag: permission denied",
    "details": "git tag command failed with exit code 128"
  }
}
```

## Success Criteria

- ✅ Tag name formatted correctly (`v` prefix, semver)
- ✅ Tag doesn't already exist
- ✅ Annotation includes commit summaries
- ✅ Tag created on correct commit
- ✅ Tag verified with `git show`
- ✅ Push instructions provided

## Rules

**DO**:
- ✅ Use annotated tags (`-a` flag)
- ✅ Prefix version with `v`
- ✅ Include release notes in annotation
- ✅ Tag the most recent commit
- ✅ Verify tag creation

**DON'T**:
- ❌ Use lightweight tags (no annotation)
- ❌ Force overwrite existing tags without confirmation
- ❌ Push tags automatically (user should decide)
- ❌ Tag wrong commit
- ❌ Skip version validation

## Notes

**Tagging Strategy**:
- Tags should point to the last commit in a sequence
- For single commits, tag that commit
- For multiple commits, tag the last one (most recent)
- This ensures the tag represents the complete feature/release

**Remote Considerations**:
- Tags are NOT pushed automatically with `git push`
- Use `git push --follow-tags` to push tags with commits
- Use `git push origin <tag>` to push specific tag
- Use `git push --tags` to push all tags (use carefully)

