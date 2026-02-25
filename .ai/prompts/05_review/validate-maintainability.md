---
id: review.validate-maintainability
version: 1.0.0
category: review
experimental: true
name: Validate Maintainability
description: Assess code complexity, technical debt, readability, and long-term maintainability
tags:
  - validation
  - maintainability
  - code-quality
  - technical-debt
model_requirements:
  min_context: 128000
  recommended:
    - claude-sonnet-4.5
agents:
  - lead
dependencies:
  requires:
    - context.use-modern-cli-tools
    - context.analyze-changes-for-review
inputs:
  - name: changed_files
    description: Files to review for maintainability
    type: array
    required: true
  - name: complexity_threshold
    description: Maximum acceptable cyclomatic complexity
    type: number
    required: false
    default: 10
outputs:
  - complexity_issues
  - code_smells
  - technical_debt_items
  - refactoring_recommendations
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Validate Maintainability

## Objective

Assess code maintainability by evaluating complexity, identifying code smells, detecting technical debt, and ensuring long-term code health.

## Validation Steps

### Step 1: Calculate Cyclomatic Complexity

**Measure complexity for each function/method**:

Cyclomatic Complexity = Number of decision points + 1

**Decision points**:
- `if`, `else if`, `else`
- `switch`, `case`
- `for`, `while`, `do-while`
- `&&`, `||` in conditions
- `try-catch` blocks
- Ternary operators `? :`

**Thresholds**:
- **1-5**: Low complexity (simple, easy to test)
- **6-10**: Moderate complexity (acceptable)
- **11-20**: High complexity (needs refactoring)
- **21+**: Very high complexity (urgent refactoring required)

**Flag functions exceeding threshold**:

```typescript
// BAD: Cyclomatic complexity = 12
function processOrder(order: Order) {
  if (order.status === 'pending') {
    if (order.paymentMethod === 'card') {
      if (order.amount > 1000) {
        // Complex logic
      } else if (order.amount > 500) {
        // More logic
      } else {
        // Even more logic
      }
    } else if (order.paymentMethod === 'bank') {
      // More branches
    }
  } else if (order.status === 'processing') {
    // More complexity
  }
  // ... and so on
}
```

### Step 2: Identify Code Smells

**Common smells to detect**:

**1. Long Methods/Functions**:
- Functions > 50 lines
- Functions doing multiple things
- Missing single responsibility

**2. God Objects/Classes**:
- Classes > 500 lines
- Classes with > 20 methods
- Classes handling too many responsibilities

**3. Duplicate Code**:
- Copy-pasted code blocks
- Similar functions with minor variations
- Repeated logic patterns

**4. Magic Numbers/Strings**:
- Hardcoded values without explanation
- Missing named constants
- Unclear business logic

**5. Long Parameter Lists**:
- Functions with > 4 parameters
- Missing parameter objects
- Unclear parameter ordering

**6. Deep Nesting**:
- Nesting depth > 3 levels
- Arrow/callback hell
- Complex conditional logic

**7. Shotgun Surgery**:
- Single change requires modifying many files
- Poor separation of concerns
- Tight coupling

**Examples**:

```typescript
// SMELL: Long parameter list
function createUser(
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  address: string,
  city: string,
  country: string,
  zipCode: string
) { }

// SMELL: Magic numbers
if (order.amount > 10000) { // What is 10000?
  applyDiscount(order, 0.15); // What is 0.15?
}

// SMELL: Deep nesting
if (user) {
  if (user.isActive) {
    if (user.hasPermission('admin')) {
      if (resource.isAvailable) {
        // Too deep!
      }
    }
  }
}
```

### Step 3: Detect Technical Debt

**Types of technical debt**:

**1. Code Debt**:
- TODOs and FIXMEs
- Commented-out code
- Temporary workarounds
- Deprecated API usage

**2. Design Debt**:
- Violated SOLID principles
- Missing abstractions
- Tight coupling
- Violation of DRY

**3. Documentation Debt**:
- Missing function/class documentation
- Outdated comments
- No inline explanations for complex logic
- Missing README updates

**4. Test Debt**:
- Missing test coverage
- Brittle/flaky tests
- Tests testing implementation vs behavior
- No edge case coverage

