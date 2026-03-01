# Development Setup

> Configure your development environment for VALORA.

## Prerequisites

### Required Software

| Software | Version | Purpose            |
| -------- | ------- | ------------------ |
| Node.js  | 18.0.0+ | JavaScript runtime |
| pnpm     | 10.x    | Package manager    |
| Git      | 2.x+    | Version control    |

### Optional Software

| Software   | Purpose                     |
| ---------- | --------------------------- |
| Docker     | Container testing           |
| Cursor IDE | Best development experience |
| VS Code    | Alternative IDE             |

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd valora
```

### 2. Install Node.js

We recommend using Volta for Node.js version management:

```bash
# Install Volta
curl https://get.volta.sh | bash

# Volta will automatically use the correct Node.js version
# (specified in package.json volta config)
```

Or use nvm:

```bash
nvm install 22
nvm use 22
```

### 3. Install pnpm

```bash
npm install -g pnpm@10
```

Or with Volta:

```bash
volta install pnpm@10
```

### 4. Install Dependencies

From the repository root:

```bash
pnpm install
```

This will:

- Install all dependencies from the frozen lockfile (no lockfile mutations)
- Set up Husky git hooks
- Build the project

> **Note**: The project enforces `frozen-lockfile=true` and `ignore-scripts=true` in `.npmrc`. See [Supply Chain Security](#supply-chain-security) below for details.

### 5. Verify Installation

```bash
# Check the CLI works
pnpm dev --version

# Run the test suite
pnpm test:smoke
```

## Environment Configuration

### Configuration File

The engine uses a multi-level configuration cascade. The default configuration is at `data/config.default.json`. For development, you can create a project-level override:

```bash
valora init  # Creates .valora/config.json
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

### Environment Variables

For API-based execution, set these environment variables:

```bash
# Anthropic (Claude)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google AI
export GOOGLE_API_KEY=...
```

Create a `.env` file in the repository root:

```plaintext
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### IDE Configuration

#### VS Code / Cursor

The project includes VS Code settings in `.vscode/`:

Recommended extensions:

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Error Lens

Settings are pre-configured for:

- Format on save
- ESLint auto-fix
- TypeScript strict mode

## Project Structure

After cloning and installing, your directory structure should be:

```plaintext
valora/                      # Repository root = npm package root
├── bin/                     # CLI entry points
│   ├── valora.js            # Main CLI entry
│   └── mcp.js               # MCP server entry
├── src/                     # TypeScript source code
│   ├── cli/                 # Command-line interface
│   ├── config/              # Configuration management
│   ├── di/                  # Dependency injection
│   ├── executor/            # Pipeline execution
│   ├── exploration/         # Parallel exploration
│   ├── llm/                 # LLM provider integrations
│   ├── mcp/                 # MCP server implementation
│   ├── output/              # Output formatting
│   ├── services/            # Shared services
│   ├── session/             # Session management
│   ├── types/               # Global type definitions
│   ├── ui/                  # Terminal UI components
│   └── utils/               # Utilities & path resolution
├── data/                    # Built-in resources (shipped with package)
│   ├── agents/              # Agent definitions
│   ├── commands/            # Command specifications
│   ├── prompts/             # Prompt templates
│   ├── templates/           # Document templates
│   ├── hooks/               # Hook scripts
│   ├── config.default.json  # Default configuration
│   ├── hooks.default.json   # Default hooks configuration
│   └── external-mcp.default.json # External MCP server registry
├── dist/                    # Compiled output (gitignored)
├── tests/                   # Test suites
├── scripts/                 # Development scripts
├── documentation/           # Comprehensive documentation
├── node_modules/            # Dependencies
├── package.json             # Package configuration
├── tsconfig.json            # TypeScript config
├── eslint.config.js         # ESLint config
└── vitest.config.ts         # Test config
```

## Development Commands

### Essential Commands

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Run in development mode              |
| `pnpm dev:watch` | Run with auto-reload on file changes |
| `pnpm build`     | Build the project                    |
| `pnpm test`      | Run all tests                        |
| `pnpm lint`      | Run ESLint                           |
| `pnpm format`    | Format code                          |

### Build Commands

| Command            | Description           |
| ------------------ | --------------------- |
| `pnpm clean:build` | Clean build artefacts |
| `pnpm build`       | Full build            |
| `pnpm build:watch` | Watch mode build      |

### Test Commands

| Command                       | Description         |
| ----------------------------- | ------------------- |
| `pnpm test:suite:unit`        | Unit tests only     |
| `pnpm test:suite:integration` | Integration tests   |
| `pnpm test:suite:e2e`         | End-to-end tests    |
| `pnpm test:coverage`          | Tests with coverage |
| `pnpm test:quick`             | Fast test subset    |

### Quality Commands

| Command             | Description        |
| ------------------- | ------------------ |
| `pnpm lint`         | Check linting      |
| `pnpm lint:fix`     | Fix linting issues |
| `pnpm beautify`     | Check formatting   |
| `pnpm beautify:fix` | Fix formatting     |
| `pnpm tsc:check`    | Type checking      |

### Security Commands

| Command           | Description                                |
| ----------------- | ------------------------------------------ |
| `pnpm audit`      | Audit all dependencies for vulnerabilities |
| `pnpm audit:prod` | Audit production dependencies only         |
| `pnpm audit:fix`  | Attempt to auto-fix vulnerabilities        |

## Supply Chain Security

The project enforces several supply chain hardening measures via `.npmrc` and `package.json`. These are documented in [ADR-009](../adr/009-supply-chain-hardening.md).

### Frozen Lockfile

`.npmrc` sets `frozen-lockfile=true`, which prevents `pnpm install` from silently modifying `pnpm-lock.yaml`. This catches lockfile drift and ensures reproducible installs.

To update dependencies intentionally:

```bash
# Update a specific package
pnpm update <package-name> --config.frozen-lockfile=false

