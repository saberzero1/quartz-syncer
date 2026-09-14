import { App, TFile } from "obsidian";
import type { BenchCompareOptions, TestContext } from "vitest";
import type QuartzSyncer from "src/main";
import type QuartzSyncerSettings from "src/models/settings";

export const NOTE_COUNT = 10_000;
export const ATTACHMENT_COUNT = 5_000;

export function makeFile(index: number, extension: string): TFile {
	const file = new TFile();
	file.name = `file-${index}.${extension}`;
	file.basename = `file-${index}`;
	file.extension = extension;
	file.path = `notes/topic-${index % 100}/section-${Math.floor(index / 100) % 10}/${file.name}`;
	return file;
}

export const markdownFiles = Array.from({ length: NOTE_COUNT }, (_, index) =>
	makeFile(index, "md"),
);
export const attachments = Array.from(
	{ length: ATTACHMENT_COUNT },
	(_, index) => makeFile(index, index % 2 === 0 ? "png" : "pdf"),
);

export function candidateFixture() {
	const app = new App();
	const allFiles = [...markdownFiles, ...attachments];
	// Plain functions avoid spy bookkeeping. Return enumeration copies without
	// charging the markdown-only API for scanning attachments a second time.
	app.vault.getFiles = () => allFiles.slice();
	app.vault.getMarkdownFiles = () => markdownFiles.slice();
	const plugin = { cacheHandle: null } as unknown as QuartzSyncer;
	const settings = {
		allNotesPublishableByDefault: true,
		vaultPath: "/",
		publishFrontmatterKey: "publish",
		useBases: false,
		useCanvas: false,
		useExcalidraw: false,
	} satisfies Partial<QuartzSyncerSettings>;
	return {
		app,
		plugin,
		settings: settings as QuartzSyncerSettings,
		allFiles,
	};
}

// Fixed sample counts make both revisions perform the same amount of work.
export const cpuOptions = {
	time: 0,
	iterations: 100,
	warmupTime: 0,
	warmupIterations: 10,
	throws: true,
} satisfies BenchCompareOptions;

export const mediaOptions = {
	...cpuOptions,
	iterations: 5,
	warmupIterations: 1,
} satisfies BenchCompareOptions;

type Result = Awaited<ReturnType<ReturnType<TestContext["bench"]>["run"]>>;

export function report(
	result: Result,
	facts: Record<string, number | string> = {},
): void {
	console.log(
		`QS_BENCH_RESULT ${JSON.stringify({
			name: result.name,
			meanMs: result.latency.mean,
			medianMs: result.latency.p50,
			rmePercent: result.latency.rme,
			marginMs: result.latency.moe,
			samples: result.latency.samplesCount,
			...facts,
		})}`,
	);
}
