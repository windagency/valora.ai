# Code Quality Standards

> Comprehensive coding standards for VALORA.

## Overview

This document provides a summary of the code quality standards enforced in this project. For the complete, detailed guidelines, see the full [Code Quality Guidelines](./CODE-QUALITY-GUIDELINES.md).

## Quick Reference

### Core Principles

| Principle      | Description                                   |
| -------------- | --------------------------------------------- |
| **Clean Code** | Write self-documenting, readable code         |
| **DRY**        | Don't Repeat Yourself - eliminate duplication |
| **KISS**       | Keep It Simple, Stupid - favour simplicity    |
| **SOLID**      | Object-oriented design principles             |
| **TDD/BDD**    | Test-driven and behaviour-driven development  |

### TypeScript Standards

#### Naming Conventions

| Element    | Convention               | Example              |
| ---------- | ------------------------ | -------------------- |
| Classes    | PascalCase (nouns)       | `UserRepository`     |
| Interfaces | PascalCase (no I prefix) | `PaymentGateway`     |
| Functions  | camelCase (verbs)        | `calculateTotal()`   |
| Constants  | UPPER_SNAKE_CASE         | `MAX_RETRIES`        |
| Files      | kebab-case               | `user-repository.ts` |

#### Type Usage

```typescript
// ✅ Interfaces for extensible objects
interface User {
  id: string;
  name: string;
}

// ✅ Types for unions and primitives
type Status = 'pending' | 'active' | 'inactive';
type ID = string | number;
```

#### Path Aliases

```typescript
// ✅ CORRECT: Absolute imports
import { UserRepository } from '@/repositories/user-repository';

// ❌ INCORRECT: Relative imports
import { UserRepository } from '../../../repositories/user-repository';
```

#### Object Literal Lookups

```typescript
// ✅ CORRECT: Object literal lookup
const statusColors = {
  pending: 'yellow',
  active: 'green',
  inactive: 'gray',
} as const;

function getStatusColor(status: keyof typeof statusColors) {
  return statusColors[status];
}

// ❌ INCORRECT: Switch statement for simple mapping
function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'yellow';
    case 'active': return 'green';
    default: return 'black';
  }
}
```

### Architectural Patterns

#### Adapter Pattern for Third-Party Libraries

```typescript
// ✅ CORRECT: Adapter pattern
interface PaymentGateway {
  createPayment(amount: number): Promise<string>;
}

class StripeAdapter implements PaymentGateway {
  constructor(private client: Stripe) {}

  async createPayment(amount: number): Promise<string> {
    const intent = await this.client.paymentIntents.create({ amount });
    return intent.id;
  }
}

// ❌ INCORRECT: Direct dependency
class PaymentService {
  private stripe = new Stripe(process.env.STRIPE_KEY);
  // Tightly coupled to Stripe
}
```

#### Dependency Injection

```typescript
// ✅ CORRECT
class UserService {
  constructor(
    private repository: UserRepository,
    private emailService: EmailService
  ) {}
}

// ❌ INCORRECT: Hard dependencies
class UserService {
  private repository = new UserRepository();
}
```

### Backend Standards

#### Input Validation with Zod

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().int().positive().max(120),
});

app.post('/users', async (req, res) => {
  const validated = CreateUserSchema.parse(req.body);
  // Safe to use validated data
});
```

#### State Machines for Workflows

```typescript
import { createMachine } from 'xstate';

const orderMachine = createMachine({
  id: 'order',
  initial: 'draft',
  states: {
    draft: { on: { SUBMIT: 'pending' } },
    pending: { on: { APPROVE: 'processing', REJECT: 'rejected' } },
    processing: { on: { COMPLETE: 'completed', FAIL: 'failed' } },
    completed: { type: 'final' },
    rejected: { type: 'final' },
    failed: { on: { RETRY: 'processing' } },
  },
});
```

#### API Versioning

```typescript
// ✅ CORRECT: Version in URL path
app.get('/api/v1/users', getUsersV1);
app.get('/api/v2/users', getUsersV2);

