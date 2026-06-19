/**
 * Drift Panel - Model behavioural drift alerts from regression suite
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';

import { getTUIAdapter } from 'ui/tui-adapter.interface';
import { getRuntimeDataDir } from 'utils/paths';

const tui = getTUIAdapter();

const { Box, Text } = tui;

interface DriftAlert {
	detectedAt: string;
	reason: string;
	scenarioId: string;
	similarity?: null | number;
}

export function DriftPanel(): React.JSX.Element {
	const alerts = loadDriftAlerts();

	if (alerts.length === 0) {
		return (
			<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="cyan">
					Model Drift
				</Text>
				<Text color="green">✓ No drift detected</Text>
			</Box>
		);
	}

	return (
		<Box borderColor="red" borderStyle="round" flexDirection="column" paddingX={1}>
			<Text bold color="red">
				Model Drift ({alerts.length} alert{alerts.length !== 1 ? 's' : ''})
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{alerts.map((alert, i) => (
					<Box flexDirection="column" key={i} marginBottom={1}>
						<Box>
							<Text color="red">✗ </Text>
							<Text bold>{alert.scenarioId}</Text>
							{alert.similarity != null && <Text dimColor> (similarity: {(alert.similarity * 100).toFixed(0)}%)</Text>}
						</Box>
						<Text dimColor> {alert.reason}</Text>
						<Text dimColor> {new Date(alert.detectedAt).toLocaleString()}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}

function loadDriftAlerts(maxEntries = 10): DriftAlert[] {
	const alertsFile = path.join(getRuntimeDataDir(), 'drift-alerts.jsonl');
	if (!fs.existsSync(alertsFile)) return [];
	try {
		const lines = fs.readFileSync(alertsFile, 'utf-8').trim().split('\n').filter(Boolean);
		return lines
			.slice(-maxEntries)
			.map((line) => JSON.parse(line) as DriftAlert)
			.reverse();
	} catch {
		return [];
	}
}
