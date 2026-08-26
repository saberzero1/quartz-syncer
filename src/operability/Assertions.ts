import type QuartzSyncer from "src/main";
import type { CheckName, CheckResult } from "./types";
import type { EventBuffer } from "./EventBuffer";

type StatusSummary = {
	unpublished: number;
	changed: number;
	published: number;
	deleted: number;
	media: number;
	arbitrary: number;
};

type ErrorSummary = {
	count: number;
	latest: string | null;
};

type CountKey = keyof StatusSummary;

const COUNT_KEYS: CountKey[] = [
	"unpublished",
	"changed",
	"published",
	"deleted",
	"media",
	"arbitrary",
];

export function runAssertion(
	check: CheckName,
	params: Record<string, unknown> | undefined,
	plugin: QuartzSyncer,
	eventBuffer: EventBuffer,
): CheckResult {
	switch (check) {
		case "health.core":
			return checkHealthCore(plugin, eventBuffer);
		case "health.configured":
			return checkHealthConfigured(plugin);
		case "health.connected":
			return checkHealthConnected(eventBuffer);
		case "pub.status.matches":
			return checkPublishStatusMatches(eventBuffer, params);
		case "pub.status.count":
			return checkPublishStatusCount(eventBuffer, params);
		case "engine.idle":
			return checkEngineIdle(plugin);
		case "engine.running":
			return checkEngineRunning(plugin);
		case "ui.modal.open":
			return checkUiModalOpen(eventBuffer, params);
		case "ui.modal.closed":
			return checkUiModalClosed(eventBuffer, params);
		case "errors.none":
			return checkErrorsNone(eventBuffer, params);
		default:
			return {
				pass: false,
				details: { reason: "Unknown check" },
			};
	}
}

function checkHealthCore(
	plugin: QuartzSyncer,
	eventBuffer: EventBuffer,
): CheckResult {
	const loaded = !!plugin.app;
	const hasDataStore = !!plugin.dataStore;
	const errors = summarizeErrors(eventBuffer);
	const pass = loaded && hasDataStore && errors.count === 0;

	return {
		pass,
		details: {
			loaded,
			dataStore: hasDataStore,
			errors,
		},
	};
}

function checkHealthConfigured(plugin: QuartzSyncer): CheckResult {
	const settings = plugin.settings;
	const configured = !!settings.gitRemoteUrl || !!settings.quartzRepoPath;
	const branch = settings.gitBranch;
	const authType = settings.gitAuthType;
	const needsToken = !settings.quartzRepoPath && authType !== "none";
	const hasToken = needsToken
		? (plugin.secretStorageService?.hasToken?.() ?? false)
		: true;
	const pass = configured && !!branch && hasToken;

	return {
		pass,
		details: {
			configured,
			branch: branch || null,
			authType,
			hasToken,
		},
	};
}

function checkHealthConnected(eventBuffer: EventBuffer): CheckResult {
	const event = findLatestEvent(eventBuffer, "connection.tested");

	if (!event) {
		return {
			pass: false,
			details: { reason: "not_tested" },
		};
	}

	const ok = event.payload.ok === true;

	return {
		pass: ok,
		details: {
			ok,
			readAccess: event.payload.readAccess ?? null,
			writeAccess: event.payload.writeAccess ?? null,
			cursor: event.cursor,
		},
	};
}

function checkPublishStatusMatches(
	eventBuffer: EventBuffer,
	params: Record<string, unknown> | undefined,
): CheckResult {
	const summary = getLatestStatusSummary(eventBuffer);

	if (!summary) {
		return {
			pass: false,
			details: { reason: "status_not_available" },
		};
	}

	const expected = parseExpectedCounts(params);

	if (!expected) {
		return {
			pass: false,
			details: { reason: "missing_expected", summary },
		};
	}

	const mismatches = compareCounts(summary, expected);

	return {
		pass: mismatches.length === 0,
		details: {
			summary,
			expected,
			mismatches,
		},
	};
}

function checkPublishStatusCount(
	eventBuffer: EventBuffer,
	params: Record<string, unknown> | undefined,
): CheckResult {
	const summary = getLatestStatusSummary(eventBuffer);

	if (!summary) {
		return {
			pass: false,
			details: { reason: "status_not_available" },
		};
	}

	const field =
		typeof params?.field === "string"
			? params.field
			: typeof params?.name === "string"
				? params.name
				: null;
	const value = typeof params?.value === "number" ? params.value : null;

	if (field && value !== null && isCountKey(field)) {
		const actual = summary[field];
		return {
			pass: actual === value,
			details: { field, expected: value, actual },
		};
	}

	const expected = parseExpectedCounts(params);

	if (!expected) {
		return {
			pass: false,
			details: { reason: "missing_expected", summary },
		};
	}

	const mismatches = compareCounts(summary, expected);

	return {
		pass: mismatches.length === 0,
		details: {
			summary,
			expected,
			mismatches,
		},
	};
}

function checkEngineIdle(plugin: QuartzSyncer): CheckResult {
	const status = safeEngineStatus(plugin);
	const pass = status.pending === 0;

	return {
		pass,
		details: {
			pending: status.pending,
			running: status.running,
			autoPublish: status.autoPublish,
		},
	};
}

function checkEngineRunning(plugin: QuartzSyncer): CheckResult {
	const status = safeEngineStatus(plugin);

	return {
		pass: status.running,
		details: {
			running: status.running,
			pending: status.pending,
			autoPublish: status.autoPublish,
		},
	};
}

