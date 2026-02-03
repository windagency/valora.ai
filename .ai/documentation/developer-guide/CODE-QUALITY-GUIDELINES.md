
# Typescript Code Quality Standards & Enforcement Guide

> Comprehensive coding standards  
> Version: 1.0.0

## Executive Summary

This document consolidates all coding considerations into a unified **code quality standard** that can be enforced through automated tooling, code reviews, and architectural testing.

## 1. Core Programming Principles

### 1.1 Clean Code Principles

**MUST** adhere to:

- ✅ **Clean Code** methodology - Write self-documenting, readable code
- ✅ **DRY (Don't Repeat Yourself)** - Eliminate code duplication
- ✅ **KISS (Keep It Simple, Stupid)** - Favor simplicity over cleverness
- ✅ **SOLID** principles for object-oriented design
- ✅ **Favor clarity over cleverness** - Reduce cognitive load

**Enforcement:**

```json
# ESLint rules to add:
"no-duplicate-code": "error"
"complexity": ["error", 10]
```

### 1.2 Development Methodologies

- ✅ **Test-Driven Development (TDD)** when feasible
- ✅ **Behavior-Driven Development (BDD)** for user-facing features
- ✅ **Domain-Driven Design (DDD)** for backend systems
- ✅ No untested code in critical paths
- ✅ Write tests before implementation for complex business logic

## 2. TypeScript Coding Standards

### 2.1 Naming Conventions

**Classes and Interfaces:**

```typescript
// ✅ CORRECT: PascalCase with nouns/noun phrases
class UserRepository { }
interface PaymentGateway { }
interface DatabaseConnection { }

// ❌ INCORRECT
class userRepository { }      // Wrong case
interface IPaymentGateway { } // Hungarian notation
class ProcessData { }         // Verb, not noun
```

**Functions and Methods:**

```typescript
// ✅ CORRECT: camelCase
// - Verbs for actions
function calculateTotal() { }
function sendEmail() { }
function validateInput() { }

// - Nouns for value-returning functions
function userName() { }
function currentDate() { }

// ❌ INCORRECT
function CalculateTotal() { }  // Wrong case
function user_name() { }  // Snake case
function get() { }  // Not descriptive
```

**Enforcement:**

```json
// ESLint + @typescript-eslint rules:
"@typescript-eslint/naming-convention": [
  "error",
  {
    "selector": "class",
    "format": ["PascalCase"]
  },
  {
    "selector": "interface",
    "format": ["PascalCase"],
    "custom": {
      "regex": "^I[A-Z]",
      "match": false
    }
  },
  {
    "selector": "function",
    "format": ["camelCase"]
  }
]
```

### 2.2 Type Safety & Type System Usage

**Interfaces vs Types:**

```typescript
// ✅ CORRECT: Interfaces for extensible objects
interface User {
  id: string;
  name: string;
}

interface Admin extends User {
  permissions: string[];
}

// ✅ CORRECT: Types for unions and primitives
type Status = 'pending' | 'active' | 'inactive';
type ID = string | number;
type Nullable<T> = T | null;

// ❌ INCORRECT
type User = {  // Should be interface for extensible objects
  id: string;
}

interface Status {  // Should be type for union
  value: 'pending' | 'active';
}
```

**Advanced Type System Usage:**

```typescript
// ✅ MUST use advanced TypeScript features
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

// ✅ Use utility types
Partial<User>
Pick<User, 'id' | 'name'>
Omit<User, 'password'>
Record<string, unknown>
```

### 2.3 Expression-Based Conditions (Object Literal Lookups)

**ENFORCE object literal lookups over switch/if-else:**

```typescript
// ✅ CORRECT: Object literal lookup
const statusColors = {
  pending: 'yellow',
  active: 'green',
  inactive: 'gray',
  error: 'red'
} as const;

function getStatusColor(status: keyof typeof statusColors) {
  return statusColors[status];
}

// ✅ CORRECT: With default value
const actionHandlers = {
  create: createHandler,
  update: updateHandler,
  delete: deleteHandler,
} as const;

function handleAction(action: string) {
  const handler = actionHandlers[action as keyof typeof actionHandlers];
  return handler?.() ?? defaultHandler();
}

// ❌ INCORRECT: Switch statement for simple mapping
function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'yellow';
    case 'active': return 'green';
    case 'inactive': return 'gray';
    default: return 'black';
  }
}

// ❌ INCORRECT: Nested if/else
function getStatusColor(status: string) {
  if (status === 'pending') return 'yellow';
  else if (status === 'active') return 'green';
  else if (status === 'inactive') return 'gray';
  else return 'black';
}
```

**When switch/if-else IS acceptable:**

- Complex conditional logic with multiple conditions per case
- Cases with side effects or multi-step operations
- Pattern matching on complex data structures

### 2.4 Advanced Data Structures

**ENFORCE usage of:**

```typescript
// ✅ Set for unique collections
const uniqueIds = new Set<string>();
uniqueIds.add('id1');
uniqueIds.add('id1'); // Automatically deduplicated

// ✅ Map for key-value pairs with non-string keys
const userCache = new Map<number, User>();
userCache.set(1, { id: 1, name: 'John' });

// ✅ Proxy for advanced object behavior
const observable = new Proxy(target, {
  set(obj, prop, value) {
    console.log(`Setting ${String(prop)} to ${value}`);
    obj[prop] = value;
    return true;
  }
});

// ✅ Union types for restricted sets
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// ❌ INCORRECT: Using arrays for unique values
const uniqueIds = [];
if (!uniqueIds.includes(id)) uniqueIds.push(id);

// ❌ INCORRECT: Using plain objects when Map is more appropriate
const userCache = {};
userCache[userId] = user; // Keys coerced to strings
```

### 2.5 Path Aliases (Absolute Imports)

**MUST use absolute path aliases over relative paths:**

```typescript
// tsconfig.json configuration
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "src/*": ["./src/*"],
      "ui/*": ["./src/components/ui/*"],
      "utils/*": ["./src/utils/*"],
      "types/*": ["./src/types/*"]
    }
  }
}

// ✅ CORRECT: Absolute imports
import { UserRepository } from 'src/repositories/user-repository';
import { Button } from 'ui/button';
import { formatDate } from 'utils/date';

// ❌ INCORRECT: Relative imports outside same module
import { UserRepository } from '../../../repositories/user-repository';
import { Button } from '../../components/ui/button';

// ✅ EXCEPTION: Within the same module/folder
import { helper } from './helper';
import { types } from './types';
```

**Enforcement:**

```json
// ESLint rule
"import/no-relative-parent-imports": "error"
```

### 2.6 Type Inference Preference

**PREFER type inference over explicit type annotations when TypeScript can reliably infer types:**

TypeScript's type inference engine is powerful and can automatically determine types in most cases. Explicit type annotations should be used strategically rather than everywhere, as excessive annotations create noise and maintenance burden.

#### When to Rely on Type Inference

```typescript
// ✅ CORRECT: Let TypeScript infer simple variable types
const userName = 'John Doe';          // inferred as string
const userAge = 30;                   // inferred as number
const isActive = true;                // inferred as boolean
const items = [1, 2, 3];              // inferred as number[]
const user = { id: 1, name: 'John' }; // inferred as { id: number; name: string }

// ❌ INCORRECT: Unnecessary explicit types
const userName: string = 'John Doe';
const userAge: number = 30;
const isActive: boolean = true;
const items: number[] = [1, 2, 3];

// ✅ CORRECT: Infer return types from function body
function add(a: number, b: number) {
  return a + b;  // Return type inferred as number
}

function getUser(id: string) {
  return { id, name: 'John', email: 'john@example.com' };
  // Return type inferred as { id: string; name: string; email: string }
}

// ✅ CORRECT: Infer array methods
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);        // inferred as number[]
const evens = numbers.filter(n => n % 2 === 0); // inferred as number[]
const sum = numbers.reduce((a, b) => a + b, 0); // inferred as number

// ✅ CORRECT: Infer generic types from usage
const users = new Map<string, User>();
users.set('123', { id: '123', name: 'John' }); // User type inferred
const maybeUser = users.get('123');             // inferred as User | undefined

// ✅ CORRECT: Infer from object methods
const config = {
  timeout: 5000,
  retry: true,
  getTimeout() {
    return this.timeout; // Return type inferred as number
  },
  shouldRetry() {
    return this.retry;   // Return type inferred as boolean
  },
};
```

#### When to Use Explicit Type Annotations

```typescript
// ✅ CORRECT: Explicit types for function parameters (ALWAYS required)
function processUser(user: User, options: ProcessOptions) {
  // Parameters MUST have explicit types
}

// ✅ CORRECT: Explicit return type for public API functions
// Helps with documentation and prevents accidental API changes
export function createUser(data: CreateUserDTO): User {
  return {
    id: generateId(),
    ...data,
    createdAt: new Date(),
  };
}

// ✅ CORRECT: Explicit type when literal would be too narrow
let status = 'pending' as 'pending' | 'active' | 'completed';
// or
let status: 'pending' | 'active' | 'completed' = 'pending';

// Without annotation, type would be inferred as 'pending' (literal)
// which prevents reassignment to 'active' or 'completed'

// ✅ CORRECT: Explicit type for complex return types that should be documented
interface PaginatedResponse<T> {
  data: T[];
  page: number;
  total: number;
}

export function getUsers(page: number): PaginatedResponse<User> {
  // Explicit return type documents the contract
  return {
    data: fetchUsersFromDB(page),
    page,
    total: countUsers(),
  };
}

// ✅ CORRECT: Explicit type when initializing with different type
const items: Array<User | null> = [];
// Inferred type would be never[] without annotation

// ✅ CORRECT: Explicit type for class properties
class UserService {
  private cache: Map<string, User> = new Map();
  private timeout: number = 5000;

  // Property types should be explicit for clarity
}

// ✅ CORRECT: Explicit type for variables that will be assigned later
let user: User | null = null;
if (condition) {
  user = await fetchUser();
}
```

#### Function Return Type Guidelines

**For internal/private functions:** Prefer inference
**For exported/public functions:** Use explicit return types

```typescript
// ✅ CORRECT: Internal helper - inferred return type
function calculateDiscount(price: number, percentage: number) {
  return price * (percentage / 100); // inferred as number
}

// ✅ CORRECT: Public API - explicit return type
export function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ CORRECT: Complex return type - explicit for clarity
export function processPayment(
  amount: number,
  paymentMethod: PaymentMethod
): Promise<PaymentResult> {
  // Explicit return type makes the contract clear
  return paymentGateway.charge(amount, paymentMethod);
}

// ✅ CORRECT: Inferred for simple internal utilities
const utils = {
  sum: (a: number, b: number) => a + b,           // inferred as number
  concat: (a: string, b: string) => a + b,        // inferred as string
  isEmpty: (arr: unknown[]) => arr.length === 0,  // inferred as boolean
};
```

#### Benefits of Type Inference

- **Less Code Noise**: Types are visible only where they add value
- **Better Refactoring**: Changing implementation updates inferred types automatically
- **Reduced Maintenance**: Fewer type annotations to update when types change
- **DRY Principle**: Don't repeat information TypeScript already knows
- **Focus on Logic**: Code is more readable without redundant type annotations

#### Trade-offs and Exceptions

```typescript
// ❌ PROBLEM: Inference can be too narrow
const config = {
  mode: 'development',  // inferred as 'development', not string
};

config.mode = 'production'; // ❌ Error: Type '"production"' is not assignable to type '"development"'

// ✅ SOLUTION: Use explicit type or const assertion
const config: { mode: string } = {
  mode: 'development',
};

// or with const assertion
const config = {
  mode: 'development' as const,
} as const;

// ❌ PROBLEM: Circular reference without explicit type
const obj = {
  self: obj,  // ❌ Error: 'obj' is used before being assigned
};

// ✅ SOLUTION: Explicit type
type SelfRef = {
  self: SelfRef;
};

const obj: SelfRef = {
  self: null as any,
};
obj.self = obj;
```

#### ESLint Configuration

```javascript
// eslint.config.js
export default [
  {
    rules: {
      // Warn on explicit return types for internal functions
      // (allows flexibility while encouraging inference)
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,               // Allow inference for expressions
        allowTypedFunctionExpressions: true,  // Allow when type is inferred from context
        allowHigherOrderFunctions: true,      // Allow for HOFs like map/filter
        allowDirectConstAssertionInArrowFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: false,
      }],

      // Require explicit return types ONLY for exported functions
      '@typescript-eslint/explicit-module-boundary-types': ['error', {
        allowArgumentsExplicitlyTypedAsAny: false,
        allowDirectConstAssertionInArrowFunctions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      }],
    },
  },
];
```

**Key Principle:**
> "Use type annotations strategically to improve code clarity and API documentation, but trust TypeScript's inference for internal implementation details where types are obvious from context."

### 2.7 Modern Iteration Patterns

**PREFER functional array methods over imperative loops:**

Modern JavaScript/TypeScript provides expressive, declarative methods for working with collections. These methods are more readable, less error-prone, and communicate intent better than traditional loops.

#### When to Use Functional Methods

```typescript
// ✅ CORRECT: map for transformations
const userNames = users.map(user => user.name);

// ❌ INCORRECT: imperative loop for simple transformation
const userNames = [];
for (const user of users) {
  userNames.push(user.name);
}

// ✅ CORRECT: filter for selection
const activeUsers = users.filter(user => user.isActive);

// ❌ INCORRECT: imperative loop with conditional push
const activeUsers = [];
for (const user of users) {
  if (user.isActive) {
    activeUsers.push(user);
  }
}

// ✅ CORRECT: reduce for aggregation
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

// ❌ INCORRECT: imperative accumulation
let totalPrice = 0;
for (const item of items) {
  totalPrice += item.price;
}

// ✅ CORRECT: find for single item lookup
const admin = users.find(user => user.role === 'admin');

// ❌ INCORRECT: loop with break
let admin = null;
for (const user of users) {
  if (user.role === 'admin') {
    admin = user;
    break;
  }
}

// ✅ CORRECT: some/every for boolean checks
const hasErrors = results.some(r => r.status === 'error');
const allPassed = results.every(r => r.status === 'passed');

// ❌ INCORRECT: loop with flag variable
let hasErrors = false;
for (const r of results) {
  if (r.status === 'error') {
    hasErrors = true;
    break;
  }
}

// ✅ CORRECT: flatMap for nested transformations
const allTags = posts.flatMap(post => post.tags);

// ❌ INCORRECT: nested loops or concat
const allTags = [];
for (const post of posts) {
  for (const tag of post.tags) {
    allTags.push(tag);
  }
}
```

#### Method Chaining

```typescript
// ✅ CORRECT: chain methods for complex operations
const result = users
  .filter(user => user.isActive)
  .map(user => user.email)
  .filter(email => email.endsWith('@company.com'))
  .sort();

// ❌ INCORRECT: intermediate variables and loops
const activeUsers = [];
for (const user of users) {
  if (user.isActive) {
    activeUsers.push(user);
  }
}
const emails = [];
for (const user of activeUsers) {
  emails.push(user.email);
}
const companyEmails = [];
for (const email of emails) {
  if (email.endsWith('@company.com')) {
    companyEmails.push(email);
  }
}
companyEmails.sort();
```

#### When Imperative Loops ARE Acceptable

```typescript
// ✅ ACCEPTABLE: Early exit with complex side effects
for (const item of items) {
  const result = await processItem(item);
  if (result.shouldStop) {
    await cleanup();
    break;
  }
}

// ✅ ACCEPTABLE: Modifying external state (though consider refactoring)
for (const node of nodes) {
  node.visited = true;
  node.parent?.children.push(node);
}

// ✅ ACCEPTABLE: Performance-critical tight loops
// When profiling shows functional methods are a bottleneck
for (let i = 0; i < largeArray.length; i++) {
  // Direct index access for performance
}

// ✅ ACCEPTABLE: Complex control flow with multiple conditions
for (const item of items) {
  if (condition1) continue;
  if (condition2) {
    handleSpecialCase(item);
    continue;
  }
  if (condition3) break;
  processNormally(item);
}
```

#### Object Iteration

```typescript
// ✅ CORRECT: Object.entries with destructuring
const formatted = Object.entries(config)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

// ✅ CORRECT: Object.keys/values when only one is needed
const allValues = Object.values(lookup);
const allKeys = Object.keys(mapping);

// ❌ INCORRECT: for...in without type safety
for (const key in config) {
  console.log(config[key]); // No type safety
}
```

#### Async Iteration

```typescript
// ✅ CORRECT: Promise.all for parallel execution
const results = await Promise.all(
  urls.map(url => fetch(url))
);

// ✅ CORRECT: for...of for sequential async operations
for (const item of items) {
  await processItem(item); // Must be sequential
}

// ✅ CORRECT: reduce for sequential with accumulation
const results = await items.reduce(
  async (accPromise, item) => {
    const acc = await accPromise;
    const result = await processItem(item);
    return [...acc, result];
  },
  Promise.resolve([] as Result[])
);

// ❌ INCORRECT: forEach with async (doesn't wait)
items.forEach(async item => {
  await processItem(item); // Fire and forget!
});
```

**Key Principle:**
> "Express what you want to achieve, not how to achieve it. Functional methods declare intent; imperative loops describe mechanics."

## 3. Architectural Patterns & Design

### 3.1 Architecture Unit Testing with arch-unit-ts

**CRITICAL: All architectural decisions MUST be validated with tests**  

```typescript
// tests/architecture/dependency-rules.test.ts
import { filesOfProject } from 'arch-unit-ts';

describe('Architecture Rules', () => {
  it('should enforce layered architecture', async () => {
    const files = await filesOfProject();

    // Domain layer should not depend on infrastructure
    files
      .inFolder('domain')
      .shouldNotDependOnFilesIn('infrastructure');

    // Controllers should only depend on services
    files
      .inFolder('controllers')
      .shouldOnlyDependOn(['services', 'types', 'utils']);
  });

  it('should enforce naming conventions', async () => {
    const files = await filesOfProject();

    files
      .inFolder('repositories')
      .shouldHaveNameMatching(/.*Repository$/);

    files
      .inFolder('services')
      .shouldHaveNameMatching(/.*Service$/);
  });

  it('should enforce adapter pattern for third-party libraries', async () => {
    const files = await filesOfProject();

    // Application code should not directly import third-party libs
    files
      .inFolder('src')
      .excluding('adapters')
      .shouldNotDependOnFilesMatching(/node_modules\/(axios|stripe|aws-sdk)/);
  });
});
```

**Required architectural tests:**

- ✅ Dependency rules between layers
- ✅ Naming convention enforcement
- ✅ Module boundary validation
- ✅ Design pattern enforcement (Repository, Factory, etc.)
- ✅ Third-party library isolation (Adapter pattern)

### 3.2 Adapter Pattern for Third-Party Dependencies

**MUST wrap highly dependent third-party libraries:**

```typescript
// ✅ CORRECT: Adapter pattern
// adapters/payment-gateway.interface.ts
export interface PaymentGateway {
  createPayment(amount: number): Promise<string>;
  refund(paymentId: string): Promise<void>;
}

// adapters/payment-gateway.adapter.ts
import Stripe from 'stripe';
import {PaymentGateway} from 'payment-gateway.interface';

export class StripeAdapter implements PaymentGateway {
  private client: Stripe;

  constructor(apiKey: string) {
    this.client = new Stripe(apiKey);
  }

  async createPayment(amount: number): Promise<string> {
    const intent = await this.client.paymentIntents.create({
      amount,
      currency: 'usd',
    });
    return intent.id;
  }

  async refund(paymentId: string): Promise<void> {
    await this.client.refunds.create({ payment_intent: paymentId });
  }
}

// services/payment.service.ts
import { PaymentGateway } from 'adapters/payment-gateway.interface';

export class PaymentService {
  constructor(private gateway: PaymentGateway) {}

  async processPayment(amount: number) {
    return this.gateway.createPayment(amount);
  }
}

// ❌ INCORRECT: Direct dependency
// services/payment.service.ts
import Stripe from 'stripe';

export class PaymentService {
  private stripe = new Stripe(process.env.STRIPE_KEY);

  async processPayment(amount: number) {
    // Directly coupled to Stripe implementation
  }
}
```

**Benefits:**

- Easier testing (mock the interface, not the library)
- Easier library replacement
- Isolated breaking changes
- Cleaner architecture

### 3.3 Design Patterns

**Dependency Injection:**

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
  private emailService = new EmailService();
}
```

**Repository Pattern:**

```typescript
// ✅ CORRECT
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

