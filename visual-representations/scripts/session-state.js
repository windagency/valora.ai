import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

import { initAllDiagrams, isDark } from './shared.js';

mermaid.initialize({
	startOnLoad: false,
	theme: 'base',
	themeVariables: {
		background: isDark ? '#091525' : '#f0f8ff',
		edgeLabelBackground: isDark ? '#091525' : '#f0f8ff',
		fontFamily: "'DM Sans', system-ui, sans-serif",
		fontSize: '14px',
		labelBackground: isDark ? '#091525' : '#f0f8ff',
		labelTextColor: isDark ? '#cce0f5' : '#091525',
		lineColor: isDark ? '#3a6080' : '#7ab0d4',
		mainBkg: isDark ? '#091525' : '#f0f8ff',
		noteBkgColor: isDark ? '#122540' : '#f0f8ff',
		noteBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		noteTextColor: isDark ? '#6b9cc0' : '#1a6ba0',
		primaryBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		primaryColor: isDark ? '#0d1e35' : '#e8f4fd',
		primaryTextColor: isDark ? '#cce0f5' : '#091525',
		secondaryBorderColor: isDark ? '#3a6080' : '#7ab0d4',
		secondaryColor: isDark ? '#091525' : '#f0f8ff',
		secondaryTextColor: isDark ? '#cce0f5' : '#091525',
		tertiaryBorderColor: isDark ? '#4ecdc4' : '#1a8080',
		tertiaryColor: isDark ? '#0d1e35' : '#e8f4fd',
		tertiaryTextColor: isDark ? '#cce0f5' : '#091525',
		transitionColor: isDark ? '#3a6080' : '#7ab0d4'
	}
});

initAllDiagrams({
	fitPadding: 28,
	maxHeightPx: 1100,
	maxHeightVh: 0.9,
	maxInitialZoom: 1.5,
	maxZoom: 6,
	minHeight: 500,
	minZoom: 0.06,
	readabilityFloor: 0.5,
	zoomStep: 0.13
});
