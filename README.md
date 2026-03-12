<p align="center">
  <img src="https://img.shields.io/badge/VALORA-6366f1?style=for-the-badge&logo=openai&logoColor=white" alt="VALORA" />
</p>

<h1 align="center">VALORA</h1>

<p align="center">
  <strong>The future of software development is not about replacing developers, but amplifying their capabilities with intelligent AI collaboration.</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-commands">Commands</a> •
  <a href="#-documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.2.1-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node" />
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Anthropic-Claude-d97706?style=flat-square" alt="Anthropic" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--5-412991?style=flat-square" alt="OpenAI" />
  <img src="https://img.shields.io/badge/Google-Gemini-4285f4?style=flat-square" alt="Google" />
  <img src="https://img.shields.io/badge/Cursor-MCP-000000?style=flat-square" alt="Cursor" />
</p>

---

## 🏛️ About VALORA

**VALORA (Versatile Agent Logic for Orchestrated Response Architecture)** is a next-generation TypeScript-based platform designed to orchestrate a sophisticated network of AI agents to automate the complete software development lifecycle. By moving beyond simple "code generation", VALORA manages the delicate interplay between requirements, architecture, and deployment. VALORA provides intelligent automation while maintaining human oversight.

### Why VALORA?

**Intelligent Orchestration**: VALORA coordinates **11 specialised AI agents**, from **@lead** technical oversight to **@secops-engineer** compliance, ensuring the right expert is assigned to every task.

**Three-Tier Flexibility**: The engine adapts to your resources, offering **MCP Sampling**, **Guided Completion**, or **API Fallback** modes.

**Phased Governance**: Every project follows a rigorous **8-phase lifecycle**, moving from initialisation and planning through implementation to validation and PR creation.

**Strategic Optimisation**: To balance depth and speed, VALORA assigns specific LLMs (like **GPT-5** for planning or **Claude Haiku** for validation) based on the task's complexity.

> VALORA is not a replacement for the developer; it is the high-fidelity instrument through which the developer conducts a full symphony of AI agents.

## ✨ Features

<table width="100%">
<tr valign="top">
<td width="50%">

### 🤖 Multi-Agent Collaboration

**11 specialised AI agents** with distinct expertise:

- **@lead** — Technical oversight & architecture
- **@product-manager** — Requirements & prioritisation
- **@software-engineer-\*** — Implementation specialists
- **@platform-engineer** — Infrastructure & DevOps
- **@qa** — Testing & quality assurance
- **@secops-engineer** — Security & compliance
- **@ui-ux-designer** — Design & accessibility

</td>
<td width="50%">

### ⚡ Three-Tier Execution

Flexible execution modes for every use case:

| Tier | Mode              | Cost        |
| ---- | ----------------- | ----------- |
| 1    | MCP Sampling      | Free\*      |
| 2    | Guided Completion | Free        |
| 3    | API Fallback      | Pay-per-use |

_\*When available in Cursor_

**Zero configuration required** — works immediately with your Cursor subscription.

</td>
</tr>
<tr valign="top">
<td width="50%">

### 💎 Model Optimisation

Strategic AI model assignment for cost efficiency:

| Model              | Use Case                |
| ------------------ | ----------------------- |
| **GPT-5 Thinking** | Deep analysis, planning |
| **Claude Sonnet**  | Implementation, reviews |
| **Claude Haiku**   | Fast tasks, validation  |

**31% strategic • 31% execution • 38% fast**

</td>
<td width="50%">

### 🔒 Security & Compliance

Enterprise-grade security controls:

- **Supply Chain Hardening** — Frozen lockfile, blocked install scripts, vulnerability overrides, Dependabot
- **User Approval Flow** — Interactive consent before connections
- **Risk Assessment** — Low/Medium/High/Critical classification
- **Tool Filtering** — Allowlist and blocklist per server
- **Audit Logging** — Complete operation trail
- **Session Caching** — Remember approvals per session

