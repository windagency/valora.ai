---
id: code.implement-tests
version: 1.0.0
category: code
experimental: true
name: Implement Tests
description: Write comprehensive tests for implemented code
tags:
  - testing
  - test-implementation
  - quality-assurance
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
    - code.implement-changes
  optional:
    - review.validate-test-strategy
inputs:
  - name: code_changes
    description: Changes from implement-changes
    type: object
    required: true
  - name: testing_strategy
    description: Testing strategy from context
    type: object
    required: true
outputs:
  - test_files
  - test_coverage
  - test_results
tokens:
  avg: 7000
  max: 18000
  min: 3000
---

# Implement Tests

## Objective

Write comprehensive, deterministic tests following the AAA pattern (Arrange, Act, Assert) to ensure code quality and correctness.

## Test Quality Standards

1. **Deterministic** - Tests always produce same results
2. **Fast** - Tests run quickly (< 1s per test ideal)
3. **Independent** - Tests don't depend on each other
4. **Readable** - Clear intent and assertions
5. **Maintainable** - Easy to update when code changes

## Instructions

### Step 1: Identify Test Requirements

From `code_changes` and `testing_strategy`:

**Extract**:
- Functions/classes to test
- Test scenarios (happy path, errors, edge cases)
- Test types needed (unit, integration, e2e)
- Coverage targets

**Categorize tests**:
```json
{
  "unit_tests": {
    "target": "src/services/email.ts",
    "functions": ["sendVerificationEmail", "validateEmail"],
    "scenarios": ["happy_path", "error_cases", "edge_cases"]
  },
  "integration_tests": {
    "target": "src/routes/auth.ts",
    "scenarios": ["endpoint_integration", "database_integration"]
  },
  "e2e_tests": {
    "workflows": ["user_registration_with_verification"]
  }
}
```

### Step 2: Write Unit Tests

For each function/method:

#### A. Test Structure (AAA Pattern)

```typescript
describe('FunctionName', () => {
  // Arrange
  const setup = () => {
    // Setup test data, mocks, etc.
    return { /* test fixtures */ };
  };

  it('should <expected behavior> when <condition>', () => {
    // Arrange
    const { testData } = setup();
    
    // Act
    const result = functionName(testData);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

#### B. Test Coverage Matrix

For each function, test:

1. **Happy Path** - Normal, expected usage
2. **Error Cases** - Invalid inputs, failures
3. **Edge Cases** - Boundaries, null/undefined, empty
4. **Boundary Conditions** - Min/max values, limits

**Example test matrix**:
```typescript
describe('sendVerificationEmail', () => {
  // Happy Path
  it('should send email successfully with valid data', async () => {
    // Test implementation
  });

  // Error Cases
  it('should throw error when email service fails', async () => {
    // Test implementation
  });

  it('should throw error when email is invalid', async () => {
    // Test implementation
  });

  // Edge Cases
  it('should handle email with special characters', async () => {
    // Test implementation
  });

  it('should handle maximum email length', async () => {
    // Test implementation
  });

  // Boundary Conditions
  it('should reject email exceeding max length', async () => {
    // Test implementation
  });
});
```

#### C. Mocking External Dependencies

**Mock external services**:
```typescript
import { emailService } from './emailService';

// Mock the module
jest.mock('./emailService');
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should call email service with correct parameters', async () => {
    // Arrange
    mockEmailService.send.mockResolvedValue({ success: true });
    const email = 'user@example.com';

    // Act
    await sendVerificationEmail(email);

    // Assert
    expect(mockEmailService.send).toHaveBeenCalledWith(
      email,
      expect.stringContaining('Verify your email'),
      expect.any(String)
    );
  });
});
```

#### D. Test Data Management

**Good practices**:
- Use test fixtures/factories
- Create helper functions for common setups
- Avoid hardcoding test data in tests
- Use meaningful test data

```typescript
// test-helpers.ts
export const createTestUser = (overrides = {}) => ({
  id: '123',
  email: 'test@example.com',
  name: 'Test User',
  ...overrides
});