class PostgresUserRepository implements UserRepository {
  // Implementation
}
```

## 4. Backend-Specific Standards

### 4.1 State Machines for Domain Workflows

**MUST use FSMs for multi-step business processes:**

```typescript
// ✅ CORRECT: XState for order workflow
import { createMachine } from 'xstate';

const orderMachine = createMachine({
  id: 'order',
  initial: 'draft',
  states: {
    draft: {
      on: { SUBMIT: 'pending' }
    },
    pending: {
      on: {
        APPROVE: 'processing',
        REJECT: 'rejected'
      }
    },
    processing: {
      on: {
        COMPLETE: 'completed',
        FAIL: 'failed'
      }
    },
    completed: { type: 'final' },
    rejected: { type: 'final' },
    failed: {
      on: { RETRY: 'processing' }
    }
  }
});

// ❌ INCORRECT: Boolean flags and status enums
class Order {
  status: 'draft' | 'pending' | 'processing' | 'completed';
  isApproved: boolean;
  isFailed: boolean;
  // Implicit state management leads to invalid states
}
```

**When to use FSMs:**

- Payment processing workflows
- Order lifecycles
- User onboarding flows
- Approval workflows
- Multi-step forms

### 4.2 Security First

**Input Validation & Sanitization:**

```typescript
// ✅ CORRECT: Zod validation
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

// ❌ INCORRECT: No validation
app.post('/users', async (req, res) => {
  const { email, password } = req.body;
  // Direct use of unvalidated input
});
```

**Authentication & Authorization:**

```typescript
// ✅ CORRECT: Middleware guards
@UseGuards(AuthGuard, RoleGuard('admin'))
@Controller('admin')
class AdminController { }

// ❌ INCORRECT: Manual checks everywhere
async deleteUser(userId: string) {
  if (!this.currentUser?.isAdmin) throw new Error('Unauthorized');
  // Repeated authorization logic
}
```

### 4.3 Observability by Default

**Every feature MUST include:**

```typescript
// ✅ Structured logging
import { logger } from 'utils/logger';

async function processPayment(amount: number) {
  logger.info('Processing payment', { amount, timestamp: Date.now() });

  try {
    const result = await gateway.charge(amount);
    logger.info('Payment successful', { paymentId: result.id });
    return result;
  } catch (error) {
    logger.error('Payment failed', { error, amount });
    throw error;
  }
}

// ✅ Metrics
import { metrics } from 'utils/metrics';

metrics.increment('payment.processed');
metrics.histogram('payment.amount', amount);
metrics.timing('payment.duration', duration);

// ✅ Tracing
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
span?.setAttribute('payment.amount', amount);
```

### 4.4 Data Integrity & Idempotency

```typescript
// ✅ CORRECT: Idempotent operations
async function createPayment(idempotencyKey: string, amount: number) {
  const existing = await payments.findByKey(idempotencyKey);
  if (existing) return existing;

  return payments.create({ idempotencyKey, amount });
}

// ✅ CORRECT: Database transactions
async function transferFunds(fromId: string, toId: string, amount: number) {
  return db.transaction(async (trx) => {
    await trx('accounts').where({ id: fromId }).decrement('balance', amount);
    await trx('accounts').where({ id: toId }).increment('balance', amount);
  });
}
```

### 4.5 API Versioning

**MUST implement API versioning from the start:**

API versioning allows backward-compatible evolution of APIs while supporting existing clients. Choose a versioning strategy and enforce it consistently.

#### Versioning Strategies

**1. URI Path Versioning (Recommended)**  

```typescript
// ✅ CORRECT: Version in URL path
// routes/v1/users.ts
app.get('/api/v1/users', getUsersV1);
app.post('/api/v1/users', createUserV1);

