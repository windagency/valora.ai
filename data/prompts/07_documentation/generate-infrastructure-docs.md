---
id: documentation.generate-infrastructure-docs
version: 1.0.0
category: documentation
experimental: true
name: Generate Infrastructure Documentation
description: Generate 6 infrastructure documentation files (HLD, CONTAINER, DEPLOYMENT, LOGGING, LZ, WORKFLOW)
tags:
  - documentation
  - infrastructure
  - devops
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - platform-engineer
dependencies:
  requires:
    - onboard.analyze-documentation-requirements
    - context.use-modern-cli-tools
inputs:
  - name: documentation_plan
    description: Full documentation plan object (extract infrastructure domain)
    type: object
    required: true
  - name: diagram_requirements
    description: Full diagram requirements object (extract infrastructure domain)
    type: object
    required: true
  - name: cross_refs
    description: Cross-reference mappings
    type: object
    required: true
  - name: prd
    description: PRD document context
    type: object
    required: true
  - name: codebase
    description: Codebase context
    type: object
    required: true
  - name: target_domain
    description: Domain to generate (always 'infrastructure' for this prompt)
    type: string
    required: true
  - name: security_requirements
    description: Security policies, compliance frameworks, and threat model context
    type: object
    required: false
outputs:
  - hld_document
  - container_document
  - deployment_document
  - logging_document
  - lz_document
  - workflow_document
  - security_compliance_summary
tokens:
  avg: 25000
  max: 50000
  min: 15000
---

# Generate Infrastructure Documentation

## Documentation Philosophy — MANDATORY

Every document has two audiences. Confusing them makes documentation useless to both.

1. **Consumers (operators)** scan to find what they need under pressure: the command to run, the config to change, the diagram to orient themselves. They do not read security compliance matrices first.
2. **Maintainers** need the full picture: why the network is segmented this way, what compliance frameworks apply, the security rationale behind a deployment gate. They work with auditors and make architectural changes.

**Structure rule**: Lead with WHAT it is. Follow with HOW to operate it. Bury the WHY and security posture behind `<details>` collapsible sections.

**Use this exact HTML syntax for all maintainer-depth sections:**

```markdown
<details>
<summary><strong>Section Title</strong></summary>

Content here — architecture decisions, security controls, compliance details.

</details>
```

**If a section has no meaningful project-specific content, omit it entirely.** Security sections are important — but only when they contain actual project-specific controls, not generic advice.

## Objective

Generate 6 comprehensive audience-layered infrastructure documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

## CRITICAL: Write Files Directly

**DO NOT return document content in JSON.** Instead:

1. Use the `write` tool to write each document file directly
2. Return only metadata about what was written

This prevents JSON truncation issues with large documents.

## Input Processing

**Extract your domain-specific data from the full input objects:**

- `plan = documentation_plan.infrastructure` (or `documentation_plan[target_domain]`)
- `diagrams = diagram_requirements.infrastructure` (or `diagram_requirements[target_domain]`)

If the infrastructure domain is not present or `plan.enabled` is false, output an empty result with all documents set to `null`.

## Language Standards

- **British English** for all prose content (colour, behaviour, organisation, utilise)
- **American English** for code snippets and technical identifiers
- Consistent spelling throughout each document

## Security and Compliance Requirements

Each infrastructure document MUST include security considerations to reduce security review iterations. Include the following based on document type:

### Security Topics by Document

| Document      | Required Security Sections                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| HLD.md        | Threat model overview, security architecture, data classification, trust boundaries |
| CONTAINER.md  | Image security, runtime security, secrets handling, vulnerability scanning          |
| DEPLOYMENT.md | Security gates, compliance checks, secrets injection, access controls               |
| LOGGING.md    | Security event logging, audit trails, PII handling, log retention policies          |
| LZ.md         | Network security, encryption standards, compliance frameworks, security controls    |
| WORKFLOW.md   | Branch protection, code signing, security scanning in CI, access reviews            |

