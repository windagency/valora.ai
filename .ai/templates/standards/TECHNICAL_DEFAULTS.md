# Technical Defaults & Standards

This document provides default technical decisions to reduce clarification cycles during planning and specification phases. Use these defaults unless explicitly overridden by requirements.

---

## Technology Stack Defaults

### TypeScript Projects (Node.js/React)

**Mandated Stack** (not negotiable):
```yaml
package_manager: pnpm  # NEVER npm or yarn
dev_environment: devcontainer  # Required for consistency
unit_testing: vitest  # NEVER jest, mocha
e2e_testing: playwright  # NEVER cypress, puppeteer
container_testing: testcontainers  # For database/service tests
```

**Default Stack** (use unless specified otherwise):
```yaml
validation: zod  # Input/schema validation
http_client: axios  # For external API calls
logging: pino  # Structured logging
state_management_react: zustand  # Lightweight, simple
forms_react: react-hook-form  # With zod resolver
query_client_react: tanstack-query  # Server state management
ui_components_react: radix-ui  # Headless, accessible
styling_react: css-modules  # Or tailwindcss
```

**Reasoning**: These tools are already proven, well-documented, and align with project standards.

---

## Architecture Defaults

### Project Structure

**Backend (Node.js/Express)**:
```
src/
├── types/           # TypeScript types and interfaces
├── models/          # Database models/entities
├── repositories/    # Data access layer
├── services/        # Business logic
├── controllers/     # Request handlers
├── routes/          # Route definitions
├── middleware/      # Express middleware
├── utils/           # Helper functions
└── config/          # Configuration
```

**Frontend (React)**:
```
src/
├── components/
│   ├── atoms/       # Basic building blocks
│   ├── molecules/   # Composite components
│   ├── organisms/   # Complex components
│   ├── templates/   # Page layouts
│   └── pages/       # Full pages
├── hooks/           # Custom React hooks
├── services/        # API clients
├── stores/          # State management
├── types/           # TypeScript types
└── utils/           # Helper functions
```

**Reasoning**: Atomic Design for frontend, layered architecture for backend.

---

## Naming Conventions

### Files and Directories

**Default Conventions**:
```yaml
files: kebab-case  # user-profile.ts
directories: kebab-case  # user-profile/
components: PascalCase  # UserProfile.tsx
test_files: <name>.test.ts  # user-profile.test.ts
types: <name>.types.ts  # user-profile.types.ts
styles: <name>.module.css  # user-profile.module.css
```

### Code

**TypeScript/JavaScript**:
```typescript
// Classes/Interfaces: PascalCase (nouns)
class UserRepository { }
interface PaymentGateway { }

// Functions/Methods: camelCase (verbs for actions, nouns for getters)
function calculateTotal() { }
function userName() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';

// Variables: camelCase
const userEmail = 'test@example.com';
let retryCount = 0;
```

**Avoid**:
- ❌ Hungarian notation: `IPaymentGateway`, `strUserName`
- ❌ Verbs for classes: `ProcessData`, `HandleRequest`
- ❌ Abbreviations: `usr`, `btn`, `msg` (unless extremely common: `id`, `url`, `api`)

---

## Testing Defaults

### Test Organization

**File naming**:
```
src/services/user.ts         → tests/unit/services/user.test.ts
src/routes/auth.ts           → tests/integration/routes/auth.test.ts
src/components/LoginForm.tsx → tests/e2e/login.spec.ts
```

**Test structure** (Vitest):
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test' };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result.email).toBe(userData.email);
    });

    it('should throw error for invalid email', async () => {
      // Arrange
      const invalidData = { email: 'invalid', name: 'Test' };

      // Act & Assert
      await expect(userService.createUser(invalidData)).rejects.toThrow('Invalid email');
    });
  });
});
```

### Coverage Targets

**Minimum Requirements**:
```yaml
line_coverage: 80%
branch_coverage: 75%
function_coverage: 90%
statement_coverage: 80%
```

**Test Types Required**:
- ✅ Unit tests for all business logic
- ✅ Integration tests for all API endpoints
- ✅ E2E tests for critical user flows
- ✅ Accessibility tests (vitest-axe) for all UI components

---

## Error Handling Defaults

### Standard Error Response (APIs)

**Format**:
```typescript
interface ErrorResponse {
  error: {
    code: string;           // e.g., "VALIDATION_ERROR", "NOT_FOUND"
    message: string;        // Human-readable message
    details?: unknown;      // Optional additional context
    timestamp: string;      // ISO 8601
    path: string;          // Request path
  };
}
```

**Example**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is invalid",
    "details": {
      "field": "email",
      "value": "invalid-email"
    },
    "timestamp": "2025-01-30T12:34:56.789Z",
    "path": "/api/users"
  }
}
```

### HTTP Status Codes

**Use these by default**:
```yaml
200: Successful GET, PUT, PATCH
201: Successful POST (resource created)
204: Successful DELETE (no content)
400: Bad request (validation error)
401: Unauthorized (missing/invalid auth)
403: Forbidden (insufficient permissions)
404: Not found (resource doesn't exist)
409: Conflict (duplicate resource)
422: Unprocessable entity (semantic error)
500: Internal server error
503: Service unavailable
```