**5. Dependency Debt**:
- Outdated dependencies
- Unused dependencies
- Multiple versions of same library
- Security vulnerabilities in deps

**Scan patterns**:

```bash
# Find TODOs and FIXMEs
rg "TODO|FIXME|HACK|XXX" src/ -t ts

# Find commented code
rg "^\s*//.*[{};]" src/ -t ts

# Check for deprecated usage
rg "@deprecated" src/ -t ts
```

### Step 4: Assess Error Handling

**Check for**:

- **Try-catch placement**: Is it at the right level?
- **Error types**: Generic `catch (error)` vs specific errors
- **Error messages**: Are they informative?
- **Error recovery**: Is there a fallback/retry?
- **Error logging**: Are errors properly logged?
- **Silent failures**: Caught errors not handled

**Anti-patterns**:

```typescript
// BAD: Empty catch block
try {
  await riskyOperation();
} catch (error) {
  // Silent failure!
}

// BAD: Swallowing errors
try {
  await importantOperation();
} catch (error) {
  console.log('Error occurred'); // No details, no action
}

// BAD: Generic error handling
try {
  await specificOperation();
} catch (error) {
  throw new Error('Something went wrong'); // Lost context
}
```

### Step 5: Review Code Organization

**Evaluate**:

**File Organization**:
- Logical grouping by feature/domain
- Consistent directory structure
- Clear separation of concerns

**Import Management**:
- Imports grouped logically (external, internal, types)
- No circular dependencies
- Minimal coupling between modules

**Code Structure**:
- Clear function ordering (public before private)
- Related code grouped together
- Consistent formatting

**Naming Clarity**:
- Variables named by what they represent
- Functions named by what they do
- Classes named by what they are
- No abbreviations without clear context

### Step 6: Check for Anti-Patterns

**Common anti-patterns**:

**1. Premature Optimization**:
- Complex code for unproven performance gains
- Micro-optimizations reducing readability

**2. Golden Hammer**:
- Using same solution for different problems
- Not considering alternatives

**3. Spaghetti Code**:
- No clear structure
- Random control flow
- Hard to follow logic

**4. Copy-Paste Programming**:
- Duplicated code blocks
- No abstraction of common patterns

**5. Lava Flow**:
- Dead code that nobody dares to remove
- Unclear if code is still used

**6. Feature Envy**:
- Methods using more data from other classes than own class

## Output Format

