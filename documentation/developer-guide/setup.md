# Development Setup

> Configure your development environment for VALORA.

## Prerequisites

| Software | Version  | Purpose            |
| -------- | -------- | ------------------ |
| Node.js  | >=18.0.0 | JavaScript runtime |
| pnpm     | 10.x     | Package manager    |
| Git      | 2.x+     | Version control    |

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd valora
```

### 2. Install Node.js

Use [Volta](https://volta.sh/) (recommended) — it pins the exact version from `package.json` automatically:

```bash
curl https://get.volta.sh | bash
# Volta reads .volta in package.json and uses the pinned version
```

Or use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 18
nvm use 18
```

### 3. Install pnpm

```bash
npm install -g pnpm@10
```

Or with Volta:

```bash
volta install pnpm@10
```

### 4. Install dependencies

```bash
pnpm install
```

This installs all dependencies from the frozen lockfile, sets up Husky git hooks, and runs the build.

> The project enforces `frozen-lockfile=true` in `.npmrc`. See [Supply Chain Security](#supply-chain-security) for details.

### 5. Verify installation

```bash
# Confirm the CLI responds
pnpm dev --version

# Run the smoke test suite
pnpm test:smoke
```

---

## Development Commands

### Essential

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Run in development mode (tsx)        |
| `pnpm dev:watch` | Run with auto-reload on file changes |
| `pnpm build`     | Compile TypeScript to `dist/`        |
| `pnpm format`    | Format and lint code                 |
| `pnpm tsc:check` | Type-check without building          |

### Testing

| Command                       | Description         |
| ----------------------------- | ------------------- |
| `pnpm test:smoke`             | Fast sanity check   |
| `pnpm test:suite:unit`        | Unit tests only     |
| `pnpm test:suite:integration` | Integration tests   |
| `pnpm test:suite:e2e`         | End-to-end tests    |
| `pnpm test:coverage`          | Tests with coverage |
| `pnpm test:quick`             | Unit + integration  |

### Build

| Command            | Description           |
| ------------------ | --------------------- |
| `pnpm clean:build` | Clean build artefacts |
| `pnpm build`       | Full build            |
| `pnpm build:watch` | Watch mode build      |

### Code quality

| Command             | Description        |
| ------------------- | ------------------ |
| `pnpm lint`         | Check linting      |
| `pnpm lint:fix`     | Fix linting issues |
| `pnpm beautify`     | Check formatting   |
| `pnpm beautify:fix` | Fix formatting     |

### Security

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `pnpm audit`      | Audit all dependencies for known CVEs    |
| `pnpm audit:prod` | Audit production dependencies only       |
| `pnpm audit:fix`  | Attempt automated vulnerability patching |

---

## Configuration

### Project configuration

VALORA uses a multi-level configuration cascade. The defaults live in `data/config.default.json`. Initialise a project-level override with:

```bash
valora init  # creates .valora/config.json
```

```json
{
	"defaults": {
		"default_provider": "cursor",
		"interactive": true,
		"log_level": "info",
		"output_format": "markdown",
		"session_mode": true
	},
	"providers": {}
}
```

### API keys

Create a `.env` file in the repository root (gitignored):

```plaintext
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

---

## Supply Chain Security

The project applies several hardening measures via `.npmrc` and `package.json`, documented in [ADR-009](../adr/009-supply-chain-hardening.md).

### Frozen lockfile

`frozen-lockfile=true` prevents `pnpm install` from silently modifying `pnpm-lock.yaml`. To update dependencies intentionally:

```bash
# Update a specific package
pnpm update <package-name> --config.frozen-lockfile=false

# Update all packages
pnpm update --config.frozen-lockfile=false
```

### Blocked install scripts

`ignore-scripts=true` prevents lifecycle scripts (`postinstall`, `preinstall`) from all third-party dependencies. Root scripts (`prepare`, `prebuild`, `postbuild`) are unaffected.

If a new dependency legitimately requires a build step (e.g., native compilation), allowlist it:

```json
{
	"pnpm": {
		"onlyBuiltDependencies": ["sharp"]
	}
}
```

### Vulnerability overrides

Transitive vulnerabilities patched via `pnpm.overrides` in `package.json`. After any dependency change, run:

```bash
pnpm audit:prod
pnpm audit --prod --audit-level=high
```

### Dependabot

Automated updates are configured in `.github/dependabot.yml`. Minor/patch updates are grouped into two weekly PRs. Major bumps get individual PRs for manual review.

---

## Troubleshooting

**`pnpm install` fails**

```bash
pnpm store prune
rm -rf node_modules
pnpm install
```

**Build errors**

```bash
pnpm clean:build && pnpm build
```

**Type errors**

```bash
pnpm tsc:check
```

**Test failures**

```bash
pnpm test:suite:unit -- --reporter=verbose
```

**Getting help**

1. Run `valora doctor` — shows log file locations and environment info
2. Run `pnpm dev doctor` — equivalent in development mode
3. See the [Architecture Documentation](../architecture/README.md)

---

<details>
<summary><strong>IDE configuration</strong></summary>

The repository ships with `.vscode/` settings pre-configured for:

- Format on save (Prettier)
- ESLint auto-fix on save
- TypeScript strict mode

Recommended VS Code / Cursor extensions:

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- TypeScript and JavaScript Language Features (built-in)
- Error Lens (`usernamehw.errorlens`)

</details>

<details>
<summary><strong>Optional tooling</strong></summary>

| Tool       | Purpose                                 | Install                          |
| ---------- | --------------------------------------- | -------------------------------- |
| Docker     | Container-based testing                 | [docker.com](https://docker.com) |
| Cursor IDE | Best Valora development UX              | [cursor.com](https://cursor.com) |
| Stryker    | Mutation testing (`pnpm test:mutation`) | already a dev dependency         |

The project's CLI enforcement hook (see [ADR-008](../adr/008-pretooluse-cli-enforcement.md)) blocks legacy commands like `grep`, `find`, and `ls` in favour of `rg`, `fd`, and `eza`. Install the modern CLI toolkit described in [modern-cli-toolkit/README.md](./modern-cli-toolkit/README.md).

</details>

<details>
<summary><strong>Environment variables reference</strong></summary>

| Variable            | Required | Description                       |
| ------------------- | -------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Optional | Enables Anthropic/Claude provider |
| `OPENAI_API_KEY`    | Optional | Enables OpenAI provider           |
| `GOOGLE_API_KEY`    | Optional | Enables Google AI provider        |
| `VALORA_LOG_LEVEL`  | Optional | Overrides `log_level` in config   |
| `VALORA_DATA_DIR`   | Optional | Overrides default data directory  |

At least one provider API key is required for execution. The `cursor` provider requires no key — it uses the active Cursor IDE session.

</details>

---

## Next Steps

1. Read the [Codebase Overview](./codebase.md)
2. Review [Contributing Guidelines](./contributing.md)
3. Pick an open issue tagged `good first issue`
