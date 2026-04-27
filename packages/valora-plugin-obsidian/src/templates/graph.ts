export interface ObsidianGraphConfig {
	colorGroups: GraphColorGroup[];
	showAttachments: boolean;
	showTags: boolean;
}

interface GraphColorGroup {
	color: RgbColor;
	query: string;
}

interface ObsidianColors {
	decisions: string;
	episodic: string;
	semantic: string;
}

interface RgbColor {
	b: number;
	g: number;
	r: number;
}

export function buildGraphConfig(colors: ObsidianColors): ObsidianGraphConfig {
	return {
		colorGroups: [
			{ color: hexToRgb(colors.episodic), query: 'path:episodic' },
			{ color: hexToRgb(colors.semantic), query: 'path:semantic' },
			{ color: hexToRgb(colors.decisions), query: 'path:decisions' }
		],
		showAttachments: false,
		showTags: true
	};
}

export function hexToRgb(hex: string): RgbColor {
	const cleaned = hex.replace('#', '');
	return {
		b: parseInt(cleaned.slice(4, 6), 16),
		g: parseInt(cleaned.slice(2, 4), 16),
		r: parseInt(cleaned.slice(0, 2), 16)
	};
}
