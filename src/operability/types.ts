/**
 * Snapshot of the operability state read model.
 */
export interface OperabilitySnapshot {
	contractVersion: 1;
	timestamp: number;
	plugin: {
		version: string;
		loaded: boolean;
		platform: "desktop" | "mobile";
	};
	settings: {
		configured: boolean; // has gitRemoteUrl set
		provider: string; // gitProviderHint value
		hasToken: boolean; // token exists in SecretStorage
		authType: string; // gitAuthType value
		branch: string; // gitBranch value
		contentFolder: string; // contentFolder value
		enableSystemCommands: boolean;
		autoPublishInterval: number; // 0 = disabled
		// NOTE: no remote URL, no token value, no CORS proxy — redacted for security
	};
	engine: {
		running: boolean;
		pending: number;
		autoPublish: boolean;
		autoPublishPaused: boolean;
		queuedPaths: string[];
	};
	publisher: {
		available: boolean; // getPublisher() !== null
		isLocal: boolean;
		lastError: string | null;
	};
	statusBar: {
		state: "ready" | "compiling" | "error" | "unconfigured";
	};
	activeUI: {
		modal: string | null; // "publication-center" | "onboarding-wizard" | "diff-viewer" | ...
	};
	publishStatus: {
		unpublished: number;
		changed: number;
		published: number;
		deleted: number;
		media: number;
		arbitrary: number;
		stale: boolean; // true if status hasn't been refreshed this session
	} | null; // null if never computed
	cache: {
		fileCount: number;
		lastUpdate: number | null;
	};
	errors: {
		count: number;
		latest: string | null;
	};
}

/**
 * Event record stored in the operability ring buffer.
 */
export interface QSEvent {
	cursor: number;
	timestamp: number;
	type: QSEventType;
	payload: Record<string, unknown>;
}

export type QSEventType =
	| "plugin.loaded"
	| "plugin.unloading"
	| "settings.changed"
	| "engine.started"
	| "engine.stopped"
	| "compilation.enqueued"
	| "compilation.completed"
	| "compilation.failed"
	| "publish.started"
	| "publish.completed"
	| "publish.failed"
	| "delete.started"
	| "delete.completed"
	| "delete.failed"
	| "status.refreshed"
	| "connection.tested"
	| "error.occurred"
	| "ui.modal.opened"
	| "ui.modal.closed";

export type Action =
	| { name: "pub.open" }
	| { name: "pub.close" }
	| { name: "pub.select"; params: { paths: string[] } }
	| { name: "pub.deselect"; params: { paths: string[] } }
	| { name: "pub.selectAll" }
	| { name: "pub.deselectAll" }
	| { name: "pub.publish"; params: { message?: string; confirm: true } }
	| { name: "pub.delete"; params: { confirm: true } }
	| { name: "status.refresh" }
	| { name: "onboarding.start" }
	| { name: "onboarding.setToken"; params: { token: string } }
	| {
			name: "onboarding.createRepo";
			params: { name: string; private?: boolean; confirm: true };
	  }
	| { name: "onboarding.connectRepo"; params: { repo: string } }
	| { name: "onboarding.configure" }
	| { name: "settings.set"; params: { key: string; value: unknown } }
	| { name: "settings.get"; params: { key: string } }
	| { name: "plugin.reload"; params: { confirm: true } }
	| { name: "connection.test" }
	| {
			name: "env.emulateMobile";
			params: { enabled: boolean; confirm: true };
	  };

/**
 * Result returned from operability actions.
 */
export interface ActionResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Result returned from operability checks.
 */
export interface CheckResult {
	pass: boolean;
	details: Record<string, unknown>;
}

export type CheckName =
	| "health.core"
	| "health.configured"
	| "health.connected"
	| "pub.status.matches"
	| "pub.status.count"
	| "engine.idle"
	| "engine.running"
	| "ui.modal.open"
	| "ui.modal.closed"
	| "errors.none";

/**
 * Write-only interface for services to emit operability events.
 * Services depend on this minimal interface, never on the full EventBuffer or facade.
 */
export interface IOperabilityEventSink {
	emit(type: QSEventType, payload: Record<string, unknown>): void;
}

/**
 * Reader interface for the operability event ring buffer.
 */
export interface EventBufferReader {
	tail(n: number): QSEvent[];
	since(
		cursor: number,
	): QSEvent[] | { error: "cursor_evicted"; oldestAvailable: number };
}

/**
 * Facade exposing operability snapshots, events, actions, and checks.
 */
export interface OperabilityFacade {
	snapshot(): OperabilitySnapshot;
	events: EventBufferReader;
	act(action: Action): Promise<ActionResult>;
	assert(check: CheckName, params?: Record<string, unknown>): CheckResult;
	waitFor(
		condition: CheckName,
		params?: Record<string, unknown>,
		timeoutMs?: number,
	): Promise<CheckResult>;
	reloadSelf(): Promise<ActionResult>;
}