function checkUiModalOpen(
	eventBuffer: EventBuffer,
	params: Record<string, unknown> | undefined,
): CheckResult {
	const modal = typeof params?.modal === "string" ? params.modal : null;
	const latest = getLatestModalState(eventBuffer, modal);

	if (!latest) {
		return {
			pass: false,
			details: { reason: "not_observed", modal },
		};
	}

	return {
		pass: latest.state === "open",
		details: {
			modal: latest.modal,
			state: latest.state,
			cursor: latest.cursor,
		},
	};
}

function checkUiModalClosed(
	eventBuffer: EventBuffer,
	params: Record<string, unknown> | undefined,
): CheckResult {
	const modal = typeof params?.modal === "string" ? params.modal : null;
	const latest = getLatestModalState(eventBuffer, modal);

	if (!latest) {
		return {
			pass: false,
			details: { reason: "not_observed", modal },
		};
	}

	return {
		pass: latest.state === "closed",
		details: {
			modal: latest.modal,
			state: latest.state,
			cursor: latest.cursor,
		},
	};
}

function checkErrorsNone(
	eventBuffer: EventBuffer,
	params: Record<string, unknown> | undefined,
): CheckResult {
	const cursor = typeof params?.cursor === "number" ? params.cursor : 0;
	const since = eventBuffer.since(cursor);

	if (!Array.isArray(since)) {
		return {
			pass: false,
			details: {
				reason: since.error,
				oldestAvailable: since.oldestAvailable,
			},
		};
	}

	const errors = since.filter((event) => event.type === "error.occurred");
	const latest = errors.length
		? toErrorMessage(errors[errors.length - 1]?.payload)
		: null;

	return {
		pass: errors.length === 0,
		details: {
			count: errors.length,
			latest,
			cursor,
		},
	};
}

function summarizeErrors(eventBuffer: EventBuffer): ErrorSummary {
	const events = eventBuffer.tail(eventBuffer.length);
	const errors = events.filter((event) => event.type === "error.occurred");
	const latest = errors.length
		? toErrorMessage(errors[errors.length - 1]?.payload)
		: null;

	return {
		count: errors.length,
		latest,
	};
}

function getLatestStatusSummary(
	eventBuffer: EventBuffer,
): StatusSummary | null {
	const events = eventBuffer.tail(eventBuffer.length);

	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type !== "status.refreshed") continue;
		const summary = parseStatusSummary(event.payload?.summary);
		if (summary) return summary;
	}

	return null;
}

function parseStatusSummary(value: unknown): StatusSummary | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	const unpublished = getNumber(record, "unpublished");
	const changed = getNumber(record, "changed");
	const published = getNumber(record, "published");
	const deleted = getNumber(record, "deleted");
	const media = getNumber(record, "media");
	const arbitrary = getNumber(record, "arbitrary");

	if (
		unpublished === null ||
		changed === null ||
		published === null ||
		deleted === null ||
		media === null ||
		arbitrary === null
	) {
		return null;
	}

	return {
		unpublished,
		changed,
		published,
		deleted,
		media,
		arbitrary,
	};
}

function parseExpectedCounts(
	params: Record<string, unknown> | undefined,
): Partial<Record<CountKey, number>> | null {
	const candidate =
		(params?.expected as Record<string, unknown> | undefined) ??
		(params?.status as Record<string, unknown> | undefined) ??
		(params?.counts as Record<string, unknown> | undefined) ??
		params;

	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const expected: Partial<Record<CountKey, number>> = {};

	for (const key of COUNT_KEYS) {
		const value = candidate[key];
		if (typeof value === "number") {
			expected[key] = value;
		}
	}

	return Object.keys(expected).length > 0 ? expected : null;
}

function compareCounts(
	summary: StatusSummary,
	expected: Partial<Record<CountKey, number>>,
): Array<{ key: CountKey; expected: number; actual: number }> {
	const mismatches: Array<{
		key: CountKey;
		expected: number;
		actual: number;
	}> = [];

	for (const key of Object.keys(expected) as CountKey[]) {
		const expectedValue = expected[key];
		if (typeof expectedValue !== "number") continue;
		const actual = summary[key];
		if (actual !== expectedValue) {
			mismatches.push({ key, expected: expectedValue, actual });
		}
	}

	return mismatches;
}

function getLatestModalState(
	eventBuffer: EventBuffer,
	modal: string | null,
): { state: "open" | "closed"; cursor: number; modal: string | null } | null {
	const events = eventBuffer.tail(eventBuffer.length);

	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event) continue;
		if (
			event.type !== "ui.modal.opened" &&
			event.type !== "ui.modal.closed"
		) {
			continue;
		}
		const eventModal =
			typeof event.payload.modal === "string"
				? event.payload.modal
				: null;
		if (modal && eventModal !== modal) {
			continue;
		}
		return {
			state: event.type === "ui.modal.opened" ? "open" : "closed",
			cursor: event.cursor,
			modal: eventModal,
		};
	}

	return null;
}

function findLatestEvent(
	eventBuffer: EventBuffer,
	type: string,
): { cursor: number; payload: Record<string, unknown> } | null {
	const events = eventBuffer.tail(eventBuffer.length);

	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === type) {
			return { cursor: event.cursor, payload: event.payload };
		}
	}

	return null;
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

function isCountKey(value: string): value is CountKey {
	return COUNT_KEYS.includes(value as CountKey);
}

function getNumber(
	record: Record<string, unknown>,
	key: CountKey,
): number | null {
	const value = record[key];
	return typeof value === "number" ? value : null;
}

function toErrorMessage(payload: Record<string, unknown> | undefined): string {
	if (!payload) return "Unknown error";
	const message =
		typeof payload.message === "string"
			? payload.message
			: typeof payload.error === "string"
				? payload.error
				: null;
	if (message) return message;

	try {
		return JSON.stringify(payload);
	} catch {
		return "Unknown error";
	}
}
