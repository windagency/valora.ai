import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

import { initAllDiagrams, isDark } from './shared.js';

mermaid.initialize({
	startOnLoad: false,
	theme: 'base',
	themeVariables: {
		activationBkgColor: isDark ? '#3a6080' : '#d0e8f8',
		activationBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		actorBkg: isDark ? '#0d1e35' : '#e8f4fd',
		actorBorder: isDark ? '#3b9edd' : '#1a6ba0',
		actorLineColor: isDark ? '#3a6080' : '#7ab0d4',
		actorTextColor: isDark ? '#cce0f5' : '#091525',
		edgeLabelBackground: isDark ? '#091525' : '#f0f8ff',
		fontFamily: "'DM Sans', system-ui, sans-serif",
		fontSize: '13px',
		labelBoxBkgColor: isDark ? '#0d1e35' : '#f0f8ff',
		labelBoxBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		labelTextColor: isDark ? '#cce0f5' : '#091525',
		lineColor: isDark ? '#3a6080' : '#7ab0d4',
		loopTextColor: isDark ? '#6b9cc0' : '#1a6ba0',
		noteBkgColor: isDark ? '#122540' : '#f0f8ff',
		noteBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		noteTextColor: isDark ? '#6b9cc0' : '#1a6ba0',
		primaryBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		primaryColor: isDark ? '#0d1e35' : '#e8f4fd',
		primaryTextColor: isDark ? '#cce0f5' : '#091525',
		sequenceNumberColor: isDark ? '#f5c842' : '#8a6700',
		signalColor: isDark ? '#4ecdc4' : '#1a8080',
		signalTextColor: isDark ? '#cce0f5' : '#091525'
	}
});

initAllDiagrams({
	fitPadding: 24,
	maxHeightPx: 1600,
	maxHeightVh: 0.94,
	maxInitialZoom: 1.4,
	maxZoom: 6,
	minHeight: 500,
	minZoom: 0.06,
	readabilityFloor: 0.45,
	zoomStep: 0.13
});
