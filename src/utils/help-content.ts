/**
 * Centralized help content for all commands with structured metadata
 */

export interface CommandExample {
	code: string;
	description: string;
}

export interface CommandHelp {
	agent: string;
	description: string;
	examples: CommandExample[];
	name: string;
	options: CommandOption[];
	relatedCommands: string[];
	subcommands?: SubcommandHelp[];
	workflowPhase: string;
}

export interface CommandOption {
	default?: string;
	description: string;
	flag: string;
}

export interface GlobalFlagHelp {
	category: string;
	default?: string;
	description: string;
	flag: string;
}

export interface SubcommandHelp {
	description: string;
	examples?: CommandExample[];
	name: string;
	options?: CommandOption[];
}

/**
 * Workflow phase definitions with color codes
 */
export const WORKFLOW_PHASES = {
	finalize: { color: 'magenta', icon: '🟣', name: 'Finalize' },
	implement: { color: 'green', icon: '🟢', name: 'Implement' },
	initialize: { color: 'cyan', icon: '🔷', name: 'Initialize' },
	learn: { color: 'blue', icon: '🔄', name: 'Learn' },
	prepare: { color: 'yellow', icon: '🔮', name: 'Prepare Task' },
	review: { color: 'red', icon: '🔴', name: 'Review' },
	system: { color: 'gray', icon: '🔧', name: 'System' },
	test: { color: 'yellow', icon: '🟡', name: 'Validate' },
	workflow: { color: 'white', icon: '⚙️', name: 'Workflow' }
} as const;

/**
 * Global flags available to all commands
 */
export const GLOBAL_FLAGS: GlobalFlagHelp[] = [
	// Core Execution
	{ category: 'Core', default: 'true', description: 'Enable interactive mode with prompts', flag: '--interactive' },
	{ category: 'Core', description: 'Disable interactive mode', flag: '--no-interactive' },
	{ category: 'Core', description: 'Resume or use specific session', flag: '--session-id <id>' },
	{ category: 'Core', description: 'Override default AI model', flag: '--model <name>' },
	{ category: 'Core', description: 'Override default LLM provider', flag: '--provider <name>' },
	{ category: 'Core', description: 'Override default AI model mode', flag: '--mode <mode>' },
	{ category: 'Core', description: 'Override default agent', flag: '--agent <role>' },

	// Output & Logging
	{ category: 'Output', description: 'Enable verbose output', flag: '-v, --verbose' },
	{ category: 'Output', description: 'Suppress non-essential output', flag: '-q, --quiet' },
	{ category: 'Output', description: 'Set log level (debug, info, warn, error)', flag: '--log-level <level>' },
	{ category: 'Output', description: 'Output format (markdown, json, yaml)', flag: '--output <format>' },
	{
		category: 'Output',
		description: 'Preview changes without executing (shows diffs, commands, cost estimates)',
		flag: '-n, --dry-run'
	},

	// Document Output
	{ category: 'Document', description: 'Disable document output to knowledge-base', flag: '--no-document-output' },
	{ category: 'Document', description: 'Auto-approve document creation', flag: '--document-auto-approve' },
	{
		category: 'Document',
		description: 'Override document category (root, backend, frontend, infrastructure)',
		flag: '--document-category <category>'
	},
	{ category: 'Document', description: 'Custom output path for document', flag: '--document-path <path>' },

	// Log Retention
	{ category: 'Log Retention', description: 'Enable log retention cleanup', flag: '--retention-enabled' },
	{ category: 'Log Retention', description: 'Disable log retention cleanup', flag: '--no-retention' },
	{ category: 'Log Retention', description: 'Override logs directory path', flag: '--logs-path <path>' },
	{ category: 'Log Retention', description: 'Maximum age for log files in days', flag: '--max-age <days>' },
	{ category: 'Log Retention', description: 'Maximum total log size in MB', flag: '--max-size <mb>' },
	{ category: 'Log Retention', description: 'Maximum number of log files', flag: '--max-files <count>' },
	{ category: 'Log Retention', description: 'Compress logs after N days', flag: '--compress-after <days>' },
	{ category: 'Log Retention', description: 'Run cleanup every N hours', flag: '--cleanup-interval <hours>' },
	{ category: 'Log Retention', description: 'Preview retention actions', flag: '--retention-dry-run' },

	// Session Retention
	{
		category: 'Session Retention',
		description: 'Enable session retention cleanup',
		flag: '--session-retention-enabled'
	},
	{ category: 'Session Retention', description: 'Disable session retention cleanup', flag: '--no-session-retention' },
	{ category: 'Session Retention', description: 'Maximum age for sessions in days', flag: '--session-max-age <days>' },
	{ category: 'Session Retention', description: 'Maximum total sessions size in MB', flag: '--session-max-size <mb>' },
	{ category: 'Session Retention', description: 'Maximum number of sessions', flag: '--session-max-count <count>' },
	{
		category: 'Session Retention',
		description: 'Compress sessions after N days',
		flag: '--session-compress-after <days>'
	},
	{
		category: 'Session Retention',
		description: 'Run session cleanup every N hours',
		flag: '--session-cleanup-interval <hours>'
	},
	{
		category: 'Session Retention',
		description: 'Preview session retention actions',
		flag: '--session-retention-dry-run'
	},

	// Isolation & Testing
	{ category: 'Isolation', description: 'Execute only specific stage(s)', flag: '--stage <stage>' },
	{ category: 'Isolation', description: 'Skip pipeline validation', flag: '--skip-validation' },
	{ category: 'Isolation', description: 'Provide mock inputs as JSON', flag: '--mock-inputs <json>' },
	{ category: 'Isolation', description: 'Override stage requirements', flag: '--force-required' },
	{ category: 'Isolation', description: 'Execute in complete isolation mode', flag: '--isolated' },

	// UI & Progress
	{ category: 'UI', description: 'Launch interactive command wizard', flag: '--wizard' },
	{
		category: 'UI',
		default: 'simple',
		description: 'Progress display mode (rich, simple, off)',
		flag: '--progress <mode>'
	},
	{ category: 'UI', description: 'Display real-time activity feed', flag: '--show-activity' },
	{ category: 'UI', description: 'Save activity log to file', flag: '--save-activity <file>' }
];

