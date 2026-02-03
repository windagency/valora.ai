---
id: code.generate-pr-description
version: 1.0.0
category: code
experimental: true
name: Generate PR Description
description: Generate comprehensive pull request description with all relevant sections
tags:
  - pr-generation
  - documentation
  - description-generation
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.analyze-commits-for-pr
    - context.analyze-codebase-changes
inputs:
  - name: template_content
    description: PR template content if available
    type: string
    required: false
  - name: change_summary
    description: Summary of changes
    type: object
    required: true
  - name: commit_messages
    description: All commit messages
    type: array
    required: true
  - name: affected_files
    description: Files changed
    type: object
    required: true
  - name: breaking_changes
    description: Breaking changes detected
    type: array
    required: true
  - name: related_issues
    description: Related issues/tickets
    type: array
    required: false
  - name: impact_areas
    description: Functional areas impacted
    type: object
    required: true
  - name: test_coverage_delta
    description: Test coverage changes
    type: object
    required: true
  - name: complexity_metrics
    description: Change complexity
    type: object
    required: true
outputs:
  - pr_description
  - description_sections
tokens:
  avg: 4000
  max: 8000
  min: 2000
---

# Generate PR Description

## Objective

Generate a comprehensive, well-structured pull request description that provides all necessary context for reviewers.

## Instructions

### Step 1: Determine Structure

If `template_content` is provided:

- Use template sections as base structure
- Fill in placeholders
- Preserve checklist items
- Follow template order

Otherwise, use standard structure (below).

### Step 2: Generate Standard Sections

#### Section 1: Summary

**Purpose**: High-level overview (2-4 sentences)

**Content**:

- What this PR does
- Why it's needed
- Key changes at a glance

**Example**:

```markdown
## Summary

This PR adds OAuth2 authentication support to replace the legacy session-based auth. It includes token management, refresh logic, and support for multiple OAuth providers (Google, GitHub, Microsoft). This change improves security and enables SSO integration.
```

---

#### Section 2: Changes

**Purpose**: Bullet list of specific changes

**Content**:

- Extract from `change_summary.grouped_changes`
- Group by type (feat, fix, refactor, etc.)
- Be specific but concise
- Use action verbs

**Example**:

```markdown
## Changes

**Features**:
- Added OAuth2 authentication flow
- Implemented token refresh mechanism
- Added support for Google, GitHub, Microsoft providers

**Bug Fixes**:
- Fixed login redirect loop
- Resolved token expiry edge case

**Documentation**:
- Updated API documentation for `/auth` endpoints
- Added OAuth setup guide
```

---

#### Section 3: Motivation

**Purpose**: Explain why this change is needed

**Content**:

- Extract from commit bodies
- Reference related issues
- Explain problem being solved
- Describe alternative approaches considered (if applicable)

**Example**:

```markdown
## Motivation

The current session-based authentication has several limitations:
- No SSO support for enterprise customers
- Session management is complex and error-prone
- Security concerns with session fixation

OAuth2 provides:
- Industry-standard authentication
- Built-in SSO capabilities
- Better security with short-lived tokens

Closes #456
```

---

#### Section 4: Breaking Changes (if applicable)

**Purpose**: Document API/behavior changes

**Content**:

- List each breaking change from `breaking_changes`
- Explain impact
- Provide migration guide
- Include before/after examples

**Example**:

```markdown
## ⚠️ Breaking Changes

### Changed `/auth/login` endpoint signature

**Before**:
\`\`\`json
POST /auth/login
{
  "username": "user",
  "password": "pass"
}
\`\`\`

**After**:
\`\`\`json
POST /auth/login
{
  "provider": "google",
  "code": "oauth_code"
}
\`\`\`

**Migration**: Update all client calls to use OAuth flow instead of username/password.

### Removed `/auth/session` endpoint

This endpoint is no longer needed with token-based auth. Use `/auth/token/refresh` instead.
```

---

#### Section 5: Testing

**Purpose**: Describe how changes were validated

**Content**:

- Test coverage from `test_coverage_delta`
- Manual testing performed
- Test scenarios covered

**Example**:

```markdown
## Testing

**Unit Tests**:
- Added 15 new unit tests for OAuth flow
- Added 5 tests for token refresh logic
- All existing auth tests updated and passing

**Integration Tests**:
- Added e2e tests for Google OAuth flow
- Added tests for token expiry scenarios

**Manual Testing**:
- Tested OAuth flow with Google, GitHub, Microsoft
- Verified token refresh works correctly
- Tested error handling for invalid tokens
- Verified backward compatibility with existing sessions (deprecated)

**Coverage**: Test coverage increased from 75% to 82% in auth module.
```

---

#### Section 6: Impact & Areas Affected

**Purpose**: Help reviewers understand scope

**Content**:

- Impact areas from `impact_areas`
- Complexity metrics
- Affected services/components

**Example**:

```markdown
## Impact

**Affected Areas**:
- 🔴 Backend/Authentication (8 files, 234 lines)
- 🟡 API Endpoints (3 files, 156 lines)
- 🟢 Documentation (2 files, 45 lines)
- 🟢 Tests (2 files, 89 lines)

**Complexity**: Medium (Score: 65/100)
**Estimated Review Time**: 2-3 hours

**No Database Migrations**
**No Infrastructure Changes**
```

---

#### Section 7: Related Issues & Links

**Purpose**: Connect PR to broader context

**Content**:

- Closing issues from `related_issues`
- Related/referenced issues
- External links (docs, RFCs, etc.)

**Example**:

```markdown
## Related Issues

**Closes**:
- #456 - Add OAuth2 authentication support
- #457 - Support SSO for enterprise

**Related**:
- #789 - Security audit findings (addresses recommendations)
- #321 - User authentication redesign (part of broader effort)

**References**:
- [OAuth 2.0 Spec](https://oauth.net/2/)
- [Internal RFC: Auth Modernization](https://link-to-rfc)
```

---

#### Section 8: Screenshots / Visuals (if applicable)

**Purpose**: Show UI changes or architecture

**Content**:

- Screenshots for UI changes
- Diagrams for architecture changes
- Before/after comparisons

**Example**:

```markdown
## Screenshots

### New OAuth Login Screen

![OAuth Login](https://example.com/screenshot.png)

### OAuth Flow Diagram

\`\`\`mermaid
sequenceDiagram
    User->>App: Click "Login with Google"
    App->>OAuth: Redirect to provider
    OAuth->>User: Authenticate
    OAuth->>App: Return code
    App->>API: Exchange code for token
    API->>App: Return access token
\`\`\`
```

---

#### Section 9: Deployment Notes (if applicable)

**Purpose**: Special deployment considerations

**Content**:

- Environment variables needed
- Configuration changes
- Deployment order
- Rollback procedure

**Example**:

```markdown
## Deployment Notes

**Required Environment Variables**:
\`\`\`bash
OAUTH_GOOGLE_CLIENT_ID=xxx
OAUTH_GOOGLE_CLIENT_SECRET=yyy
OAUTH_GITHUB_CLIENT_ID=zzz
OAUTH_GITHUB_CLIENT_SECRET=aaa
\`\`\`

**Configuration Changes**:
- Update `config/auth.yaml` to enable OAuth providers
- Disable legacy session auth with `LEGACY_AUTH_ENABLED=false`

**Deployment Order**:
1. Deploy backend with OAuth support
2. Update frontend to use OAuth flow
3. Migrate existing sessions (grace period: 7 days)

**Rollback**: Set `LEGACY_AUTH_ENABLED=true` to restore session-based auth.
```

---

#### Section 10: Checklist

**Purpose**: Pre-merge verification

**Content**:

- Standard quality checks
- Template checklist items (if template used)
- Custom items based on change type

**Example**:

```markdown
## Checklist

- [x] Tests added/updated
- [x] Documentation updated
- [x] Breaking changes documented
- [x] Reviewed my own code
- [x] No linting errors
- [x] CI passing locally
- [ ] Security review requested (for security-sensitive changes)
- [ ] Performance testing completed (for performance changes)
```

---

### Step 3: Assemble Description

Combine sections in order:

1. Summary
2. Changes
3. Motivation & Related Issues (combined if related)
4. Breaking Changes (if applicable)
5. Testing
6. Impact & Areas Affected
7. Screenshots/Visuals (if applicable)
8. Deployment Notes (if applicable)
9. Checklist

**Formatting**:

- Use `##` for section headers
- Use bullet lists for changes
- Use code blocks for code/config
- Use tables for structured data
- Use emojis sparingly (🔴 🟡 🟢 ⚠️ ✅)

### Step 4: Optimize for Readability

- Add horizontal rules (`---`) between major sections
- Use collapsible sections for long content:
  ```markdown
  <details>
  <summary>Full commit list</summary>
  
  - commit 1
  - commit 2
  </details>
  ```
- Highlight important information with **bold** or `code`
- Keep paragraphs short (2-4 sentences)

## Output Format

```json
{
  "pr_description": "## Summary\n\nThis PR adds...\n\n## Changes\n\n- Added...",
  "description_sections": [
    {
      "title": "Summary",
      "content": "This PR adds OAuth2 authentication...",
      "required": true
    },
    {
      "title": "Changes",
      "content": "**Features**:\n- Added OAuth2...",
      "required": true
    },
    {
      "title": "Breaking Changes",
      "content": "### Changed /auth/login...",
      "required": false
    }
  ],
  "word_count": 542,
  "estimated_read_time": "3 minutes"
}
```

## Success Criteria

- ✅ All required sections included
- ✅ Clear and comprehensive
- ✅ Proper markdown formatting
- ✅ Relevant code examples included
- ✅ Breaking changes well-documented
- ✅ Checklist items appropriate for change type

## Notes

- Description is the primary artifact reviewers will read
- Invest time in clarity - saves review time
- Include enough detail without overwhelming
- Use visuals for complex changes
- Make it easy to scan (headers, bullets, formatting)

