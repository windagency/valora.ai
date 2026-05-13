export enum Activity {
	Coding = 'Coding',
	Design = 'Design',
	Documentation = 'Documentation',
	Infrastructure = 'Infrastructure',
	Optimisation = 'Optimisation',
	Other = 'Other',
	Planning = 'Planning',
	Platform = 'Platform',
	Review = 'Review',
	Security = 'Security',
	Testing = 'Testing'
}

const PLUGIN_ACTIVITY_MAP: Record<string, Activity> = {
	'valora-core-design': Activity.Design,
	'valora-core-docs': Activity.Documentation,
	'valora-core-engineering': Activity.Coding,
	'valora-core-implement': Activity.Coding,
	'valora-core-platform': Activity.Infrastructure,
	'valora-core-product': Activity.Planning,
	'valora-core-qa': Activity.Testing,
	'valora-core-quality-gate': Activity.Review,
	'valora-core-secops': Activity.Security,
	'valora-plugin-compression-python': Activity.Optimisation,
	'valora-plugin-compression-typescript': Activity.Optimisation,
	'valora-plugin-compression-universal': Activity.Optimisation,
	'valora-plugin-memory-vault': Activity.Infrastructure,
	'valora-plugin-obsidian': Activity.Platform,
	'valora-plugin-ollama': Activity.Platform,
	'valora-plugin-openrouter': Activity.Platform,
	'valora-plugin-rtk': Activity.Platform
};

export function pluginToActivity(plugin: string | undefined): Activity {
	if (plugin === undefined) return Activity.Other;
	return PLUGIN_ACTIVITY_MAP[plugin] ?? Activity.Other;
}
