/**
 * Zod schema for the update-check state file.
 */

import { z } from 'zod';

export const UPDATE_CHECK_STATE_SCHEMA = z.object({
	installedVersionAtCheck: z.string().nullable(),
	lastCheckAt: z.string(),
	lastSuccessAt: z.string().nullable(),
	latestVersion: z.string().nullable(),
	latestVersionFetchedAt: z.string().nullable(),
	remindedForVersion: z.string().nullable(),
	schemaVersion: z.literal(1)
});

export type UpdateCheckState = z.infer<typeof UPDATE_CHECK_STATE_SCHEMA>;
