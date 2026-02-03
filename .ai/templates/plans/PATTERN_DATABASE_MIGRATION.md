---
pattern: database-migration
complexity_range: 3-6
estimated_time: "4-6 minutes"
use_when:
  - Adding database tables
  - Modifying database schema
  - Data migrations
  - Adding indexes
applies_to:
  - Prisma
  - TypeORM
  - SQL migrations
  - Database schema changes
---

# Database Migration Implementation Plan Template

**Pattern**: Database Schema Migration
**Typical Complexity**: 3-6/10
**Standard Planning Time**: 4-6 minutes (vs 13-15 min for full analysis)

## TASK OVERVIEW

**Summary**: Database migration to [MIGRATION_DESCRIPTION]

**Scope**:
- Schema changes (tables, columns, indexes, constraints)
- Data migration (if applicable)
- Backwards compatibility considerations
- Rollback procedures

**Success Criteria**:
- [ ] Migration runs successfully on dev/staging/production
- [ ] Existing data is preserved
- [ ] Application works with new schema
- [ ] Rollback migration tested and works
- [ ] Performance is acceptable (no slow queries)

## COMPLEXITY ASSESSMENT

**Score**: [AUTO_CALCULATED: 3-6/10]

**Breakdown**:
- Code Volume: 2/10 (~50-150 lines migration code)
- Component Coupling: 3/10 (application code + database)
- Data Complexity: [4-7]/10 (depends on data volume and transformations)
- Integration: 3/10 (database only)
- Business Logic: [2-5]/10 (depends on data transformations)
- Testing: 5/10 (migration tests + integration tests)
- Risk Level: [5-7]/10 (data integrity, performance impact)

**Mode**: Standard (with careful validation)

## DEPENDENCIES

### Technical Dependencies
- ✅ Prisma (or migration tool)
- ✅ Database access (dev/staging/production)
- ✅ Backup/restore capability

### Data Dependencies
- [LIST_EXISTING_TABLES]
- [LIST_EXISTING_COLUMNS]
- [LIST_FOREIGN_KEY_DEPENDENCIES]

**Execution Order**:
1. Create migration file (up/down)
2. Test on local database
3. Test on staging with production-like data
4. Backup production database
5. Run migration on production
6. Verify application functionality
7. Monitor performance

## RISK ASSESSMENT

### Technical Risks

**RISK-001: Data loss during migration**
- **Severity**: CRITICAL
- **Likelihood**: Medium
- **Mitigation**:
  - **Mandatory backup before migration**
  - Use transactions (if supported by database)
  - Test migration on staging with production data copy
  - Implement rollback migration
  - Dry-run migration first (if tool supports)

**RISK-002: Migration timeout on large tables**
- **Severity**: High
- **Likelihood**: Medium (for tables > 1M rows)
- **Mitigation**:
  - Test migration duration on staging
  - Use batched updates for data migrations
  - Add column as nullable first, backfill data, then make NOT NULL
  - Consider blue-green deployment for zero-downtime
  - Schedule during low-traffic window

**RISK-003: Breaking changes to application**
- **Severity**: High
- **Likelihood**: Medium
- **Mitigation**:
  - Keep old columns until code is updated
  - Use feature flags for new schema usage
  - Deploy code before/after migration as needed
  - Run integration tests before production deployment

**RISK-004: Index creation blocking writes**
- **Severity**: High
- **Likelihood**: Medium (for large tables)
- **Mitigation**:
  - Use CREATE INDEX CONCURRENTLY (PostgreSQL)
  - Create indexes offline during maintenance window
  - Monitor query performance during index creation

### Business Risks

**RISK-005: Data inconsistency during migration**
- **Severity**: High
- **Likelihood**: Low
- **Mitigation**:
  - Use database transactions
  - Validate data before and after migration
  - Add data validation constraints
  - Run data integrity checks post-migration

### Operational Risks

**RISK-006: Cannot rollback migration**
- **Severity**: Critical
- **Likelihood**: Low
- **Mitigation**:
  - Write and test down migration
  - Keep database backup for 7+ days
  - Document manual rollback steps
  - Test rollback on staging

## IMPLEMENTATION STEPS

### Step 1: Create Migration File [15 min]
**File**: `prisma/migrations/[timestamp]_[migration_name]/migration.sql`

