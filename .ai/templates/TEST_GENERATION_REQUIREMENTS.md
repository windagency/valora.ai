# Test Generation Requirements

## Purpose

This template defines specific test generation requirements to ensure high-quality test coverage. Use this when generating tests during implementation to achieve quality score >= 70.

---

## Minimum Test Requirements Per Function

### For Each Public Function/Method

| Requirement | Count | Description |
|-------------|-------|-------------|
| **Happy Path Tests** | >= 1 | Normal, expected usage |
| **Error Case Tests** | >= 2 | Invalid inputs, failure scenarios |
| **Edge Case Tests** | >= 1 | Boundaries, null, empty, extremes |
| **Total Minimum** | >= 4 | Per public function |

### Test Naming Convention

```typescript
describe('[ClassName/ModuleName]', () => {
  describe('[methodName]', () => {
    // Happy path
    it('should [expected behavior] when [valid condition]', () => {});

    // Error cases
    it('should throw [ErrorType] when [invalid condition]', () => {});
    it('should return [error result] when [failure condition]', () => {});

    // Edge cases
    it('should handle [edge case] correctly', () => {});
  });
});
```

---

## Coverage Requirements by Code Type

### 1. Service/Business Logic (>= 85% coverage)

**Required tests**:

```typescript
// For a service method like: async createUser(data: CreateUserDto): Promise<User>

// Happy path (required)
it('should create user with valid data', async () => {
  const result = await service.createUser(validData);
  expect(result).toMatchObject({ email: validData.email });
});

// Validation errors (required)
it('should throw ValidationError when email is invalid', async () => {
  await expect(service.createUser({ ...validData, email: 'invalid' }))
    .rejects.toThrow(ValidationError);
});

// Database errors (required)
it('should throw ConflictError when email already exists', async () => {
  await service.createUser(validData); // First create
  await expect(service.createUser(validData))
    .rejects.toThrow(ConflictError);
});

// Edge cases (required)
it('should handle email with special characters', async () => {
  const data = { ...validData, email: 'user+tag@example.com' };
  const result = await service.createUser(data);
  expect(result.email).toBe(data.email);
});

it('should handle maximum field lengths', async () => {
  const data = { ...validData, name: 'A'.repeat(255) };
  const result = await service.createUser(data);
  expect(result.name).toHaveLength(255);
});

// Null/undefined handling (if applicable)
it('should use default values for optional fields', async () => {
  const data = { email: 'test@example.com' }; // Minimal data
  const result = await service.createUser(data);
  expect(result.role).toBe('user'); // Default role
});
```

### 2. Controllers/Routes (>= 80% coverage)

**Required tests**:

```typescript
// For an endpoint like: POST /users

// Success response (required)
it('should return 201 with created user', async () => {
  const response = await request(app)
    .post('/users')
    .send(validData);

  expect(response.status).toBe(201);
  expect(response.body).toHaveProperty('id');
});

// Validation response (required)
it('should return 400 for invalid input', async () => {
  const response = await request(app)
    .post('/users')
    .send({ email: 'invalid' });

  expect(response.status).toBe(400);
  expect(response.body.errors).toBeDefined();
});

// Authentication (if protected)
it('should return 401 without authentication', async () => {
  const response = await request(app)
    .post('/users')
    .send(validData);

  expect(response.status).toBe(401);
});

// Authorization (if role-based)
it('should return 403 for non-admin user', async () => {
  const response = await request(app)
    .post('/users')
    .set('Authorization', `Bearer ${userToken}`)
    .send(validData);

  expect(response.status).toBe(403);
});

// Not found (for GET/PUT/DELETE by ID)
it('should return 404 for non-existent user', async () => {
  const response = await request(app)
    .get('/users/non-existent-id');

  expect(response.status).toBe(404);
});

// Conflict handling (for POST with unique constraints)
it('should return 409 for duplicate email', async () => {
  await request(app).post('/users').send(validData);
  const response = await request(app)
    .post('/users')
    .send(validData);

  expect(response.status).toBe(409);
});
```

### 3. Utilities/Helpers (>= 90% coverage)

**Required tests**:

```typescript
// For a utility like: function formatDate(date: Date, format: string): string

// Valid inputs (multiple formats)
it.each([
  [new Date('2024-01-15'), 'YYYY-MM-DD', '2024-01-15'],
  [new Date('2024-01-15'), 'DD/MM/YYYY', '15/01/2024'],
  [new Date('2024-01-15'), 'MMM D, YYYY', 'Jan 15, 2024'],
])('should format %s as %s', (date, format, expected) => {
  expect(formatDate(date, format)).toBe(expected);
});

// Invalid inputs
it('should throw for invalid date', () => {
  expect(() => formatDate(new Date('invalid'), 'YYYY-MM-DD'))
    .toThrow('Invalid date');
});

it('should throw for unsupported format', () => {
  expect(() => formatDate(new Date(), 'INVALID'))
    .toThrow('Unsupported format');
});

// Edge cases
it('should handle leap year dates', () => {
  expect(formatDate(new Date('2024-02-29'), 'YYYY-MM-DD'))
    .toBe('2024-02-29');
});

it('should handle timezone boundaries', () => {
  const date = new Date('2024-01-01T00:00:00Z');
  expect(formatDate(date, 'YYYY-MM-DD')).toBe('2024-01-01');
});

it('should handle epoch date', () => {
  expect(formatDate(new Date(0), 'YYYY-MM-DD')).toBe('1970-01-01');
});
```

