import { App } from "obsidian";
import {
	getAPI,
	type ExtendedMetadataCacheAPI,
	type ExtendedMetadataCacheHandle,
} from "obsidian-extended-metadatacache";

/**
 * Manages the lifecycle of obsidian-extended-metadatacache.
 * Uses the shared singleton pattern so other plugins sharing the library
 * reuse the same cache instance.
 */
export class ExtendedCacheService {
	private handle: ExtendedMetadataCacheHandle | null = null;
	private readyPromise: Promise<void>;
	private resolveReady!: () => void;

	constructor(app: App) {
		this.readyPromise = new Promise((resolve) => {
			this.resolveReady = resolve;
		});

		this.handle = getAPI(app);
		const api = this.handle.api;

		if (api.isReady) {
			this.resolveReady();
		} else {
			api.on("ready", () => this.resolveReady());
		}
	}

	/** The inverse cache API. Only call after `waitForReady()` resolves. */
	get api(): ExtendedMetadataCacheAPI {
		if (!this.handle) {
			throw new Error("ExtendedCacheService already destroyed");
		}

		return this.handle.api;
	}

	/** Whether the cache has finished its initial index build. */
	get isReady(): boolean {
		return this.handle?.api.isReady ?? false;
	}

	/** Resolves when the initial index build completes. */
	waitForReady(): Promise<void> {
		return this.readyPromise;
	}

	/** Release the handle. Call in plugin onunload(). */
	destroy(): void {
		this.handle?.release();
		this.handle = null;
	}
}