/**
 * Get global flags grouped by category
 */
export function getGlobalFlagsByCategory(): Record<string, GlobalFlagHelp[]> {
	return GLOBAL_FLAGS.reduce<Record<string, GlobalFlagHelp[]>>((grouped, flag) => {
		const existing = grouped[flag.category];
		if (existing) {
			existing.push(flag);
		} else {
			grouped[flag.category] = [flag];
		}
		return grouped;
	}, {});
}

/**
 * Command help content for all commands
 */
export const COMMAND_HELP: Record<string, CommandHelp> = {
	assert: {
		agent: '@asserter',
		description:
			'Validate implementation completeness, correctness, and compliance before testing phase through static analysis and requirements verification',
		examples: [
			{
				code: 'valora assert',
				description: 'Validate all recent changes'
			},
			{
				code: 'valora assert --severity=critical',
				description: 'Check only critical issues'
			},
			{
				code: 'valora assert --report-format=detailed',
				description: 'Generate detailed assertion report'
			},
			{
				code: 'valora assert --quick=typescript',
				description: 'Quick TypeScript validation (~2 min)'
			},
			{
				code: 'valora assert --quick=all',
				description: 'All quick templates (~5 min)'
			}
		],
		name: 'assert',
		options: [
			{
				description: 'Filter by severity level',
				flag: '--severity <level>'
			},
			{
				default: 'structured',
				description: 'Report output format',
				flag: '--report-format <format>'
			},
			{
				description: 'Quick template validation (completeness, security, typescript, all)',
				flag: '--quick <template>'
			}
		],
		relatedCommands: ['test', 'review-code', 'implement'],
		workflowPhase: 'test'
	},

	commit: {
		agent: '@lead',
		description:
			'Analyze changes and create atomic, conventional commits with intelligent message generation, version management, changelog updates, and quality insights',
		examples: [
			{
				code: 'valora commit',
				description: 'Generate conventional commit message'
			},
			{
				code: 'valora commit --scope=auth',
				description: 'Commit with specific scope'
			},
			{
				code: 'valora commit --breaking',
				description: 'Mark as breaking change'
			},
			{
				code: 'valora commit --version-bump=minor',
				description: 'Bump version and update changelog'
			}
		],
		name: 'commit',
		options: [
			{
				description: 'Scope of changes',
				flag: '--scope <area>'
			},
			{
				description: 'Mark as breaking change',
				flag: '--breaking'
			},
			{
				description: 'Custom commit message',
				flag: '--message <text>'
			},
			{
				description: 'Version bump strategy',
				flag: '--version-bump <type>'
			}
		],
		relatedCommands: ['review-code', 'test', 'create-pr'],
		workflowPhase: 'finalize'
	},

	'create-backlog': {
		agent: '@product-manager',
		description: 'Decompose Product Requirements Document into prioritized, actionable task backlog',
		examples: [
			{
				code: 'valora create-backlog',
				description: 'Create backlog from PRD in session'
			},
			{
				code: 'valora create-backlog --prd-file=./docs/prd.md',
				description: 'Create backlog from specific PRD file'
			},
			{
				code: 'valora create-backlog --granularity=fine',
				description: 'Create fine-grained tasks'
			}
		],
		name: 'create-backlog',
		options: [
			{
				description: 'Path to PRD file',
				flag: '--prd-file <path>'
			},
			{
				default: 'medium',
				description: 'Task granularity level',
				flag: '--granularity <level>'
			},
			{
				default: 'markdown',
				description: 'Output format',
				flag: '--format <format>'
			}
		],
		relatedCommands: ['create-prd', 'fetch-task', 'refine-task', 'generate-docs'],
		workflowPhase: 'initialize'
	},

	'create-pr': {
		agent: '@lead',
		description:
			'Generate and submit pull requests with intelligent title/description generation, automated reviewer assignment, label management, and quality validation',
		examples: [
			{
				code: 'valora create-pr',
				description: 'Create PR with auto-generated content'
			},
			{
				code: 'valora create-pr --draft',
				description: 'Create draft PR'
			},
			{
				code: 'valora create-pr --reviewers=john,jane',
				description: 'Assign specific reviewers'
			},
			{
				code: 'valora create-pr --link-issues',
				description: 'Auto-link related issues'
			}
		],
		name: 'create-pr',
		options: [
			{
				description: 'Custom PR title',
				flag: '--title <text>'
			},
			{
				description: 'Create as draft',
				flag: '--draft'
			},
			{
				description: 'Base branch',
				flag: '--base <branch>'
			},
			{
				description: 'Assign reviewers',
				flag: '--reviewers <users>'
			},
			{
				description: 'Add labels',
				flag: '--labels <labels>'
			}
		],
		relatedCommands: ['commit', 'review-code', 'review-functional'],
		workflowPhase: 'finalize'
	},

	'create-prd': {
		agent: '@product-manager',
		description: 'Generate a comprehensive Product Requirements Document from refined specifications',
		examples: [
			{
				code: 'valora create-prd',
				description: 'Generate PRD from specs in session'
			},
			{
				code: 'valora create-prd --specs-file=./specs.md',
				description: 'Generate from specific specs file'
			},
			{
				code: 'valora create-prd --template=technical',
				description: 'Use technical PRD template'
			}
		],
		name: 'create-prd',
		options: [
			{
				description: 'Path to specs file',
				flag: '--specs-file <path>'
			},
			{
				default: 'standard',
				description: 'PRD template type',
				flag: '--template <type>'
			}
		],
		relatedCommands: ['refine-specs', 'create-backlog'],
		workflowPhase: 'initialize'
	},

	feedback: {
		agent: '@product-manager',
		description:
			'Capture outcomes and user feedback to refine agents and prompts through continuous learning and workflow optimization',
		examples: [
			{
				code: 'valora feedback',
				description: 'Provide feedback on last command'
			},
			{
				code: 'valora feedback --command=plan',
				description: 'Feedback on specific command'
			},
			{
				code: 'valora feedback --satisfaction=8',
				description: 'Quick satisfaction rating'
			},
			{
				code: 'valora feedback --interactive',
				description: 'Interactive feedback session'
			}
		],
		name: 'feedback',
		options: [
			{
				description: 'Command to provide feedback on',
				flag: '--command <name>'
			},
			{
				description: 'Satisfaction rating (1-10)',
				flag: '--satisfaction <rating>'
			},
			{
				description: 'Interactive mode',
				flag: '--interactive'
			}
		],
		relatedCommands: [],
		workflowPhase: 'learn'
	},

	'fetch-task': {
		agent: '@product-manager',
		description:
			'Retrieve and contextualize a task from the project backlog - either specified or auto-selected next priority',
		examples: [
			{
				code: 'valora fetch-task',
				description: 'Get next priority task'
			},
			{
				code: 'valora fetch-task --task-id=T-123',
				description: 'Fetch specific task'
			},
			{
				code: 'valora fetch-task --priority=p0',
				description: 'Get highest priority task'
			},
			{
				code: 'valora fetch-task --domain=backend',
				description: 'Get task from specific domain'
			}
		],
		name: 'fetch-task',
		options: [
			{
				description: 'Specific task ID',
				flag: '--task-id <id>'
			},
			{
				description: 'Priority filter',
				flag: '--priority <level>'
			},
			{
				description: 'Domain filter',
				flag: '--domain <type>'
			}
		],
		relatedCommands: ['create-backlog', 'refine-task', 'plan'],
		workflowPhase: 'prepare'
	},

	'gather-knowledge': {
		agent: '@lead',
		description:
			'Analyze codebase, dependencies, patterns, and constraints to build comprehensive technical context for planning or implementation',
		examples: [
			{
				code: 'valora gather-knowledge',
				description: 'Analyze entire project context'
			},
			{
				code: 'valora gather-knowledge --scope=task',
				description: 'Focus on current task context'
			},
			{
				code: 'valora gather-knowledge --domain=backend --depth=deep',
				description: 'Deep analysis of backend'
			}
		],
		name: 'gather-knowledge',
		options: [
			{
				default: 'project',
				description: 'Analysis scope',
				flag: '--scope <level>'
			},
			{
				description: 'Domain to analyze',
				flag: '--domain <type>'
			},
			{
				default: 'shallow',
				description: 'Analysis depth',
				flag: '--depth <level>'
			}
		],
		relatedCommands: ['plan', 'implement'],
		workflowPhase: 'workflow'
	},

	'generate-docs': {
		agent: '@lead',
		description:
			'Generate comprehensive technical documentation across infrastructure, backend, and frontend domains using a 7-stage pipeline',
		examples: [
			{
				code: 'valora generate-docs',
				description: 'Generate all 15 documentation files'
			},
			{
				code: 'valora generate-docs --domain=backend',
				description: 'Generate backend documentation only'
			},
			{
				code: 'valora generate-docs --domain=infrastructure',
				description: 'Generate infrastructure documentation only'
			},
			{
				code: 'valora generate-docs --output-dir=docs/',
				description: 'Output to custom directory'
			},
			{
				code: 'valora generate-docs --quick',
				description: 'Quick template-based generation (~50% faster)'
			},
			{
				code: 'valora generate-docs --extract-only',
				description: 'Run extraction phase only'
			}
		],
		name: 'generate-docs',
		options: [
			{
				default: 'all',
				description: 'Domain to generate (infrastructure, backend, frontend, all)',
				flag: '--domain <domain>'
			},
			{
				description: 'Specific document type (HLD, API, ARCHITECTURE, etc.)',
				flag: '--doc-type <type>'
			},
			{
				default: 'knowledge-base/',
				description: 'Output directory for generated documentation',
				flag: '--output-dir <path>'
			},
			{
				description: 'Use quick templates for faster generation',
				flag: '--quick'
			},
			{
				description: 'Run extraction phase only (generates checklist)',
				flag: '--extract-only'
			}
		],
		relatedCommands: ['create-backlog', 'create-prd', 'fetch-task'],
		workflowPhase: 'initialize'
	},

	implement: {
		agent: '@software-engineer (dynamic)',
		description:
			'Execute code changes following approved implementation plan, including code, tests, and documentation',
		examples: [
			{
				code: 'valora implement',
				description: 'Execute plan from session'
			},
			{
				code: 'valora implement --mode=step-by-step',
				description: 'Execute plan step by step'
			},
			{
				code: 'valora implement --step=3',
				description: 'Execute specific step'
			},
			{
				code: 'valora implement --agent=software-engineer-react',
				description: 'Use specific engineer agent'
			}
		],
		name: 'implement',
		options: [
			{
				description: 'Override agent selection',
				flag: '--agent <type>'
			},
			{
				default: 'standard',
				description: 'Execution mode',
				flag: '--mode <mode>'
			},
			{
				description: 'Execute specific step',
				flag: '--step <number>'
			}
		],
		relatedCommands: ['plan', 'review-plan', 'test', 'assert'],
		workflowPhase: 'implement'
	},

	plan: {
		agent: '@lead',
		description: 'Analyze task and create detailed implementation plan with steps, dependencies, and risk assessment',
		examples: [
			{
				code: 'valora plan "Add user authentication"',
				description: 'Plan a new feature'
			},
			{
				code: 'valora plan "Refactor database layer"',
				description: 'Plan refactoring task'
			},
			{
				code: 'valora plan "Fix login bug" --complexity-threshold=3',
				description: 'Plan with complexity check'
			},
			{
				code: 'valora plan "Add API endpoint" --mode=tiered',
				description: 'Tiered planning (architecture → implementation)'
			},
			{
				code: 'valora plan "Add users API" --pattern=rest-api',
				description: 'Use REST API pattern template'
			},
			{
				code: 'valora plan "Add dashboard" --pattern=react-feature',
				description: 'Use React feature pattern template'
			}
		],
		name: 'plan',
		options: [
			{
				default: '5',
				description: 'Complexity threshold for warnings',
				flag: '--complexity-threshold <n>'
			},
			{
				default: 'auto',
				description: 'Planning mode (standard, incremental, tiered)',
				flag: '--mode <mode>'
			},
			{
				description: 'Use pattern template (rest-api, react-feature, database, auth, background-job)',
				flag: '--pattern <type>'
			}
		],
		relatedCommands: ['plan-architecture', 'plan-implementation', 'gather-knowledge', 'review-plan', 'implement'],
		workflowPhase: 'workflow'
	},

	'plan-architecture': {
		agent: '@lead',
		description:
			'Create high-level architectural plan covering technology choices, component boundaries, and integration strategy (Phase 1 of tiered planning)',
		examples: [
			{
				code: 'valora plan-architecture',
				description: 'Create architecture plan for current task'
			},
			{
				code: 'valora plan-architecture --task-id=TASK-001',
				description: 'Create architecture plan for specific task'
			}
		],
		name: 'plan-architecture',
		options: [
			{
				description: 'Task ID to load from backlog',
				flag: '--task-id <id>'
			},
			{
				description: 'Path to backlog file',
				flag: '--backlog-file <path>'
			}
		],
		relatedCommands: ['plan', 'plan-implementation', 'review-plan'],
		workflowPhase: 'workflow'
	},

	'plan-implementation': {
		agent: '@lead',
		description:
			'Create detailed implementation plan with step-by-step tasks, dependencies, and rollback procedures (Phase 2 of tiered planning)',
		examples: [
			{
				code: 'valora plan-implementation --arch-plan=knowledge-base/PLAN-ARCH-TASK-001.md',
				description: 'Create implementation plan from architecture plan'
			},
			{
				code: 'valora plan-implementation --task-id=TASK-001',
				description: 'Create implementation plan for specific task'
			}
		],
		name: 'plan-implementation',
		options: [
			{
				description: 'Path to approved architecture plan',
				flag: '--arch-plan <path>'
			},
			{
				description: 'Task ID to derive architecture plan path',
				flag: '--task-id <id>'
			}
		],
		relatedCommands: ['plan', 'plan-architecture', 'review-plan', 'implement'],
		workflowPhase: 'workflow'
	},

	'pre-check': {
		agent: '@qa',
		description:
			'Run automated code quality pre-checks (linting, type validation, security) before manual review to reduce review time by 50%',
		examples: [
			{
				code: 'valora pre-check',
				description: 'Run all automated pre-checks (~1.5 min)'
			},
			{
				code: 'valora pre-check --fix',
				description: 'Auto-fix issues where possible'
			},
			{
				code: 'valora pre-check --strict',
				description: 'Strict mode (warnings as errors)'
			},
			{
				code: 'valora pre-check --ci --report-format=json',
				description: 'CI/CD mode with JSON output'
			},
			{
				code: 'valora pre-check && valora review-code --focus=architecture',
				description: 'Two-phase review (recommended)'
			}
		],
		name: 'pre-check',
		options: [
			{
				description: 'Auto-fix issues where possible (ESLint, Prettier)',
				flag: '--fix'
			},
			{
				description: 'Strict mode (warnings treated as errors)',
				flag: '--strict'
			},
			{
				description: 'CI/CD mode with JSON output, fails fast',
				flag: '--ci'
			},
			{
				default: 'summary',
				description: 'Report format (summary, detailed, json)',
				flag: '--report-format <format>'
			}
		],
		relatedCommands: ['review-code', 'validate-coverage', 'test', 'assert'],
		workflowPhase: 'review'
	},

	'refine-specs': {
		agent: '@product-manager',
		description: 'Collaboratively refine product specifications through structured questioning and clarification',
		examples: [
			{
				code: 'valora refine-specs "Build analytics dashboard"',
				description: 'Refine initial concept'
			},
			{
				code: 'valora refine-specs --concept-file=./ideas/dashboard.md',
				description: 'Refine from concept file'
			},
			{
				code: 'valora refine-specs "User management" --domain=security',
				description: 'Focus on specific domain'
			},
			{
				code: 'valora refine-specs "API v2" --stakeholders=team,pm',
				description: 'Include stakeholder perspectives'
			}
		],
		name: 'refine-specs',
		options: [
			{
				description: 'Path to concept file with initial thoughts',
				flag: '--concept-file <path>'
			},
			{
				description: 'Focus domain',
				flag: '--domain <area>'
			},
			{
				description: 'Stakeholder list',
				flag: '--stakeholders <list>'
			}
		],
		relatedCommands: ['create-prd', 'create-backlog'],
		workflowPhase: 'initialize'
	},

	'refine-task': {
		agent: '@product-manager',
		description: 'Clarify task requirements, acceptance criteria, and implementation details before planning phase',
		examples: [
			{
				code: 'valora refine-task',
				description: 'Refine current task'
			},
			{
				code: 'valora refine-task --task-id=T-456',
				description: 'Refine specific task'
			},
			{
				code: 'valora refine-task --interactive',
				description: 'Interactive refinement session'
			},
			{
				code: 'valora refine-task --acceptance-criteria-only',
				description: 'Focus on acceptance criteria'
			}
		],
		name: 'refine-task',
		options: [
			{
				description: 'Task to refine',
				flag: '--task-id <id>'
			},
			{
				description: 'Interactive mode',
				flag: '--interactive'
			},
			{
				description: 'Only update acceptance criteria',
				flag: '--acceptance-criteria-only'
			}
		],
		relatedCommands: ['fetch-task', 'plan'],
		workflowPhase: 'prepare'
	},

	'review-code': {
		agent: '@lead',
		description:
			'Perform comprehensive code quality review including standards, security, maintainability, and best practices validation',
		examples: [
			{
				code: 'valora review-code',
				description: 'Review all recent changes'
			},
			{
				code: 'valora review-code src/auth/',
				description: 'Review specific directory'
			},
			{
				code: 'valora review-code --severity=critical',
				description: 'Check critical issues only'
			},
			{
				code: 'valora review-code --focus=security',
				description: 'Security-focused review'
			},
			{
				code: 'valora review-code --focus=architecture',
				description: 'Architecture-only review (~5 min after pre-check)'
			},
			{
				code: 'valora review-code --checklist',
				description: 'Quick checklist review (~3 min)'
			},
			{
				code: 'valora review-code --auto-only',
				description: 'Automated checks only (~1 min)'
			},
			{
				code: 'valora pre-check && valora review-code --focus=architecture',
				description: 'Two-phase review (reduces time by 50%)'
			}
		],
		name: 'review-code',
		options: [
			{
				description: 'Filter by severity',
				flag: '--severity <level>'
			},
			{
				default: 'all',
				description: 'Review focus area',
				flag: '--focus <area>'
			},
			{
				description: 'Quick binary validation using checklist template',
				flag: '--checklist'
			},
			{
				description: 'Run automated checks only (tsc, lint, test)',
				flag: '--auto-only'
			}
		],
		relatedCommands: ['implement', 'test', 'commit'],
		workflowPhase: 'review'
	},

	'review-functional': {
		agent: '@lead',
		description:
			'Validate feature completeness, acceptance criteria, user experience, and functional requirements alignment with PRD/task specifications',
		examples: [
			{
				code: 'valora review-functional',
				description: 'Review completed feature'
			},
			{
				code: 'valora review-functional --severity=high',
				description: 'Check high-severity issues'
			},
			{
				code: 'valora review-functional --check-a11y=true',
				description: 'Include accessibility check'
			}
		],
		name: 'review-functional',
		options: [
			{
				description: 'Filter by severity',
				flag: '--severity <level>'
			},
			{
				default: 'true',
				description: 'Check accessibility',
				flag: '--check-a11y <bool>'
			}
		],
		relatedCommands: ['test', 'review-code', 'create-pr'],
		workflowPhase: 'review'
	},

	'review-plan': {
		agent: '@lead',
		description: 'Validate implementation plan quality, completeness, and feasibility before execution begins',
		examples: [
			{
				code: 'valora review-plan',
				description: 'Review plan in session'
			},
			{
				code: 'valora review-plan --strict-mode',
				description: 'Strict validation'
			},
			{
				code: 'valora review-plan --focus=risks',
				description: 'Focus on risk assessment'
			},
			{
				code: 'valora review-plan --checklist',
				description: 'Quick binary validation (~3 min)'
			}
		],
		name: 'review-plan',
		options: [
			{
				description: 'Enable strict validation',
				flag: '--strict-mode'
			},
			{
				description: 'Review focus area',
				flag: '--focus <area>'
			},
			{
				description: 'Quick binary validation using checklist template',
				flag: '--checklist'
			}
		],
		relatedCommands: ['plan', 'plan-architecture', 'plan-implementation', 'implement'],
		workflowPhase: 'workflow'
	},

	test: {
		agent: '@qa',
		description:
			'Execute comprehensive test suites (unit, integration, e2e) to validate implementation correctness and quality',
		examples: [
			{
				code: 'valora test',
				description: 'Run all tests'
			},
			{
				code: 'valora test --type=unit',
				description: 'Run unit tests only'
			},
			{
				code: 'valora test --coverage-threshold=90',
				description: 'Require 90% coverage'
			},
			{
				code: 'valora test src/auth/',
				description: 'Test specific scope'
			}
		],
		name: 'test',
		options: [
			{
				default: 'all',
				description: 'Test type to run',
				flag: '--type <type>'
			},
			{
				default: '80',
				description: 'Minimum coverage threshold',
				flag: '--coverage-threshold <n>'
			}
		],
		relatedCommands: ['implement', 'assert', 'review-code', 'validate-parallel'],
		workflowPhase: 'test'
	},

	'validate-coverage': {
		agent: '@qa',
		description:
			'Automated test coverage validation gate with specific thresholds and quality scoring (addresses low test quality scores)',
		examples: [
			{
				code: 'valora validate-coverage',
				description: 'Validate coverage against default threshold (80%)'
			},
			{
				code: 'valora validate-coverage --threshold=85',
				description: 'Validate with custom threshold'
			},
			{
				code: 'valora validate-coverage --strict',
				description: 'Strict mode requiring all thresholds to pass'
			},
			{
				code: 'valora validate-coverage --new-code-only',
				description: 'Only validate changed files'
			},
			{
				code: 'valora validate-coverage --report-format=json',
				description: 'Generate JSON report for CI/CD'
			}
		],
		name: 'validate-coverage',
		options: [
			{
				default: '80',
				description: 'Minimum line coverage percentage',
				flag: '--threshold <n>'
			},
			{
				description: 'Enable strict mode requiring ALL thresholds to pass',
				flag: '--strict'
			},
			{
				description: 'Only validate changed/new files',
				flag: '--new-code-only'
			},
			{
				default: 'summary',
				description: 'Report format (summary, detailed, json)',
				flag: '--report-format <format>'
			},
			{
				default: 'true',
				description: 'Fail if coverage decreased from baseline',
				flag: '--fail-on-decrease'
			}
		],
		relatedCommands: ['test', 'assert', 'implement', 'validate-parallel'],
		workflowPhase: 'test'
	},

	'validate-parallel': {
		agent: '@lead',
		description:
			'Run assert and review-code commands in parallel to reduce validation time by ~50% (saves ~9 minutes per workflow)',
		examples: [
			{
				code: 'valora validate-parallel',
				description: 'Run both validations in parallel (~10 min)'
			},
			{
				code: 'valora validate-parallel --quick',
				description: 'Quick parallel validation (~5 min)'
			},
			{
				code: 'valora validate-parallel --severity=critical',
				description: 'Focus on critical issues only'
			},
			{
				code: 'valora validate-parallel --focus=security',
				description: 'Focus on security review'
			}
		],
		name: 'validate-parallel',
		options: [
			{
				description: 'Use quick validation modes for both commands',
				flag: '--quick'
			},
			{
				default: 'all',
				description: 'Filter issues by severity level',
				flag: '--severity <level>'
			},
			{
				default: 'all',
				description: 'Focus area for code review',
				flag: '--focus <area>'
			}
		],
		relatedCommands: ['assert', 'review-code', 'implement', 'commit'],
		workflowPhase: 'test'
	},

	'validate-plan': {
		agent: '@lead',
		description:
			'Automated pre-review validation to catch missing plan parameters early (reduces review-plan time by 60-70%)',
		examples: [
			{
				code: 'valora validate-plan',
				description: 'Validate most recent plan (~2 min)'
			},
			{
				code: 'valora validate-plan knowledge-base/PLAN-IMPL-001.md',
				description: 'Validate specific plan file'
			},
			{
				code: 'valora validate-plan --fix',
				description: 'Auto-fix missing sections with TODOs'
			},
			{
				code: 'valora validate-plan --strict',
				description: 'Require 100% completeness'
			}
		],
		name: 'validate-plan',
		options: [
			{
				description: 'Attempt to auto-fix missing parameters',
				flag: '--fix'
			},
			{
				description: 'Require 100% completeness for pass',
				flag: '--strict'
			}
		],
		relatedCommands: ['plan', 'plan-architecture', 'plan-implementation', 'review-plan'],
		workflowPhase: 'workflow'
	},

	// =====================================================
	// BUILT-IN COMMANDS (System utilities and management)
	// =====================================================

	config: {
		agent: 'system',
		description: 'Manage AI orchestrator configuration including providers, API keys, and settings',
		examples: [
			{
				code: 'valora config setup',
				description: 'Run interactive setup wizard'
			},
			{
				code: 'valora config setup --quick',
				description: 'Quick setup with minimal prompts'
			},
			{
				code: 'valora config show',
				description: 'Display current configuration'
			},
			{
				code: 'valora config path',
				description: 'Show configuration file path'
			}
		],
		name: 'config',
		options: [],
		relatedCommands: ['doctor'],
		subcommands: [
			{
				description: 'Run interactive setup wizard to configure providers and API keys',
				examples: [
					{ code: 'valora config setup', description: 'Full interactive setup' },
					{ code: 'valora config setup --quick', description: 'Quick setup with defaults' }
				],
				name: 'setup',
				options: [{ description: 'Quick setup with minimal prompts', flag: '--quick' }]
			},
			{
				description: 'Display current configuration (sensitive data sanitized)',
				name: 'show'
			},
			{
				description: 'Show the path to the configuration file',
				name: 'path'
			}
		],
		workflowPhase: 'system'
	},

	dashboard: {
		agent: 'system',
		description: 'Launch real-time TUI dashboard for monitoring sessions, system health, and resource usage',
		examples: [
			{
				code: 'valora dashboard',
				description: 'Launch the dashboard'
			},
			{
				code: 'valora dash',
				description: 'Launch using alias'
			},
			{
				code: 'valora dashboard --no-auto-refresh',
				description: 'Launch without auto-refresh'
			}
		],
		name: 'dashboard',
		options: [
			{
				default: 'enabled (2s)',
				description: 'Disable auto-refresh of dashboard data',
				flag: '--no-auto-refresh'
			}
		],
		relatedCommands: ['monitoring', 'session'],
		workflowPhase: 'system'
	},

	doctor: {
		agent: 'system',
		description:
			'Run diagnostic checks on the system including configuration, providers, API keys, and environment validation',
		examples: [
			{
				code: 'valora doctor',
				description: 'Run all diagnostic checks'
			},
			{
				code: 'valora doctor --fix',
				description: 'Auto-fix detected issues'
			},
			{
				code: 'valora doctor --export ./report.json',
				description: 'Export diagnostics to file'
			}
		],
		name: 'doctor',
		options: [
			{
				description: 'Attempt to auto-fix detected issues',
				flag: '--fix'
			},
			{
				description: 'Export diagnostics report to JSON file',
				flag: '--export <path>'
			}
		],
		relatedCommands: ['config', 'monitoring'],
		workflowPhase: 'system'
	},

	exec: {
		agent: 'system',
		description: 'Execute a specific command dynamically with full control over execution options and isolation',
		examples: [
			{
				code: 'valora exec plan "Build feature"',
				description: 'Execute plan command'
			},
			{
				code: 'valora exec implement --dry-run',
				description: 'Execute with dry-run flag'
			},
			{
				code: 'valora exec test --stage=unit',
				description: 'Execute specific stage only'
			},
			{
				code: 'valora exec plan --isolated',
				description: 'Execute in isolation mode'
			}
		],
		name: 'exec',
		options: [
			{
				description: 'Session ID to use or resume',
				flag: '--session-id <id>'
			},
			{
				description: 'Set log level',
				flag: '--log-level <level>'
			},
			{
				description: 'Execute only specific stage(s)',
				flag: '--stage <stage>'
			},
			{
				description: 'Skip pipeline validation',
				flag: '--skip-validation'
			},
			{
				description: 'Provide mock inputs as JSON',
				flag: '--mock-inputs <json>'
			},
			{
				description: 'Override stage requirements',
				flag: '--force-required'
			},
			{
				description: 'Execute in isolation mode',
				flag: '--isolated'
			}
		],
		relatedCommands: ['list', 'plan', 'implement'],
		workflowPhase: 'system'
	},

	help: {
		agent: 'system',
		description: 'Display help information for commands with workflow context, examples, and related commands',
		examples: [
			{
				code: 'valora help',
				description: 'Show help overview'
			},
			{
				code: 'valora help plan',
				description: 'Help for plan command'
			},
			{
				code: 'valora help --search auth',
				description: 'Search commands by keyword'
			}
		],
		name: 'help',
		options: [
			{
				description: 'Search commands by keyword',
				flag: '-s, --search <keyword>'
			}
		],
		relatedCommands: ['list', 'doctor'],
		workflowPhase: 'system'
	},

	list: {
		agent: 'system',
		description: 'List all available commands including workflow and utility commands',
		examples: [
			{
				code: 'valora list',
				description: 'List all available commands'
			}
		],
		name: 'list',
		options: [],
		relatedCommands: ['help', 'exec'],
		workflowPhase: 'system'
	},

	monitoring: {
		agent: 'system',
		description: 'Access performance monitoring, metrics collection, resource usage, and documentation linting tools',
		examples: [
			{
				code: 'valora monitoring metrics',
				description: 'Show metrics snapshot'
			},
			{
				code: 'valora monitoring performance --detailed',
				description: 'Detailed performance report'
			},
			{
				code: 'valora monitoring resources',
				description: 'Show system resource usage'
			},
			{
				code: 'valora monitoring status',
				description: 'Show monitoring status'
			}
		],
		name: 'monitoring',
		options: [],
		relatedCommands: ['dashboard', 'doctor'],
		subcommands: [
			{
				description: 'Show current metrics snapshot (counters, gauges, histograms)',
				name: 'metrics',
				options: [
					{
						default: 'json',
						description: 'Output format',
						flag: '-f, --format <format>'
					}
				]
			},
			{
				description: 'Show performance profiling report with slowest operations and resource stats',
				name: 'performance',
				options: [
					{
						default: 'false',
						description: 'Show detailed profiling data',
						flag: '-d, --detailed'
					}
				]
			},
			{
				description: 'Show current system resource usage (CPU, memory, disk, process, network)',
				name: 'resources'
			},
			{
				description: 'Show monitoring system status and active collectors',
				name: 'status'
			},
			{
				description: 'Lint documentation files for quality and completeness',
				name: 'docs',
				options: [
					{ default: 'table', description: 'Output format', flag: '-f, --format <format>' },
					{ default: 'true', description: 'Enable link validation', flag: '--check-links' },
					{ default: 'true', description: 'Enable code example validation', flag: '--check-code-examples' },
					{ default: 'false', description: 'Enable API completeness checks', flag: '--check-api-completeness' },
					{ default: 'false', description: 'Enable freshness checks', flag: '--check-freshness' },
					{ default: '0', description: 'Max errors before failing', flag: '--max-errors <number>' },
					{ default: '0', description: 'Max warnings before failing', flag: '--max-warnings <number>' }
				]
			},
			{
				description: 'Trigger a V8 heap snapshot for memory analysis',
				name: 'heap-dump',
				options: [
					{ default: './heap-dumps', description: 'Output directory', flag: '-o, --out <path>' },
					{ default: 'manual-dump', description: 'File prefix', flag: '-p, --prefix <prefix>' }
				]
			},
			{
				description: 'Reset all monitoring data (metrics, profiles)',
				name: 'reset'
			}
		],
		workflowPhase: 'system'
	},

	rollout: {
		agent: 'system',
		description: 'Monitor dynamic agent selection rollout status, analytics, and success metrics',
		examples: [
			{
				code: 'valora rollout --status',
				description: 'Show current rollout status'
			},
			{
				code: 'valora rollout --analytics 24',
				description: 'Show analytics for last 24 hours'
			},
			{
				code: 'valora rollout --metrics',
				description: 'Show success metrics'
			},
			{
				code: 'valora rollout --export ./data.json',
				description: 'Export analytics to file'
			}
		],
		name: 'rollout',
		options: [
			{
				description: 'Show current rollout status and feature flags',
				flag: '--status'
			},
			{
				default: '24',
				description: 'Show analytics for last N hours',
				flag: '--analytics <hours>'
			},
			{
				description: 'Show success metrics for rollout evaluation',
				flag: '--metrics'
			},
			{
				description: 'Export analytics data to JSON file',
				flag: '--export <file>'
			}
		],
		relatedCommands: ['monitoring', 'config'],
		workflowPhase: 'system'
	},

	session: {
		agent: 'system',
		description: 'Manage sessions including listing, resuming, browsing, cleanup, export, and import',
		examples: [
			{
				code: 'valora session list',
				description: 'List all sessions'
			},
			{
				code: 'valora session resume --auto',
				description: 'Resume most recent session'
			},
			{
				code: 'valora session browse',
				description: 'Interactive session browser'
			},
			{
				code: 'valora session clean --older-than 30',
				description: 'Clean old sessions'
			}
		],
		name: 'session',
		options: [],
		relatedCommands: ['dashboard', 'config'],
		subcommands: [
			{
				description: 'List all sessions with filtering and sorting options',
				name: 'list',
				options: [
					{ description: 'Show detailed session information', flag: '-v, --verbose' },
					{ description: 'Filter by status (active, paused, completed, failed)', flag: '--status <status>' },
					{ default: 'date', description: 'Sort by field', flag: '--sort <field>' }
				]
			},
			{
				description: 'Resume a session with smart suggestions',
				name: 'resume [sessionId]',
				options: [{ description: 'Auto-select most recent session', flag: '--auto' }]
			},
			{
				description: 'Interactive session browser (alias: b)',
				name: 'browse'
			},
			{
				description: 'Interactive session cleanup with preview (alias: cleanup)',
				name: 'clean',
				options: [
					{ description: 'Delete sessions older than N days', flag: '--older-than <days>' },
					{ description: 'Delete sessions with specific status', flag: '--status <status>' },
					{ description: 'Use configured retention policy', flag: '--retention' },
					{ description: 'Preview without deleting', flag: '--dry-run' },
					{ description: 'Skip confirmation prompts', flag: '--force' },
					{ description: 'Non-interactive mode', flag: '--no-interactive' }
				]
			},
			{
				description: 'Archive a session (mark as completed)',
				name: 'archive <sessionId>'
			},
			{
				description: 'Delete a specific session permanently',
				name: 'delete <sessionId>',
				options: [{ description: 'Skip confirmation prompt', flag: '-f, --force' }]
			},
			{
				description: 'Export session as ZIP archive for transfer or backup',
				name: 'export <sessionId> [outputPath]',
				options: [{ description: 'Exclude session artifacts', flag: '--no-artifacts' }]
			},
			{
				description: 'Import session from ZIP archive',
				name: 'import <zipPath> [sessionId]',
				options: [{ description: 'Overwrite existing session', flag: '--overwrite' }]
			},
			{
				description: 'Show detailed session information',
				name: 'show <sessionId>',
				options: [
					{ description: 'Show detailed file changes', flag: '--files' },
					{ description: 'Show full context details', flag: '--context' },
					{ description: 'Hide metrics section', flag: '--no-metrics' }
				]
			}
		],
		workflowPhase: 'system'
	}
};

/**
 * Get help for a specific command
 */
export function getCommandHelp(commandName: string): CommandHelp | undefined {
	return COMMAND_HELP[commandName];
}

/**
 * Get all command names
 */
export function getAllCommandNames(): string[] {
	return Object.keys(COMMAND_HELP).sort();
}

/**
 * Search commands by keyword
 */
export function searchCommands(keyword: string): CommandHelp[] {
	const lowerKeyword = keyword.toLowerCase();
	return Object.values(COMMAND_HELP).filter(
		(help) =>
			help.name.includes(lowerKeyword) ||
			help.description.toLowerCase().includes(lowerKeyword) ||
			help.workflowPhase.toLowerCase().includes(lowerKeyword)
	);
}

/**
 * Get commands by workflow phase
 */
export function getCommandsByPhase(phase: string): CommandHelp[] {
	return Object.values(COMMAND_HELP).filter((help) => help.workflowPhase === phase);
}

/**
 * Check if command exists
 */
export function hasCommandHelp(commandName: string): boolean {
	return commandName in COMMAND_HELP;
}
