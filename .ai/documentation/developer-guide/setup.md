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

Navigate to the engine directory and install:

```bash
cd .ai/.bin
pnpm install
```

This will:

- Install all dependencies
- Set up Husky git hooks
- Build the project

### 5. Verify Installation

```bash
# Check the CLI works
pnpm dev --version

# Run the test suite
pnpm test:smoke
```

## Environment Configuration

### Configuration File

The engine uses a configuration file at `.ai/config.json`:

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

Create a `.env` file in `.ai/.bin/`:

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

After installation, your directory structure should be:

```plaintext
.ai/
├── .bin/                    # Engine source code
│   ├── src/                # TypeScript source
│   ├── dist/               # Compiled output
│   ├── tests/              # Test suites
│   ├── node_modules/       # Dependencies
│   ├── package.json        # Package configuration
│   ├── tsconfig.json       # TypeScript config
│   ├── eslint.config.js    # ESLint config
│   └── vitest.config.ts    # Test config
├── agents/                  # Agent definitions
├── commands/                # Command specifications
├── prompts/                 # Prompt templates
├── sessions/                # Session storage
├── logs/                    # Execution logs
└── config.json             # Engine configuration
```

## Development Commands

### Essential Commands

| Command       | Description             |
| ------------- | ----------------------- |
| `pnpm dev`    | Run in development mode |
| `pnpm build`  | Build the project       |
| `pnpm test`   | Run all tests           |
| `pnpm lint`   | Run ESLint              |
| `pnpm format` | Format code             |

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

1. Check logs in `.ai/logs/`
2. Run diagnostics: `pnpm dev doctor`
3. Review the [Architecture Documentation](../architecture/README.md)

## Next Steps

1. Read the [Codebase Overview](./codebase.md)
2. Review [Contributing Guidelines](./contributing.md)
3. Start with a small fix or improvement
