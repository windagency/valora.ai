---
id: code.implement-changes
version: 1.0.0
category: code
experimental: true
name: Implement Code Changes
description: Execute code changes following implementation plan with quality standards
tags:
  - implementation
  - code-generation
  - refactoring
model_requirements:
  min_context: 200000
  recommended:
    - claude-sonnet-4.5
agents:
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - platform-engineer
  - secops-engineer
dependencies:
  requires:
    - context.load-implementation-context
    - code.validate-prerequisites
    - context.use-modern-cli-tools
inputs:
  - name: implementation_scope
    description: Scope from load-implementation-context
    type: object
    required: true
  - name: target_files
    description: Files to modify/create from context
    type: array
    required: true
  - name: mode
    description: Implementation mode
    type: string
    required: false
    default: "standard"
    validation:
      enum: ["standard", "step-by-step", "dry-run"]
  - name: step
    description: Current step number for step-by-step mode
    type: number
    required: false
outputs:
  - code_changes
  - files_modified
  - implementation_notes
  - breaking_changes
tokens:
  avg: 8000
  max: 20000
  min: 3000
---

# Implement Code Changes

## Objective

Write production-quality code following the implementation plan, applying language-specific best practices and maintaining code quality standards.

## Execution Mode

**You have access to file manipulation tools. Use them to execute the implementation.**

- **Standard mode** (default): Use `read_file`, `write`, `search_replace`, `delete_file`, and `run_terminal_cmd` to actually create, modify, and delete files. Execute the implementation plan by making real changes to the codebase.
- **Dry-run mode** (`--dry-run`): Do NOT modify any files. Instead, describe what changes would be made and output the planned changes as JSON.

**Check the `mode` input**: If `mode` equals `"dry-run"`, only describe changes. Otherwise, execute them.

## Tool Usage

When executing (not dry-run), use these tools:

| Tool               | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `read_file`        | Read existing file contents before modifying                        |
| `write`            | Create new files or completely rewrite existing files               |
| `search_replace`   | Make targeted edits to existing files (preferred for modifications) |
| `delete_file`      | Remove files that are no longer needed                              |
| `run_terminal_cmd` | Run commands (npm install, etc.)                                    |
| `glob_file_search` | Find files by pattern                                               |
| `grep`             | Search file contents                                                |

**Important**: Always read a file before modifying it with `search_replace` to understand context.

**Protected Files**: The following files are protected from accidental overwrite when they already exist:
- `.gitignore`, `.gitattributes`, `.editorconfig`
- `.env`, `.env.local`, `.env.production`, `.env.development`
- `.npmrc`, `.nvmrc`

If you need to modify a protected file that already exists, use `search_replace` instead of `write`. The `write` tool will reject attempts to overwrite these files.

## Core Principles

Apply these principles consistently:

1. **SOLID** - Single responsibility, Open/Closed, Liskov substitution, Interface segregation, Dependency inversion
2. **DRY** - Don't Repeat Yourself, extract common logic
3. **KISS** - Keep It Simple, prefer simple over clever
4. **YAGNI** - You Aren't Gonna Need It, implement only what's needed
5. **Clean Code** - Meaningful names, small functions, proper error handling

## Instructions

### Step 1: Plan Implementation Order

Determine optimal order for changes:

**Recommended order**:
1. Schema/data model changes (if any)
2. Backend/API changes (if backend)
3. Frontend/UI changes (if frontend)
4. Infrastructure changes (if platform)
5. Configuration updates
6. Integration points

**For step-by-step mode**: Implement only current step's files

**Output**:
```json
{
  "implementation_order": [
    {"file": "src/models/user.ts", "reason": "Schema change first"},
    {"file": "src/services/email.ts", "reason": "New service"},
    {"file": "src/routes/auth.ts", "reason": "Integrate service into API"}
  ]
}
```

### Step 2: Implement File Changes

For each file in implementation order, **execute these actions using tools**:

#### A. Read Existing File (if modifying)

**Execute with `read_file` tool**:
```
read_file: path/to/file.ts
```

Then analyze:
1. Understand structure and patterns
2. Identify integration points
3. Note existing error handling patterns
4. Check for related utilities/helpers

#### B. Plan Modifications

