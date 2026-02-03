---
id: documentation.update-inline-docs
version: 1.0.0
category: documentation
experimental: true
name: Update Inline Documentation
description: Add comprehensive inline documentation to implemented code
tags:
  - documentation
  - code-comments
  - maintainability
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - software-engineer-typescript-backend
  - software-engineer-typescript-frontend
  - platform-engineer
  - secops-engineer
dependencies:
  requires:
    - code.implement-changes
inputs:
  - name: code_changes
    description: Changes from implement-changes
    type: object
    required: true
  - name: files_modified
    description: List of modified files
    type: array
    required: true
outputs:
  - documentation_updated
  - inline_comments_added
  - type_annotations_complete
tokens:
  avg: 3000
  max: 8000
  min: 1500
---

# Update Inline Documentation

## Objective

Add clear, maintainable inline documentation including function docs, inline comments, type annotations, and usage examples.

## Documentation Principles

1. **Explain WHY, not WHAT** - Code shows what, comments explain why
2. **Keep docs close to code** - Inline documentation stays up-to-date
3. **Be concise** - Clear and brief, avoid essay-length comments
4. **Be specific** - Concrete examples over abstract descriptions
5. **Update docs with code** - Outdated docs are worse than no docs

## Instructions

### Step 1: Add Function/Method Documentation

For each public function/method:

#### A. Documentation Format by Language

**TypeScript/JavaScript (JSDoc)**:
```typescript
/**
 * Sends a verification email to the user with a secure token.
 * 
 * The token expires after 24 hours and can only be used once.
 * If email sending fails, the token is not saved to prevent orphaned records.
 * 
 * @param email - User's email address (must be valid format)
 * @param userId - User's unique identifier
 * @returns Promise resolving to verification token details
 * @throws {ValidationError} If email format is invalid
 * @throws {EmailServiceError} If email service is unavailable
 * 
 * @example
 * ```typescript
 * const result = await sendVerificationEmail('user@example.com', '123');
 * console.log(result.token); // 'abc123def456'
 * ```
 */
export async function sendVerificationEmail(
  email: string,
  userId: string
): Promise<VerificationTokenResult> {
  // Implementation
}
```

**Python (docstring)**:
```python
def send_verification_email(email: str, user_id: str) -> VerificationTokenResult:
    """
    Sends a verification email to the user with a secure token.
    
    The token expires after 24 hours and can only be used once.
    If email sending fails, the token is not saved to prevent orphaned records.
    
    Args:
        email: User's email address (must be valid format)
        user_id: User's unique identifier
        
    Returns:
        VerificationTokenResult: Token details including expiration
        
    Raises:
        ValidationError: If email format is invalid
        EmailServiceError: If email service is unavailable
        
    Example:
        >>> result = send_verification_email('user@example.com', '123')
        >>> print(result.token)
        'abc123def456'
    """
    # Implementation
```

**Go (godoc)**:
```go
// SendVerificationEmail sends a verification email to the user with a secure token.
//
// The token expires after 24 hours and can only be used once.
// If email sending fails, the token is not saved to prevent orphaned records.
//
// Parameters:
//   - email: User's email address (must be valid format)
//   - userID: User's unique identifier
//
// Returns the verification token result or an error if validation or sending fails.
//
// Example:
//
//	result, err := SendVerificationEmail("user@example.com", "123")
//	if err != nil {
//	    log.Fatal(err)
//	}
//	fmt.Println(result.Token) // "abc123def456"
func SendVerificationEmail(email string, userID string) (*VerificationTokenResult, error) {
    // Implementation
}
```

#### B. What to Document

**Required for all functions**:
- Purpose and behavior
- Parameters with types and constraints
- Return values and types
- Exceptions/errors that can be thrown

**Required for complex functions**:
- Algorithm description
- Time/space complexity (if relevant)
- Side effects
- Thread safety considerations
- Usage examples

**Required for public APIs**:
- Usage examples
- Common pitfalls
- Related functions
- Deprecated alternatives (if replacing old function)

#### C. Documentation Completeness Checklist

For each function, verify:
- [ ] Purpose clearly stated
- [ ] All parameters documented
- [ ] Return value documented
- [ ] Exceptions/errors documented
- [ ] Constraints and assumptions noted
- [ ] Example provided (for non-trivial functions)

### Step 2: Add Inline Comments

Add comments for:

#### A. Complex Logic

```typescript
// ✅ GOOD - Explains WHY
// We use a sliding window approach to minimize memory usage
// for large datasets while maintaining O(n) time complexity
const result = calculateMovingAverage(data, windowSize);

// ❌ BAD - Explains obvious WHAT
// Calculate moving average
const result = calculateMovingAverage(data, windowSize);
```

