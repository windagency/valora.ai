/**
 * Usage Analytics data hook - fetches cross-session token/cost analytics
 */

import { useCallback, useEffect, useState } from 'react';

import { getUsageAnalytics, type UsageSummary } from 'utils/usage-analytics';

export interface UsageAnalyticsDashboardData {
	error: null | string;
	isLoading: boolean;
	summary: null | UsageSummary;
}

export function useUsageAnalyticsData(): {
	data: UsageAnalyticsDashboardData;
	refresh: () => void;
} {
	const [data, setData] = useState<UsageAnalyticsDashboardData>({
		error: null,
		isLoading: true,
		summary: null
	});

	const refresh = useCallback(() => {
		try {
			const summary = getUsageAnalytics().analyze({ sinceDays: 7 });
			setData({ error: null, isLoading: false, summary });
		} catch (error) {
			setData({ error: (error as Error).message, isLoading: false, summary: null });
		}
	}, []);

	useEffect(() => {
		refresh();

		const interval = setInterval(refresh, 10000);

		return () => {
			clearInterval(interval);
		};
	}, [refresh]);

	return { data, refresh };
}
