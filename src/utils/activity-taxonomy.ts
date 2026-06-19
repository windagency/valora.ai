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
	'valora-plugin-compression-python': Activity.Optimisation,
	'valora-plugin-compression-typescript': Activity.Optimisation,
	'valora-plugin-compression-universal': Activity.Optimisation,
	'valora-plugin-design': Activity.Design,
	'valora-plugin-docs': Activity.Documentation,
	'valora-plugin-engineering': Activity.Coding,
	'valora-plugin-implement': Activity.Coding,
	'valora-plugin-memory-vault': Activity.Infrastructure,
	'valora-plugin-obsidian': Activity.Platform,
	'valora-plugin-ollama': Activity.Platform,
	'valora-plugin-openrouter': Activity.Platform,
	'valora-plugin-platform': Activity.Infrastructure,
	'valora-plugin-product': Activity.Planning,
	'valora-plugin-qa': Activity.Testing,
	'valora-plugin-quality-gate': Activity.Review,
	'valora-plugin-rtk': Activity.Platform,
	'valora-plugin-secops': Activity.Security
};

export function pluginToActivity(plugin: string | undefined): Activity {
	if (plugin === undefined) return Activity.Other;
	return PLUGIN_ACTIVITY_MAP[plugin] ?? Activity.Other;
}