// routes/v2/users.ts
app.get('/api/v2/users', getUsersV2);
app.post('/api/v2/users', createUserV2);

// ❌ INCORRECT: No versioning
app.get('/api/users', getUsers); // Breaking changes affect all clients
```

**Benefits of URI versioning:**

- ✅ Explicit and visible in API documentation
- ✅ Easy to route different versions to different handlers
- ✅ Simple to test and debug
- ✅ Clear separation of version logic
- ✅ Cache-friendly (different URLs = different cache keys)

**2. Header Versioning (Alternative)**  

```typescript
// ✅ ALTERNATIVE: Version in custom header
app.get('/api/users', (req, res) => {
  const versionHandlers = {
    v1: getUsersV1,
    v2: getUsersV2,
  } as const;

  type ApiVersion = keyof typeof versionHandlers;

  const version = (req.headers['api-version'] || 'v1') as string;
  const handler = versionHandlers[version as ApiVersion];

  if (!handler) {
    return res.status(400).json({ error: 'Unsupported API version' });
  }

  return handler(req, res);
});

// Client usage:
fetch('/api/users', {
  headers: { 'API-Version': 'v2' }
});
```

**Benefits of header versioning:**

- ✅ Cleaner URLs
- ✅ Same endpoint serves multiple versions
- ✅ Useful for A/B testing

**Drawbacks:**

- ❌ Less discoverable (not visible in URL)
- ❌ Harder to cache
- ❌ More complex routing logic

**3. Accept Header Versioning (Content Negotiation)**  

```typescript
// ✅ ALTERNATIVE: Version in Accept header
app.get('/api/users', (req, res) => {
  const acceptHeader = req.headers.accept;

  if (acceptHeader?.includes('application/vnd.api.v2+json')) {
    return getUsersV2(req, res);
  }

  return getUsersV1(req, res); // Default to v1
});

// Client usage:
fetch('/api/users', {
  headers: { 'Accept': 'application/vnd.api.v2+json' }
});
```

**Use when:**

- RESTful principles are strictly followed
- Content type differs between versions

#### Version Structure & Organization

```typescript
// ✅ CORRECT: Organized by version
src/
  api/
    v1/
      controllers/
        user.controller.ts
        order.controller.ts
      routes/
        user.routes.ts
        order.routes.ts
      schemas/
        user.schema.ts
        order.schema.ts
    v2/
      controllers/
        user.controller.ts
        order.controller.ts
      routes/
        user.routes.ts
        order.routes.ts
      schemas/
        user.schema.ts
        order.schema.ts
    shared/
      services/
        user.service.ts
      repositories/
        user.repository.ts
      utils/

// Main router configuration
// api/index.ts
import v1Routes from './v1/routes';
import v2Routes from './v2/routes';

app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes);

// Redirect root to latest stable version
app.get('/api', (req, res) => {
  res.redirect('/api/v2');
});
```

#### Version Management Best Practices

**1. Shared Business Logic**  

```typescript
// ✅ CORRECT: Reuse business logic, version presentation layer
// shared/services/user.service.ts
export class UserService {
  async getUser(id: string): Promise<User> {
    return this.repository.findById(id);
  }

  async createUser(data: CreateUserDTO): Promise<User> {
    return this.repository.create(data);
  }
}

// v1/controllers/user.controller.ts
import { UserService } from 'shared/services/user.service';

export class UserControllerV1 {
  constructor(private userService: UserService) {}

  async getUser(req, res) {
    const user = await this.userService.getUser(req.params.id);

    // V1 response format
    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }
}

// v2/controllers/user.controller.ts
import { UserService } from 'shared/services/user.service';

export class UserControllerV2 {
  constructor(private userService: UserService) {}