// ❌ INCORRECT: No versioning
app.get('/api/users', getUsers);
```

### Frontend Standards

#### Atomic Design Pattern

```plaintext
atoms/        # Button, Input, Label
  ↓
molecules/    # FormField (Label + Input + Error)
  ↓
organisms/    # LoginForm (multiple molecules)
  ↓
templates/    # PageLayout
  ↓
pages/        # LoginPage
```

#### Smart/Dumb Components

```typescript
// ✅ Smart (Container) component
function UserListContainer() {
  const { data, isLoading } = useQuery(['users'], fetchUsers);
  return <UserList users={data} isLoading={isLoading} />;
}

// ✅ Dumb (Presentational) component
function UserList({ users, isLoading }: UserListProps) {
  if (isLoading) return <Spinner />;
  return users.map(user => <UserCard key={user.id} user={user} />);
}
```

#### WCAG 2.0 Compliance

```tsx
// ✅ Semantic HTML
<button onClick={handleClick}>Submit</button>

// ❌ Non-semantic
<div onClick={handleClick}>Submit</div>

// ✅ ARIA labels
<button aria-label="Close modal" onClick={onClose}>
  <X />
</button>
```

### React Standards

#### Server State vs Client State

```typescript
// ✅ Tanstack Query for server state
const { data: users } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// ✅ Zustand for client UI state
const useUIStore = create((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({
    isSidebarOpen: !state.isSidebarOpen
  })),
}));
```

#### Forms with React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
    </form>
  );
}
```

### Error Handling

#### Unified Error Handling

```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
  }
}

app.use((err: Error, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
});
```

### Code Review Checklist

#### All Code

- [ ] Follows naming conventions
- [ ] Uses interfaces for objects, types for unions
- [ ] Uses object literal lookups where appropriate
- [ ] No code duplication
- [ ] Complexity < 10
- [ ] Uses absolute path aliases
- [ ] All functions have return types
- [ ] No `any` types without justification
- [ ] Includes appropriate error handling
- [ ] Has corresponding unit tests

#### Backend Code

- [ ] Input validation with Zod
- [ ] FSMs for multi-step workflows
- [ ] Proper authentication/authorisation
- [ ] Database transactions where needed
- [ ] Structured logging
- [ ] Third-party libraries wrapped with Adapter pattern

#### Frontend Code

- [ ] Follows atomic design structure
- [ ] Smart/dumb component separation
- [ ] Mobile-first responsive design
- [ ] WCAG 2.0 compliant
- [ ] No props drilling
- [ ] Server state in Tanstack Query
- [ ] Client state in Zustand

### Violation Severity

| Severity     | Action           | Examples                                                             |
| ------------ | ---------------- | -------------------------------------------------------------------- |
| **CRITICAL** | Block PR         | Security vulnerabilities, no validation, `any` without justification |
| **HIGH**     | Fix before merge | Missing error handling, no observability, WCAG non-compliance        |
| **MEDIUM**   | Fix in follow-up | Code duplication, high complexity, relative imports                  |
| **LOW**      | Nice to have     | Formatting, missing JSDoc, suboptimal patterns                       |

## Full Documentation

For the complete, detailed code quality guidelines including:

- Detailed TypeScript standards
- CSS property ordering
- Design tokens and CSS variables
- API versioning strategies
- RESTful API design
- Accessibility requirements
- Architecture unit testing
- And much more...

See: **[CODE-QUALITY-GUIDELINES.md](./CODE-QUALITY-GUIDELINES.md)**

## Enforcement

These standards are enforced through:

1. **ESLint** - Code linting and formatting
2. **TypeScript** - Strict type checking
3. **Prettier** - Code formatting
4. **arch-unit-ts** - Architectural testing
5. **Husky** - Pre-commit hooks
6. **Code reviews** - Manual review checklist

## Related Documentation

- [Contributing Guidelines](./contributing.md)
- [Codebase Overview](./codebase.md)
- [Architecture Documentation](../architecture/README.md)
