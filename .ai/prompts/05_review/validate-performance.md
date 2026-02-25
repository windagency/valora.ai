---
id: review.validate-performance
version: 1.0.0
category: review
experimental: true
name: Validate Performance
description: Identify performance bottlenecks, inefficient algorithms, and optimization opportunities
tags:
  - validation
  - performance
  - optimization
  - bottlenecks
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
    description: Files to review for performance
    type: array
    required: true
  - name: review_focus
    description: Specific performance concerns
    type: object
    required: false
outputs:
  - performance_issues
  - bottlenecks_identified
  - optimization_recommendations
tokens:
  avg: 3000
  max: 6000
  min: 1500
---

# Validate Performance

## Objective

Identify performance bottlenecks, inefficient algorithms, resource leaks, and optimization opportunities in code changes.

## Validation Steps

### Step 1: Analyze Algorithm Complexity

For each function/method in changed files:

**Time Complexity Check**:

- Nested loops: O(n²) or worse → Flag if n is unbounded
- Recursive calls: Check for memoization
- Database queries in loops: N+1 problem
- Array operations: map/filter/reduce chains

**Space Complexity Check**:

- Large data structures created unnecessarily
- Memory not freed (closures, event listeners)
- Unbounded arrays/objects
- Data duplication

**Patterns to Flag**:

```typescript
// BAD: N+1 Query Problem
for (const user of users) {
  const orders = await db.orders.find({ userId: user.id });
}

// BAD: Nested loops with unbounded data
for (const item of items) {
  for (const category of categories) {
    // O(n*m) operation
  }
}

// BAD: Inefficient array operations
data.filter(x => x.active)
    .map(x => x.name)
    .filter(x => x.length > 5); // Multiple iterations
```

### Step 2: Review Database Query Efficiency

**Check for**:

- **Missing indexes**: Queries without WHERE clause indexes
- **SELECT ***: Fetching unnecessary columns
- **N+1 queries**: Iterative database calls
- **Inefficient joins**: Large cartesian products
- **Missing pagination**: Unbounded result sets
- **Unoptimized ORMs**: Generated queries not optimized

**Validation**:

```bash
# Check for SELECT * patterns
rg "SELECT \*" src/ -t ts -g '*.sql'

# Check for queries in loops
rg -B 5 "await.*(find|query)" src/ -t ts | rg -A 5 "for|while"
```

### Step 3: Identify Resource Management Issues

**Memory Leaks**:

- Event listeners not removed
- Timers not cleared
- Closures capturing large objects
- Cache without TTL or size limits

**Connection Leaks**:

- Database connections not closed
- HTTP connections not properly handled
- WebSocket connections not terminated
- File handles not released

**Resource Exhaustion**:

- Unbounded queues or buffers
- Missing backpressure handling
- No rate limiting on expensive operations

**Examples**:

```typescript
// BAD: Memory leak - event listener not removed
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Missing cleanup!
}, []);

// BAD: Connection leak
async function getData() {
  const client = await pool.connect();
  const result = await client.query('SELECT * FROM users');
  return result.rows; // Connection never released!
}
```

### Step 4: Check Caching Strategy

**Evaluate**:

- Cache hit/miss patterns
- Cache invalidation logic
- Cache key design (avoid collisions)
- TTL appropriateness
- Cache size limits

**Anti-patterns**:

- Caching frequently changing data
- No cache invalidation on updates
- Over-caching (everything cached)
- Under-caching (nothing cached)
- Cache stampede risk

### Step 5: Review API and Network Calls

**Check for**:

- Sequential API calls that could be parallelized
- Missing timeouts
- No retry logic for transient failures
- Large payloads without compression
- Missing request batching
- Polling instead of WebSockets/SSE

**Patterns**:

```typescript
// BAD: Sequential calls
const user = await api.getUser(id);
const orders = await api.getOrders(id);
const profile = await api.getProfile(id);

// GOOD: Parallel calls
const [user, orders, profile] = await Promise.all([
  api.getUser(id),
  api.getOrders(id),
  api.getProfile(id)
]);
```

### Step 6: Frontend-Specific Performance

**React/Vue/Angular**:

- Unnecessary re-renders
- Missing memoization (useMemo, React.memo)
- Large component trees
- Unoptimized reconciliation
- Heavy computations in render

**Assets**:

- Unoptimized images
- Missing lazy loading
- Large bundle sizes
- No code splitting
- Unused dependencies

**DOM Operations**:

