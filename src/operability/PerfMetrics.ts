export const PERF_COUNTER_NAMES = [
	// Post-Phase-3 regression canaries with no production writers. They remain
	// to detect any reintroduction of background dynamic fan-out.
	"dynamicPathsExamined",
	"dynamicCacheReads",
	"dynamicCacheBytesRead",
	"cacheRecordsRead",
	"cacheBytesRead",
	"enqueueAttempts",
	"enqueueAccepted",
	"enqueueDeduped",
	"dynamicCompileStarts",
	"dynamicCompileCompletions",
	"staticCompileStarts",
	"staticCompileCompletions",
	"longTaskCount",
	"longTaskMaxMs",
	"longTaskTotalMs",
] as const;

export const PERF_TIMER_NAMES = [
	"integrationMs",
	"remarkMs",
	"hashMs",
	"persistMs",
	"queueDrainMs",
	// Post-Phase-3 regression canary with no production writers.
	"dynamicScanMs",
] as const;

export type PerfCounterName = (typeof PERF_COUNTER_NAMES)[number];
export type PerfTimerName = (typeof PERF_TIMER_NAMES)[number];
export type PerfMetricsDump = Record<PerfCounterName | PerfTimerName, number>;

const LONG_TASK_THRESHOLD_MS = 50;
const EVENT_LOOP_SAMPLE_MS = 100;

function emptyMetrics(): PerfMetricsDump {
	return Object.fromEntries(
		[...PERF_COUNTER_NAMES, ...PERF_TIMER_NAMES].map((name) => [name, 0]),
	) as PerfMetricsDump;
}

export class PerfMetrics {
	private values = emptyMetrics();
	private observer: PerformanceObserver | null = null;
	private eventLoopTimer: number | null = null;

	constructor() {
		this.startLongTaskTracking();
	}

	increment(name: PerfCounterName, amount = 1): void {
		this.values[name] += amount;
	}

	addDuration(name: PerfTimerName, startedAt: number): void {
		this.values[name] += performance.now() - startedAt;
	}

	recordCacheRead(value: unknown): void {
		this.values.cacheRecordsRead += 1;
		this.values.cacheBytesRead += this.estimateBytes(value);
	}

	recordDynamicCacheRead(value: unknown): void {
		this.values.dynamicCacheReads += 1;
		const bytes = this.estimateBytes(value);
		this.values.dynamicCacheBytesRead += bytes;
		this.values.cacheRecordsRead += 1;
		this.values.cacheBytesRead += bytes;
	}

	private estimateBytes(value: unknown): number {
		if (value !== null && value !== undefined) {
			try {
				return JSON.stringify(value).length;
			} catch {
				// Instrumentation must never alter cache behavior.
			}
		}
		return 0;
	}

	reset(): void {
		this.values = emptyMetrics();
	}

	dump(): PerfMetricsDump {
		return { ...this.values };
	}

	teardown(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.eventLoopTimer !== null) {
			window.clearInterval(this.eventLoopTimer);
			this.eventLoopTimer = null;
		}
	}

	private recordLongTask(duration: number): void {
		this.values.longTaskCount += 1;
		this.values.longTaskTotalMs += duration;
		this.values.longTaskMaxMs = Math.max(
			this.values.longTaskMaxMs,
			duration,
		);
	}

	private startLongTaskTracking(): void {
		if (typeof PerformanceObserver === "function") {
			try {
				this.observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						this.recordLongTask(entry.duration);
					}
				});
				this.observer.observe({ entryTypes: ["longtask"] });
				return;
			} catch {
				this.observer = null;
			}
		}

		let expected = performance.now() + EVENT_LOOP_SAMPLE_MS;
		this.eventLoopTimer = window.setInterval(() => {
			const now = performance.now();
			const delay = now - expected;
			expected = now + EVENT_LOOP_SAMPLE_MS;
			if (delay > LONG_TASK_THRESHOLD_MS) this.recordLongTask(delay);
		}, EVENT_LOOP_SAMPLE_MS);
	}
}

let activeMetrics: PerfMetrics | null = null;
export let perfMetricsEnabled = false;

export function enablePerfMetrics(): PerfMetrics {
	disablePerfMetrics();
	activeMetrics = new PerfMetrics();
	perfMetricsEnabled = true;
	return activeMetrics;
}

export function disablePerfMetrics(): void {
	perfMetricsEnabled = false;
	activeMetrics?.teardown();
	activeMetrics = null;
}

export function getPerfMetrics(): PerfMetrics | null {
	return activeMetrics;
}