**Consider**:
- Where to add new code (logical placement)
- What existing code to modify
- What imports/dependencies to add
- How to maintain backwards compatibility
- Error handling strategy
- Input validation approach

#### C. Write/Modify Code

**For new files, use `write` tool**:
```
write: path/to/new-file.ts
content: <full file content>
```

**For existing files, use `search_replace` tool**:
```
search_replace: path/to/existing-file.ts
old_str: <exact text to replace>
new_str: <replacement text>
```

**Prefer `search_replace` over `write`** for modifications - it's safer and preserves unchanged code.

Apply these quality standards:

**Function Design**:
- Functions should do one thing
- Maximum 50 lines per function (guideline)
- Maximum 4 parameters (consider options object if more)
- Clear, descriptive names (verb + noun for functions)
- Return early for error cases

**Error Handling**:
- Always handle errors explicitly
- Use try-catch for async operations
- Provide meaningful error messages
- Include error context (what operation failed)
- Log errors appropriately

**Input Validation**:
- Validate all external inputs
- Use type checking/validation libraries
- Provide clear validation error messages
- Handle edge cases (null, undefined, empty)

**Code Organization**:
- Group related functions
- Order: constants → types → helpers → main functions
- Consistent formatting (use project style)
- Meaningful variable names (no single letters except loops)

**Comments**:
- Explain WHY, not WHAT
- Document complex logic
- Note assumptions and constraints
- Flag TODOs with context: `// TODO: <description> - <reason>`

**Examples**:

```typescript
// ❌ BAD
function p(d) {
  return d.map(x => x * 2);
}

// ✅ GOOD
function doubleValues(data: number[]): number[] {
  return data.map(value => value * 2);
}
```

```typescript
// ❌ BAD - No error handling
async function sendEmail(to: string, subject: string, body: string) {
  await emailService.send(to, subject, body);
}

// ✅ GOOD - Proper error handling
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    validateEmail(to);
    await emailService.send(to, subject, body);
    return { success: true };
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

```typescript
// ❌ BAD - Magic numbers
if (retries > 3) { ... }

// ✅ GOOD - Named constants
const MAX_RETRY_ATTEMPTS = 3;
if (retries > MAX_RETRY_ATTEMPTS) { ... }
```

#### D. Add Integration Code

**For new functions/modules**:
- Export public API
- Update barrel exports (index files)
- Register with dependency injection (if used)
- Add to relevant registries/configs

**For API changes**:
- Update route registrations
- Add middleware (validation, auth, etc.)
- Update API documentation comments
- Consider versioning for breaking changes

**For UI changes**:
- Export components properly
- Update component indexes
- Register with routers/navigation
- Add to style systems

### Step 3: Validate Code Quality (Real-Time)

**Purpose**: Catch and fix linter violations immediately during code generation, preventing rework in assert phase.

After writing/modifying each file, run quality checks:

#### A. Run ESLint Validation

**Execute with `run_terminal_cmd` tool**:
```bash
pnpm exec eslint <file-path> --format json
```

**Parse results**:
```json
{
  "eslint_validation": {
    "file": "src/services/email.ts",
    "errors": [],
    "warnings": [
      {
        "line": 15,
        "column": 7,
        "rule": "no-unused-vars",
        "message": "Variable 'emailTemplate' is defined but never used"
      }
    ],
    "fixable_count": 1
  }
}
```

#### B. Auto-Fix Common Issues

If fixable violations exist, run auto-fix:

```bash
pnpm exec eslint <file-path> --fix
```

**Common auto-fixable issues**:
- Missing semicolons
- Inconsistent spacing
- Trailing whitespace
- Import order
- Quotes (single vs double)

#### C. Manual Fix for Non-Auto-Fixable Issues

For issues that can't be auto-fixed, modify the code:

**Example: Unused variable**:
```typescript
// ❌ ESLint error: 'emailTemplate' is defined but never used
const emailTemplate = getTemplate();
await sendEmail(to, subject, body);

// ✅ Fixed: Remove unused variable or use it
await sendEmail(to, subject, body, getTemplate());
```

**Example: Missing return type**:
```typescript
// ❌ ESLint error: Missing return type on function
async function sendEmail(to: string) {
  return emailService.send(to);
}

