---
id: review.validate-technical-feasibility
version: 1.0.0
category: review
experimental: true
name: Validate Technical Feasibility
description: Assess if proposed implementation approach is technically sound and achievable
tags:
  - plan-review
  - feasibility
  - validation
  - technical-assessment
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - review.load-plan-context
    - context.use-modern-cli-tools
allowed_tools:
  - codebase_search
  - grep
  - read_file
  - list_dir
inputs:
  - name: plan_structure
    description: Parsed plan structure from load-plan-context
    type: object
    required: true
  - name: complexity_assessment
    description: Complexity assessment from load-plan-context
    type: object
    required: true
outputs:
  - feasibility_score
  - technical_concerns
  - blockers_identified
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Validate Technical Feasibility

## Objective

Assess whether the proposed implementation approach is technically sound, implementable, and aligned with codebase architecture.

## Context

You have access to the codebase and the implementation plan. Verify that the plan's technical approach is feasible.

## Instructions

### Step 1: Validate Implementation Approach

Review the proposed technical approach:

#### Soundness Check

**Questions**:
- Is the proposed solution technically sound?
- Are the methods/patterns appropriate?
- Does it align with best practices?
- Are there simpler/better approaches?

**Examples of Issues**:
- ❌ "Use synchronous API calls in React render function" (blocks UI)
- ❌ "Store passwords in plaintext for debugging" (security)
- ❌ "Load entire dataset into memory" (scalability)
- ✅ "Use async/await with error handling"

**Scoring**:
- Sound approach: 0 deduction
- Suboptimal but workable: -1.0
- Technically problematic: -3.0
- Fundamentally flawed: -10.0 (blocker)

#### Architecture Alignment

**Verify**:
- Follows established codebase patterns
- Uses existing utilities/components where appropriate
- Maintains architectural boundaries
- Doesn't introduce anti-patterns

**How to Check**:
```plaintext
1. Use codebase_search to find similar implementations
2. Check if proposed patterns exist in codebase
3. Verify architectural layers are respected
4. Look for existing solutions to similar problems
```

**Scoring**:
- Well-aligned: 0 deduction
- Minor misalignment: -0.5
- Significant divergence: -2.0
- Violates architecture: -5.0 (major concern)

### Step 2: Verify Dependencies

Check all dependencies are available and compatible:

#### Technical Dependencies

**For each library/framework**:
```json
{
  "dependency": "zod",
  "version": "^3.22.0",
  "status": "available|missing|incompatible",
  "check_method": "grep package.json",
  "notes": "Already in use for form validation"
}
```

**Decision Thresholds**:
- **< 5 dependencies**: ✅ Good (minimal external footprint)
- **5-10 dependencies**: ⚠️ Acceptable (require justification for each)
- **10-15 dependencies**: 🔴 High concern (needs architectural review)
- **> 15 dependencies**: ❌ Escalate (major architectural decision required)

**Check**:
- [ ] Library exists in package.json or can be installed
- [ ] Version is compatible with existing stack
- [ ] No conflicting dependencies
- [ ] License is acceptable
- [ ] Dependency count within acceptable range

**Scoring per dependency**:
- Available and compatible: 0 deduction
- Needs installation (minor): -0.2
- Version conflict (moderate): -1.5
- Doesn't exist / unavailable: -5.0 (blocker)

#### Data Dependencies

**For schema changes, migrations**:
```json
{
  "dependency": "users table",
  "type": "database_table",
  "exists": true,
  "check_method": "search for schema definition",
  "compatibility": "Can add nullable column without breaking changes"
}
```

**Check**:
- [ ] Database tables exist
- [ ] Schema changes are backward-compatible
- [ ] Migration path is safe
- [ ] No data loss risks

**Scoring**:
- Safe and compatible: 0 deduction
- Requires careful migration: -0.5
- High risk migration: -2.0
- Breaking change without mitigation: -5.0 (blocker)

#### Integration Dependencies