// test file
const user = createTestUser({ email: 'custom@example.com' });
```

### Step 3: Write Integration Tests

Test component interactions:

#### A. API Integration Tests

```typescript
describe('POST /auth/verify', () => {
  it('should verify email with valid token', async () => {
    // Arrange
    const token = await createVerificationToken('user@example.com');

    // Act
    const response = await request(app)
      .post('/auth/verify')
      .send({ token });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Email verified successfully'
    });

    // Verify side effects
    const user = await User.findByEmail('user@example.com');
    expect(user.emailVerified).toBe(true);
  });
});
```

#### B. Database Integration Tests

```typescript
describe('EmailService database integration', () => {
  beforeEach(async () => {
    // Setup test database
    await setupTestDatabase();
  });

  afterEach(async () => {
    // Cleanup test database
    await cleanupTestDatabase();
  });

  it('should store verification token in database', async () => {
    // Arrange
    const email = 'user@example.com';

    // Act
    await sendVerificationEmail(email);

    // Assert
    const token = await VerificationToken.findByEmail(email);
    expect(token).toBeDefined();
    expect(token.expiresAt).toBeGreaterThan(new Date());
  });
});
```

### Step 4: Write E2E Tests (When Applicable)

Test complete user workflows:

```typescript
describe('User registration with email verification', () => {
  it('should complete full registration flow', async () => {
    // Arrange
    const userData = {
      email: 'newuser@example.com',
      password: 'SecurePass123!'
    };

    // Act - Register
    const registerResponse = await request(app)
      .post('/auth/register')
      .send(userData);

    expect(registerResponse.status).toBe(201);

    // Assert - Email sent
    const emails = await getTestEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(userData.email);

    // Extract verification token from email
    const token = extractTokenFromEmail(emails[0].body);

    // Act - Verify
    const verifyResponse = await request(app)
      .post('/auth/verify')
      .send({ token });

    // Assert - Verification successful
    expect(verifyResponse.status).toBe(200);

    // Act - Login (should work now)
    const loginResponse = await request(app)
      .post('/auth/login')
      .send(userData);

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.emailVerified).toBe(true);
  });
});
```

### Step 5: Frontend-Specific Tests

For frontend implementations:

#### A. Component Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { VerificationForm } from './VerificationForm';

describe('VerificationForm', () => {
  it('should submit verification token', async () => {
    // Arrange
    const onSubmit = jest.fn();
    render(<VerificationForm onSubmit={onSubmit} />);

    // Act
    const input = screen.getByLabelText('Verification Token');
    fireEvent.change(input, { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText('Verify'));

    // Assert
    expect(onSubmit).toHaveBeenCalledWith({ token: 'abc123' });
  });

  it('should show error for invalid token', async () => {
    // Arrange
    render(<VerificationForm onSubmit={jest.fn()} />);

    // Act
    const input = screen.getByLabelText('Verification Token');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByText('Verify'));

    // Assert
    expect(screen.getByText('Token is required')).toBeInTheDocument();
  });
});
```

#### B. Accessibility Tests

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('VerificationForm Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<VerificationForm onSubmit={jest.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should support keyboard navigation', () => {
    render(<VerificationForm onSubmit={jest.fn()} />);
    const input = screen.getByLabelText('Verification Token');
    
    input.focus();
    expect(document.activeElement).toBe(input);
    
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('Verify'));
  });
});
```

### Step 6: Infrastructure/Platform Tests

For infrastructure code:

```typescript
describe('Docker container configuration', () => {
  it('should build successfully', async () => {
    const result = await exec('docker build -t test-image .');
    expect(result.exitCode).toBe(0);
  });

  it('should expose correct ports', async () => {
    const inspect = await exec('docker inspect test-image');
    const config = JSON.parse(inspect.stdout);
    expect(config[0].Config.ExposedPorts).toHaveProperty('3000/tcp');
  });

  it('should set correct environment variables', async () => {
    const env = await getContainerEnv('test-image');
    expect(env.NODE_ENV).toBe('production');
  });
});
```

### Step 7: Security Tests

For security implementations:

```typescript
describe('Token security', () => {
  it('should generate cryptographically secure tokens', () => {
    const token1 = generateVerificationToken();
    const token2 = generateVerificationToken();
    
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThanOrEqual(32);
  });

  it('should reject expired tokens', async () => {
    const expiredToken = await createExpiredToken();
    
    await expect(verifyToken(expiredToken))
      .rejects
      .toThrow('Token has expired');
  });

  it('should rate limit verification attempts', async () => {
    const attempts = Array(10).fill(null).map(() =>
      request(app).post('/auth/verify').send({ token: 'invalid' })
    );

    const responses = await Promise.all(attempts);
    const tooManyRequests = responses.filter(r => r.status === 429);
    
    expect(tooManyRequests.length).toBeGreaterThan(0);
  });
});
```

### Step 8: Test Organization

**File structure**:
```
src/
  services/
    email.ts
    email.test.ts          # Unit tests co-located
  routes/
    auth.ts
    auth.test.ts           # Unit tests co-located
tests/
  integration/
    auth-flow.test.ts      # Integration tests
  e2e/
    registration.test.ts   # E2E tests
  helpers/
    test-helpers.ts        # Shared test utilities