  async getUser(req, res) {
    const user = await this.userService.getUser(req.params.id);

    // V2 response format (includes more fields)
    return res.json({
      id: user.id,
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      metadata: {
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }
}

// ❌ INCORRECT: Duplicating business logic
// v1/services/user.service.ts
export class UserServiceV1 {
  async getUser(id: string) {
    // Duplicate validation, database queries, business rules
    return this.repository.findById(id);
  }
}

// v2/services/user.service.ts
export class UserServiceV2 {
  async getUser(id: string) {
    // Same logic duplicated - violates DRY
    return this.repository.findById(id);
  }
}
```

**2. Version-Specific Schemas**  

```typescript
// ✅ CORRECT: Schema per version
// v1/schemas/user.schema.ts
import { z } from 'zod';

export const CreateUserSchemaV1 = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const UserResponseSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

// v2/schemas/user.schema.ts
export const CreateUserSchemaV2 = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
});

export const UserResponseSchemaV2 = z.object({
  id: z.string(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phoneNumber: z.string().optional(),
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
});
```

**3. Deprecation Strategy**  

```typescript
// ✅ CORRECT: Clear deprecation warnings
// v1/routes/user.routes.ts
import { deprecationWarning } from 'shared/middleware/deprecation';

router.get(
  '/users/:id',
  deprecationWarning({
    version: 'v1',
    deprecatedAt: '2024-01-01',
    sunsetDate: '2024-06-01',
    migrationGuide: 'https://docs.api.com/migration/v1-to-v2',
  }),
  getUserV1
);

// shared/middleware/deprecation.ts
export function deprecationWarning(options: DeprecationOptions) {
  return (req, res, next) => {
    res.setHeader('Warning', `299 - "API version ${options.version} is deprecated. Sunset date: ${options.sunsetDate}"`);
    res.setHeader('Sunset', options.sunsetDate);
    res.setHeader('Link', `<${options.migrationGuide}>; rel="deprecation"`);

    logger.warn('Deprecated API usage', {
      version: options.version,
      endpoint: req.path,
      userAgent: req.headers['user-agent'],
    });

    next();
  };
}

// Client receives:
// Warning: 299 - "API version v1 is deprecated. Sunset date: 2024-06-01"
// Sunset: 2024-06-01
// Link: <https://docs.api.com/migration/v1-to-v2>; rel="deprecation"
```

**4. Version Detection Middleware**  

```typescript
// ✅ CORRECT: Centralized version detection
// middleware/api-version.ts
export function apiVersion() {
  return (req, res, next) => {
    // Priority: URL path > Header > Default
    const urlVersion = req.path.match(/\/api\/(v\d+)\//)?.[1];
    const headerVersion = req.headers['api-version'];

    req.apiVersion = urlVersion || headerVersion || 'v1';

    // Validate version
    const supportedVersions = ['v1', 'v2'];
    if (!supportedVersions.includes(req.apiVersion)) {
      return res.status(400).json({
        error: 'Unsupported API version',
        supportedVersions,
      });
    }

    next();
  };
}

app.use(apiVersion());
```

**5. Breaking vs Non-Breaking Changes**  

```typescript
// ✅ NON-BREAKING CHANGES (Same version, no migration needed):
// - Adding new optional fields to responses
// - Adding new endpoints
// - Adding new optional query parameters
// - Deprecating (but not removing) fields

// v2/responses/user.ts (Non-breaking addition)
{
  id: "123",
  name: "John",
  email: "john@example.com",
  avatar: "https://...",  // ✅ NEW optional field - non-breaking
}

// ❌ BREAKING CHANGES (Require new version):
// - Removing fields from responses
// - Renaming fields
// - Changing field types
// - Changing endpoint URLs
// - Making optional fields required
// - Changing authentication methods

// v1 response
{
  id: "123",
  name: "John Doe"
}

// v2 response (BREAKING: split name field)
{
  id: "123",
  firstName: "John",  // ❌ BREAKING: name field removed
  lastName: "Doe"
}
```

**6. Version Negotiation**  

```typescript
// ✅ CORRECT: Automatic version negotiation
export function negotiateVersion(req: Request): string {
  const requestedVersion = req.headers['api-version'] ||
                          req.path.match(/\/api\/(v\d+)\//)?.[1] ||
                          'latest';

  const versionMap = {
    'latest': 'v2',
    'stable': 'v2',
    'v1': 'v1',
    'v2': 'v2',
  };

  return versionMap[requestedVersion] || versionMap['stable'];
}

// Usage
app.get('/api/users/:id', (req, res) => {
  const version = negotiateVersion(req);
  const controller = controllerFactory.get(version);
  return controller.getUser(req, res);
});
```

**7. Testing Across Versions**  

```typescript
// ✅ CORRECT: Test all supported versions
// tests/api/user.test.ts
import { describe, it, expect } from 'vitest';

describe.each(['v1', 'v2'])('User API %s', (version) => {
  it('should get user by id', async () => {
    const response = await request(app)
      .get(`/api/${version}/users/123`)
      .expect(200);

    // Version-specific assertions
    if (version === 'v1') {
      expect(response.body).toHaveProperty('name');
      expect(response.body).not.toHaveProperty('firstName');
    } else if (version === 'v2') {
      expect(response.body).toHaveProperty('profile.firstName');
      expect(response.body).toHaveProperty('profile.lastName');
    }
  });

  it('should create user', async () => {
    const payload = version === 'v1'
      ? { name: 'John Doe', email: 'john@example.com' }
      : { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };

    const response = await request(app)
      .post(`/api/${version}/users`)
      .send(payload)
      .expect(201);

    expect(response.body).toHaveProperty('id');
  });
});
```

**8. Documentation Versioning**  

```typescript
// ✅ CORRECT: Document each version
// Using OpenAPI/Swagger

// swagger/v1.yaml
openapi: 3.0.0
info:
  title: My API
  version: "1.0.0"
  description: "API v1 - Deprecated, sunset date 2024-06-01"
servers:
  - url: https://api.example.com/api/v1

// swagger/v2.yaml
openapi: 3.0.0
info:
  title: My API
  version: "2.0.0"
  description: "API v2 - Current stable version"
servers:
  - url: https://api.example.com/api/v2

// Generate separate docs
app.use('/api/v1/docs', swaggerUI.serve, swaggerUI.setup(v1Spec));
app.use('/api/v2/docs', swaggerUI.serve, swaggerUI.setup(v2Spec));
```

#### Version Lifecycle Management

```typescript
// ✅ CORRECT: Track version lifecycle
// config/api-versions.ts
export const API_VERSIONS = {
  v1: {
    status: 'deprecated',
    introducedAt: '2023-01-01',
    deprecatedAt: '2024-01-01',
    sunsetDate: '2024-06-01',
    supportedUntil: '2024-06-01',
  },
  v2: {
    status: 'stable',
    introducedAt: '2024-01-01',
    deprecatedAt: null,
    sunsetDate: null,
    supportedUntil: null,
  },
  v3: {
    status: 'beta',
    introducedAt: '2024-11-01',
    deprecatedAt: null,
    sunsetDate: null,
    supportedUntil: null,
  },
} as const;

// Automatically return version info
app.get('/api/versions', (req, res) => {
  res.json({
    versions: API_VERSIONS,
    currentVersion: 'v2',
    latestVersion: 'v3',
  });
});
```

**Version Lifecycle Stages:**

1. **Beta/Alpha** - New features, may change, not for production
2. **Stable** - Recommended for production use
3. **Deprecated** - Still supported but discouraged, migration path provided
4. **Sunset** - No longer supported, returns 410 Gone

```typescript
// ✅ CORRECT: Enforce version lifecycle
export function versionLifecycleGuard(version: string) {
  return (req, res, next) => {
    const versionInfo = API_VERSIONS[version];

    if (!versionInfo) {
      return res.status(400).json({ error: 'Unknown API version' });
    }

    // Check if version is sunset
    if (versionInfo.sunsetDate && new Date() > new Date(versionInfo.sunsetDate)) {
      return res.status(410).json({
        error: 'API version no longer supported',
        sunsetDate: versionInfo.sunsetDate,
        currentVersion: 'v2',
        migrationGuide: 'https://docs.api.com/migration',
      });
    }

    // Add deprecation headers if deprecated
    if (versionInfo.status === 'deprecated') {
      res.setHeader('Warning', `299 - "This API version is deprecated"`);
      res.setHeader('Sunset', versionInfo.sunsetDate);
    }

    // Add beta warning if beta
    if (versionInfo.status === 'beta') {
      res.setHeader('Warning', `299 - "This is a beta API version and may change"`);
    }

    next();
  };
}
```

#### Anti-Patterns to Avoid

```typescript
// ❌ DON'T: Version individual endpoints inconsistently
app.get('/api/users', getUsersV1);
app.get('/api/v2/users', getUsersV2);
app.get('/api/orders', getOrdersV2); // Inconsistent!

// ✅ DO: Version entire API surface consistently
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// ❌ DON'T: Put version in query parameter
app.get('/api/users?version=2', getUsers); // Hard to route, cache

// ✅ DO: Use path or header
app.get('/api/v2/users', getUsersV2);

// ❌ DON'T: Use date-based versions
app.get('/api/2024-01-15/users', getUsers); // Confusing, hard to track

// ✅ DO: Use semantic versioning
app.get('/api/v2/users', getUsersV2);

// ❌ DON'T: Break compatibility without versioning
app.get('/api/users', (req, res) => {
  // Suddenly changing response format - BREAKING!
  res.json({
    firstName: user.firstName, // Was "name" before
    lastName: user.lastName,
  });
});

// ✅ DO: Create new version for breaking changes
app.get('/api/v2/users', (req, res) => {
  res.json({
    firstName: user.firstName,
    lastName: user.lastName,
  });
});
```

#### Versioning Checklist

When introducing a new API version:

- [ ] Create new version directory structure (e.g., `api/v3/`)
- [ ] Copy and modify routes, controllers, schemas from previous version
- [ ] Extract shared business logic to `shared/services/`
- [ ] Update version configuration in `config/api-versions.ts`
- [ ] Add version lifecycle guards and deprecation middleware
- [ ] Create version-specific tests
- [ ] Generate version-specific API documentation
- [ ] Update deprecation notices for old version
- [ ] Set sunset date for previous version (minimum 6 months)
- [ ] Write migration guide
- [ ] Communicate changes to API consumers
- [ ] Monitor usage metrics per version

**Enforcement:**

```typescript
// arch-unit tests for versioning
describe('API Versioning Architecture', () => {
  it('should have all versions in dedicated folders', async () => {
    const files = await filesOfProject();

    files
      .inFolder('api')
      .shouldMatchPattern(/api\/(v\d+|shared)\/.*/);
  });

  it('should not have business logic in version-specific code', async () => {
    const files = await filesOfProject();

    files
      .inFolder('api/v1')
      .excluding('controllers')
      .excluding('routes')
      .excluding('schemas')
      .shouldNotExist();
  });

  it('should have shared services used by all versions', async () => {
    const files = await filesOfProject();

    files
      .inFolder('api/v1/controllers')
      .shouldDependOnFilesIn('api/shared/services');

    files
      .inFolder('api/v2/controllers')
      .shouldDependOnFilesIn('api/shared/services');
  });
});
```

### 4.7 RESTful API Design & Semantic Paths

**MUST follow RESTful principles and use semantic, resource-oriented URLs:**

RESTful APIs organize endpoints around resources (nouns) rather than actions (verbs), using HTTP methods to define operations.

#### Resource-Oriented URL Design

```typescript
// ✅ CORRECT: Resource-oriented paths (nouns)
GET    /api/users              // List all users
GET    /api/users/:id          // Get specific user
POST   /api/users              // Create new user
PUT    /api/users/:id          // Replace entire user
PATCH  /api/users/:id          // Update partial user
DELETE /api/users/:id          // Delete user

GET    /api/users/:id/orders   // Get orders for a user
GET    /api/orders/:id/items   // Get items in an order

// ❌ INCORRECT: Action-oriented paths (verbs)
GET    /api/getUsers
POST   /api/createUser
POST   /api/deleteUser/:id
GET    /api/getUserOrders/:userId
```

#### URL Path Conventions

```typescript
// ✅ CORRECT: Follow RESTful conventions
// - Use plural nouns for collections
// - Use lowercase with hyphens for multi-word resources
// - Nest resources logically
// - Keep URLs shallow (max 3 levels)

GET    /api/users                    // Collection
GET    /api/users/:id                // Single resource
GET    /api/users/:id/addresses      // Sub-collection
GET    /api/blog-posts               // Multi-word resource (kebab-case)
GET    /api/product-categories/:id   // Nested resource

// ❌ INCORRECT: Inconsistent conventions
GET    /api/user                     // Singular instead of plural
GET    /api/Users                    // Wrong case
GET    /api/user_addresses           // Snake case instead of kebab-case
GET    /api/users/:id/addresses/:addressId/verification/status  // Too deep
GET    /api/get-users                // Verb in URL
```

#### HTTP Methods Semantics & Idempotency

```typescript
/**
 * HTTP Method Characteristics:
 *
 * Safe Methods: Don't modify server state
 * - GET, HEAD, OPTIONS
 *
 * Idempotent Methods: Multiple identical requests have same effect as single request
 * - GET, PUT, DELETE, HEAD, OPTIONS
 *
 * Non-Idempotent Methods: Multiple requests may have different effects
 * - POST, PATCH (usually)
 */

// ✅ GET - Retrieve resource(s) [SAFE, IDEMPOTENT]
app.get('/api/users/:id', async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) throw new NotFoundError('User', req.params.id);

  res.status(200).json({ data: user });
});

// ❌ INCORRECT: GET with side effects
app.get('/api/users/:id/increment-views', async (req, res) => {
  await userService.incrementViewCount(req.params.id);  // Modifies state!
  res.status(200).json({ success: true });
});

// ✅ CORRECT: Use POST for operations with side effects
app.post('/api/users/:id/views', async (req, res) => {
  await userService.incrementViewCount(req.params.id);
  res.status(201).json({ success: true });
});

// ✅ POST - Create new resource [NON-IDEMPOTENT]
// Multiple POSTs create multiple resources
app.post('/api/users', async (req, res) => {
  const user = await userService.create(req.body);

  res.status(201)
    .location(`/api/users/${user.id}`)
    .json({ data: user });
});

// ✅ PUT - Replace entire resource [IDEMPOTENT]
// Multiple identical PUTs result in same state
app.put('/api/users/:id', async (req, res) => {
  const user = await userService.replace(req.params.id, req.body);
  if (!user) throw new NotFoundError('User', req.params.id);

  res.status(200).json({ data: user });
});

// PUT requires full resource representation
// { id: "123", name: "John", email: "john@example.com", role: "admin" }

// ✅ PATCH - Update partial resource [CONDITIONALLY IDEMPOTENT]
app.patch('/api/users/:id', async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  if (!user) throw new NotFoundError('User', req.params.id);

  res.status(200).json({ data: user });
});

// PATCH only requires changed fields
// { name: "John Doe" }  // Only update name

// ✅ DELETE - Remove resource [IDEMPOTENT]
// Multiple identical DELETEs result in same state (resource is gone)
app.delete('/api/users/:id', async (req, res) => {
  const deleted = await userService.delete(req.params.id);
  if (!deleted) throw new NotFoundError('User', req.params.id);

  res.status(204).send();
});

// Second DELETE of same resource returns 404, but end state is identical
```

#### Idempotency Keys for POST Requests

```typescript
// ✅ CORRECT: Implement idempotency for critical POST operations
// Prevents duplicate charges, orders, etc.

interface IdempotentRequest {
  idempotencyKey: string;
  // ... other fields
}

const idempotencyStore = new Map<string, any>();

app.post('/api/payments', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for payment requests',
      },
    });
  }

  // Check if request with this key was already processed
  const cached = idempotencyStore.get(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.body);
  }

  // Process the payment
  const payment = await paymentService.create(req.body);

  // Cache the response
  const response = { status: 201, body: { data: payment } };
  idempotencyStore.set(idempotencyKey, response);

  res.status(201).json(response.body);
});

// Client usage:
fetch('/api/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'unique-key-123',  // Same key = same result
  },
  body: JSON.stringify({ amount: 100, currency: 'USD' }),
});

