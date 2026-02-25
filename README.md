<p align="center">
  <img src="https://img.shields.io/badge/VALORA-6366f1?style=for-the-badge&logo=openai&logoColor=white" alt="VALORA" />
</p>

<h2 align="center">Orchestrated AI for Building Software, Safely, Predictably, at Scale</h2>

<p align="center">
  <q><i>The future of software development is not about replacing developers, but amplifying their capabilities with intelligent AI collaboration.</i></q>
</p>

<p align="center">
  <a href="#️-about-valora">About</a> •
  <a href="#-the-valora-approach">Approach</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-commands">Commands</a> •
  <a href="#-use-cases">Use Cases</a> •
  <a href="#-documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node" />
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <br>
  <img src="https://img.shields.io/badge/Anthropic-Claude-d97706?style=flat-square" alt="Anthropic" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--5-412991?style=flat-square" alt="OpenAI" />
  <img src="https://img.shields.io/badge/Google-Gemini-4285f4?style=flat-square" alt="Google" />
  <img src="https://img.shields.io/badge/Cursor-MCP-000000?style=flat-square" alt="Cursor" />
</p>

---

## 🏛️ About VALORA

**VALORA (Versatile Agent Logic for Orchestrated Response Architecture)** is a next-generation TypeScript-based platform designed to orchestrate a sophisticated network of AI agents to automate the complete software development lifecycle. 
VALORA is an **AI orchestration engine for software development**.

It doesn’t try to replace developers or magically “write the whole app for you”.  
Instead, it **coordinates multiple specialised AI agents across the entire development lifecycle**, while keeping humans firmly in control.

Think of VALORA as **a development operating system for AI-assisted engineering**.

Where most AI tools help you write _code_, VALORA helps you deliver _software_.  
VALORA is not about writing more code faster. It’s about:

- Making **better decisions earlier**
- Capturing knowledge automatically
- **Scaling engineering quality** with AI
- Turning AI from a tool into an **operating model**

### Why VALORA?

**Intelligent Orchestration**: VALORA coordinates **11 specialised AI agents**, from **@product-manager** functional oversight to **@secops-engineer** compliance, ensuring the right expert is assigned to every task.

**Three-Tier Flexibility**: The engine adapts to your resources, offering **MCP Sampling**, **Guided Completion**, or **API Fallback** modes.

**Phased Governance**: Every project follows a rigorous **8-phase lifecycle**, moving from initialisation and planning through implementation to validation and PR creation.

**Strategic Optimisation**: To balance depth and speed, VALORA assigns specific LLMs (like **GPT-5** for planning or **Claude Haiku** for execution) based on the task's complexity.

> VALORA is not a replacement for the developer; it is the high-fidelity instrument through which the developer conducts a full symphony of AI agents.

### The Problem VALORA Solves

Modern software delivery is broken in subtle but expensive ways:

- AI tools are **stateless**, they forget decisions
- Planning happens in docs, execution happens in code, reviews happen in PRs
- Governance, security, and quality are bolted on late
- Developers spend time *re-explaining context* instead of building

AI makes typing faster. But **coordination, risk, and rework still dominate cost**.

## ✨ The VALORA Approach

VALORA treats software development like a **repeatable, governed workflow**, not a sequence of prompts.

<table width="100%">
<tr valign="top">
<td width="50%">

### 🤖 Multi-Agent Collaboration

**11 specialised AI agents** with distinct expertise:

- **@product-manager** — Requirements & prioritisation
- **@ui-ux-designer** — Design & accessibility
- **@lead** — Technical oversight & architecture
- **@platform-engineer** — Infrastructure & DevOps
- **@software-engineer-*** — Implementation specialists
- **@secops-engineer** — Security & compliance
- **@qa** — Testing & quality assurance

</td>
<td width="50%">

### 👤 Human-in-the-Loop by Design

When decisions matter, VALORA **stops and asks you**:

- Clarifies requirements
- Surfaces risks
- Captures trade-offs
- Escalation criteria
- Documents decisions automatically

Those decisions are written into plans, specs, and docs, permanently.

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
| **Claude Haiku**   | Fast tasks, execution   |

**31% strategic • 31% execution • 38% fast**  

</td>
</tr>
<tr valign="top">
<td width="50%">

### 🔌 External MCP Integration

Connect to **15 external MCP servers** with:

- Explicit user approval
- Risk classification
- Audit logs

Nothing runs silently. Nothing runs unchecked.

| Category       | Servers                                   |
| -------------- | ----------------------------------------- |
| Browser/Test   | Playwright, Chrome DevTools, BrowserStack |
| Design         | Figma, Storybook                          |
| Development    | GitHub, Serena, Context7                  |
| Infrastructure | Terraform, Firebase, Google Cloud         |
| Data           | MongoDB, Elastic                          |
| Observability  | Grafana, DeepResearch                     |