</td>
</tr>
<tr valign="top">
<td width="50%">

### 🌳 Worktree Dashboard & Statistics

Live visibility into parallel explorations:

- **Worktree Diagram Panel** — Real-time tree view of git worktrees in the `valora dash` dashboard
- **Exploration Status** — Color-coded branches with status icons (▶ running, ✓ completed, ✗ failed)
- **Session-Exploration Linking** — Explorations create linked sessions; the dashboard shows exploration details (task, worktrees, status) in the session details view
- **Worktree Usage Stats** — Per-session tracking of worktree creation, concurrency, and duration

```plaintext
┌─ Git Worktrees (3) ──────────┐
│ ● main  abc1234              │
│ ├── exploration/exp-abc-jwt  │
│ │   def5678  ▶ RUNNING       │
│ └── feature/new-api          │
│     ghi9012                  │
└──────────────────────────────┘
```

</td>
<td width="50%">

### 🔌 External MCP Integration

Connect to **15 external MCP servers** with user approval:

| Category       | Servers                                   |
| -------------- | ----------------------------------------- |
| Browser/Test   | Playwright, Chrome DevTools, BrowserStack |
| Design         | Figma, Storybook                          |
| Development    | GitHub, Serena, Context7                  |
| Infrastructure | Terraform, Firebase, Google Cloud         |
| Data           | MongoDB, Elastic                          |
| Observability  | Grafana, DeepResearch                     |

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+

### Installation

```bash
# Install globally
pnpm add -g @windagency/valora          # pnpm
yarn global add @windagency/valora      # yarn
npm install -g @windagency/valora       # npm

# Verify installation
valora --version
# Should output: 2.2.1
```

### Project Setup

Initialise VALORA in your project:

```bash
cd your-project
valora init         # Minimal setup (.valora/config.json)
valora init --full  # Full setup with override directories
```

### Your First Command

```bash
# Create an implementation plan
valora plan "Add user authentication with OAuth"
```

The engine will:

1. Select the appropriate agent (`@lead`)
2. Gather codebase context
3. Generate a detailed implementation plan
4. Provide step-by-step guidance

### Zero-Config Usage with Cursor subscription

No API keys? No problem. The engine works immediately using **Guided Completion Mode**:

```bash
valora plan "Add dark mode toggle"
# → Generates structured prompt for Cursor AI
# → Uses your Cursor subscription (free)
```

### Optional: API Configuration

For fully autonomous execution:

```bash
valora config setup --quick

# Or set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

---

## 🏗️ Architecture

```plaintext
┌─────────────────────────────────────────────────────────────────────────┐
│                                 VALORA                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │ CLI Layer   │  │ Orchestrator │  │ Agent Layer │  │ LLM Layer   │   │
│   │             │──│              │──│             │──│             │   │
│   │ • Commands  │  │ • Pipeline   │  │ • Registry  │  │ • Anthropic │   │
│   │ • Wizard    │  │ • Executor   │  │ • Selection │  │ • OpenAI    │   │
│   │ • Output    │  │ • Context    │  │ • Loading   │  │ • Google    │   │
│   └─────────────┘  └──────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │ Session     │  │ Config       │  │ MCP         │  │ Services    │   │
│   │             │  │              │  │             │  │             │   │
│   │ • State     │  │ • Loader     │  │ • Server    │  │ • Logging   │   │
│   │ • Context   │  │ • Schema     │  │ • Tools     │  │ • Cleanup   │   │
│   │ • History   │  │ • Providers  │  │ • Prompts   │  │ • Utils     │   │
│   └─────────────┘  └──────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle         | Implementation                                      |
| ----------------- | --------------------------------------------------- |
| **Modularity**    | Loosely coupled components with clear interfaces    |
| **Extensibility** | Plugin architecture for agents, commands, providers |
| **Testability**   | Comprehensive test suites (unit, integration, e2e)  |
| **Observability** | Structured logging and session tracking             |
| **Resilience**    | Graceful fallbacks and error recovery               |

