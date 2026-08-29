import type { GitBackend, GitBackendConfig } from "./types";
import { ProviderError } from "./errors";
import type { App } from "obsidian";

type BackendConstructor = new (
	config: GitBackendConfig,
	app: App,
) => GitBackend;

let BundledGitBackendClass: BackendConstructor | null = null;

export function registerBundledGitBackend(ctor: BackendConstructor): void {
	BundledGitBackendClass = ctor;
}

export function createGitBackend(
	config: GitBackendConfig,
	app: App,
): GitBackend {
	if (!BundledGitBackendClass) {
		throw new ProviderError(
			"No git backend registered. The bundled git backend must be registered before use.",
		);
	}
	return new BundledGitBackendClass(config, app);
}