// ✅ Fixed: Add explicit return type
async function sendEmail(to: string): Promise<EmailResult> {
  return emailService.send(to);
}
```

#### D. Run TypeScript Type Check

**Execute**:
```bash
pnpm exec tsc --noEmit
```

**Parse errors**:
```json
{
  "typescript_check": {
    "success": false,
    "errors": [
      {
        "file": "src/services/email.ts",
        "line": 23,
        "code": "TS2345",
        "message": "Argument of type 'string' is not assignable to parameter of type 'EmailOptions'"
      }
    ]
  }
}
```

**Fix type errors immediately**:
- Add missing type annotations
- Fix incorrect type usage
- Add type assertions where safe
- Update function signatures

#### E. Validation Decision Logic

```plaintext
IF eslint errors > 0 OR typescript errors > 0:
  → FIX immediately before proceeding
  → Re-run validation after fixes
  → DO NOT continue to next file until clean

ELSE IF eslint warnings > 0:
  → FIX high-priority warnings (unused vars, missing types)
  → DOCUMENT remaining warnings in implementation_notes
  → OK to proceed

ELSE:
  → ✅ File passes quality checks
  → Continue to next file
```

#### F. Track Validation Results

```json
{
  "file": "src/services/email.ts",
  "validation": {
    "eslint": {
      "passed": true,
      "errors": 0,
      "warnings": 0,
      "auto_fixed": 2
    },
    "typescript": {
      "passed": true,
      "errors": 0
    },
    "fixes_applied": [
      "Auto-fixed missing semicolons (2 instances)",
      "Added return type to sendEmail function"
    ]
  }
}
```

**Time Savings**:
- **Without real-time validation**: Discover all linter errors in assert phase → 3-5 min rework
- **With real-time validation**: Fix errors as you code → 0-1 min incremental fixes
- **Savings**: 3-5 min per workflow + reduced context switching

**Quality Benefits**:
- Cleaner code from the start
- No batch of errors to fix at end
- Better understanding of quality standards
- Immediate feedback loop

### Step 4: Handle Agent-Specific Concerns

#### Backend Engineer Focus

**API Implementation**:
- RESTful conventions (GET, POST, PUT, DELETE)
- Proper HTTP status codes (200, 201, 400, 404, 500)
- Request validation (body, params, query)
- Response formatting (consistent structure)
- Error responses (standard format)

**Database Operations**:
- Use prepared statements/parameterized queries
- Handle transactions for multi-step operations
- Add indexes for queried fields
- Consider migration rollback
- Validate data before insertion

**Business Logic**:
- Separate concerns (controller → service → repository)
- Keep controllers thin
- Put business rules in services
- Use repositories for data access

#### Frontend Engineer Focus

**Component Implementation**:
- Single responsibility per component
- Props validation (TypeScript/PropTypes)
- Proper state management
- Event handler naming (handleClick, onSubmit)
- Accessibility attributes (aria-*, role)

**State Management**:
- Minimize state
- Lift state appropriately
- Use context for global state
- Consider memoization (useMemo, useCallback)
- Avoid prop drilling

**Accessibility**:
- Semantic HTML
- Keyboard navigation support
- Screen reader compatibility
- Focus management
- Color contrast compliance

**Performance**:
- Lazy load components/routes
- Optimize re-renders
- Use keys in lists
- Debounce expensive operations
- Code splitting

#### Platform Engineer Focus

**Infrastructure as Code**:
- Declarative configurations
- Parameterized/reusable modules
- Version pinning
- Documentation comments
- State management (Terraform)

**Container/Deployment**:
- Multi-stage builds
- Minimal base images
- Security scanning
- Health checks
- Resource limits

**CI/CD**:
- Pipeline as code
- Fail fast on errors
- Parallel execution
- Caching strategies
- Rollback mechanisms

#### SecOps Engineer Focus

**Authentication/Authorization**:
- Secure token generation
- Token expiration handling
- Password hashing (bcrypt, argon2)
- Rate limiting
- Session management

**Input Sanitization**:
- SQL injection prevention
- XSS prevention
- CSRF protection
- Input validation
- Output encoding

**Data Protection**:
- Encrypt sensitive data at rest
- Use HTTPS for data in transit
- Secure key management
- Audit logging
- PII handling compliance

### Step 5: Maintain Backwards Compatibility

**Strategies**:
- Add new functions, don't modify existing (if possible)
- Use feature flags for gradual rollout
- Add deprecation notices for old APIs
- Provide migration guides
- Version APIs if breaking changes necessary

**Deprecation notice example**:
```typescript
/**
 * @deprecated Use `sendVerificationEmail()` instead. Will be removed in v2.0.0
 */
