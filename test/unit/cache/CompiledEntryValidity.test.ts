import { describe, expect, it, vi } from "vitest";
import {
	DYNAMIC_CONTENT_DETECTOR_VERSION,
	isCompiledEntryValid,
	settingsFingerprint,
	type CompiledEntryValidityCriteria,
} from "src/cache/CompiledEntryValidity";
import { DEFAULT_SETTINGS } from "src/main";
import { getDynamicSources } from "src/utils/dynamicContent";
import {
	DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS,
	waitForDataviewSyntaxResolution,
} from "src/compiler/integrations/apis/dataview";

const criteria: CompiledEntryValidityCriteria = {
	mtime: 1000,
	dataviewRevision: 4,
	datacoreRevision: 8,
	version: "cache-v1",
	settingsFingerprint: "settings-a",
	detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
};

const base = {
	version: "cache-v1",
	sourceMtime: 1000,
	settingsFingerprint: "settings-a",
	detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
};

describe("isCompiledEntryValid", () => {
	it("accepts an unchanged static payload", () => {
		expect(
			isCompiledEntryValid(
				{
					...base,
					dynamicSources: [],
					localData: ["compiled", { blobs: [] }],
					localHash: "hash",
					mediaLinks: [],
				},
				criteria,
			),
		).toBe(true);
	});

	it("uses only revisions for sources the note depends on", () => {
		const entry = {
			...base,
			dynamicSources: ["dataview"],
			dataviewRevision: 4,
		};
		expect(isCompiledEntryValid(entry, criteria)).toBe(true);
		expect(
			isCompiledEntryValid(entry, { ...criteria, datacoreRevision: 99 }),
		).toBe(true);
		expect(
			isCompiledEntryValid(entry, { ...criteria, dataviewRevision: 3 }),
		).toBe(false);
		expect(
			isCompiledEntryValid(entry, {
				...criteria,
				dataviewRevision: undefined,
			}),
		).toBe(false);
	});

	it("invalidates when a revision counter resets", () => {
		expect(
			isCompiledEntryValid(
				{
					...base,
					dynamicSources: ["dataview"],
					dataviewRevision: 10,
				},
				{ ...criteria, dataviewRevision: 1 },
			),
		).toBe(false);
	});

	// Parameterised over every revision-backed source. Before this existed the
	// datacore branch had no coverage at all: deleting it from the source map
	// kept all 1,999 tests green.
	it.each([
		["dataview", "dataviewRevision"],
		["datacore", "datacoreRevision"],
	] as const)("enforces the %s revision counter", (source, revisionField) => {
		const entry = {
			...base,
			dynamicSources: [source],
			[revisionField]: 4,
		};

		expect(
			isCompiledEntryValid(entry, { ...criteria, [revisionField]: 4 }),
		).toBe(true);
		expect(
			isCompiledEntryValid(entry, { ...criteria, [revisionField]: 5 }),
		).toBe(false);
		expect(
			isCompiledEntryValid(entry, {
				...criteria,
				[revisionField]: undefined,
			}),
		).toBe(false);
		expect(
			isCompiledEntryValid(
				{ ...base, dynamicSources: [source] },
				{ ...criteria, [revisionField]: 4 },
			),
		).toBe(false);
	});

	it("treats missing classifications and no-counter sources as unknown", () => {
		expect(isCompiledEntryValid(base, criteria)).toBe(false);
		expect(
			isCompiledEntryValid(
				{ ...base, dynamicSources: ["fantasy-statblocks"] },
				criteria,
			),
		).toBe(false);
	});

	it("rejects dynamic records carrying any trusted payload", () => {
		expect(
			isCompiledEntryValid(
				{
					...base,
					dynamicSources: ["dataview"],
					dataviewRevision: 4,
					localHash: "stale",
					localData: ["stale", { blobs: [] }],
					mediaLinks: ["images/stale.png"],
				},
				criteria,
			),
		).toBe(false);
	});

	it("invalidates compilation-affecting settings and detector changes", () => {
		const fingerprint = settingsFingerprint(DEFAULT_SETTINGS);
		expect(
			settingsFingerprint({
				...DEFAULT_SETTINGS,
				useFantasyStatblocks: !DEFAULT_SETTINGS.useFantasyStatblocks,
			}),
		).not.toBe(fingerprint);

		const entry = { ...base, dynamicSources: [] };
		expect(
			isCompiledEntryValid(entry, {
				...criteria,
				settingsFingerprint: "settings-b",
			}),
		).toBe(false);
		expect(
			isCompiledEntryValid(entry, {
				...criteria,
				detectorVersion: "next-detector",
			}),
		).toBe(false);
	});

	it("includes effective Dataview syntax without changing while its API initializes", () => {
		const settings = { ...DEFAULT_SETTINGS, useDataview: true };
		const customSyntax = {
			dataviewJsKeyword: "datajs",
			inlineQueryPrefix: "dv=",
			inlineJsQueryPrefix: "js=",
		};
		const plugin: {
			settings?: typeof customSyntax;
			api?: { settings: typeof customSyntax };
		} = { settings: customSyntax };
		const originalApp = Reflect.get(window, "app");

		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});
			const beforeApi = settingsFingerprint(settings);
			plugin.api = { settings: customSyntax };
			delete plugin.settings;
			const afterApi = settingsFingerprint(settings);

			expect(afterApi).toBe(beforeApi);
			plugin.api.settings.inlineQueryPrefix = "new=";
			expect(settingsFingerprint(settings)).not.toBe(afterApi);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
		}
	});

	it("uses stable documented Dataview defaults when the plugin is absent", () => {
		const settings = { ...DEFAULT_SETTINGS, useDataview: true };
		const originalApp = Reflect.get(window, "app");

		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: {} } },
			});
			const absent = settingsFingerprint(settings);
			Object.defineProperty(window, "app", {
				configurable: true,
				value: {
					plugins: {
						plugins: {
							dataview: {
								api: {
									settings: {
										dataviewJsKeyword: "dataviewjs",
										inlineQueryPrefix: "=",
										inlineJsQueryPrefix: "$=",
									},
								},
							},
						},
					},
				},
			});

			expect(settingsFingerprint(settings)).toBe(absent);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
		}
	});

	it("defers the fingerprint until custom Dataview settings resolve", () => {
		const settings = { ...DEFAULT_SETTINGS, useDataview: true };
		const customSyntax = {
			dataviewJsKeyword: "datajs",
			inlineQueryPrefix: "dv=",
			inlineJsQueryPrefix: "js=",
		};
		const plugin: {
			settings?: typeof customSyntax;
			api?: { settings: typeof customSyntax };
		} = {};
		const nextSessionPlugin: {
			settings?: typeof customSyntax;
		} = {};
		const originalApp = Reflect.get(window, "app");

		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});
			expect(() => settingsFingerprint(settings)).toThrow(
				"Dataview syntax fingerprint requested before settings resolved.",
			);

			expect(
				getDynamicSources("Value: `dv= this.file.name`", settings),
			).toEqual(["dataview"]);

			plugin.settings = customSyntax;
			const resolvedFingerprint = settingsFingerprint(settings);
			expect(resolvedFingerprint).toContain('"inlineQueryPrefix":"dv="');
			expect(
				getDynamicSources("Value: `dv= this.file.name`", settings),
			).toEqual(["dataview"]);

			Object.defineProperty(window, "app", {
				configurable: true,
				value: {
					plugins: { plugins: { dataview: nextSessionPlugin } },
				},
			});
			expect(() => settingsFingerprint(settings)).toThrow();
			nextSessionPlugin.settings = { ...customSyntax };
			expect(settingsFingerprint(settings)).toBe(resolvedFingerprint);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
		}
	});
});

