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
  <img src="https://img.shields.io/badge/version-1.0.0--alpha.1-blue?style=flat-square" alt="Version" />
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

<table>
<tr valign="top">
<td width="50%">

### 🤖 Multi-Agent Collaboration

**11 specialised AI agents** with distinct expertise:

- **@lead** — Technical oversight & architecture
- **@product-manager** — Requirements & prioritisation
- **@software-engineer-*** — Implementation specialists
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
| 1    | MCP Sampling      | Free*       |
| 2    | Guided Completion | Free        |
| 3    | API Fallback      | Pay-per-use |

*\*When available in Cursor*

**Zero configuration required** — works immediately with your Cursor subscription.

</td>
</tr>
<tr valign="top">
<td width="50%">

### 🔄 8-Phase Development Lifecycle

Complete workflow automation:

```plaintext
Initialisation → Task Prep → Planning
      ↓
Implementation → Validation → Review
      ↓
Commit & PR → Feedback Loop
```

Each phase has dedicated commands and agents optimised for the task.

</td>
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
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- Docker
- ou
  - Node.js 20+
  - pnpm 10.x

### Installation

```bash
# Navigate to the engine directory
cd .ai/.bin

# Install dependencies
pnpm install

# Build the project
pnpm build

# Install globally
pnpm link

# Verify installation
valora --version
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

<table>
<tr valign="top">
<td align="center" width="33%">
<h3>👤 User Guide</h3>
<p>Getting started, workflows,<br>and daily usage</p>
<a href="./.ai/documentation/user-guide/README.md">
<img src="https://img.shields.io/badge/Read-User%20Guide-6366f1?style=for-the-badge" alt="User Guide" />
</a>
</td>
<td align="center" width="33%">
<h3>💻 Developer Guide</h3>
<p>Architecture, codebase,<br>and contributions</p>
<a href="./.ai/documentation/developer-guide/README.md">
<img src="https://img.shields.io/badge/Read-Developer%20Guide-10b981?style=for-the-badge" alt="Developer Guide" />
</a>
</td>
<td align="center" width="33%">
<h3>🏛️ Architecture</h3>
<p>System design<br>and decisions</p>
<a href="./.ai/documentation/architecture/README.md">
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
    ├── 002-three-tier-execution.md
    ├── 003-session-based-state.md
    ├── 004-pipeline-execution-model.md
    └── 005-llm-provider-abstraction.md
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
.ai/
├── .bin/                        # TypeScript implementation
│   ├── dist/                    # Built artefacts
│   ├── src/                     # Source code
│   └── tests/                   # Test suites
├── agents/                      # Agent definitions (11 agents)
│   ├── registry.json            # Agent definitions
│   ├── lead.md
│   ├── product-manager.md
│   ├── software-engineer-*.md
│   └── ...
├── commands/                    # Command specifications (16 commands)
│   ├── registry.json            # Command definitions
│   ├── implement.md
│   ├── plan.md
│   └── ...
├── documentation/               # Comprehensive docs
├── logs/                        # Execution logs
├── prompts/                     # Structured prompts by phase
│   ├── 01_onboard/
│   ├── 02_context/
│   ├── 03_plan/
│   └── ...
├── sessions/                    # Persistent session state
├── templates/                   # Document templates
└── config.json                  # Engine configuration
```

---

## 🌟 Why VALORA?

<table>
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

## 🚧 Future Improvements

There are still many improvements to be made. Contributions and suggestions are welcome!

### Token & Context Management
- Reducing prompt sizes for efficiency
- Memory management optimisation
- Distributing context window occupancy across agents

### Metrics & Observability
- Token usage tracking per agent/command
- Execution time metrics
- Cost analysis dashboards

### UI & CLI Experience
- Buffer management improvements
- Animations and visual feedback
- Making the CLI fully autonomous
- Enhanced progress indicators

### Agent & Command System
- Ability to add custom agents dynamically
- Override existing agent behaviours
- Plugin system for third-party commands
- Hot-reload for agent definitions

> Have ideas or suggestions? Contributions are welcome!

---

## 🛠️ Technology Stack

| Category            | Technologies                                         |
| ------------------- | ---------------------------------------------------- |
| **Runtime**         | Node.js 18+, TypeScript 5.x                          |
| **Package Manager** | pnpm 10.x                                            |
| **Build**           | tsc, tsc-alias                                       |
| **Testing**         | Vitest, Playwright                                   |
| **LLM SDKs**        | @anthropic-ai/sdk, openai, @google/generative-valora |
| **CLI UI**          | Ink (React), Chalk, Commander                        |
| **Validation**      | Zod                                                  |
| **MCP**             | @modelcontextprotocol/sdk                            |

---

## 📄 Licence

MIT © Damien TIVELET

---

<p align="center">
  <a href="./.ai/documentation/user-guide/quick-start.md">Get Started</a> •
  <a href="./.ai/documentation/developer-guide/contributing.md">Contribute</a> •
  <a href="./.ai/documentation/architecture/README.md">Learn More</a>
</p>
