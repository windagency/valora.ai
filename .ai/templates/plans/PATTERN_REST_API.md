---
pattern: rest-api
complexity_range: 2-5
estimated_time: "3-5 minutes"
use_when:
  - Adding new API endpoints
  - CRUD operations
  - RESTful resources
  - HTTP handlers
applies_to:
  - Node.js/Express
  - TypeScript
  - REST APIs
---

# REST API Implementation Plan Template

**Pattern**: REST API Endpoint
**Typical Complexity**: 2-5/10
**Standard Planning Time**: 3-5 minutes (vs 13-15 min for full analysis)

## TASK OVERVIEW

**Summary**: Add RESTful API endpoint(s) for [RESOURCE_NAME]

**Scope**:
- HTTP endpoints: [LIST_ENDPOINTS]
- Request/response handling
- Input validation
- Error handling
- Database operations (if applicable)

**Success Criteria**:
- [ ] Endpoints return correct HTTP status codes
- [ ] Input validation rejects invalid requests
- [ ] Responses match OpenAPI schema
- [ ] Error messages are descriptive
- [ ] Unit and integration tests pass

## COMPLEXITY ASSESSMENT

**Score**: [AUTO_CALCULATED: 2-5/10]

**Breakdown**:
- Code Volume: 3/10 (~150-300 lines)
- Component Coupling: 2/10 (controller + service + repository)
- Data Complexity: [2-5]/10 (depends on schema changes)
- Integration: 2/10 (standard database only)
- Business Logic: [2-5]/10 (depends on requirements)
- Testing: 4/10 (unit + integration tests)
- Risk Level: 3/10 (isolated, backward compatible)

**Mode**: Standard (single-pass implementation)

## DEPENDENCIES

### Technical Dependencies
- ✅ Express (already installed)
- ✅ Zod (input validation - already installed)
- ✅ TypeScript (already configured)
- [ADD_DATABASE_LIB if needed, e.g., Prisma, TypeORM]

### Data Dependencies
- [LIST_TABLES_REQUIRED]
- [LIST_SCHEMA_CHANGES if adding columns/tables]

### Integration Dependencies
- Database connection (already configured)
- [ADD_EXTERNAL_SERVICES if applicable]

**Execution Order**:
1. Schema/migration (if database changes)
2. Types and validation schemas
3. Repository/database layer
4. Service layer (business logic)
5. Controller/route handler
6. Tests

## RISK ASSESSMENT

### Technical Risks

**RISK-001: Input validation bypass**
- **Severity**: Medium
- **Likelihood**: Low
- **Mitigation**:
  - Use Zod schema validation on all inputs
  - Validate at controller layer before business logic
  - Add integration tests for invalid inputs
  - Test SQL injection, XSS payloads

**RISK-002: Database query performance**
- **Severity**: Medium
- **Likelihood**: Medium (if complex queries)
- **Mitigation**:
  - Add database indexes for query filters
  - Use pagination for list endpoints (limit/offset)
  - Test with realistic data volumes
  - Monitor query execution times

**RISK-003: Breaking changes to existing clients**
- **Severity**: High (if modifying existing endpoints)
- **Likelihood**: Low (new endpoints)
- **Mitigation**:
  - Version API endpoints (e.g., /api/v1/resource)
  - Maintain backward compatibility
  - Add deprecation warnings if changing existing endpoints
  - Update API documentation

### Business Risks

**RISK-004: Authorization gaps**
- **Severity**: High
- **Likelihood**: Medium
- **Mitigation**:
  - Apply authentication middleware to all endpoints
  - Implement role-based access control (RBAC)
  - Test unauthorized access scenarios
  - Log all access attempts

### Operational Risks

**RISK-005: Deployment rollback difficulty**
- **Severity**: Low
- **Likelihood**: Low
- **Mitigation**:
  - Feature flag for new endpoints
  - Database migrations are reversible
  - Rollback plan documented

## IMPLEMENTATION STEPS

### Step 1: Define Types and Schemas [15 min]
**File**: `src/types/[resource].types.ts`

**Actions**:
- Create TypeScript interfaces for request/response
- Define Zod validation schemas
- Export types for reuse

**Validation**:
- Types compile without errors
- Zod schemas validate expected inputs

**Example**:
```typescript
// src/types/user.types.ts
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

export type CreateUserRequest = z.infer<typeof CreateUserSchema>;
export interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
```

### Step 2: Create Database Repository [20 min]
**File**: `src/repositories/[resource].repository.ts`

**Actions**:
- Implement CRUD methods (create, read, update, delete)
- Use parameterized queries to prevent SQL injection
- Handle database errors gracefully

**Validation**:
- Repository unit tests pass
- Database operations work correctly

**Example**:
```typescript
// src/repositories/user.repository.ts
export class UserRepository {
  async create(data: CreateUserRequest): Promise<User> {
    return await prisma.user.create({ data });
  }

  async findById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({ where: { id } });
  }
}
```

### Step 3: Implement Service Layer [20 min]
**File**: `src/services/[resource].service.ts`

**Actions**:
- Add business logic
- Call repository methods
- Handle errors and edge cases
- Return structured responses

