import { Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import type { EventBuffer } from "./EventBuffer";
import type { OperabilitySnapshot } from "./types";

type BackgroundEngineLike = {
	isRunning: boolean;
	pendingCount: number;
	isAutoPublishActive: boolean;
	isAutoPublishPaused: boolean;
	queuedPaths: string[];
};

type StatusBarLike = {
	currentState: "ready" | "compiling" | "error" | "unconfigured";
};

type EngineSnapshot = {
	running: boolean;
	pending: number;
	autoPublish: boolean;
	autoPublishPaused: boolean;
	queuedPaths: string[];
};

export function assembleSnapshot(
	plugin: QuartzSyncer,
	eventBuffer?: EventBuffer | null,
): OperabilitySnapshot {
	const settings = plugin.settings;
	const engine = resolveEngine(plugin);
	const statusBar = resolveStatusBar(plugin);
	const cacheFileCount = resolveCacheFileCount(settings.cache);
	const cacheTimestamp = settings.cacheTimestamp || 0;
	const configured = !!settings.gitRemoteUrl || !!settings.quartzRepoPath;
	const activeModal = resolveActiveModal(eventBuffer ?? null);

	return {
		contractVersion: 1,
		timestamp: Date.now(),
		plugin: {
			version: plugin.appVersion ?? plugin.manifest.version,
			loaded: !!plugin.app,
			platform: Platform.isDesktopApp ? "desktop" : "mobile",
		},
		settings: {
			configured,
			provider: settings.gitProviderHint,
			hasToken: resolveHasToken(plugin),
			authType: settings.gitAuthType,
			branch: settings.gitBranch,
			contentFolder: settings.contentFolder,
			enableSystemCommands: settings.enableSystemCommands,
			autoPublishInterval: settings.autoPublishInterval,
		},
		engine: {
			running: engine.running,
			pending: engine.pending,
			autoPublish: engine.autoPublish,
			autoPublishPaused: engine.autoPublishPaused,
			queuedPaths: engine.queuedPaths,
		},
		publisher: {
			available: configured,
			isLocal: !!settings.quartzRepoPath,
			lastError: null,
		},
		statusBar: {
			state: statusBar.state,
		},
		activeUI: {
			modal: activeModal,
		},
		publishStatus: null,
		cache: {
			fileCount: cacheFileCount,
			lastUpdate: cacheTimestamp > 0 ? cacheTimestamp : null,
		},
		errors: {
			count: 0,
			latest: null,
		},
	};
}

function resolveActiveModal(eventBuffer: EventBuffer | null): string | null {
	if (!eventBuffer) return null;
	const events = eventBuffer.tail(eventBuffer.length);

	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === "ui.modal.opened") {
			return typeof event.payload.name === "string"
				? event.payload.name
				: null;
		}
		if (event?.type === "ui.modal.closed") {
			return null;
		}
	}

	return null;
}

function resolveEngine(plugin: QuartzSyncer): EngineSnapshot {
	const engineStatus = safeEngineStatus(plugin);
	const engine = resolveBackgroundEngine(plugin);

	return {
		running: engine?.isRunning ?? engineStatus.running,
		pending: engine?.pendingCount ?? engineStatus.pending,
		autoPublish: engine?.isAutoPublishActive ?? engineStatus.autoPublish,
		autoPublishPaused: engine?.isAutoPublishPaused ?? false,
		queuedPaths: engine?.queuedPaths ?? [],
	};
}

function resolveBackgroundEngine(
	plugin: QuartzSyncer,
): BackgroundEngineLike | null {
	const getter = (
		plugin as unknown as {
			getBackgroundEngine?: () => BackgroundEngineLike | null;
		}
	).getBackgroundEngine;
	if (typeof getter !== "function") {
		return null;
	}

	try {
		return getter() ?? null;
	} catch {
		return null;
	}
}

function resolveStatusBar(plugin: QuartzSyncer): {
	state: StatusBarLike["currentState"];
} {
	const getter = (
		plugin as unknown as { getStatusBar?: () => StatusBarLike | null }
	).getStatusBar;
	if (typeof getter !== "function") {
		return { state: "unconfigured" };
	}

	try {
		const statusBar = getter();
		if (!statusBar) {
			return { state: "unconfigured" };
		}
		return { state: statusBar.currentState };
	} catch {
		return { state: "unconfigured" };
	}
}

function resolveHasToken(plugin: QuartzSyncer): boolean {
	try {
		return plugin.secretStorageService?.hasToken?.() ?? false;
	} catch {
		return false;
	}
}

function resolveCacheFileCount(rawCache: string | undefined): number {
	if (!rawCache) {
		return 0;
	}

	try {
		const parsed = JSON.parse(rawCache) as Record<string, unknown>;
		if (!parsed || typeof parsed !== "object") {
			return 0;
		}
		return Object.keys(parsed).filter((key) => key.startsWith("file:"))
			.length;
	} catch {
		return 0;
	}
}

function safeEngineStatus(plugin: QuartzSyncer): {
	running: boolean;
	pending: number;
	autoPublish: boolean;
} {
	try {
		return plugin.getEngineStatus();
	} catch {
		return {
			running: false,
			pending: 0,
			autoPublish: false,
		};
	}
}
