export function buildWorkspaceConfig(): Record<string, unknown> {
	return {
		active: 'main-leaf',
		lastOpenFiles: [],
		left: {
			children: [
				{ id: 'file-explorer-leaf', state: { state: {}, type: 'file-explorer' }, type: 'leaf' },
				{ id: 'tag-pane-leaf', state: { state: {}, type: 'tag' }, type: 'leaf' }
			],
			collapsed: false,
			id: 'left-sidebar',
			type: 'split'
		},
		main: {
			children: [{ id: 'main-leaf', state: { state: {}, type: 'empty' }, type: 'leaf' }],
			id: 'main',
			type: 'split'
		},
		right: {
			children: [
				{
					id: 'backlinks-leaf',
					state: { state: { file: null, linkedFiles: {}, unlinkedFiles: {} }, type: 'backlink' },
					type: 'leaf'
				}
			],
			collapsed: false,
			id: 'right-sidebar',
			type: 'split'
		}
	};
}