---

## 📋 Commands

### Complete Command Reference

| Command             | Agent            | Description                            |
| ------------------- | ---------------- | -------------------------------------- |
| `refine-specs`      | @product-manager | Collaboratively refine specifications  |
| `create-prd`        | @product-manager | Generate Product Requirements Document |
| `create-backlog`    | @product-manager | Decompose PRD into tasks               |
| `fetch-task`        | @product-manager | Retrieve next priority task            |
| `refine-task`       | @product-manager | Clarify task requirements              |
| `gather-knowledge`  | @lead            | Analyse codebase context               |
| `plan`              | @lead            | Create implementation plan             |
| `review-plan`       | @lead            | Validate plan quality                  |
| `implement`         | Dynamic          | Execute code changes                   |
| `assert`            | @asserter        | Validate implementation                |
| `test`              | @qa              | Execute test suites                    |
| `review-code`       | @lead            | Code quality review                    |
| `review-functional` | @lead            | Functional review                      |
| `commit`            | @lead            | Create conventional commits            |
| `create-pr`         | @lead            | Generate pull request                  |
| `feedback`          | @product-manager | Capture outcomes                       |

### Command Categories

```plaintext
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Planning            │  │ Implementation      │  │ Delivery            │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ • refine-specs      │  │ • implement         │  │ • commit            │
│ • create-prd        │  │ • assert            │  │ • create-pr         │
│ • plan              │  │ • test              │  │ • feedback          │
│ • review-plan       │  │ • review-code       │  │                     │
│ • gather-knowledge  │  │ • review-functional │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## 📚 Documentation

<table width="100%">
<tr valign="top">
<td align="center" width="33%">
<h3>👤 User Guide</h3>
<p>Getting started, workflows,<br>and daily usage</p>
<a href="./documentation/user-guide/README.md">
<img src="https://img.shields.io/badge/Read-User%20Guide-6366f1?style=for-the-badge" alt="User Guide" />
</a>
</td>
<td align="center" width="33%">
<h3>💻 Developer Guide</h3>
<p>Architecture, codebase,<br>and contributions</p>
<a href="./documentation/developer-guide/README.md">
<img src="https://img.shields.io/badge/Read-Developer%20Guide-10b981?style=for-the-badge" alt="Developer Guide" />
</a>
</td>
<td align="center" width="33%">
<h3>🏛️ Architecture</h3>
<p>System design<br>and decisions</p>
<a href="./documentation/architecture/README.md">
<img src="https://img.shields.io/badge/Read-Architecture-f59e0b?style=for-the-badge" alt="Architecture" />
</a>
</td>
</tr>
</table>

### Documentation Structure

```plaintext
documentation/
├── README.md                    # Documentation entry point
├── user-guide/                  # For users
│   ├── quick-start.md           # 5-minute getting started
│   ├── workflows.md             # Common patterns
│   └── commands.md              # Command reference
├── developer-guide/             # For developers
│   ├── setup.md                 # Development environment
│   ├── codebase.md              # Code structure
│   └── contributing.md          # How to contribute
├── architecture/                # For architects
│   ├── system-architecture.md   # C4 diagrams
│   ├── components.md            # Component design
│   └── data-flow.md             # Data flow patterns
└── adr/                         # Decision records
    ├── 001-multi-agent-architecture.md
    ├── ...
    ├── 008-pretooluse-cli-enforcement.md
    └── 009-supply-chain-hardening.md
