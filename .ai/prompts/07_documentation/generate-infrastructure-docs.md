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

## Objective

Generate 6 comprehensive infrastructure documentation files by **writing them directly to disk** using the `write` tool. Apply British English for prose and include Mermaid diagrams as specified.

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

| Document | Required Security Sections |
|----------|---------------------------|
| HLD.md | Threat model overview, security architecture, data classification, trust boundaries |
| CONTAINER.md | Image security, runtime security, secrets handling, vulnerability scanning |
| DEPLOYMENT.md | Security gates, compliance checks, secrets injection, access controls |
| LOGGING.md | Security event logging, audit trails, PII handling, log retention policies |
| LZ.md | Network security, encryption standards, compliance frameworks, security controls |
| WORKFLOW.md | Branch protection, code signing, security scanning in CI, access reviews |

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

| Attribute | Value |
|-----------|-------|
| **Purpose** | [Brief purpose description] |
| **Version** | 1.0.0 |
| **Author** | AI Documentation Generator |
| **Created** | [YYYY-MM-DD] |
| **Last Updated** | [YYYY-MM-DD] |
| **Status** | Draft |

---
```

## Instructions

### Step 1: Create Output Directory

Use `list_dir` to check if `knowledge-base/infrastructure/` exists.

### Step 2: Generate and Write HLD.md

Use the `write` tool to create `knowledge-base/infrastructure/HLD.md` with:

**Required sections**:

1. **Purpose** - Document scope
2. **System Overview** - High-level system description
3. **C4 Context Diagram** (Mermaid C4Context)
4. **C4 Container Diagram** (Mermaid C4Container)
5. **Technology Stack** - Complete technology inventory
6. **Non-Functional Requirements** - NFR mapping
7. **External Integrations** - Third-party services
8. **Security Architecture** - Comprehensive security section including:
   - Threat model overview (STRIDE categories addressed)
   - Trust boundaries and data flow security
   - Authentication and authorisation architecture
   - Data classification (public, internal, confidential, restricted)
   - Encryption standards (at-rest, in-transit, key management)
   - Security controls matrix with compliance mapping
9. **Compliance Overview** - Regulatory and framework compliance:
   - Applicable compliance frameworks
   - Control implementation status
   - Audit readiness checklist
   - Exceptions and remediation timeline
10. **Troubleshooting** - Common issues
11. **Best Practices** - Architecture best practices
12. **Related Documentation** - Cross-references
13. **Changelog** - Version history

### Step 3: Generate and Write CONTAINER.md

Use the `write` tool to create `knowledge-base/infrastructure/CONTAINER.md` with:

**Required sections**:

1. **Purpose** - Container strategy overview
2. **Container Overview** - Inventory and purposes
3. **Container Topology Diagram** (Mermaid)
4. **Dockerfile Configuration** - Image build
5. **Docker Compose Setup** - Orchestration
6. **Image Management** - Registry, versioning
7. **Environment Configuration** - Env vars
8. **Volume Management** - Storage
9. **Networking** - Container networking
10. **Health Checks** - Monitoring
11. **Container Security** - Security hardening section including:
    - Base image security (approved registries, vulnerability thresholds)
    - Image scanning integration (Trivy, Snyk, or equivalent)
    - Runtime security (read-only filesystems, non-root users, capabilities)
    - Secrets management (never in images, injection methods)
    - Network policies and segmentation
    - Security contexts and pod security standards
12. **Troubleshooting** - Container issues
13. **Best Practices** - Container best practices
14. **Related Documentation** - Cross-references
15. **Changelog** - Version history

### Step 4: Generate and Write DEPLOYMENT.md

Use the `write` tool to create `knowledge-base/infrastructure/DEPLOYMENT.md` with:

**Required sections**:

1. **Purpose** - Deployment strategy
2. **Deployment Pipeline Diagram** (Mermaid flowchart)
3. **Environments** - Environment definitions
4. **CI/CD Configuration** - Pipeline config
5. **Deployment Process** - Step-by-step
6. **Release Process** - Release workflow
7. **Rollback Procedures** - Rollback strategy
8. **Health Checks** - Post-deployment
9. **Environment Variables** - Config by env
10. **Secrets Management** - Sensitive data handling:
    - Secrets storage (vault, cloud secrets manager)
    - Rotation policies and procedures
    - Access audit logging
    - Emergency revocation process
11. **Security Gates** - Pre-deployment security checks:
    - SAST (Static Application Security Testing) requirements
    - DAST (Dynamic Application Security Testing) integration
    - Dependency vulnerability scanning
    - Container image scanning
    - Infrastructure-as-Code security scanning
    - Compliance policy-as-code checks
    - Required approvals for production
12. **Compliance Verification** - Deployment compliance:
    - Change management documentation
    - Approval workflows and audit trails
    - Environment parity verification
    - Configuration drift detection
13. **Troubleshooting** - Deployment issues
14. **Best Practices** - Deployment best practices
15. **Related Documentation** - Cross-references
16. **Changelog** - Version history

### Step 5: Generate and Write LOGGING.md

Use the `write` tool to create `knowledge-base/infrastructure/LOGGING.md` with:

**Required sections**:

1. **Purpose** - Observability strategy
2. **Observability Architecture Diagram** (Mermaid)
3. **Logging Strategy** - Log levels, formats
4. **Log Aggregation** - Centralised logging
5. **Metrics Collection** - Application metrics
6. **Alerting** - Alert rules
7. **Tracing** - Distributed tracing
8. **Dashboards** - Monitoring dashboards
9. **Log Analysis** - Common queries
10. **Security Logging** - Security-specific logging:
    - Authentication events (success, failure, MFA)
    - Authorisation decisions (access granted/denied)
    - Administrative actions (user management, config changes)
    - Data access patterns (sensitive data queries)
    - Security alerts and anomalies
    - Compliance-required events by framework
11. **Audit Trail Requirements** - Compliance audit logging:
    - Immutable log storage
    - Log integrity verification
    - Retention periods by compliance framework
    - Chain of custody documentation
    - Audit log access controls
12. **PII and Sensitive Data Handling** - Data protection in logs:
    - PII detection and masking
    - Sensitive field redaction
    - Log sanitisation procedures
    - Data residency considerations
13. **Troubleshooting** - Observability issues
14. **Best Practices** - Logging best practices
15. **Related Documentation** - Cross-references
16. **Changelog** - Version history

### Step 6: Generate and Write LZ.md

Use the `write` tool to create `knowledge-base/infrastructure/LZ.md` with:

**Required sections**:

1. **Purpose** - Landing zone overview
2. **Network Topology Diagram** (Mermaid)
3. **Cloud Resources** - Resource inventory
4. **VPC Structure** - Virtual network config
5. **Security Boundaries** - Security zones and trust levels
6. **Network Security** - Network security controls:
    - Network segmentation strategy
    - Firewall rules and security groups
    - Web Application Firewall (WAF) configuration
    - DDoS protection measures
    - Private endpoints and service mesh
7. **IAM Policies** - Access management:
    - Role-based access control (RBAC) model
    - Least privilege implementation
    - Service account management
    - Cross-account access patterns
    - Emergency access procedures
8. **Encryption Standards** - Data protection:
    - Encryption at rest (algorithms, key lengths)
    - Encryption in transit (TLS versions, cipher suites)
    - Key management (KMS, HSM, rotation)
    - Certificate management
9. **Resource Groups** - Organisation
10. **Connectivity** - Network connectivity
11. **Compliance Framework Implementation** - Detailed compliance:
    - Framework-specific control mapping
    - Evidence collection procedures
    - Continuous compliance monitoring
    - Gap analysis and remediation tracking
    - Audit preparation checklist
12. **Security Monitoring** - Infrastructure security:
    - Cloud security posture management (CSPM)
    - Configuration compliance scanning
    - Vulnerability management
    - Intrusion detection/prevention
13. **Troubleshooting** - Infrastructure issues
14. **Best Practices** - Cloud best practices
15. **Related Documentation** - Cross-references
16. **Changelog** - Version history

### Step 7: Generate and Write WORKFLOW.md

Use the `write` tool to create `knowledge-base/infrastructure/WORKFLOW.md` with:

**Required sections**:

1. **Purpose** - Workflow overview
2. **Git Flow Diagram** (Mermaid gitGraph)
3. **Branch Naming** - Conventions
4. **Commit Guidelines** - Message standards
5. **Pull Request Process** - PR workflow
6. **Code Review** - Review guidelines including security review
7. **Security in CI/CD** - Security integration:
    - Branch protection rules
    - Required security checks before merge
    - Automated security scanning (SAST, secrets detection)
    - Dependency vulnerability checks
    - Code signing and provenance
    - Security review requirements for sensitive changes
8. **Release Process** - Release workflow
9. **Hotfix Process** - Emergency fixes with security considerations
10. **Access Control** - Repository and pipeline access:
    - Repository access levels
    - Pipeline secrets access
    - Deployment credentials management
    - Periodic access reviews
11. **Development Environment** - Local setup
12. **Troubleshooting** - Workflow issues
13. **Best Practices** - Dev best practices including secure coding
14. **Related Documentation** - Cross-references
15. **Changelog** - Version history

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
    "completeness_score": 0.90
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
- ✅ Each document includes standardised header
- ✅ All required sections present (including security sections)
- ✅ Mermaid diagrams render correctly
- ✅ British English used consistently
- ✅ Cross-references use correct relative paths
- ✅ Completeness score >= 85% for each document
- ✅ Security sections included in all documents per security topics matrix
- ✅ Compliance frameworks addressed with control mappings
- ✅ Security review checklist populated and ready for review
- ✅ All security gaps documented with remediation plans

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
