### Conventional Commits Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```plaintext
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

| Type       | Description                                         | Example                                     |
| ---------- | --------------------------------------------------- | ------------------------------------------- |
| `feat`     | New feature implementation                          | `feat(auth): add OAuth2 authentication`     |
| `fix`      | Bug fix                                             | `fix(api): resolve race condition in cache` |
| `docs`     | Documentation changes                               | `docs(readme): update installation steps`   |
| `style`    | Code style changes (formatting, no logic change)    | `style(components): apply Prettier rules`   |
| `refactor` | Code refactoring (no feature change or bug fix)     | `refactor(db): extract query builders`      |
| `perf`     | Performance improvements                            | `perf(api): optimize database query`        |
| `test`     | Adding or updating tests                            | `test(auth): add OAuth2 integration tests`  |
| `build`    | Build system or dependency changes                  | `build(deps): upgrade React to v18`         |
| `ci`       | CI/CD configuration changes                         | `ci(github): add automated deployments`     |
| `chore`    | Maintenance tasks, tooling updates                  | `chore(deps): update development tools`     |
| `revert`   | Revert a previous commit                            | `revert: feat(auth): add OAuth2`            |
| `wip`      | Work in progress (should not appear in main branch) | `wip: experimenting with GraphQL`           |

#### Scope Guidelines

- Use clear, concise scope names (kebab-case)
- Align with architectural boundaries (e.g., `auth`, `api`, `ui`, `db`)
- Omit scope if change affects multiple areas broadly
- Examples: `auth`, `user-profile`, `payment-gateway`, `logging`

#### Breaking Changes

For breaking changes, add `!` after scope and include footer:

```plaintext
feat(api)!: redesign authentication endpoints

BREAKING CHANGE: /api/login endpoint now requires JWT tokens
instead of session cookies. Clients must update authentication flow.
```