### 4. React Components (>= 80% coverage)

**Required tests**:

```typescript
// For a component like: <UserForm onSubmit={fn} />

// Render tests
it('should render form fields', () => {
  render(<UserForm onSubmit={jest.fn()} />);

  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
});

// Interaction tests
it('should call onSubmit with form data', async () => {
  const onSubmit = jest.fn();
  render(<UserForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
  await userEvent.type(screen.getByLabelText('Name'), 'Test User');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    name: 'Test User',
  });
});

// Validation tests
it('should show error for invalid email', async () => {
  render(<UserForm onSubmit={jest.fn()} />);

  await userEvent.type(screen.getByLabelText('Email'), 'invalid');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
});

// Loading state
it('should disable submit while loading', () => {
  render(<UserForm onSubmit={jest.fn()} isLoading />);

  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
});

// Error state
it('should display error message', () => {
  render(<UserForm onSubmit={jest.fn()} error="Something went wrong" />);

  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
});

// Accessibility
it('should have no accessibility violations', async () => {
  const { container } = render(<UserForm onSubmit={jest.fn()} />);
  const results = await axe(container);

  expect(results).toHaveNoViolations();
});
```

---

## Critical Path Test Requirements

### Authentication (MUST be 100% covered)

```typescript
describe('Authentication', () => {
  // Login flow
  it('should login with valid credentials', async () => {});
  it('should reject invalid password', async () => {});
  it('should reject non-existent user', async () => {});
  it('should rate limit after failed attempts', async () => {});

  // Token handling
  it('should generate valid JWT', async () => {});
  it('should reject expired token', async () => {});
  it('should reject malformed token', async () => {});
  it('should refresh token before expiry', async () => {});

  // Logout
  it('should invalidate token on logout', async () => {});
  it('should clear refresh tokens', async () => {});
});
```

### Authorization (MUST be 100% covered)

```typescript
describe('Authorization', () => {
  // Role checks
  it('should allow admin access to admin routes', async () => {});
  it('should deny user access to admin routes', async () => {});

  // Resource ownership
  it('should allow users to access own resources', async () => {});
  it('should deny users access to other user resources', async () => {});

  // Permission checks
  it('should check required permissions', async () => {});
  it('should handle missing permissions', async () => {});
});
```

### Input Validation (MUST be 100% covered)

```typescript
describe('Input Validation', () => {
  // SQL injection prevention
  it('should sanitize SQL injection attempts', async () => {});

  // XSS prevention
  it('should sanitize XSS attempts', async () => {});

  // Type coercion
  it('should reject invalid types', async () => {});

  // Required fields
  it('should require all mandatory fields', async () => {});

  // Field length limits
  it('should reject oversized input', async () => {});
});
```

---

## Test Structure Template

### Unit Test File Template

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { [TargetClass] } from '../[target-file]';

// Mock dependencies
vi.mock('../dependencies', () => ({
  dependency: vi.fn(),
}));

describe('[TargetClass]', () => {
  let instance: [TargetClass];

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create fresh instance
    instance = new [TargetClass](mockDependency);
  });

  afterEach(() => {
    // Cleanup
  });

  describe('[methodName]', () => {
    describe('happy path', () => {
      it('should [expected behavior] when [valid condition]', async () => {
        // Arrange
        const input = createTestInput();

        // Act
        const result = await instance.[methodName](input);

        // Assert
        expect(result).toMatchObject(expectedOutput);
      });
    });

    describe('error cases', () => {
      it('should throw [ErrorType] when [invalid condition]', async () => {
        // Arrange
        const invalidInput = createInvalidInput();

        // Act & Assert
        await expect(instance.[methodName](invalidInput))
          .rejects.toThrow([ErrorType]);
      });
    });

    describe('edge cases', () => {
      it('should handle [edge case] correctly', async () => {
        // Arrange
        const edgeCaseInput = createEdgeCaseInput();

        // Act
        const result = await instance.[methodName](edgeCaseInput);

        // Assert
        expect(result).toBe(expectedEdgeCaseResult);
      });
    });
  });
});
```

### Integration Test File Template

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { setupTestDatabase, cleanupTestDatabase } from './helpers/database';

describe('[Resource] API', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  describe('POST /api/[resource]', () => {
    it('should create [resource] with valid data', async () => {
      const response = await request(app)
        .post('/api/[resource]')
        .send(validData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        ...validData,
      });
    });

    // ... more tests
  });
});
```

---

## Quality Score Impact

Following these requirements will achieve:

| Metric | Expected Coverage | Score Contribution |
|--------|------------------|-------------------|
| Line Coverage | >= 85% | +25.5 points |
| Branch Coverage | >= 75% | +18.75 points |
| Function Coverage | >= 90% | +18 points |
| New Code Coverage | >= 95% | +14.25 points |
| Test Diversity | Unit + Integration + E2E | +10 points |
| **Total** | | **~86 points (Grade A)** |

This addresses the low test quality score (40) by providing:
- Specific test count requirements per function
- Coverage requirements by code type
- Critical path coverage mandates
- Test structure templates
- Quality score calculation transparency
