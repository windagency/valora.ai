---
id: plan.assess-risks
version: 1.0.0
category: plan
experimental: true
name: Assess Risks
description: Identify technical, business, and operational risks with mitigation strategies
tags:
  - risk-assessment
  - mitigation
  - planning
model_requirements:
  min_context: 128000
  recommended:
    - gpt-5-thinking-high
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-task-context
    - plan.assess-complexity
inputs:
  - name: task_scope
    description: Task scope from analyze-task-context
    type: object
    required: true
  - name: complexity_score
    description: Complexity score from assess-complexity
    type: number
    required: true
  - name: affected_components
    description: List of affected components
    type: array
    required: false
outputs:
  - technical_risks
  - business_risks
  - operational_risks
  - mitigation_strategies
  - risk_score
  - clarifying_questions
tokens:
  avg: 3000
  max: 6000
  min: 2000
---

# Assess Risks

## Objective

Identify potential issues that could derail implementation and define mitigation strategies to minimize impact.

## Risk Categories

### 1. Technical Risks
Issues related to code, architecture, and technology.

### 2. Business Risks
Issues affecting users, data integrity, or business operations.

### 3. Operational Risks
Issues related to deployment, monitoring, and support.

## Instructions

### Step 1: Identify Technical Risks

Analyze potential technical issues:

#### 1.1 Breaking Changes

**Assess**:
- API contract changes
- Database schema changes
- Configuration changes
- Dependency upgrades

**For each potential breaking change**:
```json
{
  "risk": "Email verification breaks existing authentication flow",
  "category": "breaking_change",
  "severity": "high",
  "likelihood": "medium",
  "impact": "Existing users may be locked out if email_verified required",
  "mitigation": [
    "Set email_verified=true for all existing users in migration",
    "Add grace period before enforcing verification",
    "Implement feature flag to gradually roll out"
  ],
  "detection": "Integration tests for existing auth flow",
  "rollback": "Disable email verification middleware, revert migration"
}
```

#### 1.2 Performance Degradation

**Check for**:
- N+1 query problems
- Inefficient algorithms
- Large data transfers
- Synchronous operations that should be async
- Missing indexes
- Cache invalidation issues

**Output**:
```json
{
  "risk": "Email verification check on every request adds latency",
  "category": "performance",
  "severity": "medium",
  "likelihood": "high",
  "impact": "Additional DB query per authenticated request (~50ms overhead)",
  "mitigation": [
    "Cache email_verified status in JWT token",
    "Add index on users.email_verified column",
    "Load verification status with user session (already fetched)"
  ],
  "detection": "Load testing with and without feature",
  "threshold": "p95 latency should stay < 500ms"
}
```

#### 1.3 Security Vulnerabilities

**Consider**:
- Authentication/authorization bypasses
- Data leaks
- Injection attacks (SQL, XSS, etc.)
- Insecure token generation
- Missing rate limiting
- Insufficient input validation

**Output**:
```json
{
  "risk": "Verification tokens predictable or guessable",
  "category": "security",
  "severity": "critical",
  "likelihood": "low",
  "impact": "Attackers could verify arbitrary email addresses",
  "mitigation": [
    "Use cryptographically secure random token generation",
    "Tokens should be 32+ characters",
    "Add rate limiting on verification endpoint",
    "Expire tokens after 24 hours",
    "Invalidate token after use"
  ],
  "detection": "Security review, penetration testing",
  "compliance": ["OWASP Top 10"]
}
```

#### 1.4 Scalability Concerns

**Assess**:
- Database growth
- API throughput
- Memory usage
- Storage requirements
- Concurrent user limits

**Output**:
```json
{
  "risk": "Email verification table grows unbounded",
  "category": "scalability",
  "severity": "low",
  "likelihood": "high",
  "impact": "Database storage grows over time with expired tokens",
  "mitigation": [
    "Add TTL/expiration cleanup job",
    "Purge expired tokens after 30 days",
    "Consider time-series partitioning for large scale"
  ],
  "detection": "Monitor table size growth",
  "threshold": "Alert if table > 10M rows"
}
```

