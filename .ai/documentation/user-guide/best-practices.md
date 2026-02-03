# Best Practices

Recommended practices for using VALORA effectively.

## Workflow Organization

### 1. Start with Clear Requirements

**DO**:

```bash
# Clear, specific task description
valora plan "Add user authentication with OAuth 2.0 using Google provider"
```

**DON'T**:

```bash
# Vague, ambiguous task
valora plan "add auth"
```

### 2. Break Down Complex Tasks

**DO**:

```bash
# Break into manageable pieces
valora plan "Add User model with email and password fields"
valora plan "Implement password hashing with bcrypt"
valora plan "Add login endpoint with JWT tokens"
```

**DON'T**:

```bash
# Overwhelming complexity in one task
valora plan "Build complete authentication system with OAuth, JWT, password reset, MFA, and session management"
```

### 3. Follow the Development Lifecycle

Recommended workflow:

```bash
1. valora refine-specs           # Define requirements
2. valora create-prd             # Document product requirements
3. valora plan                   # Create implementation plan
4. valora review-plan            # Validate plan quality
5. valora implement              # Execute implementation
6. valora assert                 # Validate completeness
7. valora test                   # Run tests
8. valora review-code            # Code review
9. valora commit                 # Create commit
10. valora create-pr             # Open pull request
```

## Template Usage

### Use Pattern Templates

**When to use**:

- REST API endpoints
- React components
- Database migrations
- Common architectural patterns

**Example**:

```bash
# Use template for 8-10 min time savings
valora plan "Add orders API" --pattern=rest-api

# Instead of
valora plan "Add orders API"  # Takes 13-15 min
```

### Create Custom Templates

For recurring patterns in your codebase:

```bash
# Create template
cp .ai/templates/plans/PATTERN_REST_API.md \
   .ai/templates/plans/PATTERN_CUSTOM.md

# Edit for your needs
code .ai/templates/plans/PATTERN_CUSTOM.md

# Use template
valora plan "Custom task" --pattern=custom
```

## Quality Assurance

### Always Run Assert Phase

**DO**:

```bash
valora implement
valora assert  # Catch issues early
```

**DON'T**:

```bash
valora implement
# Skip validation - issues discovered later
```

### Use Dry Run for Important Changes

**Preview before executing**:

```bash
valora implement --dry-run
# Review generated plan
valora implement  # Execute after review
```

### Review High-Complexity Plans

```bash
valora plan "Complex feature"
valora review-plan  # Validate before implementing
```

## Performance Optimization

### 1. Enable Parallel Execution

```json
{
  "execution": {
    "enable_parallel_execution": true,
    "max_concurrent_stages": 4
  }
}
```

### 2. Use Appropriate Models

```bash
# Complex planning
valora plan --model claude-sonnet-4.5 "Design microservices architecture"

# Simple tasks
valora implement --model claude-haiku "Fix typo in README"

# Code review
valora review-code --model gpt-5-thinking-high
```

### 3. Leverage Express Planning

For trivial tasks (complexity < 3):

```bash
valora plan --mode=express "Update version number"
valora plan --mode=express "Fix typo in error message"
```

### 4. Clean Up Old Sessions

```bash
# Regular cleanup
valora session cleanup --days 30

# Or configure automatic cleanup
{
  "session": {
    "cleanup_days": 30,
    "cleanup_enabled": true
  }
}
```

## Session Management

### Resume Sessions Efficiently

```bash
# Resume last session
valora --resume plan "Continue previous work"

# Resume specific session
valora --session <session-id> implement
```

### Clear Context When Needed

```bash
# Start fresh session
valora --new-session plan "New feature"

# Clear context for current session
valora session clear-context
```

## Metrics and Continuous Improvement

### Track Metrics Regularly

```bash
# Weekly review
./.ai/scripts/generate-weekly-report.sh 30d

# Check specific metrics
./.ai/scripts/metrics 7d | jq '.templateUsage, .earlyExit'
```

### Act on Recommendations

Review weekly metrics reports and:

1. **Template usage low?** Create more templates
2. **Early exit rate low?** Improve plan quality
3. **Express planning underused?** Break down tasks

### Review Quality Scores

Monitor quality to ensure optimizations don't compromise code quality:

```bash
./.ai/scripts/metrics 30d | jq '.qualityScores'
```

## Team Collaboration

### Document Decisions

Use clarification answers to document decisions:

```bash
# Clarifications are saved in session
valora plan "Add caching layer"
# Answer questions about tech choices
# Decisions preserved for team context
```

### Share Templates

Share custom templates with team:

