import { ensureQuartzCache } from "./quartz-setup";

/**
 * Vitest globalSetup — runs once before any test file in this suite.
 * Clones and caches Quartz v5 so individual test files don't race.
 */
export function setup(): void {
	ensureQuartzCache();
}