export function sendEmail(to: string) {
  // Old implementation
}
```

### Step 6: Add Logging and Observability

**Where to log**:
- Service boundaries (entry/exit)
- External service calls
- Error conditions
- Important state changes
- Performance-sensitive operations

**What to log**:
```typescript
// ✅ GOOD
logger.info('Email verification sent', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString()
});

// ❌ BAD - Too verbose or sensitive
logger.debug('User object:', JSON.stringify(user)); // May contain PII
```

**Log levels**:
- ERROR: Operation failures
- WARN: Recoverable issues
- INFO: Key business events
- DEBUG: Detailed debugging info (dev only)

### Step 7: Track Changes

For each file modified/created:

```json
{
  "file": "src/services/email.ts",
  "operation": "create",
  "changes": {
    "functions_added": ["sendVerificationEmail", "validateEmail"],
    "dependencies_added": ["nodemailer"],
    "exports_added": ["EmailService"],
    "lines_added": 85
  },
  "purpose": "Email verification service implementation",
  "integration_points": ["src/routes/auth.ts"],
  "breaking_changes": false
}
```

### Step 8: Identify Breaking Changes

**Breaking change indicators**:
- Function signature changes
- Removed functions/exports
- Changed return types
- Modified API contracts
- Database schema changes (non-additive)
- Changed configuration requirements

**For each breaking change**:
```json
{
  "type": "function_signature_change",
  "location": "src/services/user.ts:createUser()",
  "old": "createUser(email: string): Promise<User>",
  "new": "createUser(data: CreateUserDTO): Promise<User>",
  "reason": "Support additional fields",
  "migration_path": "Pass {email} object instead of string",
  "affects": ["src/routes/auth.ts", "src/tests/user.test.ts"]
}
```

### Step 9: Add TODOs for Follow-up

Mark items needing future attention:

```typescript
// TODO: [PERFORMANCE] Add caching for email templates - reduces DB queries
// TODO: [SECURITY] Implement rate limiting - prevents abuse
// TODO: [FEATURE] Support HTML email templates - user request #123
// TODO: [REFACTOR] Extract validation logic - reduce duplication
```

**Format**: `// TODO: [CATEGORY] Description - Reason/Context`

## Output Format

### Standard Mode (executed changes)

After using the tools to make changes, report what was done:

```json
{
  "execution_mode": "standard",
  "executed": true,
  "code_changes": {
    "files_created": [
      {
        "path": "src/services/email.ts",
        "purpose": "Email verification service",
        "functions": ["sendVerificationEmail", "validateEmail"],
        "exports": ["EmailService"],
        "dependencies": ["nodemailer"],
        "lines": 85
      }
    ],
    "files_modified": [
      {
        "path": "src/routes/auth.ts",
        "purpose": "Add verification endpoint",
        "changes_made": ["Added verifyEmail endpoint", "Updated register to send verification"],
        "lines_added": 35,
        "lines_removed": 5
      }
    ],
    "files_deleted": [],
    "commands_executed": ["npm install nodemailer"]
  },
  "files_modified": [
    "src/services/email.ts",
    "src/routes/auth.ts",
    "package.json"
  ],
  "implementation_notes": {
    "approach": "Created new EmailService, integrated with auth routes",
    "decisions": [
      "Used nodemailer for email sending (well-tested, popular)",
      "Added token expiration (24 hours) for security"
    ]
  },
  "quality_validation": {
    "eslint": {
      "total_files_checked": 2,
      "files_passed": 2,
      "total_errors": 0,
      "total_warnings": 0,
      "auto_fixes_applied": 3
    },
    "typescript": {
      "passed": true,
      "errors": 0
    },
    "validation_time_ms": 1247,
    "notes": ["Auto-fixed semicolons in email.ts", "Added return type to sendEmail()"]
  },
  "breaking_changes": [],
  "migration_steps": []
}
```

