/**
 * Performance View - MetricsCollector data: counters, gauges, histograms
 */

import React from 'react';

import type { PerformanceData } from 'ui/dashboard/hooks/use-metrics-data';

import { ResourceGauge, Sparkline } from 'exploration/dashboard-metrics';
import { getTUIAdapter } from 'ui/tui-adapter.interface';

const tui = getTUIAdapter();
// eslint-disable-next-line @typescript-eslint/naming-convention -- Box and Text are React components which require PascalCase
const { Box, Text } = tui;

// eslint-disable-next-line @typescript-eslint/naming-convention -- React components must use PascalCase
export function PerformanceView({ data }: { data: PerformanceData }): React.JSX.Element {
	const hasData = data.counters.length > 0 || data.gauges.length > 0 || data.histograms.length > 0;

	if (!hasData) {
		return (
			<Box borderColor="white" borderStyle="round" flexDirection="column" paddingX={1}>
				<Text bold color="cyan">
					Performance Metrics
				</Text>
				<Text dimColor>No metrics collected yet. Run some commands to generate metrics.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Box flexGrow={1}>
				{/* Left column: Counters + Histograms */}
				<Box flexDirection="column" width="50%">
					{data.counters.length > 0 && (
						<Box borderColor="green" borderStyle="round" flexDirection="column" paddingX={1}>
							<Text bold color="green">
								Counters ({data.counters.length})
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{data.counters.slice(0, 15).map((counter, index) => (
									<Box key={index}>
										<Text dimColor>{counter.name.padEnd(30)}</Text>
										<Text bold color="cyan">
											{counter.value}
										</Text>
									</Box>
								))}
								{data.counters.length > 15 && <Text dimColor>...and {data.counters.length - 15} more</Text>}
							</Box>
						</Box>
					)}

					{data.histograms.length > 0 && (
						<Box borderColor="yellow" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
							<Text bold color="yellow">
								Histograms ({data.histograms.length})
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{data.histograms.slice(0, 5).map((histogram, index) => {
									const bucketValues = Object.values(histogram.buckets);
									const avg = histogram.count > 0 ? histogram.sum / histogram.count : 0;
									return (
										<Box flexDirection="column" key={index} marginBottom={1}>
											<Box>
												<Text bold>{histogram.name}</Text>
												<Text dimColor>
													{' '}
													(count: {histogram.count}, avg: {avg.toFixed(1)})
												</Text>
											</Box>
											{bucketValues.length > 0 && (
												<Sparkline color="yellow" data={bucketValues} height={2} width={25} />
											)}
										</Box>
									);
								})}
							</Box>
						</Box>
					)}
				</Box>

				{/* Right column: Gauges */}
				<Box flexDirection="column" marginLeft={1} width="50%">
					{data.gauges.length > 0 && (
						<Box borderColor="cyan" borderStyle="round" flexDirection="column" paddingX={1}>
							<Text bold color="cyan">
								Gauges ({data.gauges.length})
							</Text>
							<Box flexDirection="column" marginTop={1}>
								{data.gauges.slice(0, 10).map((gauge, index) => (
									<Box key={index} marginBottom={index < data.gauges.length - 1 ? 0 : 0}>
										<ResourceGauge
											label={gauge.name.length > 20 ? gauge.name.substring(0, 17) + '...' : gauge.name}
											max={Math.max(gauge.value * 1.5, 100)}
											unit=""
											value={gauge.value}
											width={20}
										/>
									</Box>
								))}
								{data.gauges.length > 10 && <Text dimColor>...and {data.gauges.length - 10} more</Text>}
							</Box>
						</Box>
					)}

					{data.snapshot && (
						<Box borderColor="white" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
							<Text bold color="white">
								Snapshot Info
							</Text>
							<Box flexDirection="column" marginTop={1}>
								<Box>
									<Text dimColor>Uptime: </Text>
									<Text>{(data.snapshot.uptime / 1000).toFixed(0)}s</Text>
								</Box>
								<Box>
									<Text dimColor>Collection Time: </Text>
									<Text>{data.snapshot.collectionDuration}ms</Text>
								</Box>
								<Box>
									<Text dimColor>Counters: </Text>
									<Text>{data.snapshot.counters.length}</Text>
									<Text dimColor> Gauges: </Text>
									<Text>{data.snapshot.gauges.length}</Text>
									<Text dimColor> Histograms: </Text>
									<Text>{data.snapshot.histograms.length}</Text>
								</Box>
							</Box>
						</Box>
					)}
				</Box>
			</Box>
		</Box>
	);
}