describe("Dataview syntax resolution barrier", () => {
	it("resolves immediately without scheduling a timer when Dataview is absent", () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		const timerSpy = vi.spyOn(window, "setTimeout");
		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: {} } },
			});

			expect(waitForDataviewSyntaxResolution()).toBe("resolved");
			expect(timerSpy).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			timerSpy.mockRestore();
			vi.useRealTimers();
		}
	});

	it("resolves after settings appear and memoises the timer-free verdict", async () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		const plugin: { settings?: Record<string, never> } = {};
		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});

			const first = waitForDataviewSyntaxResolution();
			expect(first).toBeInstanceOf(Promise);
			expect(vi.getTimerCount()).toBe(1);

			await vi.advanceTimersByTimeAsync(10);
			plugin.settings = {};
			await vi.advanceTimersByTimeAsync(15);
			await expect(first).resolves.toBe("resolved");
			expect(vi.getTimerCount()).toBe(0);

			expect(waitForDataviewSyntaxResolution()).toBe("resolved");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.useRealTimers();
		}
	});

	it("recovers synchronously when settings arrive after timeout without another wait", async () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		const plugin: { settings?: Record<string, never> } = {};
		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});

			const first = waitForDataviewSyntaxResolution();
			expect(first).toBeInstanceOf(Promise);
			await vi.advanceTimersByTimeAsync(
				DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS,
			);
			await expect(first).resolves.toBe("unresolved");
			expect(vi.getTimerCount()).toBe(0);

			expect(waitForDataviewSyntaxResolution()).toBe("unresolved");
			expect(vi.getTimerCount()).toBe(0);
			plugin.settings = {};
			expect(waitForDataviewSyntaxResolution()).toBe("resolved");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.useRealTimers();
		}
	});

	it("times out when the wall clock moves backward mid-wait", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100_000);
		const originalApp = Reflect.get(window, "app");
		const plugin = {};
		let verdict: string | undefined;
		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});

			const barrier = waitForDataviewSyntaxResolution();
			expect(barrier).toBeInstanceOf(Promise);
			void Promise.resolve(barrier).then((result) => {
				verdict = result;
			});

			vi.setSystemTime(0);
			await vi.advanceTimersByTimeAsync(
				DATAVIEW_SYNTAX_RESOLUTION_TIMEOUT_MS,
			);

			expect(verdict).toBe("unresolved");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it("keeps replacement barriers instance-bound and settles the old barrier", async () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		const firstPlugin: { settings?: Record<string, never> } = {};
		const secondPlugin: { settings?: Record<string, never> } = {};
		try {
			const plugins = { dataview: firstPlugin };
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins } },
			});

			const first = waitForDataviewSyntaxResolution();
			plugins.dataview = secondPlugin;
			const second = waitForDataviewSyntaxResolution();
			expect(first).not.toBe(second);

			secondPlugin.settings = {};
			await vi.advanceTimersByTimeAsync(25);
			await expect(first).resolves.toBe("unresolved");
			await expect(second).resolves.toBe("resolved");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.useRealTimers();
		}
	});

	it("settles and clears its timer when Dataview unloads mid-wait", async () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		try {
			const plugins: Record<string, object> = { dataview: {} };
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins } },
			});

			const barrier = waitForDataviewSyntaxResolution();
			delete plugins.dataview;
			await vi.advanceTimersByTimeAsync(25);

			await expect(barrier).resolves.toBe("unresolved");
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.useRealTimers();
		}
	});

	it("shares one barrier across concurrent callers", async () => {
		vi.useFakeTimers();
		const originalApp = Reflect.get(window, "app");
		const plugin: { settings?: Record<string, never> } = {};
		try {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: { plugins: { plugins: { dataview: plugin } } },
			});

			const callers = Array.from({ length: 50 }, () =>
				waitForDataviewSyntaxResolution(),
			);
			expect(new Set(callers).size).toBe(1);
			expect(vi.getTimerCount()).toBe(1);

			plugin.settings = {};
			await vi.advanceTimersByTimeAsync(25);
			await expect(Promise.all(callers)).resolves.toEqual(
				Array.from({ length: 50 }, () => "resolved"),
			);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			Object.defineProperty(window, "app", {
				configurable: true,
				value: originalApp,
			});
			vi.useRealTimers();
		}
	});
});
