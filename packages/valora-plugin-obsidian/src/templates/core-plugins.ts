export function buildCorePluginsConfig(): Record<string, boolean> {
	return {
		backlink: true,
		'file-explorer': true,
		graph: true,
		'outgoing-link': true,
		search: true,
		'tag-pane': true
	};
}
