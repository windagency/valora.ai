# Planning Template: REST API Endpoint

## Pattern Type: REST API

**Use when**: Adding new API endpoints, extending existing APIs, or creating new resources.

---

## Quick Fill Template

### 1. Endpoint Overview

| Field | Value |
|-------|-------|
| **Resource** | [e.g., users, orders, products] |
| **Base Path** | `/api/v1/[resource]` |
| **Methods** | [ ] GET [ ] POST [ ] PUT [ ] PATCH [ ] DELETE |
| **Auth Required** | [ ] Yes [ ] No |
| **Rate Limited** | [ ] Yes [ ] No |

### 2. Endpoints to Implement

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/v1/[resource]` | `list[Resource]` | List with pagination |
| GET | `/api/v1/[resource]/:id` | `get[Resource]` | Get by ID |
| POST | `/api/v1/[resource]` | `create[Resource]` | Create new |
| PUT | `/api/v1/[resource]/:id` | `update[Resource]` | Full update |
| PATCH | `/api/v1/[resource]/:id` | `patch[Resource]` | Partial update |
| DELETE | `/api/v1/[resource]/:id` | `delete[Resource]` | Soft/hard delete |

### 3. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/[resource].routes.ts` | Create | Route definitions |
| `src/controllers/[resource].controller.ts` | Create | Request handlers |
| `src/services/[resource].service.ts` | Create | Business logic |
| `src/repositories/[resource].repository.ts` | Create | Data access |
| `src/schemas/[resource].schema.ts` | Create | Zod validation |
| `src/types/[resource].types.ts` | Create | TypeScript types |
| `tests/[resource].test.ts` | Create | Unit tests |
| `tests/[resource].integration.test.ts` | Create | Integration tests |

### 4. Standard Implementation Steps

#### Step 1: Define Types and Schemas

**Objective**: Create TypeScript types and Zod validation schemas

**Files**:
- `src/types/[resource].types.ts`
- `src/schemas/[resource].schema.ts`

```typescript
// types/[resource].types.ts
export interface [Resource] {
  id: string;
  // Add fields
  createdAt: Date;
  updatedAt: Date;
}

export interface Create[Resource]Dto {
  // Add fields
}

export interface Update[Resource]Dto {
  // Add fields (all optional)
}
```

```typescript
// schemas/[resource].schema.ts
import { z } from 'zod';

export const create[Resource]Schema = z.object({
  // Add validation rules
});

export const update[Resource]Schema = create[Resource]Schema.partial();

export const [resource]ParamsSchema = z.object({
  id: z.string().uuid(),
});

export const [resource]QuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
```

**Validation**: Types compile, schemas validate test data

---

#### Step 2: Create Repository

**Objective**: Implement data access layer

**Files**:
- `src/repositories/[resource].repository.ts`

```typescript
export class [Resource]Repository {
  constructor(private db: Database) {}

  async findAll(options: PaginationOptions): Promise<[Resource][]> {
    // Implementation
  }

  async findById(id: string): Promise<[Resource] | null> {
    // Implementation
  }

  async create(data: Create[Resource]Dto): Promise<[Resource]> {
    // Implementation
  }

  async update(id: string, data: Update[Resource]Dto): Promise<[Resource]> {
    // Implementation
  }

  async delete(id: string): Promise<void> {
    // Implementation
  }
}
```

**Validation**: Repository methods work with test database

---

#### Step 3: Create Service

**Objective**: Implement business logic

**Files**:
- `src/services/[resource].service.ts`

```typescript
export class [Resource]Service {
  constructor(private repository: [Resource]Repository) {}

  async list(options: PaginationOptions): Promise<Paginated<[Resource]>> {
    // Add business logic
    return this.repository.findAll(options);
  }

  async get(id: string): Promise<[Resource]> {
    const result = await this.repository.findById(id);
    if (!result) throw new NotFoundError('[Resource] not found');
    return result;
  }

  async create(data: Create[Resource]Dto): Promise<[Resource]> {
    // Validate business rules
    return this.repository.create(data);
  }

  async update(id: string, data: Update[Resource]Dto): Promise<[Resource]> {
    await this.get(id); // Ensure exists
    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.get(id); // Ensure exists
    return this.repository.delete(id);
  }
}
```

**Validation**: Service methods handle business rules correctly

---

#### Step 4: Create Controller

**Objective**: Implement request handlers

**Files**:
- `src/controllers/[resource].controller.ts`

```typescript
export class [Resource]Controller {
  constructor(private service: [Resource]Service) {}

  list = async (req: Request, res: Response) => {
    const query = [resource]QuerySchema.parse(req.query);
    const result = await this.service.list(query);
    res.json({ data: result.items, pagination: result.pagination });
  };

  get = async (req: Request, res: Response) => {
    const { id } = [resource]ParamsSchema.parse(req.params);
    const result = await this.service.get(id);
    res.json({ data: result });
  };

  create = async (req: Request, res: Response) => {
    const data = create[Resource]Schema.parse(req.body);
    const result = await this.service.create(data);
    res.status(201).json({ data: result });
  };

  update = async (req: Request, res: Response) => {
    const { id } = [resource]ParamsSchema.parse(req.params);
    const data = update[Resource]Schema.parse(req.body);
    const result = await this.service.update(id, data);
    res.json({ data: result });
  };

  delete = async (req: Request, res: Response) => {
    const { id } = [resource]ParamsSchema.parse(req.params);
    await this.service.delete(id);
    res.status(204).send();
  };
}
```

**Validation**: Controller handles requests and responses correctly

---

#### Step 5: Create Routes

**Objective**: Define route configuration

**Files**:
- `src/routes/[resource].routes.ts`

```typescript
import { Router } from 'express';

export function create[Resource]Routes(controller: [Resource]Controller): Router {
  const router = Router();

  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.delete);

  return router;
}
```

**Validation**: Routes registered and accessible

---

#### Step 6: Write Tests

**Objective**: Add unit and integration tests

**Files**:
- `tests/[resource].test.ts`
- `tests/[resource].integration.test.ts`

**Test scenarios**:
- [ ] List returns paginated results
- [ ] Get returns single resource
- [ ] Get returns 404 for missing
- [ ] Create validates input
- [ ] Create returns 201 with resource
- [ ] Update validates input
- [ ] Update returns 404 for missing
- [ ] Delete returns 204
- [ ] Delete returns 404 for missing

**Validation**: `pnpm test:quick` passes

---

### 5. Standard Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Express/Fastify | HTTP framework | [ ] Available |
| Zod | Validation | [ ] Available |
| Database client | Data access | [ ] Available |

### 6. Standard Risks

| Risk | Mitigation |
|------|------------|
| N+1 queries | Use eager loading / joins |
| Missing validation | Zod schemas at boundary |
| Auth bypass | Middleware on all routes |
| Rate limiting | Apply rate limiter middleware |

### 7. Rollback

```bash
# Revert all changes
git revert HEAD

# Or remove specific files
rm -rf src/**/[resource]*
rm -rf tests/**/[resource]*
```

---

## Estimated Effort

| Step | Points | Confidence |
|------|--------|------------|
| Types & Schemas | 1 | High |
| Repository | 2 | High |
| Service | 2 | High |
| Controller | 1 | High |
| Routes | 1 | High |
| Tests | 3 | Medium |
| **Total** | **10** | **High** |