#### 1.5 Browser/Platform Compatibility

**Check**:
- Browser API usage
- CSS features
- JavaScript features
- Mobile responsiveness

**Output**:
```json
{
  "risk": "Email verification UI breaks on older browsers",
  "category": "compatibility",
  "severity": "low",
  "likelihood": "medium",
  "impact": "Users on IE11 or old Safari cannot verify email",
  "mitigation": [
    "Use polyfills for modern JS features",
    "Test on minimum supported browsers",
    "Graceful degradation for unsupported features"
  ],
  "detection": "Cross-browser testing",
  "minimum_support": ["Chrome 90+", "Safari 14+", "Firefox 88+"]
}
```

### Step 2: Identify Business Risks

Analyze impacts on users and business operations:

#### 2.1 Data Loss or Corruption

**Consider**:
- Migration failures
- Rollback scenarios
- Data consistency issues
- Orphaned records

**Output**:
```json
{
  "risk": "Migration fails midway, leaving data inconsistent",
  "category": "data_integrity",
  "severity": "critical",
  "likelihood": "low",
  "impact": "Some users have email_verified field, others don't",
  "mitigation": [
    "Run migration in transaction",
    "Test migration on staging with production data snapshot",
    "Have rollback migration ready",
    "Verify data consistency post-migration"
  ],
  "detection": "Post-migration validation query",
  "recovery": "Rollback migration and re-run"
}
```

#### 2.2 User Experience Degradation

**Assess**:
- Increased friction
- Confusion or frustration
- Workflow interruption
- Feature discoverability

**Output**:
```json
{
  "risk": "Users frustrated by mandatory email verification",
  "category": "user_experience",
  "severity": "medium",
  "likelihood": "high",
  "impact": "Increased support tickets, user complaints, potential churn",
  "mitigation": [
    "Clear messaging about why verification is needed",
    "Allow users to skip initially and verify later",
    "Provide easy resend verification email option",
    "Monitor support tickets and user feedback"
  ],
  "detection": "Track support tickets, user feedback, drop-off rates",
  "threshold": "If drop-off > 5%, reconsider approach"
}
```

#### 2.3 Revenue or Business Impact

**Consider**:
- Conversion rate changes
- Customer acquisition cost impact
- Retention effects
- Feature adoption

**Output**:
```json
{
  "risk": "Email verification adds friction to signup, reducing conversions",
  "category": "business_impact",
  "severity": "high",
  "likelihood": "medium",
  "impact": "10-20% drop in signup completion rate",
  "mitigation": [
    "A/B test verification requirement",
    "Allow social login as alternative",
    "Defer verification until first protected action",
    "Optimize email delivery time and template"
  ],
  "detection": "Track signup funnel metrics",
  "rollback_trigger": "If conversion drops > 15%, disable feature"
}
```

#### 2.4 Compliance or Legal Risks

**Check**:
- GDPR, CCPA, HIPAA compliance
- Data retention policies
- Privacy requirements
- Terms of service alignment

**Output**:
```json
{
  "risk": "Storing email verification tokens violates data retention policy",
  "category": "compliance",
  "severity": "medium",
  "likelihood": "low",
  "impact": "Potential GDPR violation, regulatory fines",
  "mitigation": [
    "Expire and delete tokens after 24 hours",
    "Document data retention in privacy policy",
    "Ensure tokens are encrypted at rest",
    "Include tokens in user data export"
  ],
  "detection": "Privacy/legal review",
  "compliance": ["GDPR Article 5"]
}
```

### Step 3: Identify Operational Risks

Analyze deployment and support issues:

#### 3.1 Deployment Complexity

**Assess**:
- Multi-stage rollout requirements
- Database migration coordination
- Feature flag management
- Rollback difficulty

**Output**:
```json
{
  "risk": "Database migration must run before code deployment",
  "category": "deployment",
  "severity": "medium",
  "likelihood": "high",
  "impact": "Deployment order critical, risk of downtime or errors",
  "mitigation": [
    "Use backward-compatible migration (add column with default)",
    "Deploy in two phases: (1) schema change, (2) code change",
    "Test deployment order on staging",
    "Automate deployment sequence"
  ],
  "detection": "Deployment runbook, staging tests",
  "rollback": "Revert code first, then migration"
}
```

