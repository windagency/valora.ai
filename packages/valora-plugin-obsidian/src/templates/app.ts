export interface ObsidianAppConfig {
	legacyEditor: boolean;
	livePreview: boolean;
	showLineNumber: boolean;
}

export function buildAppConfig(): ObsidianAppConfig {
	return { legacyEditor: false, livePreview: true, showLineNumber: false };
}