---

## Security Defaults

### Authentication

**Default Approach**: JWT tokens

**Token Structure**:
```typescript
interface JWTPayload {
  sub: string;        // User ID
  email: string;      // User email
  role: string;       // User role (e.g., "user", "admin")
  iat: number;        // Issued at
  exp: number;        // Expiration
}
```

**Token Expiration**:
```yaml
access_token: 15 minutes
refresh_token: 7 days
email_verification: 24 hours
password_reset: 1 hour
```

### Password Hashing

**Default Algorithm**: Argon2

**Fallback**: bcrypt (10 rounds minimum)

**Never Use**: MD5, SHA1, plain bcrypt < 10 rounds

### Input Validation

**Always Validate**:
- ✅ All user inputs (body, query, params)
- ✅ Email addresses (use regex + DNS check)
- ✅ URLs (whitelist protocols: https, http)
- ✅ File uploads (type, size, extension)
- ✅ JSON payloads (schema validation with Zod)

**Never Trust**:
- ❌ Client-side validation alone
- ❌ User-provided IDs without authorization check
- ❌ File extensions (check MIME type)
- ❌ Redirect URLs (whitelist domains)

---

## Database Defaults

### ORM/Query Builder

**Default**: Prisma (for TypeScript projects)

**Migrations**:
```bash
# Create migration
pnpm prisma migrate dev --name add_user_email_verified

# Apply migration (production)
pnpm prisma migrate deploy

# Rollback (if supported)
pnpm prisma migrate reset
```

### Indexing Strategy

**Always Index**:
- Primary keys (automatic)
- Foreign keys
- Columns in WHERE clauses
- Columns in ORDER BY clauses
- Frequently joined columns

**Index Naming**:
```sql
-- Format: idx_<table>_<column1>_<column2>
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_posts_author_created ON posts(author_id, created_at);
```

### Query Performance

**Default Rules**:
- ✅ Use `SELECT` with specific columns (not `SELECT *`)
- ✅ Add `LIMIT` to queries returning multiple rows
- ✅ Use pagination (offset/limit or cursor-based)
- ✅ Avoid N+1 queries (use joins or eager loading)
- ✅ Use database transactions for multi-step operations

**Pagination Default**:
```typescript
interface PaginationParams {
  page: number;       // Default: 1
  limit: number;      // Default: 20, Max: 100
  sortBy?: string;    // Default: "created_at"
  sortOrder?: "asc" | "desc";  // Default: "desc"
}
```

---

## Logging Defaults

### Log Levels

**When to Use Each Level**:
```yaml
error: Operation failures, exceptions
warn: Recoverable issues, deprecation warnings
info: Key business events (user registered, order placed)
debug: Detailed debugging info (dev/staging only)
trace: Very verbose debugging (dev only)
```

### Structured Logging Format

**Use JSON** (parseable by log aggregators):
```typescript
logger.info('User registered', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString(),
  source: 'auth-service',
  action: 'register'
});
```

**Don't Log**:
- ❌ Passwords or tokens
- ❌ Full credit card numbers
- ❌ Social Security Numbers
- ❌ PII without anonymization (in production)

---

## API Design Defaults

### RESTful Conventions

**Resource Naming**:
```yaml
# Plural nouns for collections
GET    /api/users          # List users
POST   /api/users          # Create user
GET    /api/users/:id      # Get user
PUT    /api/users/:id      # Replace user (full update)
PATCH  /api/users/:id      # Update user (partial)
DELETE /api/users/:id      # Delete user

# Nested resources
GET    /api/users/:id/posts          # User's posts
POST   /api/users/:id/posts          # Create post for user
GET    /api/users/:id/posts/:postId  # Specific post
```

**Query Parameters**:
```yaml
# Filtering
GET /api/users?role=admin&status=active

# Sorting
GET /api/users?sortBy=created_at&sortOrder=desc

# Pagination
GET /api/users?page=2&limit=20

# Search
GET /api/users?search=john
```

### Request/Response Format