#### 3.2 Monitoring Gaps

**Identify**:
- Missing metrics
- Alerting gaps
- Observability issues
- Debugging difficulties

**Output**:
```json
{
  "risk": "Cannot detect when verification emails fail to send",
  "category": "monitoring",
  "severity": "high",
  "likelihood": "medium",
  "impact": "Users cannot verify, support tickets increase, no visibility",
  "mitigation": [
    "Add metric for email send success/failure rate",
    "Alert if failure rate > 5%",
    "Log email send attempts with user ID",
    "Add dashboard for email verification funnel"
  ],
  "detection": "Monitor dashboards, alert configuration",
  "slo": "Email delivery success rate > 95%"
}
```

#### 3.3 Support Burden

**Consider**:
- Increased support tickets
- Complex troubleshooting
- User confusion
- Operational overhead

**Output**:
```json
{
  "risk": "Support team unable to manually verify users if needed",
  "category": "support",
  "severity": "medium",
  "likelihood": "medium",
  "impact": "Cannot help users with email delivery issues",
  "mitigation": [
    "Build admin API to manually mark email as verified",
    "Document support process for email verification issues",
    "Add logging to troubleshoot email delivery",
    "Provide clear user-facing error messages"
  ],
  "detection": "Support ticket volume and resolution time",
  "documentation": "Create support runbook"
}
```

#### 3.4 Incident Response

**Assess**:
- Incident detection time
- Mean time to recovery
- Blast radius
- Communication plan

**Output**:
```json
{
  "risk": "Email provider outage blocks all verifications",
  "category": "incident",
  "severity": "high",
  "likelihood": "low",
  "impact": "No new users can complete registration",
  "mitigation": [
    "Queue email sends for retry",
    "Alert on sustained email delivery failures",
    "Have manual verification process as fallback",
    "Consider backup email provider"
  ],
  "detection": "Alert on email send failures > 10% for 5 min",
  "mttr_target": "< 30 minutes"
}
```

### Step 4: Calculate Overall Risk Score

Combine individual risk scores:

**For each risk**:
```
Risk Score = Severity × Likelihood
Where:
  Severity: Low=1, Medium=3, High=5, Critical=10
  Likelihood: Low=1, Medium=3, High=5
```

**Overall Risk Score**:
```
Overall = Sum of (Risk Score × Weight)
Where Weight = 1.0 for Critical, 0.7 for High, 0.4 for Medium, 0.2 for Low
```

**Risk Level**:
- **< 10**: Low risk
- **10-30**: Medium risk
- **30-50**: High risk
- **> 50**: Critical risk

### Step 5: Prioritize Mitigation

Rank risks by score and feasibility of mitigation:

**Priority Matrix**:
```
High Severity + High Likelihood = Priority 1 (must address)
High Severity + Low Likelihood = Priority 2 (monitor)
Low Severity + High Likelihood = Priority 3 (nice to fix)
Low Severity + Low Likelihood = Priority 4 (accept)
```

## Clarifying Questions

When risk mitigation decisions require user input, generate clarifying questions. Questions will be presented interactively before proceeding.

### When to Include Questions

Include `clarifying_questions` when:
- Risk mitigation strategies have significant trade-offs
- Rollback approach options affect implementation
- Acceptable risk thresholds need user confirmation
- Business impact decisions require stakeholder input

### Question Format

Each question must have:
- `id`: Unique identifier (e.g., "risk_q1")
- `question`: Clear question text
- `options`: Array of 2-4 predefined answer choices
- `priority`: "P0" (Critical), "P1" (Important), or "P2" (Minor)
- `context`: Optional explanation of risk implications

**Example**:
```json
{
  "clarifying_questions": [
    {
      "id": "risk_q1",
      "question": "What is the acceptable downtime during deployment?",
      "options": [
        "Zero downtime required (blue-green deployment)",
        "Brief maintenance window acceptable (< 5 min)",
        "Extended maintenance window OK (< 30 min)"
      ],
      "priority": "P0",
      "context": "Affects deployment strategy and rollback complexity"
    }
  ]
}
```