**For external services, APIs**:
```json
{
  "dependency": "SendGrid API",
  "type": "external_service",
  "available": true,
  "check_method": "Check if API key configured",
  "notes": "Already used for notification emails"
}
```

**Check**:
- [ ] External service is accessible
- [ ] API keys/credentials available
- [ ] Rate limits understood
- [ ] SLA meets requirements

**Scoring**:
- Available and configured: 0 deduction
- Needs configuration: -0.3
- Service unavailable: -5.0 (blocker)
- Unreliable/inadequate SLA: -2.0

### Step 3: Assess Complexity Alignment

Verify complexity score matches actual complexity:

**Compare**:
```plaintext
Stated Complexity: 6.5/10 (Moderate)

Actual Indicators:
- File count: 8 files (moderate)
- New dependencies: 1 (low)
- Database changes: 1 table, 2 columns (low)
- Integration points: 1 external service (moderate)
- Test coverage needed: 15 test cases (moderate)

Assessment: Complexity score appears accurate
```

**File Count Decision Thresholds**:
- **1-3 files**: ✅ Simple (complexity should be 1-4)
- **4-6 files**: ✅ Moderate (complexity should be 4-6)
- **7-10 files**: ⚠️ Complex (complexity should be 6-8)
- **11-15 files**: 🔴 Very Complex (complexity should be 7-9)
- **> 15 files**: ❌ Extremely Complex (complexity should be 9-10, requires tiered planning)

**Implementation Steps Decision Thresholds**:
- **1-5 steps**: ✅ Simple (standard mode)
- **6-10 steps**: ✅ Moderate (standard mode acceptable)
- **11-15 steps**: ⚠️ Complex (consider incremental mode)
- **16-20 steps**: 🔴 Very Complex (incremental mode recommended)
- **> 20 steps**: ❌ Extremely Complex (requires breakdown or tiered approach)

**Red Flags**:
- Complexity stated as 3/10 but requires 5+ new integrations
- Complexity stated as 8/10 but only touches 2 files
- Mode is "standard" but has 20+ implementation steps
- Mode is "incremental" but complexity is 3/10
- File count > 15 without tiered planning approach

**Scoring**:
- Aligned (±1 point): 0 deduction
- Underestimated (>2 points low): -2.0
- Overestimated (>2 points high): -0.5
- Completely misaligned: -3.0

### Step 4: Identify Technical Concerns

Flag potential issues:

#### Categories of Concerns

**Minor Concerns** (-0.5 each):
- Suboptimal approach (works but not ideal)
- Missing optimization opportunities
- Slightly inconsistent with patterns
- Could be simpler

**Moderate Concerns** (-1.5 each):
- Performance implications not addressed
- Dependency version uncertainty
- Incomplete error handling plan
- Testing approach is weak

**Major Concerns** (-3.0 each):
- Security vulnerability in approach
- Scalability issue not mitigated
- Breaking change without compatibility layer
- Critical dependency missing plan

**Critical Blockers** (score = 0.0):
- Fundamental technical impossibility
- Required dependency doesn't exist
- Approach contradicts core architecture
- Missing critical knowledge with no research plan

### Step 5: Check for Blockers

Identify showstoppers:

**Blocker Checklist**:
- [ ] Required library/API doesn't exist
- [ ] Approach requires unavailable technology
- [ ] Contradicts architectural constraints
- [ ] Missing critical domain knowledge
- [ ] External service is inaccessible
- [ ] Breaking change with no migration path
- [ ] Security vulnerability with no fix
- [ ] Impossible performance requirements

**For each blocker**:
```json
{
  "blocker_id": "BLOCK-001",
  "description": "Plan requires WebRTC API not available in target browsers",
  "impact": "Cannot implement real-time video feature as planned",
  "severity": "critical",
  "recommendation": "Use WebSocket-based streaming or fallback to polling",
  "research_needed": true
}
```

### Step 6: Calculate Feasibility Score

