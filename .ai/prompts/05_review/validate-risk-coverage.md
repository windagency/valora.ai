---
id: review.validate-risk-coverage
version: 1.0.0
category: review
experimental: true
name: Validate Risk Coverage
description: Ensure risks are properly identified, assessed, and mitigated in the plan
tags:
  - plan-review
  - risk-assessment
  - validation
  - mitigation
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
  optional:
    - plan.assess-risks
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
  - risk_coverage_score
  - unaddressed_risks
  - mitigation_gaps
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Validate Risk Coverage

## Objective

Ensure the implementation plan adequately identifies, assesses, and mitigates all relevant risks.

## Context

You are reviewing the Risk Assessment section of an implementation plan to verify comprehensive risk coverage.

## Risk Categories

Plans should address these risk categories:

1. **Technical Risks** - Breaking changes, performance, security, compatibility
2. **Business Risks** - Data loss, UX degradation, compliance
3. **Operational Risks** - Deployment, monitoring, support

## Instructions

### Step 1: Review Identified Risks

Extract risks from plan:

```json
{
  "identified_risks": [
    {
      "risk_id": "RISK-001",
      "description": "Email verification breaks existing auth flow",
      "category": "technical",
      "severity": "high",
      "likelihood": "medium",
      "has_mitigation": true,
      "mitigation_quality": "detailed|adequate|vague|missing"
    }
  ]
}
```

**Count by Category**:
- Technical risks: X
- Business risks: Y
- Operational risks: Z
- Total: N

### Step 2: Assess Risk Identification Completeness

Check if obvious risks are identified:

#### Technical Risk Checklist

**Must Consider**:
- [ ] Breaking changes (API, schema, config)
- [ ] Performance degradation (queries, algorithms)
- [ ] Security vulnerabilities (auth, injection, tokens)
- [ ] Scalability concerns (growth, concurrency)
- [ ] Browser/platform compatibility
- [ ] Integration failures (external services)

**For each category**:
- Addressed with specific risk: +1.0
- Generic mention without specifics: +0.5
- Not addressed: 0.0

#### Business Risk Checklist

**Must Consider**:
- [ ] Data loss or corruption
- [ ] User experience degradation
- [ ] Revenue/conversion impact
- [ ] Compliance/legal risks (GDPR, CCPA)
- [ ] Support burden increase

**Scoring**: Same as technical

#### Operational Risk Checklist

**Must Consider**:
- [ ] Deployment complexity
- [ ] Monitoring gaps
- [ ] Incident response
- [ ] Rollback difficulty

**Scoring**: Same as technical

**Identification Score**:
```plaintext
Identification Score = (addressed_categories / total_categories) × 10

Total Categories: 15 (6 technical + 5 business + 4 operational)
```

### Step 3: Evaluate Severity Ratings

Check if severity ratings are realistic:

**Severity Levels**:
- **Critical**: Data loss, security breach, service outage
- **High**: Breaking changes, significant UX degradation, major bugs
- **Medium**: Performance issues, minor breaking changes, moderate impact
- **Low**: Edge cases, cosmetic issues, negligible impact

**Red Flags**:
- Data loss risk marked as "low"
- Security vulnerability marked as "medium"
- Cosmetic issue marked as "critical"
- No high-severity risks despite complex changes

**Scoring**:
```plaintext
For each risk:
- Severity is realistic: 0 deduction
- Severity is understated: -0.5
- Severity is overstated: -0.2
- Critical severity rating missing: -2.0

Max deductions: -5.0
```

### Step 4: Review Mitigation Strategies

Assess mitigation quality for each risk:

#### Mitigation Quality Criteria

**Detailed** (1.0 score):
- Specific, actionable steps
- Multiple mitigation layers
- Detection mechanism defined
- Rollback plan included

Example:
```json
{
  "risk": "Email tokens could be guessable",
  "mitigation": [
    "Use crypto.randomBytes(32) for token generation",
    "Add rate limiting: 5 attempts per hour per email",
    "Expire tokens after 24 hours",
    "Invalidate token after first use",
    "Log failed verification attempts for monitoring"
  ],
  "detection": "Alert on >10 failed attempts in 1 hour",
  "rollback": "Feature flag to disable verification requirement"
}
```