**Actions**:
- Define schema changes in Prisma schema (if using Prisma)
- Generate migration: `pnpm prisma migrate dev --name [migration_name]`
- Review generated SQL
- Add comments explaining changes

**Validation**:
- SQL syntax is correct
- Migration file includes both UP and DOWN

**Example (Prisma)**:
```prisma
// prisma/schema.prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  emailVerified Boolean  @default(false)  // NEW COLUMN
  createdAt     DateTime @default(now())
}
```

**Generated SQL**:
```sql
-- Migration Up
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Migration Down
ALTER TABLE "User" DROP COLUMN "emailVerified";
```

### Step 2: Test Migration Locally [15 min]
**Actions**:
- Run migration on local database: `pnpm prisma migrate dev`
- Verify schema changes applied correctly
- Test rollback: `pnpm prisma migrate rollback`
- Re-apply migration to ensure idempotency

**Validation**:
- Migration applies successfully
- Rollback works
- Application starts with new schema

### Step 3: Add Data Migration (if applicable) [30 min]
**File**: `prisma/migrations/[timestamp]_[migration_name]/data_migration.ts`

**Actions**:
- Write script to backfill or transform data
- Handle batching for large datasets
- Add error handling and logging
- Make idempotent (can run multiple times)

**Example**:
```typescript
// Backfill emailVerified for existing users
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateData() {
  const batchSize = 1000;
  let offset = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where: { emailVerified: null },
      take: batchSize,
      skip: offset,
    });

    if (users.length === 0) break;

    await prisma.user.updateMany({
      where: { id: { in: users.map(u => u.id) } },
      data: { emailVerified: false },
    });

    offset += batchSize;
    console.log(`Migrated ${offset} users`);
  }
}

migrateData()
  .then(() => console.log('Migration complete'))
  .catch(err => console.error('Migration failed:', err))
  .finally(() => prisma.$disconnect());
```

**Validation**:
- Data migration script runs successfully
- All data transformed correctly
- No data loss

### Step 4: Update Application Code [20 min]
**Files**: Update all files that query affected tables

**Actions**:
- Update TypeScript types
- Update queries to use new columns
- Add/update validation logic
- Handle null values (if column added to existing table)

**Validation**:
- TypeScript compiles without errors
- Queries work with new schema
- Unit tests pass

### Step 5: Write Migration Tests [20 min]
**File**: `tests/migrations/[migration_name].test.ts`

**Test Cases**:
- Migration applies successfully on fresh database
- Migration applies successfully on database with existing data
- Rollback migration works
- Data integrity maintained after migration
- Application works with migrated schema

**Example**:
```typescript
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

describe('Migration: add_email_verified', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Reset database to pre-migration state
    execSync('pnpm prisma migrate reset --force --skip-seed');
    prisma = new PrismaClient();
  });

  it('should apply migration successfully', async () => {
    execSync('pnpm prisma migrate deploy');

    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        emailVerified: true,
      },
    });

    expect(user.emailVerified).toBe(true);
  });

  it('should rollback migration successfully', async () => {
    execSync('pnpm prisma migrate rollback');

    // Verify column is removed
    await expect(
      prisma.user.findFirst({ select: { emailVerified: true } })
    ).rejects.toThrow();
  });
});
```

**Validation**:
- All migration tests pass

### Step 6: Test on Staging [30 min]
**Actions**:
- Copy production database to staging
- Run migration on staging
- Test application functionality
- Monitor performance (query times, CPU, memory)
- Test rollback procedure

**Validation**:
- Migration completes in acceptable time
- Application works correctly
- No performance degradation
- Rollback works

### Step 7: Document Migration [10 min]
**File**: `prisma/migrations/[timestamp]_[migration_name]/README.md`

**Include**:
- Purpose of migration
- Schema changes summary
- Data changes (if any)
- Estimated duration
- Rollback procedure
- Risks and mitigations
- Deployment checklist