```plaintext
Base Score: 10.0

Apply deductions:
- Implementation approach issues: -X
- Architecture misalignment: -X
- Dependency problems: -X
- Complexity misalignment: -X
- Technical concerns: -X

Final Score: max(0.0, 10.0 - total_deductions)

If any critical blocker: Score = 0.0 (automatic NO-GO)
```

**Interpretation**:
- **9.0-10.0**: Excellent - Highly feasible, sound approach
- **7.5-8.9**: Good - Feasible with minor adjustments
- **6.0-7.4**: Acceptable - Workable but has concerns
- **4.0-5.9**: Needs Work - Significant feasibility issues
- **0.0-3.9**: Inadequate - Major blockers or flawed approach

### Step 7: Generate Recommendations

Provide actionable guidance:

```json
{
  "recommendations": {
    "critical": [
      "Replace synchronous API calls with async/await pattern"
    ],
    "important": [
      "Add rate limiting to verification endpoint",
      "Verify SendGrid API key is configured in staging"
    ],
    "minor": [
      "Consider caching email_verified status in JWT",
      "Review similar implementation in auth module for patterns"
    ]
  },
  "alternative_approaches": [
    {
      "approach": "Use existing email service abstraction",
      "benefits": "Already tested, reduces new code",
      "tradeoffs": "Less control over email templating"
    }
  ]
}
```

## Output Format

```json
{
  "feasibility_score": 7.5,
  "status": "good",
  "score_breakdown": {
    "base_score": 10.0,
    "deductions": {
      "implementation_approach": -0.5,
      "architecture_alignment": 0.0,
      "dependencies": -0.5,
      "complexity_alignment": 0.0,
      "technical_concerns": -1.5
    }
  },
  "technical_concerns": [
    {
      "concern_id": "TECH-001",
      "category": "performance",
      "severity": "moderate",
      "description": "Email verification check on every request adds DB query",
      "impact": "~50ms latency per authenticated request",
      "recommendation": "Cache email_verified status in JWT or session"
    },
    {
      "concern_id": "TECH-002",
      "category": "error_handling",
      "severity": "minor",
      "description": "Email send failure handling not detailed",
      "impact": "Users may not know if email failed to send",
      "recommendation": "Add retry logic and user notification"
    }
  ],
  "blockers_identified": [],
  "dependency_check": {
    "technical_dependencies": [
      {
        "name": "zod",
        "status": "available",
        "version": "^3.22.0",
        "notes": "Already in use"
      }
    ],
    "data_dependencies": [
      {
        "name": "users table",
        "status": "available",
        "compatibility": "backward-compatible"
      }
    ],
    "integration_dependencies": [
      {
        "name": "SendGrid API",
        "status": "needs_verification",
        "notes": "Verify API key configured"
      }
    ]
  },
  "complexity_alignment": {
    "stated_complexity": 6.5,
    "assessed_complexity": 6.0,
    "alignment": "good",
    "notes": "Slightly simpler than estimated"
  },
  "recommendations": {
    "critical": [],
    "important": [
      "Verify SendGrid API configuration",
      "Add email send failure handling details"
    ],
    "minor": [
      "Consider caching verification status"
    ]
  }
}
```

## Success Criteria

- ✅ Implementation approach evaluated for soundness
- ✅ Architecture alignment verified
- ✅ All dependencies checked (available/compatible)
- ✅ Complexity assessment validated
- ✅ Technical concerns identified and categorized
- ✅ Blockers flagged (if any)
- ✅ Feasibility score calculated objectively
- ✅ Actionable recommendations provided

## Rules

**DO**:
- ✅ Use codebase_search to verify existing patterns
- ✅ Check package.json for dependencies
- ✅ Look for similar implementations
- ✅ Be thorough in identifying concerns
- ✅ Flag critical blockers immediately

**DON'T**:
- ❌ Don't assume dependencies exist without checking
- ❌ Don't overlook architectural misalignment
- ❌ Don't minimize security concerns
- ❌ Don't accept impossible requirements
- ❌ Don't skip the blocker check