### Compliance Frameworks to Address

When `security_requirements` input includes compliance frameworks, ensure documentation addresses:

**SOC 2 Type II**:

- Access control documentation
- Change management procedures
- Monitoring and alerting
- Incident response references

**ISO 27001**:

- Information security policies
- Asset management
- Cryptographic controls
- Operations security

**GDPR** (if applicable):

- Data processing documentation
- Data retention policies
- Cross-border transfer considerations
- Data subject rights support

**PCI-DSS** (if applicable):

- Cardholder data environment boundaries
- Network segmentation
- Encryption requirements
- Access logging

**HIPAA** (if applicable):

- PHI handling procedures
- Audit controls
- Transmission security
- Backup and recovery

### Security Documentation Standards

For each security section, include:

1. **Control Description**: What security control is implemented
2. **Implementation Details**: How it is configured/deployed
3. **Verification Method**: How to verify the control is working
4. **Compliance Mapping**: Which compliance requirements it satisfies
5. **Exceptions/Gaps**: Any known gaps with remediation plans

## Document Header Template

All documents must begin with this header:

```markdown
# [Document Title]

| Attribute        | Value                       |
| ---------------- | --------------------------- |
| **Purpose**      | [Brief purpose description] |
| **Version**      | 1.0.0                       |
| **Author**       | AI Documentation Generator  |
| **Created**      | [YYYY-MM-DD]                |
| **Last Updated** | [YYYY-MM-DD]                |
| **Status**       | Draft                       |

---
```

## Instructions

### Step 1: Create Output Directory

Use `list_dir` to check if `knowledge-base/infrastructure/` exists.

### Step 2: Generate and Write HLD.md

Use the `write` tool to create `knowledge-base/infrastructure/HLD.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **System Overview** — 2-3 sentences + C4 Context Diagram (Mermaid C4Context)
3. **C4 Container Diagram** (Mermaid C4Container)
4. **Technology Stack** — complete technology inventory table: `Technology | Version | Purpose`
5. **External Integrations** — third-party services table: `Service | Purpose | Authentication Method`

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Non-Functional Requirements** — NFR mapping: `Requirement | Target | Current | Notes`
7. `<details>` **Security Architecture** — threat model overview, trust boundaries, authentication architecture, data classification, encryption standards, security controls matrix with compliance mapping
8. `<details>` **Compliance Overview** — applicable frameworks, control implementation status, audit readiness, exceptions and remediation timeline

**Conditional (only if project-specific content exists)**:

9. **Related Documentation** — cross-references

### Step 3: Generate and Write CONTAINER.md

Use the `write` tool to create `knowledge-base/infrastructure/CONTAINER.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Container Overview** — inventory table: `Container | Purpose | Port | Base Image`
3. **Container Topology Diagram** (Mermaid)
4. **Key Commands** — copy-paste commands for build, run, stop, logs
5. **Environment Configuration** — env vars table: `Variable | Required | Default | Description`

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Dockerfile Configuration** — image build details, multi-stage build rationale
7. `<details>` **Docker Compose Setup** — orchestration configuration and service dependencies
8. `<details>` **Image Management** — registry, versioning strategy, tagging conventions
9. `<details>` **Volume Management** — storage configuration and persistence strategy
10. `<details>` **Networking** — container networking setup and inter-service communication
11. `<details>` **Health Checks** — health check configuration and failure thresholds
12. `<details>` **Container Security** — base image security, image scanning, runtime security (read-only FS, non-root), secrets injection, network policies

**Conditional (only if project-specific content exists)**:

13. **Related Documentation** — cross-references

### Step 4: Generate and Write DEPLOYMENT.md