## Output Format

```json
{
  "technical_risks": [
    {
      "id": "TECH-001",
      "risk": "Email verification breaks existing auth flow",
      "category": "breaking_change",
      "severity": "high",
      "likelihood": "medium",
      "risk_score": 15,
      "impact": "Existing users may be locked out",
      "mitigation": [
        "Set email_verified=true for existing users",
        "Add grace period before enforcement"
      ],
      "detection": "Integration tests",
      "rollback": "Disable middleware, revert migration",
      "priority": 1
    }
  ],
  "business_risks": [
    {
      "id": "BIZ-001",
      "risk": "Email verification reduces signup conversions",
      "category": "business_impact",
      "severity": "high",
      "likelihood": "medium",
      "risk_score": 15,
      "impact": "10-20% drop in signup completion",
      "mitigation": [
        "A/B test requirement",
        "Defer verification until necessary"
      ],
      "detection": "Track funnel metrics",
      "rollback_trigger": "Conversion drop > 15%",
      "priority": 1
    }
  ],
  "operational_risks": [
    {
      "id": "OPS-001",
      "risk": "Cannot detect email send failures",
      "category": "monitoring",
      "severity": "high",
      "likelihood": "medium",
      "risk_score": 15,
      "impact": "Users stuck, no visibility",
      "mitigation": [
        "Add email success/failure metrics",
        "Alert on failure rate > 5%"
      ],
      "detection": "Dashboard and alerts",
      "slo": "Email delivery > 95%",
      "priority": 1
    }
  ],
  "risk_summary": {
    "total_risks": 12,
    "by_severity": {
      "critical": 1,
      "high": 4,
      "medium": 5,
      "low": 2
    },
    "by_category": {
      "technical": 5,
      "business": 4,
      "operational": 3
    },
    "overall_risk_score": 38.5,
    "risk_level": "high"
  },
  "top_priorities": [
    {
      "id": "TECH-001",
      "risk": "Breaking existing auth flow",
      "priority": 1,
      "reason": "High severity + medium likelihood"
    },
    {
      "id": "BIZ-001",
      "risk": "Reduced conversions",
      "priority": 1,
      "reason": "High business impact"
    }
  ],
  "mitigation_strategies": {
    "immediate": [
      "Set email_verified=true for existing users",
      "Add metrics and alerting for email delivery",
      "Create A/B test plan for conversion impact"
    ],
    "before_deployment": [
      "Run migration tests on staging",
      "Set up monitoring dashboards",
      "Document support runbook"
    ],
    "post_deployment": [
      "Monitor conversion funnel daily",
      "Review support tickets weekly",
      "Analyze email delivery rates"
    ]
  },
  "risk_score": 38.5,
  "red_flags": [
    "Overall risk score is HIGH (38.5)",
    "1 critical risk identified",
    "4 high-severity risks require mitigation"
  ],
  "recommendation": "Address Priority 1 risks before proceeding. Consider phased rollout with feature flag to limit blast radius.",
  "clarifying_questions": []
}
```

**Note**: Include `clarifying_questions` array even if empty. Populate when risk decisions require user preference.

## Success Criteria

- ✅ All risk categories assessed (technical, business, operational)
- ✅ Each risk has severity and likelihood
- ✅ Mitigation strategies defined for high-priority risks
- ✅ Detection mechanisms identified
- ✅ Rollback procedures documented
- ✅ Overall risk score calculated
- ✅ Red flags highlighted

## Rules

**DO**:
- ✅ Be thorough - consider all risk categories
- ✅ Be realistic about likelihood
- ✅ Provide actionable mitigation strategies
- ✅ Flag critical risks prominently
- ✅ Consider blast radius and reversibility

**DON'T**:
- ❌ Don't minimize risks to make plan look better
- ❌ Don't skip mitigation strategies
- ❌ Don't ignore operational concerns
- ❌ Don't forget to consider rollback procedures
- ❌ Don't overlook compliance and legal risks