</td>
<td width="50%">

### 🔒 Security & Compliance

Enterprise-grade security controls:

- **User Approval Flow** — Interactive consent before connections
- **Risk Assessment** — Low/Medium/High/Critical classification
- **Tool Filtering** — Allowlist and blocklist per server
- **Audit Logging** — Complete operation trail
- **Session Caching** — Remember approvals per session

</td>
</tr>
</table>

## What You Can Actually Do With VALORA

### 📝 Define & Refine Requirements (Before Anything Breaks)

```bash
valora refine-specs "Add OAuth authentication"
```

- Clarifies requirements through structured questions  
- Captures your answers as explicit decisions  
- Produces a clean, shared understanding of *what* to build  

```bash
valora create-prd
```

- Generates a full Product Requirements Document (PRD)
- Identifies edge cases, constraints, and open questions
- Ensures product, tech, and business are aligned early

```bash
valora create-backlog
```

- Breaks the PRD into prioritised, actionable tasks
- Establishes clear scope boundaries
- Prevents “hidden work” from surfacing mid-implementation

```bash
valora refine-task
```

- Pulls the next highest-priority task
- Refines acceptance criteria and implementation expectations
- Locks clarity *before* planning or coding begins

### ✨ Plan Before You Code

```bash
valora plan
```

- Analyses your codebase
- Identifies risks and dependencies
- Produces a clear, reviewable implementation plan

### 🧱 Build With Context

```bash
valora implement
```

- Uses the approved plan
- Maintains architectural consistency
- Applies project conventions automatically

### 🧪 Validate Continuously

```bash
valora assert
valora test
valora review-code
```

- Automated checks
- AI-assisted reviews
- Human oversight where it matters

### 🚀 Deliver Cleanly

```bash
valora commit
valora create-pr
```

- Conventional commits
- Clear PR descriptions
- Full traceability back to requirements

## 🚀 Quick Start

### Prerequisites

<table width="100%">
<tr valign="top">
<td width="50%">

**Option 1: devcontainer (Recommended)**
- Containerised application runner  
  _(e.g., Docker, Rancher, Podman)_

> **Image Details:**
> - Base: `node:22.21.0-alpine` (multi-stage build)
> - Size: optimized with layer caching
> - Security: Non-root user, dumb-init, latest security updates
> - Health check: Built-in endpoint monitoring

</td>
<td width="50%">

Option 2: Local Development
- Node.js 22.21.0+ (managed via Volta)
- pnpm 10.19.0 (enabled via Corepack)

</td>
</tr>
</table>

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

# Set up
valora config setup
```

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

## 🛠️ Technology Stack

| Category            | Technologies                                     |
| ------------------- | ------------------------------------------------ |
| **Runtime**         | Node.js 22.21.0+, TypeScript 5.x                 |
| **Package Manager** | pnpm 10.19.0 (via Corepack)                      |
| **Build**           | tsc, tsc-alias                                   |
| **Testing**         | Vitest, Playwright, Testcontainers               |
| **LLM SDKs**        | @anthropic-ai/sdk, openai, @google/generative-ai |
| **CLI UI**          | Ink (React), Chalk, Commander                    |
| **Validation**      | Zod                                              |
| **MCP**             | @modelcontextprotocol/sdk                        |
| **Deployment**      | Docker (multi-stage), Cloud Run compatible       |

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

## 📚 Documentation

<table width="100%">
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
├── config.json                  # Engine configuration
└── external-mcp.json            # External MCP server registry
```

## 🌟 Why VALORA?

<table width="100%">
<tr valign="top">
<td>

**Traditional Development**  

- ❌ Context switching between tools
- ❌ Manual documentation
- ❌ Inconsistent code reviews
- ❌ Repetitive commit messages
- ❌ Time-consuming PR creation

</td>
<td>

**With AI Orchestration**  

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

### What Makes VALORA Different

| Traditional AI Tools | VALORA                  |
| -------------------- | ----------------------- |
| Prompt-based         | Process-driven          |
| Stateless            | Persistent memory       |
| Single-model         | Multi-agent             |
| Code-focused         | Lifecycle-focused       |
| Fast but risky       | Fast **and** controlled |

VALORA optimises **outcomes**, not just outputs.

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

## 📄 Licence

MIT © Damien TIVELET

---

<p align="center">
  <a href="./.ai/documentation/user-guide/quick-start.md">Get Started</a> •
  <a href="./.ai/documentation/developer-guide/contributing.md">Contribute</a> •
  <a href="./.ai/documentation/architecture/README.md">Learn More</a>
</p>