**Validation**:
- Service unit tests pass
- Business logic is correct

### Step 4: Create Route Handlers [25 min]
**File**: `src/routes/[resource].routes.ts`

**Actions**:
- Define Express routes (GET, POST, PUT, DELETE)
- Apply validation middleware
- Apply authentication middleware
- Call service layer
- Return HTTP responses with correct status codes

**Validation**:
- Routes registered correctly
- Middleware applied in correct order
- Handler integration tests pass

**HTTP Status Codes**:
- 200 OK (GET success)
- 201 Created (POST success)
- 204 No Content (DELETE success)
- 400 Bad Request (validation error)
- 401 Unauthorized (missing auth)
- 403 Forbidden (insufficient permissions)
- 404 Not Found (resource not found)
- 500 Internal Server Error (unexpected errors)

### Step 5: Add Error Handling [15 min]
**File**: `src/middleware/error-handler.ts`

**Actions**:
- Centralized error handling middleware
- Return consistent error response format
- Log errors for monitoring

**Validation**:
- Error responses match expected format
- Sensitive information not leaked

### Step 6: Write Tests [30 min]
**Files**:
- `tests/unit/services/[resource].service.test.ts`
- `tests/integration/routes/[resource].routes.test.ts`

**Test Cases**:
- **Unit Tests**:
  - Service methods handle valid inputs
  - Service methods reject invalid inputs
  - Service methods handle database errors

- **Integration Tests**:
  - POST /[resource] creates resource
  - GET /[resource]/:id returns resource
  - PUT /[resource]/:id updates resource
  - DELETE /[resource]/:id deletes resource
  - Invalid requests return 400
  - Unauthorized requests return 401
  - Not found requests return 404

**Validation**:
- All tests pass
- Coverage ≥ 85%

### Step 7: Update Documentation [10 min]
**Files**:
- `docs/api/[resource].md` (API documentation)
- OpenAPI/Swagger spec (if applicable)

**Actions**:
- Document all endpoints
- Include request/response examples
- Document error responses

**Validation**:
- Documentation is accurate
- Examples work

## TESTING STRATEGY

### Unit Tests (Vitest)
**Coverage Target**: 85%

**Test Scenarios**:
- Service layer methods with valid inputs
- Service layer methods with invalid inputs
- Repository methods (with test database)
- Error handling paths

### Integration Tests (Vitest + Testcontainers)
**Coverage Target**: All endpoints

**Test Scenarios**:
- Happy path: Create, read, update, delete
- Error cases: Invalid input, not found, unauthorized
- Edge cases: Duplicate creation, concurrent updates
- Authentication: Protected endpoints reject unauthenticated requests
- Authorization: Protected endpoints enforce permissions

### E2E Tests (Playwright)
**Coverage Target**: Critical user flows (if user-facing)

**Test Scenarios**:
- [ADD_IF_USER_FACING: e.g., "User creates resource via UI"]

## ROLLBACK STRATEGY

### Immediate Rollback (< 5 minutes)
1. Disable feature flag (if implemented)
2. Restart service to previous version
3. Monitor error logs and metrics

### Database Rollback (if schema changes)
1. Run down migration: `pnpm prisma migrate rollback`
2. Verify data integrity
3. Restart service

### Validation
- Service starts successfully
- Existing functionality works
- No data loss

## EFFORT ESTIMATE

**Total Estimated Time**: 2-3 hours

**Breakdown**:
- Types/schemas: 15 min
- Repository: 20 min
- Service layer: 20 min
- Route handlers: 25 min
- Error handling: 15 min
- Tests: 30 min
- Documentation: 10 min
- Buffer (debugging, review): 30 min

**Confidence Level**: High (standard pattern, well-understood)

**Assumptions**:
- No complex business logic
- Standard CRUD operations
- Existing database connection configured
- Familiar with Express/TypeScript patterns

---

## CUSTOMIZATION CHECKLIST

When using this template, replace the following placeholders:

- [ ] [RESOURCE_NAME] - Name of the resource (e.g., "users", "posts", "orders")
- [ ] [LIST_ENDPOINTS] - List of endpoints (e.g., "GET /users, POST /users")
- [ ] [LIST_TABLES_REQUIRED] - Database tables needed
- [ ] [LIST_SCHEMA_CHANGES] - Any schema modifications needed
- [ ] [ADD_DATABASE_LIB] - Add if using specific ORM
- [ ] [ADD_EXTERNAL_SERVICES] - Add if integrating external APIs
- [ ] Adjust complexity scores based on actual requirements
- [ ] Add/remove risks based on specific implementation
- [ ] Customize test scenarios for specific business logic
- [ ] Update time estimates based on team velocity

---

## PATTERN USAGE NOTES

**When to Use This Template**:
- ✅ Adding new CRUD endpoints
- ✅ Standard RESTful API operations
- ✅ Complexity score 2-5/10
- ✅ No complex integrations

**When NOT to Use**:
- ❌ Complex multi-step workflows (use full planning)
- ❌ GraphQL APIs (different pattern)
- ❌ WebSocket/real-time features (different pattern)
- ❌ Complexity > 6/10 (requires detailed analysis)

**Time Savings**: 8-10 minutes vs full planning process
