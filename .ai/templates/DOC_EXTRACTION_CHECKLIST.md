# Documentation Extraction Checklist

**Project**: [Project Name]
**Date**: [YYYY-MM-DD]
**Extractor**: [Agent/Human]

---

## Instructions

Use this checklist to systematically extract documentation from existing code and specifications. Mark each item as extracted (Y) or not found (N). Target completion: ~10 minutes for quick extraction.

---

## 1. API Endpoints (from routes/controllers)

### Automated Extraction Commands

```bash
# Find all route definitions
grep -rn "router\.\|app\.\(get\|post\|put\|patch\|delete\)" src/ --include="*.ts"

# Find all controller methods
grep -rn "@Get\|@Post\|@Put\|@Patch\|@Delete" src/ --include="*.ts"

# Find OpenAPI decorators
grep -rn "@Api\|@ApiOperation\|@ApiResponse" src/ --include="*.ts"
```

### Endpoints Found

| Method | Path | Handler | Auth | Description |
|--------|------|---------|------|-------------|
| GET | /api/v1/[resource] | [handler] | [ ] Y / [ ] N | |
| POST | /api/v1/[resource] | [handler] | [ ] Y / [ ] N | |
| PUT | /api/v1/[resource]/:id | [handler] | [ ] Y / [ ] N | |
| DELETE | /api/v1/[resource]/:id | [handler] | [ ] Y / [ ] N | |

---

## 2. Data Models (from schemas/models)

### Automated Extraction Commands

```bash
# Find all interfaces/types
grep -rn "^export interface\|^export type" src/ --include="*.ts"

# Find Zod schemas
grep -rn "z\.object\|z\.string\|z\.number" src/ --include="*.ts"

# Find Prisma models
grep -n "^model " prisma/schema.prisma

# Find TypeORM entities
grep -rn "@Entity\|@Column\|@PrimaryColumn" src/ --include="*.ts"
```

### Models Found

| Model Name | File | Type | Fields | Relationships |
|------------|------|------|--------|---------------|
| [Model] | [path] | interface/class/schema | [N] | [relations] |

---

## 3. Services (from services/)

### Automated Extraction Commands

```bash
# Find all service classes
grep -rn "^export class.*Service" src/ --include="*.ts"

# Find service methods
grep -rn "async.*(" src/services/ --include="*.ts"

# Find dependency injections
grep -rn "constructor(" src/services/ --include="*.ts"
```

### Services Found

| Service | File | Methods | Dependencies |
|---------|------|---------|--------------|
| [ServiceName] | [path] | [N] methods | [deps] |

---

## 4. Configuration (from config/)

### Automated Extraction Commands

```bash
# Find environment variables
grep -rn "process\.env\." src/ --include="*.ts"

# Find config files
ls -la src/config/ .env.example

# Find Zod config schemas
grep -rn "configSchema\|ConfigSchema" src/ --include="*.ts"
```

### Configuration Found

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| [VAR_NAME] | string/number/boolean | [default] | [ ] Y / [ ] N | |

---

## 5. Error Handling (from errors/)

### Automated Extraction Commands

```bash
# Find custom error classes
grep -rn "extends Error\|extends BaseError" src/ --include="*.ts"

# Find error codes
grep -rn "ErrorCode\|ERROR_" src/ --include="*.ts"

# Find error handlers
grep -rn "errorHandler\|handleError" src/ --include="*.ts"
```

### Errors Found

| Error Class | HTTP Status | Code | Description |
|-------------|-------------|------|-------------|
| [ErrorClass] | [4xx/5xx] | [CODE] | |

---

## 6. Middleware (from middleware/)

### Automated Extraction Commands

```bash
# Find middleware files
ls -la src/middleware/

# Find middleware functions
grep -rn "export.*middleware\|export function.*req.*res.*next" src/ --include="*.ts"

# Find applied middleware
grep -rn "app\.use\|router\.use" src/ --include="*.ts"
```

### Middleware Found

| Name | File | Purpose | Applied To |
|------|------|---------|------------|
| [MiddlewareName] | [path] | [purpose] | [routes/global] |

---

## 7. Tests (from tests/)

### Automated Extraction Commands

```bash
# Count test files
find . -name "*.test.ts" -o -name "*.spec.ts" | wc -l

# Find test suites
grep -rn "describe\(" tests/ --include="*.ts"

# Find test coverage
cat coverage/coverage-summary.json 2>/dev/null || echo "Run pnpm test:coverage"
```

### Test Summary

| Category | Files | Tests | Coverage |
|----------|-------|-------|----------|
| Unit | [N] | [N] | [%] |
| Integration | [N] | [N] | [%] |
| E2E | [N] | [N] | [%] |

---

## 8. Dependencies (from package.json)

### Automated Extraction Commands

```bash
# List production dependencies
cat package.json | jq '.dependencies'

# List dev dependencies
cat package.json | jq '.devDependencies'

# Check for outdated
pnpm outdated
```

### Key Dependencies

| Package | Version | Purpose | Category |
|---------|---------|---------|----------|
| [package] | [x.x.x] | [purpose] | runtime/dev/test |

---

## 9. Infrastructure (from docker/k8s)

### Automated Extraction Commands

```bash
# Find Dockerfiles
find . -name "Dockerfile*"

# Find docker-compose
find . -name "docker-compose*.yml"

# Find k8s manifests
find . -name "*.yaml" -path "*/k8s/*"
```

### Infrastructure Found

| Component | File | Type | Description |
|-----------|------|------|-------------|
| [component] | [path] | Dockerfile/compose/k8s | |

---

## 10. Scripts (from package.json)

### Automated Extraction Commands

```bash
# List all scripts
cat package.json | jq '.scripts'
```

### Scripts Found

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | [command] | Development server |
| `build` | [command] | Build for production |
| `test` | [command] | Run tests |
| `lint` | [command] | Lint code |

---

## Extraction Summary

| Category | Items Found | Status |
|----------|-------------|--------|
| 1. API Endpoints | [N] | [ ] Complete |
| 2. Data Models | [N] | [ ] Complete |
| 3. Services | [N] | [ ] Complete |
| 4. Configuration | [N] | [ ] Complete |
| 5. Error Handling | [N] | [ ] Complete |
| 6. Middleware | [N] | [ ] Complete |
| 7. Tests | [N] | [ ] Complete |
| 8. Dependencies | [N] | [ ] Complete |
| 9. Infrastructure | [N] | [ ] Complete |
| 10. Scripts | [N] | [ ] Complete |

---

## Generated Documentation Artifacts

Based on extraction, generate:

| Document | Source Categories | Template |
|----------|-------------------|----------|
| API.md | 1, 4, 5, 6 | DOC_API_TEMPLATE.md |
| ARCHITECTURE.md | 2, 3, 6 | BACKEND_DOC.md |
| DATA.md | 2 | BACKEND_DOC.md |
| TESTING.md | 7 | BACKEND_DOC.md |
| DEPLOYMENT.md | 9, 10 | INFRASTRUCTURE_DOC.md |

---

## Next Step

- If extraction complete: Generate documentation using templates
- If gaps found: Manual review of source code required