Use the `write` tool to create `knowledge-base/infrastructure/DEPLOYMENT.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Deployment Pipeline Diagram** (Mermaid flowchart)
3. **Environments** — table: `Environment | URL | Deploy Branch | Auto-Deploy`
4. **How to Deploy** — numbered step-by-step for the most common deployment scenario
5. **Rollback Procedure** — numbered steps to roll back a bad deployment

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **CI/CD Configuration** — pipeline YAML reference, trigger conditions, approval gates
7. `<details>` **Release Process** — versioning strategy, release branch workflow, change log generation
8. `<details>` **Environment Variables** — config by environment: `Variable | Dev | Staging | Production`
9. `<details>` **Secrets Management** — secrets storage, rotation policies, access audit logging, emergency revocation
10. `<details>` **Security Gates** — SAST, DAST, dependency scanning, container scanning, IaC scanning, required approvals
11. `<details>` **Compliance Verification** — change management, approval audit trails, environment parity, drift detection

**Conditional (only if project-specific content exists)**:

12. **Related Documentation** — cross-references

### Step 5: Generate and Write LOGGING.md

Use the `write` tool to create `knowledge-base/infrastructure/LOGGING.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Observability Architecture Diagram** (Mermaid)
3. **Log Levels** — table: `Level | When to Use | Example`
4. **How to Query Logs** — copy-paste queries for the most common scenarios (errors, auth failures, slow requests)
5. **Alert Rules** — table: `Alert | Condition | Severity | Owner`

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Log Aggregation** — centralised logging architecture, ingestion pipeline, retention policies
7. `<details>` **Metrics Collection** — what metrics are collected, naming conventions, Prometheus/OTEL setup
8. `<details>` **Tracing** — distributed tracing setup, sampling strategy, trace context propagation
9. `<details>` **Dashboards** — dashboard inventory, what each monitors, alert thresholds
10. `<details>` **Security Logging** — authentication events, authorisation decisions, administrative actions, security alerts, compliance-required events by framework
11. `<details>` **Audit Trail Requirements** — immutable storage, integrity verification, retention periods by framework, access controls
12. `<details>` **PII and Sensitive Data Handling** — PII detection, field redaction, log sanitisation, data residency

**Conditional (only if project-specific content exists)**:

13. **Related Documentation** — cross-references

### Step 6: Generate and Write LZ.md

