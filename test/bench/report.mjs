import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";

const [baselinePath, fixedPath, outputPath = "/tmp/bench-results.md"] =
	process.argv.slice(2);
if (!baselinePath || !fixedPath) {
	throw new Error(
		"Usage: node test/bench/report.mjs BASELINE.log FIXED.log [OUTPUT.md]",
	);
}
const baselineRaw = readFileSync(baselinePath, "utf8");
const fixedRaw = readFileSync(fixedPath, "utf8");
function results(raw) {
	return new Map(
		Array.from(raw.matchAll(/QS_BENCH_RESULT (\{[^\n]+\})/g), (match) => {
			const result = JSON.parse(match[1]);
			assert(Number.isFinite(result.meanMs) && result.meanMs > 0);
			assert(result.samples > 0);
			return [result.name, result];
		}),
	);
}
const baseline = results(baselineRaw);
const fixed = results(fixedRaw);
const scopes = new Map([
	["status", "Status-shaped synthetic pipeline"],
	["queue-interleaved", "Interleaved backlog microbenchmark"],
	["queue-burst", "Isolated drain microbenchmark"],
	["media", "Isolated async-I/O workload"],
	[
		"candidates",
		"Collection-only microbenchmark; no production-impact claim",
	],
]);
assert.equal(baseline.size, 5, "Baseline must contain all five benchmarks");
assert.equal(fixed.size, 5, "Fixed must contain all five benchmarks");
assert.deepEqual(
	new Set([...baseline.values()].map((r) => r.kind)),
	new Set(scopes.keys()),
);
assert.deepEqual(
	new Set([...fixed.values()].map((r) => r.kind)),
	new Set(scopes.keys()),
);
const rows = [];
const observations = [];
for (const [kind, scope] of scopes) {
	const before = [...baseline.values()].find((r) => r.kind === kind);
	const name = before.name;
	const after = fixed.get(name);
	assert(after, `Missing fixed result: ${name}`);
	assert.equal(after.kind, kind);
	assert.equal(before.samples, after.samples);
	const overlaps =
		Math.abs(before.meanMs - after.meanMs) <=
		before.marginMs + after.marginMs;
	const warningTitle = {
		candidates: "collectCandidatePaths at vault scale",
		status: "status-shaped candidate and media pipeline",
		"queue-burst": name,
		"queue-interleaved": name,
		media: "resolveLinkedMediaByFile with asynchronous reads",
	}[kind];
	const getterWarning =
		warningTitle &&
		`${baselineRaw}\n${fixedRaw}`.includes(
			`Benchmark "${warningTitle}" accessed module export getters too many times.`,
		);
	const interpretation = overlaps
		? "Inconclusive: error intervals overlap"
		: after.meanMs < before.meanMs
			? "Measured faster"
			: "Measured slower";
	rows.push(
		`| ${name} | ${scope} | ${before.meanMs.toFixed(3)} ms ± ${before.rmePercent.toFixed(2)}% | ${after.meanMs.toFixed(3)} ms ± ${after.rmePercent.toFixed(2)}% | ${(before.meanMs / after.meanMs).toFixed(3)}× | ${before.samples} | ${interpretation}${getterWarning ? "; module-getter overhead warning" : ""} |`,
	);
	if (getterWarning) {
		observations.push(
			`Vitest reported repeated module export getter accesses in **${name}** (see raw output), adding instrumentation overhead. This timing is for the instrumented harness, **not an exact production-impact measurement**.`,
		);
	}
	if ("completedCount" in before) {
		assert.equal(before.completedCount, 10_000);
		assert.equal(after.completedCount, 10_000);
		observations.push(
			overlaps
				? `**${name}: no demonstrated speedup** at 10,000 items; mean error intervals overlap.`
				: `**${name}: ${interpretation.toLowerCase()}** at 10,000 items in this run; this single size does not establish asymptotic complexity.`,
		);
		for (const r of [before, after]) {
			assert.equal(
				r.enqueuedBatches,
				kind === "queue-interleaved" ? 1_000 : 1,
			);
			assert.equal(
				r.completedBeforeFinalDrain,
				kind === "queue-interleaved" ? 3_000 : 0,
			);
			assert.equal(
				r.pendingBeforeFinalDrain,
				kind === "queue-interleaved" ? 7_000 : 10_000,
			);
		}
	}
	if ("peakConcurrency" in before) {
		assert.equal(before.resolvedNotes, 10_000);
		assert.equal(after.resolvedNotes, 10_000);
		observations.push(
			`${name}: peak concurrency ${before.peakConcurrency} → ${after.peakConcurrency}; measured timing includes the fixed implementation's batch-yield timer overhead.`,
		);
	}
}
const beforeCandidates = [...baseline.values()].find(
	(r) => r.kind === "candidates",
);
const afterCandidates = [...fixed.values()].find(
	(r) => r.kind === "candidates",
);
assert.equal(beforeCandidates.candidateCount, 15_000);
assert.equal(afterCandidates.candidateCount, 10_000);
const beforeStatus = [...baseline.values()].find((r) => r.kind === "status");
const afterStatus = [...fixed.values()].find((r) => r.kind === "status");
for (const [r, expected] of [
	[beforeStatus, 15_000],
	[afterStatus, 10_000],
]) {
	assert.equal(r.candidateCount, expected);
	assert.equal(r.mappedPublishFileCount, expected);
	assert.equal(r.blobLookupCount, expected);
	assert.equal(r.binaryBlobLookupCount, expected - 10_000);
	assert.equal(r.resolvedNotes, 10_000);
}
const stageRows = [
	["Collected candidates", "candidateCount"],
	["Mapped PublishFile stubs", "mappedPublishFileCount"],
	["Completed asynchronous blob lookups", "blobLookupCount"],
	["Binary-candidate lookups (empty results)", "binaryBlobLookupCount"],
	["Useful output notes with media", "resolvedNotes"],
].map(
	([label, field]) =>
		`| ${label} | ${beforeStatus[field]} | ${afterStatus[field]} |`,
);
const head = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf8",
	env: { ...process.env, GIT_MASTER: "1" },
}).trim();
const methodology = readFileSync(new URL("README.md", import.meta.url), "utf8");
writeFileSync(
	outputPath,
	`# Quartz Syncer before/after benchmark

Generated: ${new Date().toISOString()}
Baseline: unmodified HEAD ${head}; fixed: uncommitted working tree at that HEAD.
Machine: ${cpus()[0]?.model}, ${cpus().length} logical CPUs, ${platform()} ${release()}, Node ${process.version}, Vitest 5.0.0.
Runs: baseline first, fixed immediately afterwards, same machine, shared dependencies, identical benchmark files/config; one worker, no parallel benchmark files.

All times are mean wall-clock milliseconds per full operation. Speedup = baseline mean / fixed mean (below 1 means slower). ± is the measured relative margin of error; these are one sequential pair of runs, not an isolated-machine or end-to-end vault performance claim.

| Benchmark | Scope | Baseline (HEAD) | Fixed (working tree) | Speedup | Samples per side | Interpretation |
| --- | --- | ---: | ---: | ---: | ---: | --- |
${rows.join("\n")}

**Candidate count: 15,000 → 10,000: 5,000 fewer candidates (33.33% fewer; all binary attachments excluded).** This reduces downstream work even if the collection-only wall time is slower. No downstream speedup is inferred from the count alone.

## Headline: status-shaped downstream work

The first row times the complete requested chain: real candidate collection → timed mapping to stubs → real media resolution. It combines reduced downstream volume **and** bounded concurrency. It is a synthetic status-shaped workload with 1 ms lookup timers, not a full Publisher/Obsidian status refresh or an attribution of speedup solely to candidate filtering.

| Stage / count per iteration | Baseline (HEAD) | Fixed (working tree) |
| --- | ---: | ---: |
${stageRows.join("\n")}

Binary stubs still wait for the async lookup but return no links. Both revisions produce the exact same 10,000-entry useful media map. Avoiding the 5,000 useless lookups is measured inside the chain rather than extrapolated from the ~millisecond collection call.

## Queue interpretation

The interleaved workload enqueues 1,000 batches of ten, running one concurrency-three pump between batches. On **both revisions**, 3,000 items finish during enqueueing and a 7,000-item backlog remains before final draining; all 10,000 ultimately complete. Equal-priority appends re-flag sorting at HEAD while the fixed queue preserves its ordered tail. No sorting or queue methods are replaced. This reproduces repeated sorting of a growing backlog, but compresses the startup 50 ms cadence and uses a no-op processor: it measures queue overhead, **not actual startup wall time**.

A likely explanation for the earlier isolated-drain non-win is V8's ability to left-trim sufficiently large packed arrays for Array.prototype.shift(), avoiding the naive full-copy cost. This is an engine-optimization hypothesis, **not a profiled finding from this harness**; Promise/Map/scheduler overhead and noise can also mask removal cost. The single-burst benchmark does not reproduce repeated sorting and is not evidence for or against the startup regression's production impact.

## Limitations and measured interpretations

**The isolated candidate-collection benchmark is a microbenchmark, not a production-impact metric.** It omits all avoided downstream work; its ~millisecond time is negligible beside the timer-backed pipeline. The burst queue and interleaved queue are microbenchmarks too; the isolated media workload measures only synthetic async lookup behavior.

${observations.join("\n\n")}

## Methodology, compatibility and reproduction

${methodology}

## Raw Vitest output: baseline

\x60\x60\x60text
${baselineRaw}
\x60\x60\x60

## Raw Vitest output: fixed

\x60\x60\x60text
${fixedRaw}
\x60\x60\x60
`,
);
console.log(`Wrote ${outputPath}`);
console.log(rows.join("\n"));
