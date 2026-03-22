import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

import { initAllDiagrams, isDark } from './shared.js';

mermaid.initialize({
	startOnLoad: false,
	theme: 'base',
	themeVariables: {
		activationBkgColor: isDark ? '#1a3a60' : '#d0e8f8',
		activationBorderColor: isDark ? '#4ecdc4' : '#1a8080',
		actorBkg: isDark ? '#122540' : '#e8f4fd',
		actorBorder: isDark ? '#3b9edd' : '#1a6ba0',
		actorLineColor: isDark ? '#3a6080' : '#7ab0d4',
		actorTextColor: isDark ? '#cce0f5' : '#091525',
		fontFamily: "'DM Sans', system-ui, sans-serif",
		fontSize: '13px',
		labelBoxBkgColor: isDark ? '#0d1e35' : '#f0f8ff',
		labelBoxBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		labelTextColor: isDark ? '#cce0f5' : '#091525',
		lineColor: isDark ? '#3a6080' : '#7ab0d4',
		loopTextColor: isDark ? '#f5c842' : '#8a6700',
		noteBkgColor: isDark ? '#1a3050' : '#fff8e1',
		noteBorderColor: isDark ? '#f5c842' : '#d4a000',
		noteTextColor: isDark ? '#f5c842' : '#8a6700',
		primaryBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		primaryColor: isDark ? '#122540' : '#e8f4fd',
		primaryTextColor: isDark ? '#cce0f5' : '#091525',
		secondaryColor: isDark ? '#1a3050' : '#fff8e1',
		sequenceNumberColor: isDark ? '#f5c842' : '#8a6700',
		signalColor: isDark ? '#6b9cc0' : '#1a6ba0',
		signalTextColor: isDark ? '#cce0f5' : '#091525',
		tertiaryColor: isDark ? '#0d2a1f' : '#e8fff8'
	}
});

initAllDiagrams({
	fitPadding: 28,
	maxHeightPx: 960,
	maxHeightVh: 0.88,
	maxInitialZoom: 1.4,
	maxZoom: 6,
	minHeight: 500,
	minZoom: 0.06,
	readabilityFloor: 0.5,
	zoomStep: 0.13
});