# Update all packages
pnpm update --config.frozen-lockfile=false
```

### Dependency Install Scripts Blocked

`.npmrc` sets `ignore-scripts=true`, which blocks lifecycle scripts (`postinstall`, `install`, `preinstall`) from all dependencies. This is the primary defence against supply chain attacks via malicious install scripts.

Root project scripts (`prepare`, `prebuild`, `postbuild`) are unaffected.

If a new dependency legitimately requires a build step (e.g., native compilation), add it to `pnpm.onlyBuiltDependencies` in `package.json`:

```json
{
	"pnpm": {
		"onlyBuiltDependencies": ["sharp"]
	}
}
```

### Vulnerability Overrides

Transitive vulnerabilities that cannot be fixed by updating direct dependencies are patched via `pnpm.overrides` in `package.json`. When adding or reviewing overrides, run:

```bash
pnpm audit:prod                          # Check production vulnerabilities
pnpm audit --prod --audit-level=high     # Check high/critical only
```

### Dependabot

Automated dependency updates are configured in `.github/dependabot.yml`. Dependabot groups minor/patch updates into two weekly PRs (production and dev dependencies). Major version bumps get individual PRs for careful review.

## Troubleshooting

### Common Issues

#### pnpm Install Fails

```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules
pnpm install
```

#### Build Errors

```bash
# Clean and rebuild
pnpm clean:build
pnpm build
```

#### Type Errors

```bash
# Check types without build
pnpm tsc:check
```

#### Test Failures

```bash
# Run with verbose output
pnpm test:suite:unit -- --reporter=verbose
```

### Getting Help

1. Check logs: `valora doctor` shows log locations
2. Run diagnostics: `pnpm dev doctor`
3. Review the [Architecture Documentation](../architecture/README.md)

## Next Steps

1. Read the [Codebase Overview](./codebase.md)
2. Review [Contributing Guidelines](./contributing.md)
3. Start with a small fix or improvement