// ✅ Database-backed idempotency (production-ready)
app.post('/api/orders', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  if (!idempotencyKey) {
    throw new ValidationError('Idempotency-Key header required');
  }

  // Check database for existing request
  const existing = await db.query(
    'SELECT * FROM idempotent_requests WHERE key = $1',
    [idempotencyKey]
  );

  if (existing.rows.length > 0) {
    const cached = existing.rows[0];
    return res.status(cached.status_code).json(JSON.parse(cached.response_body));
  }

  // Process request in transaction
  await db.transaction(async (trx) => {
    const order = await orderService.create(req.body, trx);

    // Store idempotency record
    await trx.query(
      `INSERT INTO idempotent_requests (key, status_code, response_body, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [idempotencyKey, 201, JSON.stringify({ data: order })]
    );

    res.status(201).json({ data: order });
  });
});
```

#### Query Parameters for Filtering, Sorting, and Pagination

```typescript
// ✅ CORRECT: Comprehensive query parameter handling
interface QueryParams {
  // Filtering
  status?: string;
  role?: string;
  createdAfter?: string;
  createdBefore?: string;
  search?: string;

  // Sorting
  sortBy?: string;
  order?: 'asc' | 'desc';

  // Pagination
  page?: number;
  limit?: number;
  offset?: number;

  // Field selection
  fields?: string;
}

app.get('/api/users', async (req, res) => {
  const query = req.query as QueryParams;

  // Build filter object using modern object composition
  const filters = {
    ...(query.status && { status: query.status }),
    ...(query.role && { role: query.role }),
    ...(query.search && { search: query.search }),
    ...(query.createdAfter && { createdAfter: new Date(query.createdAfter) }),
    ...(query.createdBefore && { createdBefore: new Date(query.createdBefore) }),
  };

  // Sorting with defaults
  const sortBy = query.sortBy ?? 'createdAt';
  const order = query.order ?? 'desc';

  // Pagination with safe parsing
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100); // Max 100
  const offset = (page - 1) * limit;

  // Field selection (sparse fieldsets)
  const fields = query.fields?.split(',');

  const result = await userService.findAll({
    filters,
    sortBy,
    order,
    limit,
    offset,
    fields,
  });

  const totalPages = Math.ceil(result.total / limit);
  const buildPageUrl = (p: number) => `/api/users?page=${p}&limit=${limit}`;

  res.status(200).json({
    data: result.items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages,
    },
    links: {
      self: buildPageUrl(page),
      first: buildPageUrl(1),
      last: buildPageUrl(totalPages),
      ...(page > 1 && { prev: buildPageUrl(page - 1) }),
      ...(page < totalPages && { next: buildPageUrl(page + 1) }),
    },
  });
});

// Example queries:
GET /api/users?status=active&role=admin
GET /api/users?search=john&sortBy=name&order=asc
GET /api/users?page=2&limit=50
GET /api/users?fields=id,name,email
GET /api/users?createdAfter=2024-01-01&createdBefore=2024-12-31
```

#### Advanced Query Language (JSON:API / GraphQL-style filtering)

```typescript
// ✅ CORRECT: Advanced filtering with operators
// Support for complex queries: ?filter[age][gte]=18&filter[status][in]=active,verified

interface FilterOperators {
  eq?: any;        // Equal
  ne?: any;        // Not equal
  gt?: any;        // Greater than
  gte?: any;       // Greater than or equal
  lt?: any;        // Less than
  lte?: any;       // Less than or equal
  in?: any[];      // In array
  nin?: any[];     // Not in array
  like?: string;   // SQL LIKE
  contains?: string; // Contains substring
}

app.get('/api/products', async (req, res) => {
  // Parse complex filter query
  // GET /api/products?filter[price][gte]=100&filter[price][lte]=500&filter[category][in]=electronics,computers

  const filters = parseFilters(req.query.filter);

  /*
  Parsed result:
  {
    price: { gte: 100, lte: 500 },
    category: { in: ['electronics', 'computers'] }
  }
  */

  const products = await productService.findWithFilters(filters);

  res.status(200).json({ data: products });
});

function parseFilters(filterQuery: any): Record<string, FilterOperators> {
  return Object.entries(filterQuery || {}).reduce((acc, [field, operators]) => ({
    ...acc,
    [field]: Object.entries(operators as Record<string, any>).reduce(
      (opAcc, [operator, value]) => ({
        ...opAcc,
        [operator]: operator === 'in' || operator === 'nin'
          ? String(value).split(',')
          : value,
      }),
      {} as FilterOperators
    ),
  }), {} as Record<string, FilterOperators>);
}

// Example: Convert filters to SQL WHERE clause
const operatorToSQL: Record<string, (field: string, value: any) => string> = {
  eq: (field, value) => `${field} = ${value}`,
  ne: (field, value) => `${field} != ${value}`,
  gt: (field, value) => `${field} > ${value}`,
  gte: (field, value) => `${field} >= ${value}`,
  lt: (field, value) => `${field} < ${value}`,
  lte: (field, value) => `${field} <= ${value}`,
  in: (field, value) => `${field} IN (${value.map((v: any) => `'${v}'`).join(', ')})`,
  nin: (field, value) => `${field} NOT IN (${value.map((v: any) => `'${v}'`).join(', ')})`,
  like: (field, value) => `${field} LIKE '%${value}%'`,
  contains: (field, value) => `${field} LIKE '%${value}%'`,
};

function buildWhereClause(filters: Record<string, FilterOperators>): string {
  return Object.entries(filters)
    .flatMap(([field, operators]) =>
      Object.entries(operators)
        .map(([operator, value]) => operatorToSQL[operator]?.(field, value))
        .filter(Boolean)
    )
    .join(' AND ');
}
```

#### Sub-Resources and Nested Routes

```typescript
// ✅ CORRECT: Logical nesting (max 2-3 levels)
GET    /api/users/:userId/orders                    // User's orders
GET    /api/users/:userId/orders/:orderId           // Specific order for user
GET    /api/orders/:orderId/items                   // Items in an order
POST   /api/users/:userId/addresses                 // Add address to user
DELETE /api/users/:userId/addresses/:addressId      // Remove user's address

// ✅ CORRECT: For deeply nested resources, provide direct access too
GET    /api/orders/:orderId          // Direct access to order
GET    /api/addresses/:addressId     // Direct access to address

// ❌ INCORRECT: Too deeply nested
GET    /api/users/:userId/orders/:orderId/items/:itemId/reviews/:reviewId

// ✅ CORRECT: Flatten deep hierarchies
GET    /api/reviews/:reviewId        // Direct access
GET    /api/items/:itemId/reviews    // Reviews for an item
```

#### Custom Actions on Resources

```typescript
// ✅ CORRECT: Use sub-resources for custom actions
POST   /api/users/:id/activate           // Activate user account
POST   /api/users/:id/deactivate         // Deactivate user account
POST   /api/orders/:id/cancel            // Cancel order
POST   /api/orders/:id/ship              // Ship order
POST   /api/posts/:id/publish            // Publish post
POST   /api/posts/:id/archive            // Archive post

// ✅ CORRECT: Action endpoints for operations that don't fit REST
POST   /api/auth/login                   // Login (not a resource operation)
POST   /api/auth/logout                  // Logout
POST   /api/auth/refresh-token           // Refresh token
POST   /api/password/reset               // Password reset
POST   /api/email/verify                 // Email verification

// ❌ INCORRECT: Using verbs in resource names
POST   /api/activate-user/:id
POST   /api/cancel-order/:id

// ❌ INCORRECT: Using GET for actions with side effects
GET    /api/users/:id/delete             // Should be DELETE
GET    /api/orders/:id/cancel            // Should be POST
```

#### Batch Operations

```typescript
// ✅ CORRECT: Batch endpoint for multiple operations
// Use POST with array of operations in request body

interface BatchOperation {
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: any;
}

interface BatchRequest {
  operations: BatchOperation[];
}

interface BatchResponse {
  results: Array<{
    status: number;
    body?: any;
    error?: any;
  }>;
}

app.post('/api/batch', async (req, res) => {
  const { operations } = req.body as BatchRequest;

  // Validate batch size
  if (operations.length > 100) {
    throw new ValidationError('Maximum 100 operations per batch');
  }

  const operationHandlers = {
    POST: async (op: BatchOperation) => ({
      status: 201 as const,
      body: await processPost(op.path, op.body),
    }),
    PATCH: async (op: BatchOperation) => ({
      status: 200 as const,
      body: await processPatch(op.path, op.body),
    }),
    DELETE: async (op: BatchOperation) => {
      await processDelete(op.path);
      return { status: 204 as const };
    },
  };

  const results = await Promise.all(
    operations.map(async (op) => {
      try {
        const handler = operationHandlers[op.method];
        return await handler(op);
      } catch (error: any) {
        return {
          status: error.statusCode || 500,
          error: {
            code: error.code,
            message: error.message,
          },
        };
      }
    })
  );

  res.status(200).json({ results });
});

// Client usage:
fetch('/api/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operations: [
      {
        method: 'POST',
        path: '/api/users',
        body: { name: 'John', email: 'john@example.com' },
      },
      {
        method: 'PATCH',
        path: '/api/users/123',
        body: { name: 'Jane' },
      },
      {
        method: 'DELETE',
        path: '/api/users/456',
      },
    ],
  }),
});

// ✅ CORRECT: Bulk operations on same resource type
POST   /api/users/bulk-create
POST   /api/users/bulk-update
POST   /api/users/bulk-delete

app.post('/api/users/bulk-create', async (req, res) => {
  const { users } = req.body;

  if (users.length > 1000) {
    throw new ValidationError('Maximum 1000 users per bulk operation');
  }

  const created = await userService.bulkCreate(users);

  res.status(201).json({
    data: created,
    meta: {
      total: created.length,
      successful: created.filter(u => u.success).length,
      failed: created.filter(u => !u.success).length,
    },
  });
});

// Request body:
{
  "users": [
    { "name": "John", "email": "john@example.com" },
    { "name": "Jane", "email": "jane@example.com" },
    { "name": "Bob", "email": "bob@example.com" }
  ]
}

// Response:
{
  "data": [
    { "id": "1", "name": "John", "email": "john@example.com", "success": true },
    { "id": "2", "name": "Jane", "email": "jane@example.com", "success": true },
    { "success": false, "error": "Email already exists" }
  ],
  "meta": {
    "total": 3,
    "successful": 2,
    "failed": 1
  }
}
```

#### Async Processing & Long-Running Operations

```typescript
// ✅ CORRECT: Return 202 Accepted for async operations
app.post('/api/reports/generate', async (req, res) => {
  const job = await jobQueue.enqueue('generate-report', req.body);

  res.status(202)
    .location(`/api/jobs/${job.id}`)
    .json({
      data: {
        jobId: job.id,
        status: 'pending',
        statusUrl: `/api/jobs/${job.id}`,
        estimatedCompletionTime: job.estimatedCompletionTime,
      },
    });
});

// Check job status
app.get('/api/jobs/:id', async (req, res) => {
  type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

  const statusEnrichers: Record<JobStatus, (data: any, job: Job) => void> = {
    pending: () => {},
    processing: (data, job) => {
      data.progress = job.progress;
    },
    completed: (data, job) => {
      data.result = job.result;
      data.resultUrl = `/api/reports/${job.result.id}`;
    },
    failed: (data, job) => {
      data.error = job.error;
    },
  };

  const job = await jobQueue.getJob(req.params.id);

  if (!job) throw new NotFoundError('Job', req.params.id);

  const data = {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  statusEnrichers[job.status](data, job);

  res.status(200).json({ data });
});

// WebSocket alternative for real-time updates
io.on('connection', (socket) => {
  socket.on('subscribe-job', async (jobId) => {
    const job = await jobQueue.getJob(jobId);

    job.on('progress', (progress) => {
      socket.emit('job-progress', { jobId, progress });
    });

    job.on('completed', (result) => {
      socket.emit('job-completed', { jobId, result });
    });

    job.on('failed', (error) => {
      socket.emit('job-failed', { jobId, error });
    });
  });
});
```

#### HATEOAS (Hypermedia as the Engine of Application State)

```typescript
// ✅ CORRECT: Include hypermedia links in responses
app.get('/api/orders/:id', async (req, res) => {
  const order = await orderService.findById(req.params.id);
  if (!order) throw new NotFoundError('Order', req.params.id);

  res.status(200).json({
    data: order,
    links: {
      self: `/api/orders/${order.id}`,
      items: `/api/orders/${order.id}/items`,
      user: `/api/users/${order.userId}`,
      ...(order.status === 'pending' && {
        cancel: {
          href: `/api/orders/${order.id}/cancel`,
          method: 'POST',
        },
      }),
      ...(order.status === 'paid' && {
        ship: {
          href: `/api/orders/${order.id}/ship`,
          method: 'POST',
        },
      }),
    },
  });
});

// Response shows available actions based on current state
{
  "data": {
    "id": "123",
    "status": "pending",
    "total": 100.00
  },
  "links": {
    "self": "/api/orders/123",
    "items": "/api/orders/123/items",
    "user": "/api/users/456",
    "cancel": {
      "href": "/api/orders/123/cancel",
      "method": "POST"
    }
  }
}
```

#### Content Negotiation

```typescript
// ✅ CORRECT: Support multiple response formats
const formatHandlers = {
  'application/xml': (data: any) => ({
    type: 'application/xml',
    body: convertToXML(data),
  }),
  'text/csv': (data: any) => ({
    type: 'text/csv',
    body: convertToCSV([data]),
  }),
  'application/json': (data: any) => ({
    type: 'application/json',
    body: { data },
  }),
};

app.get('/api/users/:id', async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) throw new NotFoundError('User', req.params.id);

  const acceptHeader = req.headers.accept ?? 'application/json';

  const format = Object.keys(formatHandlers).find(
    (type) => acceptHeader.includes(type)
  ) ?? 'application/json';

  const { type, body } = formatHandlers[format](user);

  res.type(type);
  typeof body === 'string' ? res.send(body) : res.json(body);
});

// Support compression
import compression from 'compression';
app.use(compression());

// Client specifies preferred format
fetch('/api/users/123', {
  headers: {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  },
});
```

**Key Principles:**

- ✅ Use resource-oriented URLs (nouns, not verbs)
- ✅ Use plural nouns for collections
- ✅ Leverage HTTP methods semantically (GET, POST, PUT, PATCH, DELETE)
- ✅ Implement idempotency for critical operations (payments, orders)
- ✅ Use idempotency keys for non-idempotent POST requests
- ✅ Support filtering, sorting, and pagination via query parameters
- ✅ Limit nesting to 2-3 levels, provide direct access for deep resources
- ✅ Use 202 Accepted for async operations
- ✅ Provide batch endpoints for bulk operations
- ✅ Include hypermedia links (HATEOAS) for discoverability
- ✅ Support content negotiation when applicable
- ✅ Never use GET for operations with side effects
- ✅ Keep URLs semantic, consistent, and predictable

## 5. Frontend-Specific Standards

### 5.1 Atomic Design Pattern

**MUST implement component hierarchy:**

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

```typescript
// ✅ CORRECT: Atomic structure
// atoms/button.tsx
export function Button({ children, ...props }: ButtonProps) {
  return <button {...props}>{children}</button>;
}

// molecules/form-field.tsx
import { Input } from 'atoms/input';
import { Label } from 'atoms/label';
import { ErrorText } from 'atoms/error-text';

export function FormField({ label, error, ...inputProps }: FormFieldProps) {
  return (
    <div>
      <Label>{label}</Label>
      <Input {...inputProps} />
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
```

### 5.2 Smart/Dumb Component Pattern

```typescript
// ✅ CORRECT: Smart (Container) component
function UserListContainer() {
  const { data, isLoading } = useQuery(['users'], fetchUsers);
  const [filter, setFilter] = useState('');

  if (isLoading) return <Spinner />;

  return (
    <UserList
      users={data}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}

// ✅ CORRECT: Dumb (Presentational) component
interface UserListProps {
  users: User[];
  filter: string;
  onFilterChange: (filter: string) => void;
}

function UserList({ users, filter, onFilterChange }: UserListProps) {
  const filtered = users.filter(u => u.name.includes(filter));

  return (
    <div>
      <input value={filter} onChange={e => onFilterChange(e.target.value)} />
      {filtered.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  );
}

// ❌ INCORRECT: Mixed concerns
function UserList() {
  const { data } = useQuery(['users'], fetchUsers); // Data fetching
  const [filter, setFilter] = useState(''); // State management

  return <div>{/* Rendering */}</div>;
}
```

### 5.3 CSS Property Order

**MUST follow logical property ordering for consistency and readability:**

```css
/* ✅ CORRECT: Logical property order */
.component {
  /* 1. POSITIONING */
  position: relative;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;

  /* 2. DISPLAY & BOX MODEL */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;

  /* 3. BOX SIZING */
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
  height: auto;
  min-height: 400px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  overflow: hidden;

  /* 4. TYPOGRAPHY */
  font-family: 'Inter', sans-serif;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: 0.02em;
  text-align: left;
  color: #333;

  /* 5. VISUAL (Background, Border) */
  background-color: #fff;
  background-image: url('/pattern.svg');
  background-size: cover;
  background-position: center;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  /* 6. TRANSFORMS & ANIMATIONS */
  transform: translateY(0);
  transition: all 0.3s ease;
  animation: fadeIn 0.5s ease-in;

  /* 7. OTHER */
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  opacity: 1;
  visibility: visible;
}

/* ❌ INCORRECT: Random property order (hard to read and maintain) */
.component {
  color: #333;
  position: relative;
  background-color: #fff;
  display: flex;
  font-size: 1rem;
  width: 100%;
  border: 1px solid #e5e7eb;
  padding: 2rem;
  transition: all 0.3s ease;
  margin: 0 auto;
  z-index: 10;
  /* Properties scattered randomly - difficult to scan */
}
```

**Recommended Property Order Groups:**

```css
.element {
  /* ============================================
     1. POSITIONING
     - Controls element position in document flow
     ============================================ */
  position: /* static | relative | absolute | fixed | sticky */;
  top: ;
  right: ;
  bottom: ;
  left: ;
  z-index: ;

  /* ============================================
     2. DISPLAY & FLEXBOX/GRID
     - Controls layout behavior
     ============================================ */
  display: /* block | inline | flex | grid | none */;

  /* Flexbox */
  flex-direction: ;
  flex-wrap: ;
  justify-content: ;
  align-items: ;
  align-content: ;
  gap: ;
  flex: ;
  flex-grow: ;
  flex-shrink: ;
  flex-basis: ;
  order: ;

  /* Grid */
  grid-template-columns: ;
  grid-template-rows: ;
  grid-template-areas: ;
  grid-auto-columns: ;
  grid-auto-rows: ;
  grid-auto-flow: ;
  grid-column: ;
  grid-row: ;
  grid-area: ;
  gap: ;

  /* ============================================
     3. BOX MODEL
     - Controls element dimensions and spacing
     ============================================ */
  box-sizing: /* border-box | content-box */;
  width: ;
  min-width: ;
  max-width: ;
  height: ;
  min-height: ;
  max-height: ;
  margin: ;
  margin-top: ;
  margin-right: ;
  margin-bottom: ;
  margin-left: ;
  padding: ;
  padding-top: ;
  padding-right: ;
  padding-bottom: ;
  padding-left: ;
  overflow: ;
  overflow-x: ;
  overflow-y: ;

  /* ============================================
     4. TYPOGRAPHY
     - Controls text appearance
     ============================================ */
  font-family: ;
  font-size: ;
  font-weight: ;
  font-style: ;
  line-height: ;
  letter-spacing: ;
  word-spacing: ;
  text-align: ;
  text-decoration: ;
  text-transform: ;
  text-indent: ;
  white-space: ;
  word-wrap: ;
  word-break: ;
  color: ;

  /* ============================================
     5. VISUAL
     - Controls background, borders, shadows
     ============================================ */
  background: ;
  background-color: ;
  background-image: ;
  background-size: ;
  background-position: ;
  background-repeat: ;
  background-attachment: ;
  border: ;
  border-width: ;
  border-style: ;
  border-color: ;
  border-top: ;
  border-right: ;
  border-bottom: ;
  border-left: ;
  border-radius: ;
  box-shadow: ;
  outline: ;

  /* ============================================
     6. TRANSFORMS & ANIMATIONS
     - Controls motion and transformations
     ============================================ */
  transform: ;
  transform-origin: ;
  transition: ;
  transition-property: ;
  transition-duration: ;
  transition-timing-function: ;
  transition-delay: ;
  animation: ;
  animation-name: ;
  animation-duration: ;
  animation-timing-function: ;
  animation-delay: ;
  animation-iteration-count: ;
  animation-direction: ;

  /* ============================================
     7. MISCELLANEOUS
     - Other properties
     ============================================ */
  cursor: ;
  pointer-events: ;
  user-select: ;
  resize: ;
  opacity: ;
  visibility: ;
  filter: ;
  backdrop-filter: ;
  content: ;
  quotes: ;
}
```

**Practical Example:**

```css
/* ✅ CORRECT: Well-organized button styles */
.button {
  /* Positioning */
  position: relative;

  /* Display & Layout */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  /* Box Model */
  min-width: 120px;
  min-height: 44px;
  padding: 0.75rem 1.5rem;

  /* Typography */
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  color: white;

  /* Visual */
  background-color: #3b82f6;
  border: none;
  border-radius: 0.375rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  /* Transforms & Animations */
  transform: translateY(0);
  transition: all 0.2s ease;

  /* Miscellaneous */
  cursor: pointer;
  user-select: none;
}

.button:hover {
  background-color: #2563eb;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.button:active {
  transform: translateY(0);
}

.button:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
  opacity: 0.6;
}
```

**Automation with Stylelint:**

```javascript
// .stylelintrc.js
module.exports = {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-order'],
  rules: {
    'order/properties-order': [
      // Positioning
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'z-index',

      // Display & Layout
      'display',
      'flex-direction',
      'flex-wrap',
      'justify-content',
      'align-items',
      'align-content',
      'gap',
      'flex',
      'flex-grow',
      'flex-shrink',
      'flex-basis',
      'order',
      'grid-template-columns',
      'grid-template-rows',
      'grid-auto-columns',
      'grid-auto-rows',
      'grid-column',
      'grid-row',

      // Box Model
      'box-sizing',
      'width',
      'min-width',
      'max-width',
      'height',
      'min-height',
      'max-height',
      'margin',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'padding',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'overflow',
      'overflow-x',
      'overflow-y',

      // Typography
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'line-height',
      'letter-spacing',
      'text-align',
      'text-decoration',
      'text-transform',
      'color',

      // Visual
      'background',
      'background-color',
      'background-image',
      'background-size',
      'background-position',
      'background-repeat',
      'border',
      'border-width',
      'border-style',
      'border-color',
      'border-radius',
      'box-shadow',
      'outline',

      // Transforms & Animations
      'transform',
      'transition',
      'animation',

      // Miscellaneous
      'cursor',
      'pointer-events',
      'user-select',
      'opacity',
      'visibility',
    ],
  },
};
```

**Benefits of Consistent Property Order:**

- ✅ **Easier to scan** - Properties always in the same location
- ✅ **Faster debugging** - Know where to look for specific properties
- ✅ **Better diffs** - Changes are easier to review in version control
- ✅ **Team consistency** - All developers follow same patterns
- ✅ **Reduced merge conflicts** - Consistent ordering prevents reordering conflicts
- ✅ **Automated enforcement** - Stylelint can auto-fix property order

### 5.4 CSS Variables & Design Tokens

**MUST use CSS custom properties (variables) for design tokens to ensure consistency, maintainability, and themability:**

#### Design Token Architecture

```css
/* ✅ CORRECT: Hierarchical design token system */

/* ================================================
   PRIMITIVE TOKENS (Base values - never use directly in components)
   ================================================ */
:root {
  /* Colors - Raw values */
  --color-blue-50: #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-900: #1e3a8a;

  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-500: #6b7280;
  --color-gray-900: #111827;

  --color-red-500: #ef4444;
  --color-red-600: #dc2626;

  --color-green-500: #10b981;
  --color-green-600: #059669;

  /* Spacing - Raw values */
  --space-0: 0;
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */

  /* Font sizes - Raw values */
  --font-size-xs: 0.75rem;   /* 12px */
  --font-size-sm: 0.875rem;  /* 14px */
  --font-size-base: 1rem;    /* 16px */
  --font-size-lg: 1.125rem;  /* 18px */
  --font-size-xl: 1.25rem;   /* 20px */
  --font-size-2xl: 1.5rem;   /* 24px */
  --font-size-3xl: 1.875rem; /* 30px */

  /* Font weights */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Line heights */
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;

  /* Border radius */
  --radius-none: 0;
  --radius-sm: 0.125rem;  /* 2px */
  --radius-base: 0.25rem; /* 4px */
  --radius-md: 0.375rem;  /* 6px */
  --radius-lg: 0.5rem;    /* 8px */
  --radius-xl: 0.75rem;   /* 12px */
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-base: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);

  /* Z-index scale */
  --z-index-dropdown: 1000;
  --z-index-sticky: 1020;
  --z-index-fixed: 1030;
  --z-index-modal-backdrop: 1040;
  --z-index-modal: 1050;
  --z-index-popover: 1060;
  --z-index-tooltip: 1070;
}

/* ================================================
   SEMANTIC TOKENS (Purpose-driven - USE THESE in components)
   ================================================ */
:root {
  /* Text colors */
  --text-primary: var(--color-gray-900);
  --text-secondary: var(--color-gray-500);
  --text-disabled: var(--color-gray-400);
  --text-inverse: var(--color-white);
  --text-link: var(--color-blue-600);
  --text-link-hover: var(--color-blue-700);
  --text-error: var(--color-red-600);
  --text-success: var(--color-green-600);

  /* Background colors */
  --bg-primary: var(--color-white);
  --bg-secondary: var(--color-gray-50);
  --bg-tertiary: var(--color-gray-100);
  --bg-disabled: var(--color-gray-200);
  --bg-inverse: var(--color-gray-900);

  /* Border colors */
  --border-primary: var(--color-gray-300);
  --border-secondary: var(--color-gray-200);
  --border-focus: var(--color-blue-500);
  --border-error: var(--color-red-500);

  /* Component-specific tokens */
  --button-primary-bg: var(--color-blue-600);
  --button-primary-bg-hover: var(--color-blue-700);
  --button-primary-text: var(--color-white);
  --button-disabled-bg: var(--color-gray-300);
  --button-disabled-text: var(--color-gray-500);

  --input-bg: var(--bg-primary);
  --input-border: var(--border-primary);
  --input-border-focus: var(--border-focus);
  --input-text: var(--text-primary);
  --input-placeholder: var(--text-secondary);

  /* Spacing tokens (semantic) */
  --spacing-component-gap: var(--space-4);
  --spacing-section-gap: var(--space-8);
  --spacing-page-padding: var(--space-6);
}

/* ================================================
   DARK THEME (Override semantic tokens)
   ================================================ */
[data-theme="dark"] {
  --text-primary: var(--color-gray-50);
  --text-secondary: var(--color-gray-400);
  --text-disabled: var(--color-gray-600);
  --text-inverse: var(--color-gray-900);

  --bg-primary: var(--color-gray-900);
  --bg-secondary: var(--color-gray-800);
  --bg-tertiary: var(--color-gray-700);

  --border-primary: var(--color-gray-700);
  --border-secondary: var(--color-gray-600);

  --button-primary-bg: var(--color-blue-500);
  --button-primary-bg-hover: var(--color-blue-600);
}

/* ❌ INCORRECT: Using primitive tokens directly in components */
.button {
  background-color: var(--color-blue-600);  /* ❌ Don't use primitive tokens */
  color: white;  /* ❌ Hardcoded value */
  padding: 12px 24px;  /* ❌ Magic numbers */
  border-radius: 6px;  /* ❌ Hardcoded value */
}

/* ✅ CORRECT: Using semantic tokens */
.button {
  background-color: var(--button-primary-bg);
  color: var(--button-primary-text);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  transition: background-color 0.2s ease;
}

.button:hover {
  background-color: var(--button-primary-bg-hover);
}

.button:disabled {
  background-color: var(--button-disabled-bg);
  color: var(--button-disabled-text);
  cursor: not-allowed;
}
```

#### Best Practices

**1. Token Naming Convention**  

```css
/* ✅ CORRECT: Hierarchical naming */
--{category}-{variant}-{state}

Examples:
--color-blue-500           /* Primitive: color palette */
--text-primary             /* Semantic: purpose */
--button-primary-bg        /* Component: specific use */
--button-primary-bg-hover  /* Component: with state */

/* ❌ INCORRECT: Ambiguous naming */
--blue
--main-color
--buttonColor
--btn-bg-1
```

**2. Never Use Primitive Tokens Directly**  

```css
/* ❌ INCORRECT: Component uses primitive tokens */
.card {
  background: var(--color-gray-100);
  border: 1px solid var(--color-gray-300);
}

/* ✅ CORRECT: Component uses semantic tokens */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
}
```

**3. TypeScript Integration**  

```typescript
// styles/tokens.ts
export const tokens = {
  colors: {
    blue: {
      50: '#eff6ff',
      500: '#3b82f6',
      600: '#2563eb',
    },
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    4: '1rem',
  },
} as const;

// Generate CSS variables from TypeScript
export function generateCSSVariables(tokens: typeof tokens): string {
  let css = ':root {\n';

  Object.entries(tokens.colors).forEach(([colorName, shades]) => {
    Object.entries(shades).forEach(([shade, value]) => {
      css += `  --color-${colorName}-${shade}: ${value};\n`;
    });
  });

  return css + '}';
}
```

**4. CSS-in-JS with Design Tokens**  

```typescript
// ✅ CORRECT: Using CSS variables in styled-components
import styled from 'styled-components';

const Button = styled.button`
  background-color: var(--button-primary-bg);
  color: var(--button-primary-text);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);

  &:hover {
    background-color: var(--button-primary-bg-hover);
  }
`;

// ❌ INCORRECT: Hardcoded values
const Button = styled.button`
  background-color: #3b82f6;
  color: white;
  padding: 12px 24px;
  border-radius: 6px;
`;
```

**5. Responsive Design Tokens**  

```css
/* ✅ CORRECT: Responsive spacing tokens */
:root {
  --container-padding: var(--space-4);
  --heading-size: var(--font-size-2xl);
}

@media (min-width: 768px) {
  :root {
    --container-padding: var(--space-6);
    --heading-size: var(--font-size-3xl);
  }
}

@media (min-width: 1024px) {
  :root {
    --container-padding: var(--space-8);
    --heading-size: var(--font-size-4xl);
  }
}

.container {
  padding: var(--container-padding);
}

.heading {
  font-size: var(--heading-size);
}
```

**6. Animation Tokens**  

```css
:root {
  /* Duration */
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-base: 300ms;
  --duration-slow: 500ms;

  /* Easing */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ✅ CORRECT: Using animation tokens */
.modal {
  transition:
    opacity var(--duration-base) var(--ease-in-out),
    transform var(--duration-base) var(--ease-out);
}

/* ❌ INCORRECT: Hardcoded animation values */
.modal {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**7. Token Documentation**  

```typescript
// tokens.config.ts
export const designTokens = {
  /**
   * Primary brand color
   * Usage: Buttons, links, active states
   * Contrast ratio: 4.5:1 (AA compliant)
   */
  colorPrimaryBase: '#3b82f6',

  /**
   * Base spacing unit (4px)
   * Use multiples: space-2 (8px), space-4 (16px)
   */
  spaceBase: '0.25rem',

  /**
   * Default border radius for buttons and inputs
   * Creates subtle rounded corners
   */
  radiusMd: '0.375rem',
} as const;
```

**8. Design Token Generation**  

```json
// tokens.json (Design tool export - Figma, etc.)
{
  "color": {
    "primary": {
      "base": { "value": "#3b82f6" },
      "hover": { "value": "#2563eb" },
      "active": { "value": "#1d4ed8" }
    }
  },
  "spacing": {
    "base": { "value": "4px" },
    "scale": [0, 1, 2, 3, 4, 6, 8, 12, 16]
  }
}
```

```javascript
// generate-tokens.js
const tokens = require('./tokens.json');

function generateCSS(tokens) {
  let css = ':root {\n';

  // Generate color tokens
  Object.entries(tokens.color.primary).forEach(([key, { value }]) => {
    css += `  --color-primary-${key}: ${value};\n`;
  });

  // Generate spacing tokens
  tokens.spacing.scale.forEach(multiplier => {
    const value = parseInt(tokens.spacing.base.value) * multiplier;
    css += `  --space-${multiplier}: ${value}px;\n`;
  });

  css += '}\n';
  return css;
}

console.log(generateCSS(tokens));
```

**Benefits of Design Tokens:**

- ✅ **Single source of truth** - All design values in one place
- ✅ **Easy theming** - Switch themes by changing semantic tokens
- ✅ **Consistency** - Enforces design system adherence
- ✅ **Maintainability** - Update once, changes everywhere
- ✅ **Type safety** - TypeScript integration for autocomplete
- ✅ **Designer-developer sync** - Export from design tools
- ✅ **Scalability** - Easy to add new themes or variants
- ✅ **Performance** - CSS variables are native and fast

**Anti-Patterns to Avoid:**

```css
/* ❌ DON'T: Mix primitive and semantic tokens */
.button {
  background: var(--color-blue-600);  /* Primitive */
  color: var(--text-primary);          /* Semantic */
}

/* ❌ DON'T: Use inline styles instead of tokens */
<div style="color: #3b82f6; padding: 16px">

/* ❌ DON'T: Create tokens for every single value */
:root {
  --padding-top-button-large: 12px;
  --padding-right-button-large: 24px;
  --padding-bottom-button-large: 12px;
  --padding-left-button-large: 24px;
}

/* ✅ DO: Use logical spacing tokens */
:root {
  --space-3: 0.75rem;
  --space-6: 1.5rem;
}

.button-large {
  padding: var(--space-3) var(--space-6);
}

/* ❌ DON'T: Hardcode calculations */
.element {
  margin: calc(16px * 2);
}

/* ✅ DO: Use token-based calculations */
.element {
  margin: calc(var(--space-4) * 2);
}
```

**Enforcement:**

```json
// ESLint + stylelint-use-logical-spec rules:
"csstools/use-logical": "always",
"scale-unlimited/declaration-strict-value": [
  ["color", "background-color", "border-color"],
  {
    "ignoreValues": ["transparent", "inherit", "currentColor"],
  }
]
```

### 5.5 Mobile-First Responsive Design

```css
/* ✅ CORRECT: Mobile-first */

.container {
  padding: 1rem;
  font-size: 1.4rem;
}

@media (min-width: 768px) {
  .container {
    padding: 2rem;
    font-size: 1.6rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 3rem;
    font-size: 1.8rem;
  }
}

/* ❌ INCORRECT: Desktop-first */
.container {
  padding: 3rem;
}

@media (max-width: 1024px) {
  .container {
    padding: 2rem;
  }
}
```

### 5.6 WCAG 2.0 Compliance

**MUST ensure:**

```tsx
// ✅ Semantic HTML
<button onClick={handleClick}>Submit</button>

// ❌ Non-semantic
<div onClick={handleClick}>Submit</div>

// ✅ ARIA labels
<button aria-label="Close modal" onClick={onClose}>
  <X />
</button>

// ✅ Keyboard navigation
<div
  role="button"
  tabIndex={0}
  onKeyPress={(e) => e.key === 'Enter' && handleClick()}
  onClick={handleClick}
>
  Interactive Element
</div>

// ✅ Color contrast (minimum 4.5:1 for normal text)
// ✅ Focus indicators
// ✅ Screen reader support

// ✅ Focus Trap for Modals/Dialogs (WCAG 2.1.2 - No Keyboard Trap)
function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store the element that had focus before opening modal
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in modal
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    // Cleanup: restore focus when modal closes
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab: if on first element, focus last
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      }
      // Tab: if on last element, focus first
      else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
      className="modal-overlay"
    >
      <div className="modal-content">
        <h2 id="modal-title">Modal Title</h2>
        {children}
        <button onClick={onClose} aria-label="Close modal">
          Close
        </button>
      </div>
    </div>
  );
}