### Dry-Run Mode (proposed changes only)

When `mode` is `"dry-run"`, do NOT execute tools. Instead describe what would be done:

```json
{
  "execution_mode": "dry-run",
  "executed": false,
  "proposed_changes": {
    "files_to_create": [
      {
        "path": "src/services/email.ts",
        "purpose": "Email verification service",
        "proposed_content_summary": "EmailService class with sendVerificationEmail() and validateEmail() methods",
        "estimated_lines": 85
      }
    ],
    "files_to_modify": [
      {
        "path": "src/routes/auth.ts",
        "purpose": "Add verification endpoint",
        "changes_planned": [
          "Add import for EmailService",
          "Add POST /verify-email endpoint",
          "Modify register() to call sendVerificationEmail()"
        ]
      }
    ],
    "files_to_delete": [],
    "commands_to_run": ["npm install nodemailer"]
  },
  "implementation_notes": {
    "approach": "Will create new EmailService, integrate with auth routes",
    "decisions": [
      "Will use nodemailer for email sending (well-tested, popular)",
      "Will add token expiration (24 hours) for security"
    ]
  },
  "breaking_changes": [],
  "migration_steps": []
}
```

## Success Criteria

### Standard Mode
- ✅ All target files actually created/modified using tools
- ✅ `write` or `search_replace` executed for each planned change
- ✅ **Real-time validation**: ESLint and TypeScript checks run after each file
- ✅ **Zero linter errors**: All files pass ESLint validation
- ✅ **Zero type errors**: All files pass TypeScript type check
- ✅ Code follows language best practices
- ✅ Proper error handling in place
- ✅ Input validation implemented
- ✅ Meaningful variable/function names
- ✅ Integration points updated
- ✅ Breaking changes documented
- ✅ No placeholder/stub code
- ✅ No commented-out code
- ✅ No debug statements left in

### Dry-Run Mode
- ✅ No files modified (tools not called)
- ✅ All planned changes clearly described
- ✅ Proposed code snippets included where helpful
- ✅ Breaking changes identified

## Anti-Patterns to Avoid

❌ **Magic Numbers**: Use named constants
❌ **God Objects**: Single responsibility principle
❌ **Deep Nesting**: Max 3 levels, use early returns
❌ **Tight Coupling**: Depend on abstractions
❌ **Missing Error Handling**: Always handle errors
❌ **Inconsistent Naming**: Follow project conventions
❌ **Commented Code**: Delete, don't comment out
❌ **Global State**: Use dependency injection
❌ **Premature Optimization**: Make it work, then optimize
❌ **Hardcoded Values**: Use configuration

## Rules

**EXECUTION (Standard Mode)**:
- ✅ **USE THE TOOLS** - Call `write`, `search_replace`, `read_file` to make actual changes
- ✅ Always `read_file` before `search_replace` to understand context
- ✅ Use `search_replace` for modifications (safer than full `write`)
- ✅ Use `write` for new files
- ✅ **VALIDATE IMMEDIATELY** - Run ESLint and TypeScript checks after each file
- ✅ **FIX BEFORE PROCEEDING** - Fix all errors/warnings before moving to next file
- ✅ Run `run_terminal_cmd` for package installation, builds, etc.
- ❌ Don't just describe changes - execute them
- ❌ Don't skip validation - catch errors early

**DRY-RUN Mode**:
- ✅ Describe all planned changes in detail
- ✅ Include proposed code snippets
- ❌ Don't call any file modification tools

**CODE QUALITY**:
- ✅ Follow existing project patterns
- ✅ Write self-documenting code
- ✅ Handle all error cases
- ✅ Validate all inputs
- ✅ Use meaningful names
- ✅ Keep functions small and focused
- ✅ Add comments for complex logic
- ✅ Consider edge cases

**DON'T**:
- ❌ Don't leave TODOs without context
- ❌ Don't use placeholder comments like "implement later"
- ❌ Don't copy-paste code (extract to function)
- ❌ Don't ignore linter warnings
- ❌ Don't use any/unknown types without justification
- ❌ Don't hardcode configuration values
- ❌ Don't skip input validation
- ❌ Don't implement features not in plan

