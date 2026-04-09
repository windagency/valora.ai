/**
 * Dashboard navigation hook - tab state machine + key handlers
 */

import { useCallback, useState } from 'react';

import type { DashboardTab, SessionSubTab, ViewMode } from 'ui/dashboard/types';

const TAB_ORDER: DashboardTab[] = ['overview', 'performance', 'agents', 'cache', 'audit', 'usage'];
const SUB_TAB_ORDER: SessionSubTab[] = ['overview', 'optimization', 'quality', 'tokens', 'spending'];

export interface NavigationActions {
	navigateDown: (maxIndex: number) => void;
	navigateUp: () => void;
	nextSubTab: () => void;
	nextTab: () => void;
	prevSubTab: () => void;
	prevTab: () => void;
	setSelectedIndex: (index: number) => void;
	setTab: (tab: DashboardTab) => void;
	setViewMode: (mode: ViewMode) => void;
	switchToDashboard: () => void;
	switchToDetails: () => void;
}

export interface NavigationState {
	activeTab: DashboardTab;
	selectedIndex: number;
	sessionSubTab: SessionSubTab;
	viewMode: ViewMode;
}

export function useNavigation(): NavigationActions & NavigationState {
	const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
	const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [sessionSubTab, setSessionSubTab] = useState<SessionSubTab>('overview');

	const nextTab = useCallback(() => {
		setActiveTab((prev) => {
			const idx = TAB_ORDER.indexOf(prev);
			return TAB_ORDER[(idx + 1) % TAB_ORDER.length]!;
		});
	}, []);

	const prevTab = useCallback(() => {
		setActiveTab((prev) => {
			const idx = TAB_ORDER.indexOf(prev);
			return TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
		});
	}, []);

	const setTab = useCallback((tab: DashboardTab) => {
		setActiveTab(tab);
	}, []);

	const nextSubTab = useCallback(() => {
		setSessionSubTab((prev) => {
			const idx = SUB_TAB_ORDER.indexOf(prev);
			return SUB_TAB_ORDER[(idx + 1) % SUB_TAB_ORDER.length]!;
		});
	}, []);

	const prevSubTab = useCallback(() => {
		setSessionSubTab((prev) => {
			const idx = SUB_TAB_ORDER.indexOf(prev);
			return SUB_TAB_ORDER[(idx - 1 + SUB_TAB_ORDER.length) % SUB_TAB_ORDER.length]!;
		});
	}, []);

	const navigateDown = useCallback((maxIndex: number) => {
		setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
	}, []);

	const navigateUp = useCallback(() => {
		setSelectedIndex((prev) => Math.max(prev - 1, 0));
	}, []);

	const switchToDetails = useCallback(() => {
		setViewMode('details');
		setSessionSubTab('overview');
	}, []);

	const switchToDashboard = useCallback(() => {
		setViewMode('dashboard');
	}, []);

	return {
		activeTab,
		navigateDown,
		navigateUp,
		nextSubTab,
		nextTab,
		prevSubTab,
		prevTab,
		selectedIndex,
		sessionSubTab,
		setSelectedIndex,
		setTab,
		setViewMode,
		switchToDashboard,
		switchToDetails,
		viewMode
	};
}