// ❌ INCORRECT: No focus trap
function BadModal({ isOpen, children }: ModalProps) {
  if (!isOpen) return null;

  // Missing:
  // - Focus trap (Tab can escape to background)
  // - Focus restoration
  // - Keyboard navigation (Escape key)
  // - ARIA attributes (role, aria-modal, aria-labelledby)
  return <div className="modal">{children}</div>;
}

// 💡 RECOMMENDED: Use battle-tested libraries for production
// - focus-trap-react: https://github.com/focus-trap/focus-trap-react
// - react-focus-lock: https://github.com/theKashey/react-focus-lock
// - @radix-ui/react-dialog: Includes focus trap built-in
// - @headlessui/react Dialog: Fully accessible with focus management

// Example with focus-trap-react:
import FocusTrap from 'focus-trap-react';

function AccessibleModal({ isOpen, onClose, children }: ModalProps) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
    return () => {
      if (!isOpen && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: true,
        onDeactivate: onClose,
        clickOutsideDeactivates: true,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal-overlay"
      >
        <div className="modal-content">
          <h2 id="modal-title">Modal Title</h2>
          {children}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </FocusTrap>
  );
}

// ✅ Zoom & Text Resize Support (WCAG 1.4.4, 1.4.10 - Resize Text & Reflow)
// Users must be able to zoom up to 200% without losing content or functionality

