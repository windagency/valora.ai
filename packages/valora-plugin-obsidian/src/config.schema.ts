import { z } from 'zod';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const hexColor = z.string().regex(HEX_COLOR_RE, 'Must be a valid 6-digit hex colour (e.g. #4c9be8)');

export const obsidianColorsSchema = z
	.object({
		decisions: hexColor.default('#059669'),
		episodic: hexColor.default('#4c9be8'),
		semantic: hexColor.default('#7c3aed')
	})
	.default({});

export const obsidianConfigSchema = z
	.object({
		obsidian: z
			.object({
				colors: obsidianColorsSchema,
				vaultDir: z.string().optional()
			})
			.default({})
	})
	.default({});

export type ObsidianColors = z.infer<typeof obsidianColorsSchema>;
export type ObsidianConfig = z.infer<typeof obsidianConfigSchema>;