```

### Step 9: Run Tests and Capture Results

**Execute test suite**:
```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- email.test.ts
```

**Capture results**:
```json
{
  "test_results": {
    "total_tests": 45,
    "passed": 45,
    "failed": 0,
    "skipped": 0,
    "duration": "3.52s",
    "suites": [
      {
        "name": "EmailService",
        "tests": 12,
        "passed": 12,
        "failed": 0,
        "duration": "0.85s"
      }
    ]
  },
  "coverage": {
    "statements": 92.5,
    "branches": 88.3,
    "functions": 95.2,
    "lines": 91.8
  }
}
```

### Step 10: Document Test Coverage

**Track what's tested**:
```json
{
  "test_coverage_by_file": {
    "src/services/email.ts": {
      "coverage_percent": 95.2,
      "untested_lines": [47, 48],
      "untested_reason": "Error recovery path - hard to mock",
      "test_file": "src/services/email.test.ts",
      "test_count": 12
    },
    "src/routes/auth.ts": {
      "coverage_percent": 88.5,
      "untested_lines": [],
      "test_file": "src/routes/auth.test.ts",
      "test_count": 15
    }
  }
}
```

## Output Format

```json
{
  "test_files": [
    {
      "path": "src/services/email.test.ts",
      "type": "unit",
      "target": "src/services/email.ts",
      "test_count": 12,
      "test_scenarios": ["happy_path", "error_cases", "edge_cases"],
      "functions_tested": ["sendVerificationEmail", "validateEmail"]
    },
    {
      "path": "tests/integration/auth-flow.test.ts",
      "type": "integration",
      "target": "src/routes/auth.ts",
      "test_count": 8,
      "test_scenarios": ["api_integration", "database_integration"]
    }
  ],
  "test_coverage": {
    "overall": {
      "statements": 92.5,
      "branches": 88.3,
      "functions": 95.2,
      "lines": 91.8
    },
    "by_file": {
      "src/services/email.ts": 95.2,
      "src/routes/auth.ts": 88.5
    },
    "uncovered_areas": [
      {
        "file": "src/services/email.ts",
        "lines": [47, 48],
        "reason": "Error recovery path - hard to mock"
      }
    ]
  },
  "test_results": {
    "total_tests": 45,
    "passed": 45,
    "failed": 0,
    "skipped": 0,
    "duration": "3.52s"
  }
}
```

## Success Criteria

- ✅ All new functions have unit tests
- ✅ Happy paths tested
- ✅ Error cases tested
- ✅ Edge cases tested
- ✅ Integration points tested
- ✅ All tests pass
- ✅ Coverage meets threshold (80%+)
- ✅ Tests are deterministic
- ✅ Tests are independent
- ✅ Tests follow AAA pattern

## Coverage Requirements (Quality Score Target: >= 70)

### Minimum Thresholds (MUST PASS)

| Metric | Threshold | Priority |
|--------|-----------|----------|
| **Overall Line Coverage** | >= 80% | Critical |
| **Overall Branch Coverage** | >= 70% | Critical |
| **Overall Function Coverage** | >= 85% | Critical |
| **New Code Coverage** | >= 90% | Critical |

### Tests Per Function

| Requirement | Minimum Count |
|-------------|---------------|
| Happy path tests | >= 1 |
| Error case tests | >= 2 |
| Edge case tests | >= 1 |
| **Total per function** | **>= 4** |

### Coverage by File Type

| File Type | Line Coverage | Branch Coverage |
|-----------|---------------|-----------------|
| Service/Business Logic | >= 85% | >= 75% |
| Controllers/Routes | >= 80% | >= 70% |
| Utilities/Helpers | >= 90% | >= 80% |

### Critical Path Requirements (MUST be 100%)

These MUST have complete test coverage:
- Authentication flows (login, logout, token refresh)
- Authorization checks (permission validation)
- Input validation (sanitisation, type checking)
- Error handling (catch blocks, error responses)

### Quality Score Calculation

```
Score = (
  Line Coverage * 0.30 +
  Branch Coverage * 0.25 +
  Function Coverage * 0.20 +
  New Code Coverage * 0.15 +
  Test Diversity * 0.10
) * 100
```

**Target**: Score >= 70 (Grade B or higher)

### Reference Template

See `.ai/templates/TEST_GENERATION_REQUIREMENTS.md` for detailed examples and patterns

## Rules

**DO**:
- ✅ Test behavior, not implementation
- ✅ Use descriptive test names
- ✅ Mock external dependencies
- ✅ Test error conditions
- ✅ Keep tests simple and focused
- ✅ Use setup/teardown for common code
- ✅ Make assertions specific

**DON'T**:
- ❌ Don't test private methods directly
- ❌ Don't make tests dependent on each other
- ❌ Don't use real external services in tests
- ❌ Don't skip writing tests
- ❌ Don't use random data in tests
- ❌ Don't test framework code
- ❌ Don't make tests too complex
- ❌ Don't use setTimeout in tests (makes them flaky)