#### B. Non-obvious Decisions

```typescript
// ✅ GOOD - Explains decision rationale
// Using 24-hour expiration instead of 1 hour to accommodate
// users in different timezones who may check email later
const TOKEN_EXPIRATION_HOURS = 24;

// ❌ BAD - States the obvious
// Token expiration is 24 hours
const TOKEN_EXPIRATION_HOURS = 24;
```

#### C. Workarounds and Hacks

```typescript
// ✅ GOOD - Explains workaround and links to context
// HACK: Email service has a bug where it doesn't respect
// the 'from' field for transactional emails. Using 'replyTo'
// as workaround until fixed. See issue: JIRA-123
config.replyTo = config.from;
delete config.from;

// ❌ BAD - No context
// Workaround for email service
config.replyTo = config.from;
```

#### D. TODOs and FIXMEs

```typescript
// ✅ GOOD - Context and reason
// TODO: [PERFORMANCE] Add caching for email templates
// Reduces DB queries from ~100/min to ~1/hour
// See performance analysis: docs/perf-analysis.md
const template = await loadEmailTemplate('verification');

// TODO: [SECURITY] Implement rate limiting per user
// Currently global rate limit only. Need per-user to prevent
// abuse via multiple accounts. Target: 5 attempts/hour/user
await sendEmail(email);

// ❌ BAD - No context
// TODO: Add caching
const template = await loadEmailTemplate('verification');
```

**TODO format**: `// TODO: [CATEGORY] Description - Reason/Context`

**Categories**: PERFORMANCE, SECURITY, FEATURE, REFACTOR, BUG, TECH-DEBT

#### E. Magic Numbers Explanation

```typescript
// ✅ GOOD - Named constant with comment
// Maximum token length based on cryptographic requirements
// for 256-bit security (32 bytes = 64 hex characters)
const MAX_TOKEN_LENGTH = 64;

// ❌ BAD - Magic number
if (token.length > 64) { ... }
```

#### F. Algorithm Explanation

```typescript
/**
 * Generates a secure verification token using crypto.randomBytes.
 * 
 * Algorithm:
 * 1. Generate 32 random bytes (256-bit security)
 * 2. Convert to hexadecimal string (64 characters)
 * 3. Add timestamp prefix for token versioning
 * 4. Hash the final token for storage (prevents token leakage)
 */
function generateToken(): string {
  const randomBytes = crypto.randomBytes(32);
  const hexString = randomBytes.toString('hex');
  const timestamp = Date.now().toString(36);
  return hash(`${timestamp}_${hexString}`);
}
```

### Step 3: Add Type Annotations

#### A. TypeScript

Ensure complete type coverage:

```typescript
// ✅ GOOD - Complete type annotations
interface VerificationTokenResult {
  token: string;
  expiresAt: Date;
  userId: string;
}

async function sendVerificationEmail(
  email: string,
  userId: string
): Promise<VerificationTokenResult> {
  // Implementation
}

// ❌ BAD - Missing return type
async function sendVerificationEmail(email: string, userId: string) {
  // TypeScript infers return type, but explicit is better
}
```

#### B. Python Type Hints

```python
# ✅ GOOD - Complete type hints
from typing import Optional
from datetime import datetime

class VerificationTokenResult:
    token: str
    expires_at: datetime
    user_id: str

async def send_verification_email(
    email: str,
    user_id: str
) -> VerificationTokenResult:
    # Implementation
    
# ❌ BAD - Missing type hints
async def send_verification_email(email, user_id):
    # No type information
```

#### C. Document Complex Types

```typescript
/**
 * Configuration for email verification system.
 * 
 * @property tokenExpiration - Hours until token expires (default: 24)
 * @property maxRetries - Maximum send attempts (default: 3)
 * @property emailTemplate - Template ID or custom HTML
 * @property onSuccess - Callback fired after successful send
 * @property onFailure - Callback fired after all retries fail
 */
interface EmailVerificationConfig {
  tokenExpiration?: number;
  maxRetries?: number;
  emailTemplate: string | EmailTemplateCustom;
  onSuccess?: (result: VerificationTokenResult) => void;
  onFailure?: (error: Error) => void;
}
```

### Step 4: Add Usage Examples

For complex or non-obvious functions:

#### A. Basic Usage Example

```typescript
/**
 * @example
 * Basic usage:
 * ```typescript
 * const result = await sendVerificationEmail(
 *   'user@example.com',
 *   'user-123'
 * );
 * console.log(`Token: ${result.token}`);
 * ```
 */
```