// HTML: Proper viewport meta tag (DO NOT disable user scaling)
// ✅ CORRECT
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

// ❌ INCORRECT: Prevents zoom
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />

// CSS: Use relative units (rem, em, %) instead of fixed pixels
// ✅ CORRECT: Responsive to user zoom preferences
.text-base {
  font-size: 1rem;        /* 16px by default, scales with zoom */
  line-height: 1.5;       /* Relative to font size */
  padding: 1rem 1.5rem;   /* Scales with zoom */
  max-width: 65ch;        /* Character-based width, scales with text */
}

.container {
  width: 100%;
  max-width: 1200px;
  padding: clamp(1rem, 5vw, 3rem);  /* Fluid spacing */
}

// ❌ INCORRECT: Fixed pixel sizes break at zoom
.text-base {
  font-size: 14px;        /* Fixed, ignores zoom */
  line-height: 20px;      /* Fixed line height */
  padding: 10px 15px;     /* Fixed padding */
  width: 800px;           /* Fixed width causes horizontal scroll */
}

// ✅ CORRECT: Breakpoints in em units (respect user font size preferences)
@media (min-width: 48em) {   /* 768px with default 16px font */
  .sidebar {
    display: block;
  }
}

@media (min-width: 64em) {   /* 1024px with default 16px font */
  .content {
    grid-template-columns: repeat(2, 1fr);
  }
}

// ❌ INCORRECT: Breakpoints in px don't respect user preferences
@media (min-width: 768px) {
  .sidebar {
    display: block;  /* May trigger at wrong zoom levels */
  }
}