Use the `write` tool to create `knowledge-base/infrastructure/LZ.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Network Topology Diagram** (Mermaid)
3. **Cloud Resources** — inventory table: `Resource | Type | Region | Purpose`
4. **VPC Structure** — CIDR ranges, subnet layout, availability zones
5. **Resource Groups** — organisation and tagging strategy table

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Security Boundaries** — security zones, trust levels, data classification per zone
7. `<details>` **Network Security** — segmentation strategy, firewall rules, WAF config, DDoS protection, private endpoints
8. `<details>` **IAM Policies** — RBAC model, least-privilege implementation, service accounts, cross-account patterns, emergency access
9. `<details>` **Encryption Standards** — at-rest and in-transit standards, key management (KMS/HSM), certificate management, rotation schedules
10. `<details>` **Connectivity** — network connectivity between environments, VPN/Direct Connect, peering
11. `<details>` **Compliance Framework Implementation** — control mapping per framework, evidence collection, continuous monitoring, gap analysis
12. `<details>` **Security Monitoring** — CSPM configuration, compliance scanning, vulnerability management, intrusion detection

**Conditional (only if project-specific content exists)**:

13. **Related Documentation** — cross-references

### Step 7: Generate and Write WORKFLOW.md

Use the `write` tool to create `knowledge-base/infrastructure/WORKFLOW.md` with:

**Consumer Surface (always present — leads the document)**:

1. **Purpose** — one sentence
2. **Git Flow Diagram** (Mermaid gitGraph)
3. **Branch Naming** — conventions table: `Type | Pattern | Example`
4. **Commit Guidelines** — format, scope rules, example
5. **Pull Request Process** — numbered steps, required approvals, checklist

**Maintainer Depth (use `<details>` tags)**:

6. `<details>` **Code Review Guidelines** — what to look for, security review requirements for sensitive changes
7. `<details>` **Security in CI/CD** — branch protection rules, required security checks (SAST, secrets detection, dependency scans), code signing
8. `<details>` **Release Process** — versioning, release branch workflow, changelog generation, tag signing
9. `<details>` **Hotfix Process** — emergency fix workflow with security considerations and approval bypass criteria
10. `<details>` **Access Control** — repository access levels, pipeline secrets management, deployment credentials, periodic access reviews
11. `<details>` **Development Environment** — local setup for new contributors

**Conditional (only if project-specific content exists)**:

12. **Related Documentation** — cross-references

### Step 8: Generate Security Compliance Summary

Before returning, compile a security compliance summary that consolidates all security considerations across documents. This summary helps security reviewers quickly assess coverage.

**Summary includes**:

1. **Security Controls Inventory**: List of all security controls documented
2. **Compliance Coverage Matrix**: Which frameworks are addressed and where
3. **Gaps and Exceptions**: Known security gaps with remediation status
4. **Security Review Checklist**: Pre-populated checklist for security reviewers
5. **Risk Assessment Summary**: High-level risk areas identified

### Step 9: Return Metadata

After writing all files, output JSON with metadata only (no content).

## Output Format

**After writing all files with the `write` tool**, return this JSON:

```json
{
	"hld_document": {
		"id": "INFRA-HLD",
		"filename": "HLD.md",
		"target_path": "knowledge-base/infrastructure/HLD.md",
		"written": true,
		"sections_count": 12,
		"diagrams_included": ["C4 Context", "C4 Container"],
		"completeness_score": 0.95
	},
	"container_document": {
		"id": "INFRA-CONTAINER",
		"filename": "CONTAINER.md",
		"target_path": "knowledge-base/infrastructure/CONTAINER.md",
		"written": true,
		"sections_count": 14,
		"diagrams_included": ["Container Topology"],
		"completeness_score": 0.92
	},
	"deployment_document": {
		"id": "INFRA-DEPLOYMENT",
		"filename": "DEPLOYMENT.md",
		"target_path": "knowledge-base/infrastructure/DEPLOYMENT.md",
		"written": true,
		"sections_count": 14,
		"diagrams_included": ["Deployment Pipeline"],
		"completeness_score": 0.94
	},
	"logging_document": {
		"id": "INFRA-LOGGING",
		"filename": "LOGGING.md",
		"target_path": "knowledge-base/infrastructure/LOGGING.md",
		"written": true,
		"sections_count": 13,
		"diagrams_included": ["Observability Architecture"],
		"completeness_score": 0.9
	},
	"lz_document": {
		"id": "INFRA-LZ",
		"filename": "LZ.md",
		"target_path": "knowledge-base/infrastructure/LZ.md",
		"written": true,
		"sections_count": 13,
		"diagrams_included": ["Network Topology"],
		"completeness_score": 0.88
	},
	"workflow_document": {
		"id": "INFRA-WORKFLOW",
		"filename": "WORKFLOW.md",
		"target_path": "knowledge-base/infrastructure/WORKFLOW.md",
		"written": true,
		"sections_count": 13,
		"diagrams_included": ["Git Flow"],
		"completeness_score": 0.93
	},
	"generation_summary": {
		"documents_generated": 6,
		"total_diagrams": 8,
		"files_written": [
			"knowledge-base/infrastructure/HLD.md",
			"knowledge-base/infrastructure/CONTAINER.md",
			"knowledge-base/infrastructure/DEPLOYMENT.md",
			"knowledge-base/infrastructure/LOGGING.md",
			"knowledge-base/infrastructure/LZ.md",
			"knowledge-base/infrastructure/WORKFLOW.md"
		],
		"average_completeness": 0.92,
		"issues": []
	},
	"security_compliance_summary": {
		"security_controls": [
			{
				"control_id": "SC-001",
				"name": "Encryption at Rest",
				"category": "Data Protection",
				"documented_in": ["HLD.md", "LZ.md"],
				"status": "implemented"
			},
			{
				"control_id": "SC-002",
				"name": "Container Image Scanning",
				"category": "Vulnerability Management",
				"documented_in": ["CONTAINER.md", "DEPLOYMENT.md"],
				"status": "implemented"
			}
		],
		"compliance_coverage": {
			"soc2": {
				"addressed": true,
				"coverage_percentage": 85,
				"documented_in": ["HLD.md", "LZ.md", "LOGGING.md"],
				"gaps": ["CC7.2 - Incident response procedures need expansion"]
			},
			"iso27001": {
				"addressed": true,
				"coverage_percentage": 80,
				"documented_in": ["HLD.md", "LZ.md"],
				"gaps": []
			},
			"gdpr": {
				"addressed": false,
				"coverage_percentage": 0,
				"documented_in": [],
				"gaps": ["Not applicable or not in scope"]
			}
		},
		"security_gaps": [
			{
				"gap_id": "GAP-001",
				"description": "Penetration testing schedule not documented",
				"severity": "medium",
				"remediation": "Add to DEPLOYMENT.md security gates",
				"target_date": "TBD"
			}
		],
		"security_review_checklist": [
			{
				"item": "Authentication architecture reviewed",
				"document": "HLD.md",
				"section": "Security Architecture",
				"status": "ready_for_review"
			},
			{
				"item": "Network segmentation verified",
				"document": "LZ.md",
				"section": "Network Security",
				"status": "ready_for_review"
			},
			{
				"item": "Secrets management documented",
				"document": "DEPLOYMENT.md",
				"section": "Secrets Management",
				"status": "ready_for_review"
			},
			{
				"item": "Audit logging configured",
				"document": "LOGGING.md",
				"section": "Audit Trail Requirements",
				"status": "ready_for_review"
			},
			{
				"item": "Container security hardening",
				"document": "CONTAINER.md",
				"section": "Container Security",
				"status": "ready_for_review"
			},
			{
				"item": "CI/CD security gates",
				"document": "DEPLOYMENT.md",
				"section": "Security Gates",
				"status": "ready_for_review"
			}
		],
		"risk_summary": {
			"high_risk_areas": [],
			"medium_risk_areas": ["Third-party integrations", "Key rotation automation"],
			"low_risk_areas": ["Development workflow security"],
			"mitigations_documented": true
		}
	}
}
```

## Success Criteria

- ✅ All 6 files written using `write` tool
- ✅ Each document includes standardised header with Audience field
- ✅ Consumer surface leads each document and is scannable without expanding anything
- ✅ Maintainer depth sections (including security and compliance) use `<details><summary>` tags
- ✅ No empty or generic boilerplate sections — omit rather than pad
- ✅ Mermaid diagrams render correctly
- ✅ British English used consistently
- ✅ Cross-references use correct relative paths
- ✅ Security sections contain project-specific controls (not generic advice) in `<details>` blocks
- ✅ Security compliance summary metadata populated

## Error Handling

### Write Tool Failure

**Issue**: Cannot write file to disk

**Action**:

1. Report error in output JSON
2. Set `written: false` for affected document
3. Continue with remaining documents

### Missing Context

**Issue**: Insufficient context for section

**Action**:

1. Generate placeholder with TODO marker
2. Note in issues array
3. Reduce completeness score

### Missing Security Requirements

**Issue**: `security_requirements` input not provided or incomplete

**Action**:

1. Generate security sections with generic best practices
2. Add TODO markers for organisation-specific policies
3. Flag in `security_compliance_summary.security_gaps`
4. Set compliance coverage to "requires_input" status
5. Include note: "Security requirements input recommended for complete compliance coverage"

## REMINDER: Write Files First

**Use the `write` tool to create each file, then return metadata JSON. DO NOT include file content in the JSON response.**
