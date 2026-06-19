/**
 * Usage Analytics View - Cross-session token/cost analytics dashboard tab
 */

import React from 'react';

import type { UsageAnalyticsDashboardData } from 'ui/dashboard/hooks/use-usage-analytics-data';

import { Sparkline } from 'exploration/dashboard-metrics';
import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { formatNumber } from 'utils/number-format';

const tui = getTUIAdapter();

const { Box, Text } = tui;

export function UsageAnalyticsView({ data }: { data: UsageAnalyticsDashboardData }): React.JSX.Element {
	if (data.isLoading) {
		return <Text dimColor>Loading usage data...</Text>;
	}

	if (data.error !== null) {
		return <Text color="red">Error: {data.error}</Text>;
	}

	const { summary } = data;

	if (summary === null || summary.totals.requestCount === 0) {
		return <Text dimColor>No spending data found. Run some Valora commands to see usage analytics.</Text>;
	}

	return (
		<Box flexDirection="column">
			<Box flexDirection="row">
				<SummaryPanel
					avgDailyCost={summary.avgDailyCost}
					cacheHitRatio={summary.cacheHitRatio}
					period={summary.period}
					sessionsCount={summary.sessionsCount}
					totals={summary.totals}
				/>
				<ModelPanel models={summary.byModel} />
			</Box>
			<Box flexDirection="row" marginTop={1}>
				<ActivityPanel activities={summary.byActivity} />
				<SessionPanel sessions={summary.bySession} />
			</Box>
			<Box flexDirection="row" marginTop={1}>
				<DailyPanel daily={summary.daily} />
				<ProjectPanel projects={summary.byProject} />
			</Box>
			<Box flexDirection="row" marginTop={1}>
				<CommandPanel commands={summary.byCommand} />
				<ModelComparisonPanel models={summary.byModel} />
			</Box>
		</Box>
	);
}