```json
{
  "complexity_issues": {
    "status": "fail",
    "total_issues": 5,
    "functions_over_threshold": [
      {
        "location": "src/services/order.service.ts:processOrder",
        "lines": "45-128",
        "complexity": 15,
        "threshold": 10,
        "severity": "high",
        "description": "Function has 15 decision points, exceeding threshold of 10",
        "recommendation": "Extract order validation and payment processing into separate functions",
        "suggested_refactoring": [
          "validateOrder(order)",
          "processPayment(order)",
          "updateOrderStatus(order)"
        ]
      }
    ],
    "long_functions": [
      {
        "location": "src/utils/parser.ts:parseData",
        "lines": 89,
        "threshold": 50,
        "severity": "medium",
        "recommendation": "Split into smaller, focused functions"
      }
    ]
  },
  "code_smells": [
    {
      "type": "long_parameter_list",
      "severity": "medium",
      "location": "src/api/users.ts:createUser",
      "line": 34,
      "description": "Function has 8 parameters",
      "recommendation": "Use parameter object: createUser(userData: CreateUserData)",
      "example": "interface CreateUserData { firstName: string; lastName: string; ... }"
    },
    {
      "type": "magic_number",
      "severity": "low",
      "location": "src/services/discount.service.ts",
      "line": 67,
      "code_snippet": "if (order.amount > 10000)",
      "recommendation": "Extract to named constant: const BULK_ORDER_THRESHOLD = 10000",
      "impact": "Reduces code clarity and makes business logic harder to maintain"
    },
    {
      "type": "deep_nesting",
      "severity": "high",
      "location": "src/utils/validator.ts:validateInput",
      "line": 23,
      "nesting_depth": 5,
      "recommendation": "Use early returns or guard clauses to reduce nesting",
      "example": "if (!condition) return error; // Early exit"
    },
    {
      "type": "duplicate_code",
      "severity": "medium",
      "locations": [
        "src/services/user.service.ts:45-52",
        "src/services/admin.service.ts:78-85"
      ],
      "description": "Similar validation logic duplicated across services",
      "recommendation": "Extract to shared validation utility function"
    }
  ],
  "technical_debt_items": [
    {
      "type": "code_debt",
      "category": "todo",
      "location": "src/api/payments.ts",
      "line": 89,
      "description": "TODO: Implement retry logic for failed payments",
      "age_estimate": "unknown",
      "priority": "high",
      "effort": "medium"
    },
    {
      "type": "design_debt",
      "category": "coupling",
      "location": "src/services/notification.service.ts",
      "description": "Service directly depends on 5 other services, high coupling",
      "priority": "medium",
      "recommendation": "Introduce event-driven architecture or service bus",
      "effort": "high"
    },
    {
      "type": "documentation_debt",
      "category": "missing_docs",
      "location": "src/utils/encryption.ts",
      "description": "Complex encryption logic lacks documentation",
      "priority": "high",
      "recommendation": "Add JSDoc explaining algorithm, key management, and usage"
    },
    {
      "type": "test_debt",
      "category": "missing_coverage",
      "files": [
        "src/services/payment.service.ts",
        "src/api/orders.ts"
      ],
      "description": "Critical business logic lacks test coverage",
      "priority": "critical",
      "recommendation": "Add unit and integration tests before merging"
    }
  ],
  "refactoring_recommendations": [
    {
      "priority": "critical",
      "file": "src/services/order.service.ts",
      "recommendation": "Break down processOrder into smaller, testable functions",
      "pattern": "Extract Method refactoring",
      "effort": "medium",
      "impact": "high",
      "benefits": [
        "Improved testability",
        "Better readability",
        "Reduced complexity"
      ]
    },
    {
      "priority": "high",
      "files": [
        "src/services/user.service.ts",
        "src/services/admin.service.ts"
      ],
      "recommendation": "Extract common validation logic to shared utility",
      "pattern": "DRY principle application",
      "effort": "low",
      "impact": "medium",
      "benefits": [
        "Single source of truth",
        "Easier maintenance",
        "Consistent validation"
      ]
    }
  ],
  "summary": {
    "total_issues": 14,
    "critical": 2,
    "high": 5,
    "medium": 5,
    "low": 2,
    "blocking": true,
    "maintainability_score": 6.2,
    "score_explanation": "Score: 0-10 (0=unmaintainable, 10=excellent). Based on complexity, code smells, and technical debt",
    "overall_assessment": "Code has significant maintainability issues requiring refactoring before merge"
  }
}
```

## Success Criteria

- ✅ Cyclomatic complexity calculated for all functions
- ✅ Code smells identified with specific locations
- ✅ Technical debt cataloged by type and priority
- ✅ Error handling patterns reviewed
- ✅ Code organization assessed
- ✅ Concrete refactoring recommendations provided
- ✅ Maintainability score calculated objectively

## Rules

**Blocking Issues** (Fail Review):

- Functions with complexity > 20
- Critical business logic without documentation
- Missing test coverage for critical paths
- High coupling preventing future changes
- Hardcoded secrets or credentials

**Warning Issues**:

- Complexity 11-20 (should refactor)
- Minor code smells
- Non-critical TODOs
- Moderate code duplication

**Maintainability Score Formula**:

```plaintext
Base score = 10
Deduct 2 points per critical issue
Deduct 1 point per high issue
Deduct 0.5 points per medium issue
Deduct 0.2 points per low issue

Minimum score = 0
```

**Thresholds**:
- Score ≥ 7.0: Good maintainability
- Score 5.0-6.9: Acceptable with warnings
- Score < 5.0: Blocking - requires refactoring

## Notes

- Focus on long-term code health, not just current functionality
- Consider: "Will this be easy to change in 6 months?"
- Balance refactoring effort vs. benefit
- Prioritize issues affecting critical business logic
- Document WHY code is complex if simplification isn't possible

