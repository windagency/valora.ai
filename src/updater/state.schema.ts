import { z } from 'zod';

const PLUGIN_UPDATE_STATE_SCHEMA = z.object({
	latestVersion: z.string().nullable(),
	latestVersionFetchedAt: z.string().nullable(),
	remindedForVersion: z.string().nullable()
});

const V2_SCHEMA = z.object({
	installedVersionAtCheck: z.string().nullable(),
	lastCheckAt: z.string(),
	lastSuccessAt: z.string().nullable(),
	latestVersion: z.string().nullable(),
	latestVersionFetchedAt: z.string().nullable(),
	plugins: z.record(z.string(), PLUGIN_UPDATE_STATE_SCHEMA).default({}),
	remindedForVersion: z.string().nullable(),
	schemaVersion: z.literal(2)
});

const V1_SCHEMA = z.object({
	installedVersionAtCheck: z.string().nullable(),
	lastCheckAt: z.string(),
	lastSuccessAt: z.string().nullable(),
	latestVersion: z.string().nullable(),
	latestVersionFetchedAt: z.string().nullable(),
	remindedForVersion: z.string().nullable(),
	schemaVersion: z.literal(1)
});

export const UPDATE_CHECK_STATE_SCHEMA = z.union([
	V2_SCHEMA,
	V1_SCHEMA.transform((v1) => ({
		...v1,
		plugins: {} as Record<string, z.infer<typeof PLUGIN_UPDATE_STATE_SCHEMA>>,
		schemaVersion: 2 as const
	}))
]);