- Frequent DOM access in loops
- Forced reflows/repaints
- Missing virtualization for long lists

## Output Format

```json
{
  "performance_issues": {
    "status": "fail",
    "total_issues": 8,
    "critical": 2,
    "high": 3,
    "medium": 3,
    "issues": [
      {
        "severity": "critical",
        "category": "database",
        "type": "n_plus_1_query",
        "location": "src/services/order.service.ts:45-52",
        "description": "Database query inside loop causing N+1 problem",
        "code_snippet": "for (const user of users) {\n  const orders = await db.orders.find({ userId: user.id });\n}",
        "impact": "Performance degrades linearly with user count. 1000 users = 1000 queries",
        "recommendation": "Use single query with IN clause: db.orders.find({ userId: { $in: userIds } })",
        "estimated_improvement": "1000x reduction in queries"
      },
      {
        "severity": "high",
        "category": "algorithm",
        "type": "inefficient_complexity",
        "location": "src/utils/search.ts:23-35",
        "description": "Nested loops creating O(n²) complexity",
        "code_snippet": "items.forEach(item => {\n  categories.forEach(cat => {\n    if (item.category === cat.id) results.push(item);\n  });\n});",
        "impact": "Performance degrades quadratically. 1000 items + 100 categories = 100k iterations",
        "recommendation": "Use Map for O(1) lookups: const catMap = new Map(categories.map(c => [c.id, c]));",
        "estimated_improvement": "O(n²) → O(n)"
      },
      {
        "severity": "high",
        "category": "memory",
        "type": "memory_leak",
        "location": "src/components/Dashboard.tsx:67-72",
        "description": "Event listener not cleaned up in useEffect",
        "code_snippet": "useEffect(() => {\n  window.addEventListener('resize', handleResize);\n}, []);",
        "impact": "Memory leak on component mount/unmount cycles",
        "recommendation": "Add cleanup: return () => window.removeEventListener('resize', handleResize);",
        "estimated_improvement": "Prevents memory leak"
      }
    ]
  },
  "bottlenecks_identified": [
    {
      "location": "src/api/users.ts:handleGetUsers",
      "type": "database",
      "description": "Fetching all users without pagination",
      "impact_level": "high"
    },
    {
      "location": "src/utils/transform.ts:processData",
      "type": "cpu",
      "description": "Heavy synchronous computation blocking event loop",
      "impact_level": "medium"
    }
  ],
  "optimization_recommendations": [
    {
      "priority": "critical",
      "area": "database",
      "recommendation": "Implement query batching and connection pooling",
      "files": ["src/services/order.service.ts", "src/services/user.service.ts"],
      "effort": "medium",
      "impact": "high"
    },
    {
      "priority": "high",
      "area": "caching",
      "recommendation": "Add Redis cache layer for frequently accessed data",
      "files": ["src/api/products.ts"],
      "effort": "high",
      "impact": "high"
    },
    {
      "priority": "medium",
      "area": "frontend",
      "recommendation": "Implement React.memo for expensive components",
      "files": ["src/components/ProductList.tsx"],
      "effort": "low",
      "impact": "medium"
    }
  ],
  "summary": {
    "total_issues": 8,
    "critical": 2,
    "high": 3,
    "medium": 3,
    "blocking": true,
    "overall_assessment": "Multiple critical performance issues found that will impact production performance"
  }
}
```

## Success Criteria

- ✅ Algorithm complexity analyzed for all changed functions
- ✅ Database query efficiency validated
- ✅ Resource leaks identified
- ✅ Caching strategy reviewed
- ✅ API/network calls optimized
- ✅ Concrete optimization recommendations with impact estimates

## Rules

**Blocking Issues** (Fail Review):

- N+1 query problems in production code
- O(n²) or worse algorithms on unbounded data
- Memory leaks in long-running processes
- Missing resource cleanup (connections, files)
- Unbounded result sets without pagination

**Warning Issues**:

- Inefficient but acceptable algorithms (small n)
- Missing caching opportunities
- Sub-optimal query patterns
- Potential future bottlenecks

**Performance Thresholds**:

- Database queries: < 100ms per query
- API endpoints: < 200ms response time
- Frontend renders: < 16ms (60fps)
- Memory usage: No unbounded growth

## Notes

- Focus on scalability issues (problems that get worse with scale)
- Consider production data volumes, not dev/test data
- Prioritize user-facing performance over internal operations
- Balance optimization effort vs. actual impact
- Premature optimization is still evil - flag real issues only