function ActivityPanel({
	activities
}: {
	activities: NonNullable<UsageAnalyticsDashboardData['summary']>['byActivity'];
}): React.JSX.Element {
	const top = activities.slice(0, 6);
	const maxCost = top.length > 0 ? Math.max(...top.map((a) => a.totalCostUsd)) : 1;
	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
			<Text bold color="magenta">
				By Activity
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{top.length === 0 ? (
					<Text dimColor>No activity data</Text>
				) : (
					top.map((a) => {
						const oneShot = a.oneShotRate !== null ? ` ${(a.oneShotRate * 100).toFixed(0)}% one-shot` : '';
						return (
							<Box flexDirection="column" key={a.activity}>
								<BarRow color="magenta" label={a.activity.padEnd(16)} maxValue={maxCost} value={a.totalCostUsd} />
								<Text dimColor>
									{''.padEnd(18)}
									{a.requestCount} req{oneShot}
								</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}

function BarRow({
	color = 'cyan',
	label,
	maxValue,
	value,
	width = 20
}: {
	color?: string;
	label: string;
	maxValue: number;
	value: number;
	width?: number;
}): React.JSX.Element {
	const filled = maxValue > 0 ? Math.max(1, Math.floor((value / maxValue) * width)) : 0;
	return (
		<Box>
			<Text>{label}</Text>
			<Text color={color as never}>{'█'.repeat(filled)}</Text>
			<Text dimColor>{'░'.repeat(Math.max(0, width - filled))}</Text>
			<Text> ${value.toFixed(4)}</Text>
		</Box>
	);
}

function CommandPanel({
	commands
}: {
	commands: NonNullable<UsageAnalyticsDashboardData['summary']>['byCommand'];
}): React.JSX.Element {
	const top = commands.slice(0, 6);
	const maxCost = top.length > 0 ? Math.max(...top.map((c) => c.totalCostUsd)) : 1;
	return (
		<Box borderColor="magenta" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
			<Text bold color="magenta">
				Cost by Command
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{top.length === 0 ? (
					<Text dimColor>No command data</Text>
				) : (
					top.map((c) => {
						const name = c.command.length > 20 ? c.command.substring(0, 17) + '...' : c.command;
						return (
							<BarRow
								color="magenta"
								key={c.command}
								label={name.padEnd(20)}
								maxValue={maxCost}
								value={c.totalCostUsd}
							/>
						);
					})
				)}
			</Box>
		</Box>
	);
}

function DailyPanel({
	daily
}: {
	daily: NonNullable<UsageAnalyticsDashboardData['summary']>['daily'];
}): React.JSX.Element {
	const recent = daily.slice(-7);
	return (
		<Box borderColor="green" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
			<Text bold color="green">
				Daily Trend (last 7 days)
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{recent.length === 0 ? (
					<Text dimColor>No data</Text>
				) : (
					<>
						<Sparkline color="green" data={recent.map((d) => d.totalCostUsd)} height={3} width={30} />
						<Box flexDirection="column" marginTop={1}>
							{recent.map((d) => (
								<Box key={d.date}>
									<Text dimColor>{d.date}</Text>
									<Text dimColor> req:</Text>
									<Text color="cyan">{String(d.requestCount).padStart(4)}</Text>
									<Text dimColor> tok:</Text>
									<Text color="cyan">{formatNumber(d.totalTokens).padStart(8)}</Text>
									<Text color="yellow"> ${d.totalCostUsd.toFixed(4)}</Text>
								</Box>
							))}
						</Box>
					</>
				)}
			</Box>
		</Box>
	);
}

function ModelComparisonPanel({
	models
}: {
	models: NonNullable<UsageAnalyticsDashboardData['summary']>['byModel'];
}): null | React.JSX.Element {
	const model1 = models[0];
	const model2 = models[1];
	if (model1 === undefined || model2 === undefined) return null;
	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				Model Comparison
			</Text>
			<Box flexDirection="row" marginTop={1}>
				{[model1, model2].map((m) => (
					<Box flexDirection="column" key={m.model} marginRight={2}>
						<Text bold color="cyan">
							{m.model.length > 24 ? m.model.substring(0, 21) + '...' : m.model}
						</Text>
						<Text dimColor>
							Cost: <Text color="yellow">${m.totalCostUsd.toFixed(4)}</Text>
						</Text>
						<Text dimColor>
							Requests: <Text color="cyan">{m.requestCount}</Text>
						</Text>
						<Text dimColor>
							Input tok: <Text color="cyan">{formatNumber(m.inputTokens)}</Text>
						</Text>
						<Text dimColor>
							Output tok: <Text color="cyan">{formatNumber(m.outputTokens)}</Text>
						</Text>
						<Text dimColor>
							Cache read: <Text color="green">{formatNumber(m.cacheReadTokens)}</Text>
						</Text>
						<Text dimColor>
							Cache write: <Text color="green">{formatNumber(m.cacheWriteTokens)}</Text>
						</Text>
						<Text dimColor>
							Cache saved: <Text color="green">${m.cacheSavingsUsd.toFixed(4)}</Text>
						</Text>
						<Text dimColor>
							Avg/req: <Text color="yellow">${m.avgCostPerRequest.toFixed(4)}</Text>
						</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}

function ModelPanel({
	models
}: {
	models: NonNullable<UsageAnalyticsDashboardData['summary']>['byModel'];
}): React.JSX.Element {
	const top = models.slice(0, 6);
	const maxCost = top.length > 0 ? Math.max(...top.map((m) => m.totalCostUsd)) : 1;
	return (
		<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="cyan">
				Cost by Model
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{top.length === 0 ? (
					<Text dimColor>No model data</Text>
				) : (
					top.map((m) => {
						const name = m.model.length > 30 ? m.model.substring(0, 27) + '...' : m.model;
						return (
							<BarRow color="cyan" key={m.model} label={name.padEnd(30)} maxValue={maxCost} value={m.totalCostUsd} />
						);
					})
				)}
			</Box>
		</Box>
	);
}

function ProjectPanel({
	projects
}: {
	projects: NonNullable<UsageAnalyticsDashboardData['summary']>['byProject'];
}): React.JSX.Element {
	const top = projects.slice(0, 5);
	const maxCost = top.length > 0 ? Math.max(...top.map((p) => p.totalCostUsd)) : 1;
	return (
		<Box borderColor="white" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold>By Project</Text>
			<Box flexDirection="column" marginTop={1}>
				{top.length === 0 ? (
					<Text dimColor>No project data</Text>
				) : (
					top.map((p) => {
						const label = p.projectPath.length > 24 ? `...${p.projectPath.slice(-21)}` : p.projectPath;
						return (
							<Box flexDirection="column" key={p.projectPath}>
								<BarRow color="white" label={label.padEnd(24)} maxValue={maxCost} value={p.totalCostUsd} />
								<Text dimColor>
									{''.padEnd(26)}
									{p.requestCount} req
								</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}

function SessionPanel({
	sessions
}: {
	sessions: NonNullable<UsageAnalyticsDashboardData['summary']>['bySession'];
}): React.JSX.Element {
	const top = sessions.slice(0, 5);
	const maxCost = top.length > 0 ? Math.max(...top.map((s) => s.totalCostUsd)) : 1;
	return (
		<Box borderColor="blue" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="blue">
				Top Sessions
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{top.length === 0 ? (
					<Text dimColor>No session data</Text>
				) : (
					top.map((s, i) => {
						const label = `${String(i + 1)}. ${s.sessionId.slice(0, 16).padEnd(16)}`;
						return (
							<Box flexDirection="column" key={s.sessionId}>
								<BarRow color="blue" label={label} maxValue={maxCost} value={s.totalCostUsd} />
								<Text dimColor>
									{''.padEnd(20)}
									{s.requestCount} req {s.from.slice(0, 10)}
								</Text>
							</Box>
						);
					})
				)}
			</Box>
		</Box>
	);
}

function SummaryPanel({
	avgDailyCost,
	cacheHitRatio,
	period,
	sessionsCount,
	totals
}: Pick<
	NonNullable<UsageAnalyticsDashboardData['summary']>,
	'avgDailyCost' | 'cacheHitRatio' | 'period' | 'sessionsCount' | 'totals'
>): React.JSX.Element {
	return (
		<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginRight={1} paddingX={1}>
			<Text bold color="yellow">
				Usage Analytics (last 7 days)
			</Text>
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text dimColor>Period: </Text>
					<Text color="cyan">
						{period.from.slice(0, 10)} → {period.to.slice(0, 10)}
					</Text>
				</Box>
				<Box>
					<Text dimColor>Total cost: </Text>
					<Text bold color="yellow">
						${totals.totalCostUsd.toFixed(4)}
					</Text>
				</Box>
				<Box>
					<Text dimColor>Total tokens: </Text>
					<Text color="cyan">{formatNumber(totals.totalTokens)}</Text>
				</Box>
				<Box>
					<Text dimColor>Requests: </Text>
					<Text color="cyan">{totals.requestCount}</Text>
				</Box>
				<Box>
					<Text dimColor>Sessions: </Text>
					<Text color="cyan">{sessionsCount}</Text>
				</Box>
				<Box>
					<Text dimColor>Avg daily: </Text>
					<Text color="yellow">${avgDailyCost.toFixed(4)}</Text>
				</Box>
				<Box>
					<Text dimColor>Cache saved: </Text>
					<Text color="green">${totals.cacheSavingsUsd.toFixed(4)}</Text>
				</Box>
				<Box>
					<Text dimColor>Cache hit: </Text>
					<Text color="green">{(cacheHitRatio * 100).toFixed(1)}%</Text>
				</Box>
			</Box>
		</Box>
	);
}
