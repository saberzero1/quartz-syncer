import { afterAll, expect, test, vi } from "vitest";
import { BackgroundEngine } from "src/services/BackgroundEngine";
import { hasDynamicContent } from "src/utils/dynamicContent";
import {
	disablePerfMetrics,
	enablePerfMetrics,
	type PerfMetricsDump,
} from "src/operability/PerfMetrics";
import {
	createBackgroundCacheFixture,
	DYNAMIC_NOTE_COUNTS,
} from "./background-cache-fixture";

type ArmResult = {
	n: number;
	metrics: PerfMetricsDump;
};

type D8Result = {
	n: number;
	flagMedianMs: number;
	flagP95Ms: number;
	readDetectMedianMs: number;
	readDetectP95Ms: number;
};

const armResults: ArmResult[] = [];
const d8Results: D8Result[] = [];

afterAll(() => {
	disablePerfMetrics();
	console.log("QS_PERF_COUNTERS");
	console.table(armResults.map(({ n, metrics }) => ({ n, ...metrics })));
	console.log("QS_D8_MEASUREMENTS");
	console.table(d8Results);
	console.log(
		"QS_D8_CONCLUSION Cached flags should short-circuit status reads. This synthetic in-memory fixture does not support a compile-path shortcut: cachedRead plus detection is faster because compilation already has note text in hand.",
	);
});

for (const n of DYNAMIC_NOTE_COUNTS) {
	test(`Phase 3 dynamic fan-out remains zero at N=${n}`, async () => {
		vi.useFakeTimers({
			toFake: ["Date", "setTimeout", "clearTimeout"],
		});
		try {
			const fixture = createBackgroundCacheFixture(n);
			Object.assign(window, {
				app: {
					plugins: {
						plugins: { dataview: { api: fixture.dataviewApi } },
					},
				},
			});
			const metrics = enablePerfMetrics();
			const engine = new BackgroundEngine(fixture.app, fixture.plugin);
			engine.start();
			await vi.advanceTimersByTimeAsync(40_001);
			metrics.reset();

			fixture.triggerDataviewRevision();
			await vi.advanceTimersByTimeAsync(5_000);
			const revisionDump = metrics.dump();
			expect(revisionDump.dynamicPathsExamined).toBe(0);
			expect(revisionDump.dynamicCacheReads).toBe(0);
			expect(revisionDump.enqueueAttempts).toBe(0);
			expect(revisionDump.dynamicCompileStarts).toBe(0);
			expect(revisionDump.dynamicCompileCompletions).toBe(0);

			metrics.reset();
			fixture.modifyUnrelatedStaticNote();
			await vi.advanceTimersByTimeAsync(5_000);
			let drainRounds = 0;
			while (
				engine.compilationQueue.pendingCount > 0 ||
				engine.compilationQueue.inFlightCount > 0
			) {
				await vi.advanceTimersByTimeAsync(10);
				if (++drainRounds > n * 10 + 100) {
					throw new Error("Measurement queue failed to drain");
				}
			}

			const dump = metrics.dump();
			armResults.push({ n, metrics: dump });
			expect(dump.enqueueAttempts).toBe(1);
			expect(dump.dynamicCompileStarts).toBe(0);
			expect(dump.dynamicCompileCompletions).toBe(0);
			expect(dump.staticCompileStarts).toBe(1);
			expect(dump.staticCompileCompletions).toBe(1);
			engine.stop();
			disablePerfMetrics();
		} finally {
			vi.useRealTimers();
		}
	});

	test(`D8 cached flag versus read and detect at N=${n}`, async () => {
		const fixture = createBackgroundCacheFixture(n);
		const keys = fixture.dynamicFiles.map((file) => `file:${file.path}`);
		const samples = 25;
		const flagDurations: number[] = [];
		const readDetectDurations: number[] = [];
		for (let sample = 0; sample < samples; sample++) {
			let startedAt = performance.now();
			const records = await fixture.persister.getMany<{
				dynamicSources?: string[];
			}>(keys);
			expect(
				records.filter(
					(record) => (record?.dynamicSources?.length ?? 0) > 0,
				).length,
			).toBe(n);
			flagDurations.push(performance.now() - startedAt);

			startedAt = performance.now();
			let detected = 0;
			for (const file of fixture.dynamicFiles) {
				const text = await fixture.app.vault.cachedRead(file);
				if (hasDynamicContent(text)) detected++;
			}
			expect(detected).toBe(n);
			readDetectDurations.push(performance.now() - startedAt);
		}
		d8Results.push({
			n,
			flagMedianMs: percentile(flagDurations, 0.5),
			flagP95Ms: percentile(flagDurations, 0.95),
			readDetectMedianMs: percentile(readDetectDurations, 0.5),
			readDetectP95Ms: percentile(readDetectDurations, 0.95),
		});
	});
}

function percentile(values: number[], quantile: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.ceil(sorted.length * quantile) - 1,
	);
	return sorted[index] ?? 0;
}
