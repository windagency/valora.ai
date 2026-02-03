# Planning Template: Database Schema/Migration

## Pattern Type: Database Schema

**Use when**: Adding tables, modifying schema, creating migrations, or setting up new entities.

---

## Quick Fill Template

### 1. Schema Overview

| Field | Value |
|-------|-------|
| **Entity Name** | [e.g., User, Order, Product] |
| **Table Name** | [e.g., users, orders, products] |
| **Database** | [ ] PostgreSQL [ ] MySQL [ ] SQLite [ ] MongoDB |
| **ORM** | [ ] Prisma [ ] TypeORM [ ] Drizzle [ ] Raw SQL |
| **Migration Type** | [ ] New Table [ ] Alter Table [ ] Drop Table |

### 2. Schema Definition

| Column | Type | Nullable | Default | Index | Description |
|--------|------|----------|---------|-------|-------------|
| `id` | UUID/BIGINT | No | gen_random_uuid() | PK | Primary key |
| `[field1]` | VARCHAR(255) | No | - | - | |
| `[field2]` | INTEGER | Yes | 0 | - | |
| `[field3]` | TIMESTAMP | No | NOW() | - | |
| `created_at` | TIMESTAMP | No | NOW() | - | Creation time |
| `updated_at` | TIMESTAMP | No | NOW() | - | Last update |

### 3. Relationships

| Relationship | Type | Foreign Key | On Delete |
|--------------|------|-------------|-----------|
| [Entity] → [Related] | One-to-Many | `[entity]_id` | CASCADE/SET NULL |
| [Entity] ↔ [Related] | Many-to-Many | via junction | CASCADE |

### 4. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `prisma/migrations/[timestamp]_[name]/migration.sql` | Create | Migration SQL |
| `prisma/schema.prisma` | Modify | Schema definition |
| `src/types/[entity].types.ts` | Create | TypeScript types |
| `src/repositories/[entity].repository.ts` | Create | Data access |
| `tests/[entity].repository.test.ts` | Create | Repository tests |

### 5. Standard Implementation Steps

#### Step 1: Design Schema (Prisma)

**Objective**: Add entity to Prisma schema

**Files**:
- `prisma/schema.prisma`

```prisma
model [Entity] {
  id        String   @id @default(uuid())
  [field1]  String
  [field2]  Int?     @default(0)
  [field3]  DateTime

  // Relations
  [related] [Related][] @relation("[RelationName]")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("[table_name]")
  @@index([[field1]])
}
```

**Validation**: `pnpm prisma validate` passes

---

#### Step 2: Generate Migration

**Objective**: Create and verify migration

**Commands**:
```bash
# Generate migration
pnpm prisma migrate dev --name add_[entity]

# Verify migration SQL
cat prisma/migrations/*/migration.sql
```

**Validation**: Migration applies without errors

---

#### Step 3: Generate Types

**Objective**: Generate TypeScript types from schema

**Commands**:
```bash
pnpm prisma generate
```

**Files** (auto-generated):
- `node_modules/.prisma/client/index.d.ts`

**Validation**: Types available in IDE

---

#### Step 4: Create Repository

**Objective**: Implement data access layer

**Files**:
- `src/repositories/[entity].repository.ts`

```typescript
import { PrismaClient, [Entity] } from '@prisma/client';

export class [Entity]Repository {
  constructor(private prisma: PrismaClient) {}

  async findAll(options?: FindManyOptions): Promise<[Entity][]> {
    return this.prisma.[entity].findMany({
      ...options,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<[Entity] | null> {
    return this.prisma.[entity].findUnique({ where: { id } });
  }

  async create(data: Create[Entity]Input): Promise<[Entity]> {
    return this.prisma.[entity].create({ data });
  }

  async update(id: string, data: Update[Entity]Input): Promise<[Entity]> {
    return this.prisma.[entity].update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.[entity].delete({ where: { id } });
  }
}
```

**Validation**: Repository CRUD operations work

---

#### Step 5: Write Tests

**Objective**: Add repository tests with testcontainers

**Files**:
- `tests/[entity].repository.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('[Entity]Repository', () => {
  let container: PostgreSqlContainer;
  let repository: [Entity]Repository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    // Setup prisma with container URL
  });

  afterAll(async () => {
    await container.stop();
  });

  it('creates entity', async () => {
    const result = await repository.create({ /* data */ });
    expect(result.id).toBeDefined();
  });

  it('finds entity by id', async () => {
    const created = await repository.create({ /* data */ });
    const found = await repository.findById(created.id);
    expect(found).toEqual(created);
  });
});
```

**Validation**: `pnpm test:suite:integration` passes

---

#### Step 6: Seed Data (Optional)

**Objective**: Add seed data for development

**Files**:
- `prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.[entity].createMany({
    data: [
      { /* seed data */ },
      { /* seed data */ },
    ],
  });
}

main();
```

**Commands**:
```bash
pnpm prisma db seed
```

**Validation**: Seed data visible in database

---

### 6. Standard Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Prisma | ORM | [ ] Available |
| @testcontainers/postgresql | Testing | [ ] Available |

### 7. Standard Risks

| Risk | Mitigation |
|------|------------|
| Data loss on migration | Backup before migrate |
| Breaking existing code | Run full test suite |
| Performance (large table) | Add indexes, use pagination |
| Constraint violations | Validate data before migrate |

### 8. Rollback

```bash
# Rollback last migration
pnpm prisma migrate reset

# Or manual rollback
psql -c "DROP TABLE [table_name]"
git revert HEAD
```

---

## Migration Safety Checklist

- [ ] Backup production database
- [ ] Test migration on staging first
- [ ] Migration is reversible
- [ ] No NOT NULL without default on existing table
- [ ] No DROP without data migration
- [ ] Indexes added for frequently queried columns

---

## Estimated Effort

| Step | Points | Confidence |
|------|--------|------------|
| Schema Design | 1 | High |
| Migration | 1 | High |
| Generate Types | 0.5 | High |
| Repository | 2 | High |
| Tests | 2 | Medium |
| Seed Data | 1 | High |
| **Total** | **7.5** | **High** |
