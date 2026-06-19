import type { Rule } from 'eslint';

const LAYER_ORDER = ['types', 'config', 'repo', 'services', 'runtime', 'ui'] as const;

type Layer = (typeof LAYER_ORDER)[number];

function detectLayer(segment: string): Layer | undefined {
	return LAYER_ORDER.find((layer) => segment === layer);
}

function fileLayerIndex(filename: string): number {
	for (const layer of LAYER_ORDER) {
		if (filename.includes(`/src/${layer}/`) || filename.includes(`/${layer}/`)) {
			return LAYER_ORDER.indexOf(layer);
		}
	}
	return -1;
}

function layerIndex(importPath: string): number {
	const segment = importPath.split('/')[0];
	const layer = detectLayer(segment ?? '');
	return layer !== undefined ? LAYER_ORDER.indexOf(layer) : -1;
}

export const importLayerRemedyRule: Rule.RuleModule = {
	create(context) {
		return {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			ImportDeclaration(node) {
				const importPath = node.source.value as string;
				const importIdx = layerIndex(importPath);
				const fileIdx = fileLayerIndex(context.filename);

				if (importIdx === -1 || fileIdx === -1) return;
				if (importIdx <= fileIdx) return;

				const suggested =
					importPath
						.split('/')
						.pop()
						?.replace(/\.(service|repo|runtime|ui)$/, '') ?? 'shared';

				context.report({
					data: { importPath, layer: LAYER_ORDER[fileIdx], suggested },
					messageId: 'layerViolation',
					node
				});
			}
		};
	},
	meta: {
		docs: {
			description: 'Enforce forward-only layer imports and surface agent-targeted remediation instructions'
		},
		messages: {
			layerViolation:
				"Layer violation: '{{importPath}}' is a higher-layer module imported from '{{layer}}' layer. " +
				"Fix: extract the shared contract into 'types/{{suggested}}.types.ts' and import from there. " +
				'Allowed direction: types → config → repo → services → runtime → ui. ' +
				'Cross-cutting concerns must enter through Providers only.'
		},
		schema: [],
		type: 'problem'
	}
};