**Request Body (POST/PUT/PATCH)**:
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user"
}
```

**Success Response**:
```json
{
  "data": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "createdAt": "2025-01-30T12:34:56.789Z"
  },
  "meta": {
    "timestamp": "2025-01-30T12:34:56.789Z"
  }
}
```

**Collection Response (with pagination)**:
```json
{
  "data": [
    { "id": "usr_1", "email": "user1@example.com" },
    { "id": "usr_2", "email": "user2@example.com" }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

## Performance Defaults

### Caching Strategy

**Default TTLs**:
```yaml
static_content: 1 year  # CSS, JS, images (with cache busting)
api_responses: 5 minutes  # Frequently changing data
user_sessions: 1 hour  # User-specific data
database_queries: 10 minutes  # Expensive queries
```

**Cache Headers**:
```http
# Immutable static assets
Cache-Control: public, max-age=31536000, immutable

# API responses
Cache-Control: public, max-age=300

# Private user data
Cache-Control: private, max-age=3600

# Never cache
Cache-Control: no-store
```

### Rate Limiting

**Default Limits**:
```yaml
# Per IP address
public_endpoints: 100 requests/15 minutes
auth_endpoints: 5 requests/15 minutes (login, register)
api_general: 1000 requests/hour
api_burst: 10 requests/second

# Per user (authenticated)
api_general: 10000 requests/hour
api_burst: 100 requests/second
```

---

## Accessibility Defaults

### WCAG Compliance

**Target Level**: WCAG 2.1 AA

**Required Attributes**:
```html
<!-- Forms -->
<label for="email">Email</label>
<input id="email" type="email" aria-required="true" />

<!-- Buttons -->
<button aria-label="Close dialog">×</button>

<!-- Images -->
<img src="logo.png" alt="Company logo" />

<!-- Landmarks -->
<nav aria-label="Main navigation">
<main aria-label="Main content">
<aside aria-label="Sidebar">
```

### Keyboard Navigation

**Required Support**:
- ✅ Tab: Navigate forward
- ✅ Shift+Tab: Navigate backward
- ✅ Enter: Activate button/link
- ✅ Space: Activate button, check/uncheck checkbox
- ✅ Escape: Close modals/dialogs
- ✅ Arrow keys: Navigate within components (lists, menus)

---

## Git Workflow Defaults

### Commit Message Format

**Convention**: Conventional Commits

**Format**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
```yaml
feat: New feature
fix: Bug fix
docs: Documentation only
style: Formatting, missing semicolons
refactor: Code change that neither fixes bug nor adds feature
perf: Performance improvement
test: Adding tests
chore: Build process or auxiliary tool changes
```

**Examples**:
```
feat(auth): add email verification

Implement email verification flow with JWT tokens.
Users receive verification email on registration.

Closes #123

---

fix(api): prevent SQL injection in user search

Use parameterized queries instead of string concatenation.

---

docs(readme): update installation instructions

Add devcontainer setup steps.
```

### Branch Naming

**Format**: `<type>/<short-description>`

**Examples**:
```
feature/email-verification
bugfix/sql-injection-users
hotfix/login-csrf
chore/upgrade-dependencies
docs/api-documentation
```

---

## Decision Heuristics

### When to Add a Dependency

**Ask yourself**:
1. Is it actively maintained? (commits in last 6 months)
2. Is it widely used? (> 10k weekly downloads)
3. Is the license compatible? (MIT, Apache 2.0, BSD)
4. Does it solve a non-trivial problem? (don't install for 5 lines of code)
5. Is it well-documented?

**If NO to any**: Reconsider or use alternative.

### When to Use a Library vs Build Custom

**Use Library**:
- ✅ Security-critical (auth, crypto)
- ✅ Complex algorithms (date manipulation, validation)
- ✅ Cross-browser compatibility needed
- ✅ Well-established patterns (forms, state management)

**Build Custom**:
- ✅ Simple logic (< 20 lines)
- ✅ Very specific to your use case
- ✅ Performance-critical and library is bloated
- ✅ Learning opportunity (non-production)

### When to Refactor

**Refactor if**:
- ✅ Duplicated code in 3+ places
- ✅ Function > 50 lines
- ✅ Cyclomatic complexity > 10
- ✅ Adding feature requires changing many files
- ✅ Tests are brittle and break often

**Don't refactor if**:
- ❌ Working on tight deadline
- ❌ Code rarely changes
- ❌ No test coverage (refactor later with tests)
- ❌ Just for "cleaner code" without measurable benefit

---

## Clarification Reduction

**Use these defaults to avoid asking**:
1. "Which package manager?" → **pnpm**
2. "Which test framework?" → **Vitest** (unit/integration), **Playwright** (E2E)
3. "How should I structure folders?" → See **Architecture Defaults** above
4. "What naming convention?" → See **Naming Conventions** above
5. "How should I handle errors?" → See **Error Handling Defaults**
6. "Should I add validation?" → **Yes, always**
7. "Should I add logging?" → **Yes, at service boundaries**
8. "Should I add tests?" → **Yes, minimum 80% coverage**
9. "Which HTTP status code?" → See **HTTP Status Codes** above
10. "How should I format commit messages?" → **Conventional Commits**

---

## Override Protocol

If a requirement explicitly contradicts these defaults:
1. Follow the requirement (requirements > defaults)
2. Document the deviation in implementation notes
3. Explain the reason for the override

**Example**:
```json
{
  "override": {
    "default": "pnpm package manager",
    "actual": "yarn",
    "reason": "Legacy monorepo already uses yarn workspaces"
  }
}
```

---

## Version

**Version**: 1.0
**Last Updated**: 2026-01-30
**Applies to**: All TypeScript/JavaScript projects in this repository

---

**Purpose**: Reduce planning/specification time by providing sensible defaults for common technical decisions. These defaults are based on industry best practices and project experience.
