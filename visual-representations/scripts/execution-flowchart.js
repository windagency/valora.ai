import elkLayouts from 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0.1.5/dist/mermaid-layout-elk.esm.min.mjs';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

import { initAllDiagrams, isDark } from './shared.js';

mermaid.registerLayoutLoaders(elkLayouts);

mermaid.initialize({
	layout: 'elk',
	look: 'classic',
	startOnLoad: false,
	theme: 'base',
	themeVariables: {
		clusterBkg: isDark ? '#091525' : '#f0f8ff',
		clusterBorder: isDark ? '#3a6080' : '#7ab0d4',
		edgeLabelBackground: isDark ? '#091525' : '#f0f8ff',
		fontFamily: "'DM Sans', system-ui, sans-serif",
		fontSize: '14px',
		lineColor: isDark ? '#3a6080' : '#7ab0d4',
		noteBkgColor: isDark ? '#122540' : '#f0f8ff',
		noteBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		noteTextColor: isDark ? '#cce0f5' : '#091525',
		primaryBorderColor: isDark ? '#3b9edd' : '#1a6ba0',
		primaryColor: isDark ? '#0d1e35' : '#e8f4fd',
		primaryTextColor: isDark ? '#cce0f5' : '#091525',
		secondaryBorderColor: isDark ? '#4ecdc4' : '#1a8080',
		secondaryColor: isDark ? '#091525' : '#f0f8ff',
		secondaryTextColor: isDark ? '#cce0f5' : '#091525',
		tertiaryBorderColor: isDark ? '#4ecdc4' : '#1a8080',
		tertiaryColor: isDark ? '#091a1a' : '#e8fff8',
		tertiaryTextColor: isDark ? '#cce0f5' : '#091525'
	}
});

initAllDiagrams({
	fitPadding: 28,
	maxHeightPx: 1100,
	maxHeightVh: 0.9,
	maxInitialZoom: 1.6,
	maxZoom: 6,
	minHeight: 500,
	minZoom: 0.06,
	readabilityFloor: 0.5,
	zoomStep: 0.13
});