#### B. Advanced Usage Example

```typescript
/**
 * @example
 * With custom configuration:
 * ```typescript
 * const result = await sendVerificationEmail(
 *   'user@example.com',
 *   'user-123',
 *   {
 *     tokenExpiration: 48, // 48 hours instead of default 24
 *     emailTemplate: 'custom-verification-template',
 *     onSuccess: (result) => {
 *       logger.info('Verification email sent', { token: result.token });
 *     }
 *   }
 * );
 * ```
 */
```

#### C. Error Handling Example

```typescript
/**
 * @example
 * With error handling:
 * ```typescript
 * try {
 *   const result = await sendVerificationEmail(email, userId);
 *   await saveTokenToDatabase(result.token);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error('Invalid email format:', email);
 *   } else if (error instanceof EmailServiceError) {
 *     console.error('Email service unavailable, retry later');
 *   }
 * }
 * ```
 */
```

### Step 5: Document Module/Class Purpose

For each file/module:

```typescript
/**
 * Email verification service.
 * 
 * This module provides functionality for sending verification emails
 * to users during registration. It handles token generation, email
 * sending, and token validation.
 * 
 * Key features:
 * - Secure token generation (256-bit)
 * - Automatic token expiration (24 hours default)
 * - Rate limiting support
 * - Retry logic for email sending
 * - Template-based email content
 * 
 * Dependencies:
 * - nodemailer: Email sending
 * - crypto: Secure token generation
 * - database: Token storage
 * 
 * @module email-verification
 * @see {@link https://docs.example.com/email-verification}
 */

// Module implementation
```

### Step 6: Document Component Props (Frontend)

For React/Vue components:

```typescript
/**
 * Verification form component for email verification.
 * 
 * Displays an input field for the verification token and handles
 * submission with validation and error handling.
 * 
 * @component
 * @example
 * ```tsx
 * <VerificationForm
 *   onSubmit={(token) => verifyEmail(token)}
 *   onError={(error) => showNotification(error)}
 *   loading={isVerifying}
 * />
 * ```
 */
interface VerificationFormProps {
  /** Callback fired when form is submitted with valid token */
  onSubmit: (token: string) => void;
  
  /** Callback fired when validation or submission fails */
  onError?: (error: Error) => void;
  
  /** Whether the form is in loading state */
  loading?: boolean;
  
  /** Custom CSS class for styling */
  className?: string;
  
  /** Initial token value (for pre-filled forms) */
  initialToken?: string;
}
```

### Step 7: Update Documentation Checklist

Track documentation updates:

```json
{
  "files_documented": [
    {
      "file": "src/services/email.ts",
      "functions_documented": 3,
      "classes_documented": 1,
      "types_documented": 5,
      "inline_comments": 12,
      "examples_provided": 2
    }
  ]
}
```

### Step 8: Verify Documentation Quality

For each documented function:
- [ ] Purpose is clear
- [ ] Parameters are explained
- [ ] Return value is documented
- [ ] Exceptions are listed
- [ ] Example is provided (if complex)
- [ ] WHY is explained (not just WHAT)
- [ ] No outdated comments
- [ ] No commented-out code
- [ ] TODOs have context

## Output Format

```json
{
  "documentation_updated": true,
  "inline_comments_added": {
    "files": [
      {
        "path": "src/services/email.ts",
        "functions_documented": 3,
        "inline_comments": 12,
        "examples": 2,
        "todos": 1
      }
    ],
    "total_comments": 12,
    "total_functions_documented": 3
  },
  "type_annotations_complete": true,
  "documentation_quality": {
    "completeness": "high",
    "clarity": "high",
    "examples": "sufficient"
  }
}
```

## Success Criteria

- ✅ All public functions documented
- ✅ All parameters and return values documented
- ✅ Complex logic explained with comments
- ✅ Type annotations complete
- ✅ Examples provided for non-trivial functions
- ✅ TODOs have context and categorization
- ✅ No commented-out code
- ✅ No outdated comments

## Rules

**DO**:
- ✅ Explain WHY, not WHAT
- ✅ Keep comments concise
- ✅ Update comments when code changes
- ✅ Provide examples for complex functions
- ✅ Document assumptions and constraints
- ✅ Add context to TODOs
- ✅ Use proper documentation format for language

**DON'T**:
- ❌ Don't state the obvious
- ❌ Don't leave outdated comments
- ❌ Don't comment out code (delete it)
- ❌ Don't write essay-length comments
- ❌ Don't use vague TODOs
- ❌ Don't duplicate type information in comments
- ❌ Don't add comments for self-explanatory code

