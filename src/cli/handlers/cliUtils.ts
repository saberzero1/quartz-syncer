import type QuartzSyncer from "src/main";
import { createGitBackend } from "src/git/GitBackendFactory";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { RemoteFileSource } from "src/quartz/RemoteFileSource";

export function createRepositoryAdapter(
	plugin: QuartzSyncer,
): QuartzFileSource | null {
	if (!plugin.settings.gitRemoteUrl) {
		return null;
	}

	const gitSettings = plugin.getGitSettingsWithSecret();
	const backend = createGitBackend(
		{
			remoteUrl: gitSettings.remoteUrl,
			branch: gitSettings.branch,
			corsProxyUrl: gitSettings.corsProxyUrl,
			auth: gitSettings.auth,
		},
		plugin.app,
	);
	const branch = plugin.settings.gitBranch || "v4";

	return new RemoteFileSource(backend, branch);
}

export function getValueByPath(
	input: Record<string, unknown>,
	path: string,
): unknown {
	if (!path) return undefined;

	if (Object.prototype.hasOwnProperty.call(input, path)) {
		return input[path];
	}

	const parts = path.split(".");
	let current: unknown = input;

	for (const part of parts) {
		if (!current || typeof current !== "object") return undefined;
		const record = current as Record<string, unknown>;
		if (!Object.prototype.hasOwnProperty.call(record, part)) {
			return undefined;
		}
		current = record[part];
	}

	return current;
}

export function setValueByPath(
	input: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	if (!path) return;

	if (Object.prototype.hasOwnProperty.call(input, path)) {
		input[path] = value;
		return;
	}

	const parts = path.split(".");
	let current: Record<string, unknown> = input;

	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (!part) continue;

		if (index === parts.length - 1) {
			current[part] = value;
			return;
		}

		const existing = current[part];
		if (
			!existing ||
			typeof existing !== "object" ||
			Array.isArray(existing)
		) {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
			continue;
		}

		current = existing as Record<string, unknown>;
	}
}

export function parseCliValue(rawValue: string | undefined): unknown {
	if (rawValue === undefined) return undefined;
	const trimmed = rawValue.trim();

	if (trimmed === "") return "";

	const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
	const isPrimitive =
		trimmed === "true" ||
		trimmed === "false" ||
		trimmed === "null" ||
		/^-?\d+(\.\d+)?$/.test(trimmed);

	if (looksLikeJson || isPrimitive) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return rawValue;
		}
	}

	return rawValue;
}
