import * as path from 'node:path';

import type { AgentConstraints } from 'types/agent.types';

import { resolveRealPathBestEffort } from 'utils/real-path';

export interface EffectivePermissions {
	delegationDepth: number;
	forbidden_paths: string[];
	requires_approval_for: string[];
}

export class PermissionPropagationService {
	/**
	 * Derive the effective permissions for a child agent given its parent's constraints.
	 *
	 * Intersection rule: a child can never gain scope the parent forbids.
	 * Forbidden paths are UNIONED (child can never write what parent can't write).
	 * Approval requirements are UNIONED (child inherits all parent approval gates).
	 */
	derive(parent: AgentConstraints, child: AgentConstraints, parentDelegationDepth = 0): EffectivePermissions {
		const parentForbidden = parent.forbidden_paths ?? [];
		const childForbidden = child.forbidden_paths ?? [];
		const forbiddenPaths = [...new Set([...childForbidden, ...parentForbidden])];

		const parentApproval = parent.requires_approval_for ?? [];
		const childApproval = child.requires_approval_for ?? [];
		const requiresApprovalFor = [...new Set([...childApproval, ...parentApproval])];

		return {
			delegationDepth: parentDelegationDepth + 1,
			forbidden_paths: forbiddenPaths,
			requires_approval_for: requiresApprovalFor
		};
	}

	/**
	 * Returns true if the given file path falls under any forbidden path prefix.
	 *
	 * Both sides are resolved to their real (symlink-free, `..`-collapsed) form
	 * before comparing — a lexical-only comparison can be defeated by an
	 * unnormalized ".." segment, or by a mismatch between a caller's
	 * already-symlink-resolved path and a `forbidden_paths` entry configured
	 * using an unresolved symlink pointing at the same real location.
	 */
	isForbidden(filePath: string, forbiddenPaths: string[]): boolean {
		if (forbiddenPaths.length === 0) return false;
		const resolvedFilePath = resolveRealPathBestEffort(filePath);
		return forbiddenPaths.some((forbidden) => {
			const resolvedForbidden = resolveRealPathBestEffort(forbidden);
			return resolvedFilePath === resolvedForbidden || resolvedFilePath.startsWith(resolvedForbidden + path.sep);
		});
	}

	/**
	 * Returns true if the given file path matches any approval-required pattern.
	 * Supports simple glob wildcards (*) in patterns.
	 */
	requiresApproval(filePath: string, patterns: string[]): boolean {
		if (patterns.length === 0) return false;
		const fileName = filePath.split('/').pop() ?? filePath;
		return patterns.some((pattern) => {
			if (!pattern.includes('*')) {
				return fileName === pattern || filePath === pattern;
			}
			const regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
			return new RegExp(`^${regexStr}$`).test(fileName) || new RegExp(`^${regexStr}$`).test(filePath);
		});
	}
}

let serviceInstance: null | PermissionPropagationService = null;

export function getPermissionPropagationService(): PermissionPropagationService {
	serviceInstance ??= new PermissionPropagationService();
	return serviceInstance;
}
