# Plan Templates

Plan templates accelerate the planning process for common implementation patterns by providing pre-structured plans with standard steps, dependencies, and risk mitigations.

## Available Templates

| Template                                              | Complexity Range | Time Savings | Use When                                                 |
| ----------------------------------------------------- | ---------------- | ------------ | -------------------------------------------------------- |
| [REST API](./PATTERN_REST_API.md)                     | 2-5/10           | 8-10 min     | Adding API endpoints, CRUD operations, RESTful resources |
| [React Component](./PATTERN_REACT_COMPONENT.md)       | 2-5/10           | 8-10 min     | Building UI components, forms, pages                     |
| [Database Migration](./PATTERN_DATABASE_MIGRATION.md) | 3-6/10           | 7-9 min      | Schema changes, data migrations, indexes                 |

## Pattern Detection

The planning system can auto-detect patterns based on task keywords:

### REST API Pattern
**Keywords**: `api`, `endpoint`, `rest`, `crud`, `http`, `route`, `handler`
**File patterns**: `src/routes/`, `src/controllers/`, `*.routes.ts`

**Example tasks**:
- "Add users API endpoint"
- "Create CRUD endpoints for posts"
- "Implement GET /api/orders endpoint"

### React Component Pattern
**Keywords**: `component`, `react`, `ui`, `form`, `page`, `view`, `modal`
**File patterns**: `src/components/`, `*.tsx`, `*.jsx`

**Example tasks**:
- "Add login form component"
- "Create user profile page"
- "Build notification modal"

### Database Migration Pattern
**Keywords**: `migration`, `schema`, `database`, `table`, `column`, `index`, `prisma`
**File patterns**: `prisma/schema.prisma`, `migrations/`, `*.sql`

**Example tasks**:
- "Add email_verified column to users table"
- "Create orders table with foreign keys"
- "Add index to user email column"

## Usage

### Manual Template Selection

```bash
# Specify template explicitly
valora plan "Add users API" --template=rest-api

# Or use pattern name
valora plan "Add users API" --pattern=rest-api
```

### Automatic Pattern Detection

```bash
# Planning system detects pattern automatically
valora plan "Add login form component"
# → Detects "React Component" pattern
# → Uses PATTERN_REACT_COMPONENT.md template

valora plan "Create users API endpoint"
# → Detects "REST API" pattern
# → Uses PATTERN_REST_API.md template
```

### Override Pattern Detection

```bash
# Force full planning even if pattern detected
valora plan "Add users API" --no-template
```

## Template Structure

Each template follows this structure:

1. **Metadata** (YAML frontmatter)
   - Pattern name
   - Complexity range
   - Use cases
   - Applicable technologies

2. **Overview**
   - Task summary
   - Scope definition
   - Success criteria

3. **Pre-filled Sections**
   - Complexity assessment with typical scores
   - Standard dependencies
   - Common risks with mitigations
   - Step-by-step implementation guide
   - Testing strategy
   - Rollback procedures

4. **Customization Checklist**
   - Placeholders to replace
   - Adjustments needed

## Benefits

### Time Savings
- **Without template**: 13-15 minutes for full planning
- **With template**: 3-5 minutes for customization
- **Savings**: 8-10 minutes per plan (~60% reduction)

### Consistency
- Standard structure across similar implementations
- Best practices built into templates
- Reduced planning errors

### Quality
- Pre-identified risks and mitigations
- Comprehensive test strategies
- Proven implementation steps

## When NOT to Use Templates

Templates are optimized for **low-to-moderate complexity** tasks. Use full planning for:

- ❌ Complexity > 6/10
- ❌ Novel or experimental implementations
- ❌ Complex integrations (> 3 external services)
- ❌ Major architectural changes
- ❌ Multi-step workflows with state machines
- ❌ High-risk changes (data loss potential, security critical)

## Creating New Templates

To add a new pattern template:

1. Create `PATTERN_[NAME].md` in this directory
2. Use existing templates as reference
3. Include YAML frontmatter with metadata
4. Add pattern detection keywords
5. Update this README with new pattern
6. Update `assess-complexity.md` prompt with detection logic

### Template Naming Convention

- File: `PATTERN_[UPPERCASE_NAME].md`
- Pattern ID: `lowercase-name` (used in CLI)
- Examples:
  - `PATTERN_REST_API.md` → `rest-api`
  - `PATTERN_REACT_COMPONENT.md` → `react-component`
  - `PATTERN_DATABASE_MIGRATION.md` → `database-migration`

## Metrics

Track template effectiveness:

- **Usage rate**: % of plans using templates
- **Time savings**: Actual vs expected planning time
- **Quality**: Template-based plans vs full plans (review scores)
- **Feedback**: User satisfaction with templates

Target metrics:
- Usage rate: > 40% of plans
- Time savings: 8-10 min per template use
- Quality: Review scores ≥ 7.5/10
- Satisfaction: > 80% find templates helpful