```

---

## 🎯 Use Cases

### New Feature Development

```bash
valora refine-specs "User authentication with OAuth"
valora create-prd
valora create-backlog
valora fetch-task && valora plan
valora implement
valora review-code && valora commit
valora create-pr
```

### Bug Fix Workflow

```bash
valora plan "Fix: Login timeout issue"
valora implement
valora test --type=all
valora commit --scope=fix
```

### Code Review

```bash
valora review-code --focus=security
valora review-functional --check-a11y=true
```

---

## 🔧 Project Structure

```plaintext
valora/                          # npm package root
├── bin/                         # CLI entry points
│   ├── valora.js                # Main CLI
│   └── mcp.js                   # MCP server
├── src/                         # TypeScript source
│   ├── cli/                     # Command-line interface
│   ├── config/                  # Configuration management
│   ├── executor/                # Pipeline execution
│   ├── llm/                     # LLM provider integrations
│   ├── mcp/                     # MCP server implementation
│   ├── session/                 # Session management
│   │   └── worktree-stats-tracker.ts  # Worktree usage statistics
│   ├── ui/                      # Terminal UI (dashboard, panels)
│   ├── utils/                   # Utilities & path resolution
│   └── ...
├── data/                        # Built-in resources (shipped with package)
│   ├── agents/                  # Agent definitions (11 agents)
│   ├── commands/                # Command specifications (24 commands)
│   ├── prompts/                 # Structured prompts by phase
│   ├── templates/               # Document templates
│   ├── hooks/                   # Hook scripts
│   ├── config.default.json      # Default configuration
│   ├── hooks.default.json       # Default hooks config
│   └── external-mcp.default.json # External MCP server registry
├── dist/                        # Compiled output (gitignored)
├── tests/                       # Test suites
├── documentation/               # Comprehensive docs
└── package.json
```

### Project-Level Overrides (`.valora/`)

When installed in a project, VALORA supports a `.valora/` directory for local overrides:

```plaintext
.valora/                         # Project-specific configuration
├── config.json                  # Project settings (overrides defaults)
├── agents/                      # Custom/override agent definitions
├── commands/                    # Custom/override command specs
├── prompts/                     # Custom/override prompts
├── templates/                   # Custom/override templates
├── sessions/                    # Session state (gitignored)
├── logs/                        # Execution logs (gitignored)
└── cache/                       # Cache data (gitignored)
```

Resources in `.valora/` take precedence over built-in `data/` resources.

---

## 🌟 Why VALORA?

<table width="100%">
<tr valign="top">
<td>

### Traditional Development

- ❌ Context switching between tools
- ❌ Manual documentation
- ❌ Inconsistent code reviews
- ❌ Repetitive commit messages
- ❌ Time-consuming PR creation

</td>
<td>

### With AI Orchestration

- ✅ Unified workflow automation
- ✅ Auto-generated documentation
- ✅ Comprehensive AI-powered reviews
- ✅ Intelligent commit messages
- ✅ One-command PR creation

</td>
</tr>
</table>

### Innovation Highlights

| Innovation                    | Impact                                         |
| ----------------------------- | ---------------------------------------------- |
| **Multi-Agent Orchestration** | Specialised agents produce expert-level output |
| **Three-Tier Execution**      | Flexibility from free to fully automated       |
| **Session Persistence**       | Context flows naturally between commands       |
| **Dynamic Agent Selection**   | Right expert for every task                    |
| **Quality Gates**             | Multiple checkpoints prevent technical debt    |

---

## 🛠️ Technology Stack

| Category            | Technologies                                     |
| ------------------- | ------------------------------------------------ |
| **Runtime**         | Node.js 18+, TypeScript 5.x                      |
| **Package Manager** | pnpm 10.x                                        |
| **Build**           | tsc, tsc-alias                                   |
| **Testing**         | Vitest, Playwright                               |
| **LLM SDKs**        | @anthropic-ai/sdk, openai, @google/generative-ai |
| **CLI UI**          | Ink (React), Chalk, Commander                    |
| **Validation**      | Zod                                              |
| **MCP**             | @modelcontextprotocol/sdk                        |

---

## 📄 Licence

MIT © Damien TIVELET

---

<p align="center">
  <a href="./documentation/user-guide/quick-start.md">Get Started</a> •
  <a href="./documentation/developer-guide/contributing.md">Contribute</a> •
  <a href="./documentation/architecture/README.md">Learn More</a>
</p>