**Adequate** (0.7 score):
- Specific steps provided
- One mitigation approach
- Basic detection/monitoring
- May lack rollback plan

**Vague** (0.3 score):
- Generic statements
- No specific steps
- No detection mechanism
- Example: "Handle errors properly", "Test thoroughly"

**Missing** (0.0 score):
- No mitigation provided
- Risk is acknowledged but not addressed

#### Critical Risk Requirements

**High/Critical severity risks MUST have**:
- [ ] Detailed mitigation (not vague)
- [ ] Detection mechanism
- [ ] Rollback/recovery plan
- [ ] Testing strategy

**Deductions**:
- High-severity without detailed mitigation: -3.0
- Critical severity without mitigation: -10.0 (automatic NO-GO)

### Step 5: Identify Unaddressed Risks

Based on plan complexity and scope, identify missing risks:

**Analysis Questions**:
1. Given complexity score of X, are enough risks identified?
2. Does the plan involve database changes? (Check for data integrity risks)
3. Does the plan add authentication/authorization? (Check for security risks)
4. Does the plan affect user workflows? (Check for UX risks)
5. Does the plan integrate external services? (Check for integration risks)
6. Does the plan modify critical paths? (Check for breaking change risks)

**Expected Risk Count by Complexity** (Decision Thresholds):
```plaintext
Complexity 1-3 (Simple):
  ✅ 2-4 risks: Good
  ⚠️ 1 risk: Acceptable if low-impact feature
  ❌ 0 risks or >5 risks: Review needed

Complexity 4-6 (Moderate):
  ✅ 5-8 risks: Good
  ⚠️ 3-4 risks: Acceptable with justification
  ❌ <3 risks or >10 risks: Review needed

Complexity 7-9 (Complex):
  ✅ 9-15 risks: Good
  ⚠️ 7-8 risks: Acceptable if well-mitigated
  ❌ <7 risks or >20 risks: Review needed

Complexity 10 (Very Complex):
  ✅ 15-25 risks: Good
  ⚠️ 12-14 risks: Acceptable if comprehensive mitigations
  ❌ <12 risks or >30 risks: Review needed
```

**Auto-escalation Rules**:
- If risk count < minimum threshold → Flag as "Incomplete risk identification"
- If risk count > maximum threshold → Flag as "Over-identified or overly complex task"

**If risk count is below minimum**:
```json
{
  "concern": "Insufficient risk identification",
  "expected_minimum": 5,
  "actual_count": 2,
  "missing_risk_areas": [
    "No security risks identified despite adding auth endpoint",
    "No deployment risks identified despite DB migration",
    "No monitoring risks identified"
  ]
}
```

### Step 6: Check for Red Flag Risks

Identify critical risks without adequate mitigation:

**Red Flags** (each triggers NO-GO):
- [ ] Data loss risk without backup/recovery plan
- [ ] Security vulnerability without fix
- [ ] Breaking change without compatibility layer
- [ ] High-severity risk without mitigation
- [ ] No rollback strategy for high-risk changes

### Step 7: Calculate Risk Coverage Score

```plaintext
Risk Coverage Score = (
  (Identification Score × 0.35) +
  (Severity Accuracy × 0.15) +
  (Mitigation Quality × 0.40) +
  (Coverage Completeness × 0.10)
)

Where:
- Identification Score: 0-10 (how many risk categories covered)
- Severity Accuracy: 0-10 (realistic severity ratings)
- Mitigation Quality: 0-10 (average quality of mitigations)
- Coverage Completeness: 0-10 (risks relative to complexity)

Result: 0.0 - 10.0
```

**Interpretation**:
- **9.0-10.0**: Excellent - Comprehensive risk coverage
- **7.5-8.9**: Good - Adequate coverage, minor gaps
- **6.0-7.4**: Acceptable - Several gaps need addressing
- **4.0-5.9**: Needs Work - Significant risk gaps
- **0.0-3.9**: Inadequate - Major revision required

**Critical Override**:
- If ANY red flag risk exists: Score = 0.0 (NO-GO)

### Step 8: Generate Recommendations

Provide actionable guidance:

```json
{
  "critical_recommendations": [
    "Add mitigation strategy for data loss risk (RISK-003)"
  ],
  "important_recommendations": [
    "Identify security risks for new auth endpoint",
    "Add deployment risks for database migration",
    "Improve mitigation quality for RISK-005 (currently vague)"
  ],
  "additional_risks_to_consider": [
    {
      "risk": "Email provider outage blocks all verifications",
      "category": "operational",
      "severity": "high",
      "suggested_mitigation": "Queue emails for retry, alert on failures"
    },
    {
      "risk": "Verification tokens stored indefinitely",
      "category": "compliance",
      "severity": "medium",
      "suggested_mitigation": "Add TTL cleanup job, expire after 30 days"
    }
  ]
}
```

## Output Format

```json
{
  "risk_coverage_score": 7.2,
  "status": "acceptable",
  "score_breakdown": {
    "identification_score": 7.0,
    "severity_accuracy": 8.5,
    "mitigation_quality": 6.8,
    "coverage_completeness": 6.0
  },
  "risk_summary": {
    "total_risks": 6,
    "by_category": {
      "technical": 4,
      "business": 1,
      "operational": 1
    },
    "by_severity": {
      "critical": 0,
      "high": 2,
      "medium": 3,
      "low": 1
    }
  },
  "identification_gaps": [
    {
      "category": "security",
      "missing": "No risks identified for token generation security",
      "severity": "high"
    },
    {
      "category": "operational",
      "missing": "Monitoring gaps not addressed",
      "severity": "medium"
    }
  ],
  "mitigation_gaps": [
    {
      "risk_id": "RISK-002",
      "risk": "Email verification reduces signups",
      "current_mitigation": "Monitor conversion metrics",
      "issue": "Too vague, no specific actions or rollback trigger",
      "recommendation": "Add A/B test plan and rollback threshold (e.g., >15% drop)"
    },
    {
      "risk_id": "RISK-005",
      "risk": "Migration fails midway",
      "current_mitigation": "Test on staging",
      "issue": "Missing recovery plan",
      "recommendation": "Add transaction wrapping and rollback migration script"
    }
  ],
  "unaddressed_risks": [
    {
      "risk": "Email provider outage blocks verifications",
      "category": "operational",
      "severity": "high",
      "impact": "No new users can complete registration",
      "suggested_mitigation": [
        "Queue email sends for retry",
        "Alert on sustained delivery failures",
        "Manual verification fallback process"
      ]
    },
    {
      "risk": "Token enumeration attack",
      "category": "security",
      "severity": "high",
      "impact": "Attackers could guess valid tokens",
      "suggested_mitigation": [
        "Use cryptographically secure random tokens (32+ chars)",
        "Rate limit verification endpoint (5/hour per email)",
        "Log failed attempts for detection"
      ]
    }
  ],
  "red_flags": [
    "High-severity risk RISK-002 has vague mitigation"
  ],
  "recommendations": {
    "critical": [
      "Add detailed mitigation for RISK-002 with specific rollback trigger"
    ],
    "important": [
      "Identify and address security risks for token handling",
      "Add operational risks for monitoring and incident response",
      "Improve mitigation quality for RISK-005"
    ],
    "minor": [
      "Consider compliance risks for token storage"
    ]
  }
}
```

## Success Criteria

- ✅ All risk categories assessed (technical, business, operational)
- ✅ Risk identification completeness evaluated
- ✅ Severity ratings validated for realism
- ✅ Mitigation quality assessed for each risk
- ✅ Unaddressed risks identified
- ✅ Red flag risks flagged
- ✅ Risk coverage score calculated
- ✅ Actionable recommendations provided

## Rules

**DO**:
- ✅ Consider plan complexity when assessing risk count
- ✅ Flag high-severity risks without mitigation
- ✅ Identify obvious missing risks
- ✅ Verify mitigation strategies are actionable
- ✅ Check for red flag risks

**DON'T**:
- ❌ Don't minimize data loss or security risks
- ❌ Don't accept vague mitigations for high-severity risks
- ❌ Don't overlook obvious risk categories
- ❌ Don't approve plans with critical risks unmitigated
- ❌ Don't skip operational risk assessment