// ✅ CORRECT: Ensure content reflows at 400% zoom (1280px width becomes 320px)
.card {
  display: flex;
  flex-wrap: wrap;           /* Allow wrapping at high zoom */
  gap: 1rem;
}

.card__image {
  width: 100%;
  max-width: 20rem;          /* Scales with text */
  height: auto;              /* Maintain aspect ratio */
}

.card__content {
  flex: 1 1 15rem;           /* Flexible, maintains minimum size */
}

// ❌ INCORRECT: Fixed positioning breaks at zoom
.card {
  display: flex;
  flex-wrap: nowrap;         /* Forces horizontal scroll at zoom */
}

.card__image {
  width: 200px;              /* Fixed width */
  height: 150px;             /* Fixed height, distorts image */
}

.card__content {
  width: 600px;              /* Fixed width causes overflow */
}

// ✅ CORRECT: Responsive font sizing with clamp()
.heading {
  font-size: clamp(1.5rem, 4vw + 1rem, 3rem);
  /* Min: 1.5rem (24px), Preferred: 4vw + 1rem, Max: 3rem (48px) */
  /* Scales smoothly and respects user zoom */
}

// ✅ CORRECT: Ensure interactive elements are large enough when zoomed
button {
  min-height: 44px;          /* WCAG 2.5.5 Target Size minimum */
  min-width: 44px;
  padding: 0.75em 1.5em;     /* Scales with text */
  font-size: 1rem;
}

// ❌ INCORRECT: Too small at default size, worse when zoomed
button {
  height: 24px;              /* Below minimum target size */
  padding: 2px 8px;          /* Fixed small padding */
  font-size: 12px;           /* Fixed small text */
}
```

**Key WCAG Requirements for Zoom:**

- ✅ **1.4.4 Resize Text (AA)**: Text can be resized up to 200% without assistive technology
- ✅ **1.4.10 Reflow (AA)**: Content reflows without horizontal scrolling at 400% zoom (1280px → 320px)
- ✅ **2.5.5 Target Size (AAA)**: Interactive elements at least 44×44 CSS pixels
- ✅ No `user-scalable=no` or `maximum-scale=1.0` in viewport meta tag
- ✅ Use relative units (rem, em, %, vw, vh, ch) instead of fixed px
- ✅ Test at 200% browser zoom - all content should be visible and functional
- ✅ Test at 400% zoom - content should reflow without horizontal scrolling

**Testing Checklist:**

```bash
# Browser zoom levels to test:
# - 100% (default)
# - 150%
# - 200% (WCAG AA requirement)
# - 400% (WCAG AA reflow requirement)

# What to check:
# 1. No horizontal scrolling (except data tables)
# 2. All text is readable
# 3. No overlapping content
# 4. All interactive elements remain clickable
# 5. No content is cut off
# 6. Focus indicators visible
# 7. Forms remain usable
```

### 5.7 Avoid Props Drilling

```typescript
// ✅ CORRECT: Context or state management
const UserContext = createContext<User | null>(null);

function App() {
  const user = useUser();
  return (
    <UserContext.Provider value={user}>
      <Layout />
    </UserContext.Provider>
  );
}

function Profile() {
  const user = useContext(UserContext);
  return <div>{user?.name}</div>;
}

// ✅ CORRECT: Zustand
const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// ❌ INCORRECT: Props drilling
function App() {
  const user = useUser();
  return <Layout user={user} />;
}

function Layout({ user }) {
  return <Header user={user} />;
}

function Header({ user }) {
  return <Profile user={user} />;
}

function Profile({ user }) {
  return <div>{user.name}</div>;
}
```

## 6. React-Specific Standards

### 6.1 Server State vs Client State Separation

```typescript
// ✅ CORRECT: Tanstack Query for server state
const { data: users } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
});

// ✅ CORRECT: Zustand for client UI state
const useUIStore = create((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({
    isSidebarOpen: !state.isSidebarOpen
  })),
}));

// ❌ INCORRECT: Mixing server data in client state
const [users, setUsers] = useState([]);

useEffect(() => {
  fetchUsers().then(setUsers);
}, []);
```

### 6.2 Form Handling with React Hook Form + Zod

```typescript
// ✅ CORRECT
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    // data is validated and type-safe
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Login</button>
    </form>
  );
}

// ❌ INCORRECT: Manual state management
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    // Manual validation logic
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      // Submit
    }
  };
}
```

### 6.3 Function Components Only

```typescript
// ✅ CORRECT: Function component with hooks
function UserProfile({ userId }: { userId: string }) {
  const { data } = useQuery(['user', userId], () => fetchUser(userId));

  return <div>{data?.name}</div>;
}

// ❌ INCORRECT: Class component
class UserProfile extends React.Component {
  state = { user: null };

  componentDidMount() {
    fetchUser(this.props.userId).then(user => this.setState({ user }));
  }

  render() {
    return <div>{this.state.user?.name}</div>;
  }
}
```

## 7. Error Handling & Resilience

### 7.1 Unified Error Handling

**Backend:**

```typescript
// ✅ Global error handler
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

  logger.error('Unhandled error', { err });
  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
});
```

**Frontend (React):**

```typescript
// ✅ Error Boundaries
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Component error', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

### 7.2 Design for Failure

```typescript
// ✅ Circuit breaker pattern
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}

// ✅ Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
  throw new Error('Max retries exceeded');
}
```

## 8. Code Quality Anti-Patterns to Avoid

### 8.1 Code Smells

```typescript
// ❌ Long parameter lists
function createUser(name, email, password, age, address, phone, country) { }

// ✅ Use object parameter
function createUser(params: CreateUserParams) { }

// ❌ Magic numbers
setTimeout(callback, 3600000);

// ✅ Named constants
const ONE_HOUR_MS = 60 * 60 * 1000;
setTimeout(callback, ONE_HOUR_MS);

// ❌ Nested callbacks (callback hell)
getData((data) => {
  processData(data, (result) => {
    saveResult(result, (saved) => {
      // ...
    });
  });
});

// ✅ async/await
const data = await getData();
const result = await processData(data);
await saveResult(result);

// ❌ God classes/functions
class UserManager {
  createUser() { }
  deleteUser() { }
  sendEmail() { }
  generateReport() { }
  processPayment() { }
  // 50 more methods...
}

// ✅ Single Responsibility Principle
class UserRepository {
  create() { }
  delete() { }
}

class EmailService {
  send() { }
}

class ReportGenerator {
  generate() { }
}
```

### 8.2 Common Violations

```typescript
// ❌ Mutating function parameters
function updateUser(user: User) {
  user.lastUpdated = Date.now(); // Mutation!
  return user;
}

// ✅ Return new object
function updateUser(user: User): User {
  return {
    ...user,
    lastUpdated: Date.now(),
  };
}

// ❌ Side effects in pure functions
function calculateTotal(items: Item[]): number {
  console.log('Calculating...'); // Side effect!
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ Pure function
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Implicit any
function processData(data) { // Implicit any
  return data.map(item => item.value);
}

// ✅ Explicit types
function processData(data: DataItem[]): number[] {
  return data.map(item => item.value);
}
```

## 9. Code Review Checklist

### 9.1 For All Code

- [ ] Follows naming conventions (PascalCase for classes, camelCase for functions)
- [ ] Uses interfaces for extensible objects, types for unions
- [ ] Uses object literal lookups instead of switch/if-else where appropriate
- [ ] No code duplication (DRY principle)
- [ ] Complexity is reasonable (max cyclomatic complexity: 10)
- [ ] Uses absolute path aliases, not relative imports
- [ ] All functions have return type annotations
- [ ] No `any` types without explicit reason
- [ ] Uses advanced TypeScript features (Set, Map, Proxy) where appropriate
- [ ] Includes appropriate error handling
- [ ] Has corresponding unit tests
- [ ] Architectural decisions have arch-unit-ts tests

### 9.2 For Backend Code

- [ ] Input validation with Zod schemas
- [ ] Uses FSMs for multi-step workflows
- [ ] Implements proper authentication/authorization
- [ ] Database transactions where needed
- [ ] Idempotent operations
- [ ] Structured logging with context
- [ ] Metrics and tracing instrumentation
- [ ] Security headers configured
- [ ] Rate limiting on public endpoints
- [ ] Third-party libraries wrapped with Adapter pattern

### 9.3 For Frontend Code

- [ ] Follows atomic design structure
- [ ] Smart/dumb component separation
- [ ] Mobile-first responsive design
- [ ] WCAG 2.0 compliant (semantic HTML, ARIA, keyboard nav)
- [ ] No props drilling (uses context/state management)
- [ ] Server state in Tanstack Query
- [ ] Client state in Zustand
- [ ] Forms use React Hook Form + Zod
- [ ] Error boundaries implemented
- [ ] Loading states handled
- [ ] Optimistic UI updates where appropriate

## 10. Continuous Improvement

### 10.1 Regular Audits

**Weekly:**

- Run architectural tests
- Review ESLint/TypeScript warnings
- Check bundle size

**Monthly:**

- Dependency vulnerability scan
- Code coverage review
- Performance profiling
- Accessibility audit

**Quarterly:**

- Architecture review
- Refactoring opportunities
- Technical debt assessment

### 10.2 Metrics to Track

```typescript
// Code quality metrics
const metrics = {
  testCoverage: 'Target: > 60%',
  typesCoverage: 'Target: 100% (no any)',
  cyclomaticComplexity: 'Target: < 10',
  linesPerFunction: 'Target: < 50',
  duplicatedCode: 'Target: < 3%',
  technicalDebt: 'Track and reduce quarterly',
  bundleSize: 'Frontend: < 200KB initial',
  archTestCoverage: 'Target: 100% architectural rules',
};
```

## 11. Tooling Recommendations

### 11.1 Required Tools

- **ESLint** - Code quality and standards enforcement
- **TypeScript** - Type safety
- **Prettier** - Code formatting
- **arch-unit-ts** - Architectural testing
- **Husky** - Git hooks
- **Vitest/Playwright** - Testing
- **Zod** - Runtime validation

### 11.2 Recommended Tools

**Backend:**

- **Pino/Winston** - Structured logging
- **Prometheus** - Metrics
- **OpenTelemetry** - Tracing
- **XState** - State machines
- **Fastify/NestJS** - Web frameworks

**Frontend:**

- **Astro.js/TanStack Start** - Web frameworks
- **Tanstack Query** - Server state
- **Zustand** - Client state
- **React Hook Form** - Forms
- **Vite** - Build tool
- **Storybook** - Component documentation
- **vitest-axe** - Accessibility testing

## Appendix A: Quick Reference

### Naming Conventions

- Classes/Interfaces: `PascalCase`, nouns
- Functions/Methods: `camelCase`, verbs for actions
- Constants: `UPPER_SNAKE_CASE`
- Files: `kebab-case.ts`

### Type Usage

- Interfaces: Extensible objects
- Types: Unions, primitives, utilities

### Import Style

- Absolute paths with aliases: `src/*`, `ui/*`
- No relative imports outside module

### Patterns to Enforce

- Object literal lookups > switch/if-else
- Set/Map over arrays/objects
- Adapter pattern for third-party libs
- Repository pattern for data access
- FSMs for workflows

### Testing Requirements

- Unit tests for all business logic
- Architecture tests for all rules
- Integration tests for APIs
- Accessibility tests for UI

## Appendix B: Violation Severity Levels

**CRITICAL (Block PR):**

- Security vulnerabilities
- No input validation
- Missing architectural tests
- Type safety violations (`any` without justification)
- Direct third-party library usage without adapter

**HIGH (Require fix before merge):**

- Naming convention violations
- Missing error handling
- No observability (logging/metrics)
- Props drilling beyond 2 levels
- Missing WCAG compliance

**MEDIUM (Fix in follow-up):**

- Code duplication
- High complexity (>10)
- Missing documentation
- Relative imports
- Switch statements for simple mappings

**LOW (Nice to have):**

- Code formatting inconsistencies
- Missing JSDoc comments
- Suboptimal performance patterns
- Long functions