```bash
# Commit templates to repo
git add .ai/templates/plans/PATTERN_TEAM.md
git commit -m "Add team pattern template"
git push
```

### Standardize Configuration

```json
{
  "team": {
    "name": "backend-team",
    "default_agent": "software-engineer-typescript-backend",
    "baseline_times": {
      "avgWorkflowTime": 180
    }
  }
}
```

## Security Best Practices

### Protect API Keys

**DO**:

```bash
# Use environment variables
export ANTHROPIC_API_KEY="sk-ant-..."

# Or use .env file (gitignored)
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
source .env
```

**DON'T**:

```bash
# Commit API keys
echo '{"api_key": "sk-ant-..."}' > .ai/config.json
git add .ai/config.json  # DON'T DO THIS
```

### Enable Session Encryption

```json
{
  "session": {
    "encryption": true
  }
}
```

### Review Generated Code

Always review AI-generated code for:

- Security vulnerabilities
- Input validation
- Error handling
- Authentication/authorization

## Code Quality

### Follow Project Standards

Ensure AI follows your coding standards:

- Reference standards in prompts
- Use linters and formatters
- Enable real-time validation
- Review generated code

### Use Technical Defaults

Document standard tech choices:

```markdown
# .ai/templates/standards/TECHNICAL_DEFAULTS.md

- Package Manager: pnpm
- Testing: Vitest (unit), Playwright (E2E)
- Linting: ESLint + Prettier
- TypeScript: Strict mode enabled
```

### Validate Test Coverage

```bash
valora test
valora validate-coverage --threshold=80
```

## Error Handling

### Check Logs on Errors

```bash
# View recent logs
tail -50 .ai/logs/ai-$(date +%Y-%m-%d).log

# Follow logs in real-time
tail -f .ai/logs/ai-$(date +%Y-%m-%d).log
```

### Retry Failed Commands

```bash
# Retry with increased timeout
valora plan --timeout=900000 "Complex task"

# Use different model
valora plan --model=claude-sonnet-4.5 "Task"
```

### Preserve Failed Sessions

Don't delete sessions with errors - they contain valuable context for debugging.

## Anti-Patterns to Avoid

### ❌ Skipping Plan Review

```bash
# Bad
valora plan "Feature"
valora implement  # Implementing without review
```

```bash
# Good
valora plan "Feature"
valora review-plan  # Validate before implementing
valora implement
```

### ❌ Not Using Templates for Common Patterns

```bash
# Bad - takes 13-15 min
valora plan "Add users API"
```

```bash
# Good - takes 4-6 min
valora plan "Add users API" --pattern=rest-api
```

### ❌ Ignoring Metrics Recommendations

Weekly reports show actionable improvements - act on them.

### ❌ One Massive Task

```bash
# Bad
valora plan "Implement entire authentication system"
```

```bash
# Good
valora plan "Add User model"
valora plan "Add password hashing"
valora plan "Add login endpoint"
```

### ❌ Not Committing Regularly

```bash
# Bad
# Implement multiple features without commits
```

```bash
# Good
valora implement "Feature 1"
valora assert
valora commit
valora implement "Feature 2"
valora assert
valora commit
```

## Tips and Tricks

### 1. Use Command Aliases

```bash
# Create aliases in .ai/config.json
{
  "commands": {
    "aliases": {
      "p": "plan",
      "i": "implement",
      "r": "review-plan",
      "a": "assert",
      "c": "commit"
    }
  }
}

# Use aliases
valora p "Feature"
valora r
valora i
valora a
valora c
```

### 2. Set Default Arguments

```json
{
  "commands": {
    "plan": {
      "default_args": {
        "complexity_threshold": 5
      }
    }
  }
}
```

### 3. Use Context from Previous Commands

The engine preserves context across commands:

```bash
valora plan "Add feature"
# Context available

valora implement
# Uses plan context automatically

valora review-code
# Uses implementation context
```

### 4. Leverage Parallel Validation

Enabled by default, saves 12-15 min per review:

```bash
valora review-plan  # Runs 4 validations in parallel
```

### 5. Monitor Optimization Adoption

```bash
# Check if you're hitting targets
./.ai/scripts/metrics 30d | jq '{
  template_rate: .templateUsage.rate,
  early_exit_rate: .earlyExit.rate,
  express_rate: .expressPlanning.rate
}'
```

## Recommended Reading Order

1. [Quick Start](./quick-start.md) - Get started
2. **This document** - Learn best practices
3. [Workflows](./workflows.md) - Common patterns
4. [Commands](./commands.md) - Command details
5. [Metrics](./metrics.md) - Track efficiency

---

*These practices evolve based on team experience. Share your learnings!*