**Example**:
```markdown
# Migration: Add Email Verification

## Purpose
Add `emailVerified` column to track email verification status.

## Schema Changes
- Add `User.emailVerified` BOOLEAN DEFAULT false

## Data Changes
- Backfill existing users with `emailVerified = false`

## Estimated Duration
- Small DB (<10k users): < 1 second
- Medium DB (10k-100k users): 1-5 seconds
- Large DB (100k-1M users): 5-30 seconds

## Deployment Steps
1. Backup database
2. Run migration: `pnpm prisma migrate deploy`
3. Verify migration: Check `User` table has new column
4. Deploy application code
5. Monitor logs for errors

## Rollback Procedure
1. Rollback application code
2. Run: `pnpm prisma migrate rollback`
3. Verify column removed
```

**Validation**:
- Documentation is clear and complete

### Step 8: Production Deployment [Variable]
**Actions**:
- Schedule maintenance window (if needed)
- Backup production database
- Run migration
- Deploy application code (before or after migration as appropriate)
- Monitor application logs and metrics
- Run data validation queries

**Deployment Checklist**:
- [ ] Database backup created
- [ ] Staging migration successful
- [ ] Rollback procedure tested
- [ ] Team notified of deployment
- [ ] Monitoring dashboards ready
- [ ] Migration applied successfully
- [ ] Application deployed
- [ ] Smoke tests passed
- [ ] Performance metrics normal

**Validation**:
- Migration completed successfully
- Application is running normally
- No error spikes in logs
- Query performance is acceptable

## TESTING STRATEGY

### Migration Tests (Testcontainers)
**Coverage Target**: All schema changes

**Test Scenarios**:
- Fresh database migration (up)
- Migration rollback (down)
- Migration on database with existing data
- Data migration correctness
- Constraint validation

### Integration Tests (Vitest + Testcontainers)
**Coverage Target**: All affected queries

**Test Scenarios**:
- CRUD operations work with new schema
- Queries return expected results
- Constraints are enforced
- Indexes improve query performance

### Performance Tests
**Coverage Target**: Critical queries

**Test Scenarios**:
- Migration duration on realistic data volume
- Query performance before/after migration
- Index effectiveness

## ROLLBACK STRATEGY

### Immediate Rollback (< 10 minutes)
1. **Stop application** (prevent writes to database)
2. **Run rollback migration**: `pnpm prisma migrate rollback` or manual SQL
3. **Restore application code** to previous version
4. **Restart application**
5. **Verify functionality**

### Restore from Backup (if rollback fails)
1. **Stop application**
2. **Restore database from backup**
3. **Verify data integrity**
4. **Restart application with old code**

### Validation
- Database schema matches pre-migration state
- Application works correctly
- No data loss
- Query performance normal

## EFFORT ESTIMATE

**Total Estimated Time**: 2-4 hours

**Breakdown**:
- Create migration file: 15 min
- Test locally: 15 min
- Data migration script (if needed): 30 min
- Update application code: 20 min
- Write migration tests: 20 min
- Test on staging: 30 min
- Documentation: 10 min
- Production deployment: 30 min
- Buffer (issues, verification): 30 min

**Confidence Level**: Medium (depends on data volume and complexity)

**Assumptions**:
- Database size < 1M rows
- No complex data transformations
- Staging environment available
- Backup/restore capability exists

---

## CUSTOMIZATION CHECKLIST

When using this template, replace the following placeholders:

- [ ] [MIGRATION_DESCRIPTION] - Brief description (e.g., "add email verification columns")
- [ ] [LIST_EXISTING_TABLES] - Tables being modified
- [ ] [LIST_EXISTING_COLUMNS] - Columns being added/modified/removed
- [ ] [LIST_FOREIGN_KEY_DEPENDENCIES] - Any FK dependencies
- [ ] Adjust complexity based on data volume and transformations
- [ ] Add/remove risks based on specific migration
- [ ] Update time estimates based on database size
- [ ] Customize rollback procedure for specific changes

---

## PATTERN USAGE NOTES

**When to Use This Template**:
- ✅ Adding/removing columns
- ✅ Adding/removing tables
- ✅ Adding indexes or constraints
- ✅ Simple data migrations
- ✅ Complexity score 3-6/10

**When NOT to Use**:
- ❌ Complex multi-table refactoring (use full planning)
- ❌ Large-scale data transformations (use full planning)
- ❌ Zero-downtime migrations (requires detailed planning)
- ❌ Complexity > 7/10 (requires detailed analysis)

**Time Savings**: 7-9 minutes vs full planning process
