# Large-vault benchmarks

Run `npm run bench` (one-shot), or `npm run bench -- --watch` for development.
No additional dependencies are required. Each sample uses 10,000 notes;
the deterministic fixture also contains 5,000 PNG/PDF attachments, spread over
100 topics with 10 nested sections per topic. Fixture allocation and correctness
checks are outside the timed callbacks; the status pipeline's mapping to new
PublishFile stubs is intentionally timed. Settings disable special file types and
use the whole vault (`vaultPath: "/"`). No network, disk reads, compilation, or
running Obsidian instance is required.

## What is measured

- **Cache composition and entry deserialization:** 10,000 modeled cache records
  using the current `QuartzSyncerCache` type and `DATA_STORE_CACHE_VERSION`, with
  roughly 1 KiB of field-note prose each. 550 notes (5.5%) embed one image, spread
  across the vault and cycling through 39 distinct images: 14.10 references per
  asset. Asset sizes range from 94 to 246 KiB, averaging exactly 170 KiB. Shared
  assets are charged once **per referring note** in the synthetic old shape;
  they are not deduplicated across IndexedDB records. These parameters imply
  6.47 MiB of distinct assets, not the measured vault's 10.8 MB: this is a
  calibrated model of the duplication mechanism, not an exact vault replay.
  The measured 668 → 10,020-note vault's 142.20 → 13.01 MB and 90.9% binary share
  are context, not hard-coded expected benchmark results.
  Current records contain deferred `{ path, vaultPath }` assets; the explicitly
  **synthetic OLD baseline** substitutes `{ path, content: base64 }`. Both have
  local compiled text, hashes, timestamps, media links and null remote data.
  The benchmark models these shapes; real compilation/persistence is covered
  separately by `test/unit/cache/CachePayloadRegression.test.ts`.
  Each shape emits serialized UTF-8 JSON bytes (including record keys), bytes per
  note, base64 payload bytes (encoded bytes, not decoded image size), binary
  share percentage, and mean entry deserialization milliseconds. Common timing
  fields measure a full pass of **individual `structuredClone(entry)` calls**,
  matching independent IndexedDB record reads rather than JSON parsing or a
  whole-cache clone that could share references. This is CPU deserialization,
  not IndexedDB I/O, heap size, or physical disk size. Fixture allocation and
  size accounting are outside timing. One warmup and five samples per shape keep
  the roughly 130 MiB synthetic baseline proportionate to the timer-heavy suite.
  No timing/size threshold in this benchmark gates CI.
- **Status-shaped pipeline (headline):** real `collectCandidatePaths()` → map
  returned paths to newly allocated narrow `PublishFile` stubs → real
  `resolveLinkedMediaByFile()`. All three stages are inside the timed callback.
  Every stub waits for a real 1 ms timer; markdown stubs return one attachment
  link, binary stubs return an empty array **after** the wait. This deliberately
  models wasted asynchronous work for non-publishable candidates. The exact
  same 10,000-entry useful media map must be returned on both revisions.
  Reported and asserted counts: candidates collected, mapped stubs, completed
  blob lookups, binary lookups, useful output notes, and peak concurrency.
  HEAD does 15,000 lookups (5,000 useless); fixed does 10,000. The combined
  measurement includes both the smaller candidate set and the real resolver's
  concurrency change, without attributing the full speedup to either alone.
  **This is a synthetic status-shaped pipeline, not a full Obsidian status
  refresh**: no actual compilation, metadata parsing, cache, or Git I/O.
- **Candidates (microbenchmark, not production impact):** real
  `collectCandidatePaths(app, plugin, settings)`. Both vault
  enumeration stubs return array copies; markdown enumeration does not rescan the
  attachment list. All-default mode must return exactly the complete markdown
  set or the complete vault set (the two revision contracts). Every iteration
  checks the count, and the result logs the observed count. The report generator
  additionally requires 15,000 on HEAD and 10,000 on the fixed tree.
- **Queue burst (isolated-drain microbenchmark):** allocation, enqueue of all
  10,000 equal-priority paths, then a full
  drain through the queue's own scheduled callbacks, `processQueue`, `pump`,
  `takeNext`, and `runItem`, at its default concurrency of three. The processor is
  an async no-op. A benchmark-only `window.setTimeout` captures the next callback;
  the harness executes it and yields a microtask for the completed processors.
  This avoids approximately 3,334 real timer clamps masking queue bookkeeping.
  It does not replace queue methods, call private methods, or bypass async
  completion. Each iteration waits for `onIdle()` and asserts 10,000 completed,
  zero failed/pending/in-flight items, no scheduled callback, and processing
  stopped. This isolates enqueue/drain cost, **not production scheduler latency**.
  Only one initial enqueue burst is measured; it does not recreate repeated
  sorting. A likely explanation for the earlier isolated-drain non-win is V8
  left-trimming large packed arrays for `shift()`, avoiding naive full-array
  copies. This is a plausible engine-specific hypothesis, not a profiled finding
  here. Promise/Map/scheduler overhead and noise can also mask removal costs.
  Do not infer asymptotic complexity or production impact from a single size.
- **Interleaved queue (backlog microbenchmark):** enqueue ten equal-priority
  paths, execute one real scheduled pump, yield for the three no-op processors,
  then enqueue another ten. Repeat for 1,000 batches, **without draining each
  batch to idle**, then fully drain the remaining queue. The shared scheduler
  and completion assertions are the same as the burst case. Assert and report
  3,000 completed during enqueueing, a 7,000-item backlog before final drain,
  1,000 batches, and 10,000 total completed. This explicitly makes enqueueing
  repeatedly mark a growing queue for sorting at HEAD. It compresses the real
  pre-warm's 50 ms cadence; no wall-clock 50 ms pauses are simulated and no
  actual compiler runs. The number is queue overhead under this backlog, **not
  startup elapsed time**. Equal-priority appends are tested, not reprioritization.
- **Media (isolated async-I/O workload):** real `resolveLinkedMediaByFile()` on 10,000 narrow `PublishFile`
  stubs. Every `getBlobLinks()` waits for a **real 1 ms timer**, returning one
  attachment link (5,000 distinct attachments, two referring notes each).
  The full output map, completed calls, and zero remaining work are checked
  after every iteration. Peak concurrency is logged and must be 1 (baseline)
  or 5 (fixed desktop). The fixed implementation's real zero-delay batch-yield
  timers are **included**. Consequently the result need not approach 5×.
  This is a synthetic I/O-latency workload, not a measurement of real vault
  read latency. Mobile concurrency is not benchmarked.

Candidates and both queue cases have 10 warmup iterations and 100 measured
iterations; media and status have one warmup and five measured iterations.
Allow approximately four minutes for a complete before/after pair with 1 ms
timers on this fixture. Time-based extension is
disabled so both revisions execute identical iteration counts. Benchmark files
run serially with one worker. Results include mean/median milliseconds, sample
count, and relative/absolute margins of error, emitted as `QS_BENCH_RESULT` JSON
alongside Vitest's native benchmark tables. Overlapping mean error intervals
are labeled inconclusive; this is a noise indicator, not a formal significance
test or a substitute for independent repeated runs.

## Compatibility (no baseline source shim)

The actual HEAD used here has the **same three-argument candidate signature** as
the fixed code. The harness never imports `isWithinVaultPath`; only the fixed
source imports its own helper. Both revisions therefore run identical benchmark
files and configuration with **no source edits or revision-dependent shim**.

Installed **Vitest 5.0.0 does not export a top-level `bench`**. Its supported API
is `test("name", async ({ bench }) => { await bench("operation", options, fn).run(runOptions); })`.
These files use that native Vitest `bench()` fixture rather than inventing a
named-export shim, downgrading Vitest, or adding dependencies. The queue's
deterministic window scheduler is the same benchmark-only adaptation on both
revisions and is restored before leaving the test.

`tsconfig.json` includes `test/bench/**/*.ts` so `npx tsc --noEmit` checks the
harness as well as production code, without adding existing unit tests to the
typecheck surface.

## Reproduce before/after

### Track the current cache composition over time

Save the raw `QS_BENCH_RESULT` records and a dated snapshot on each revision;
all existing operations remain in the report alongside the two cache shapes:

```bash
set -o pipefail
npm run bench -- --run --no-color 2>&1 | tee /tmp/qs-bench.log
node test/bench/report.mjs --current /tmp/qs-bench.log /tmp/qs-bench.md
```

Compare `cache-current-deferred` metrics between runs; the side-by-side synthetic
OLD column makes the avoided payload cost visible on every revision. Preserve
machine/revision context with archived logs; timings are noisy, sizes deterministic.
The CI tests independently enforce path-only persisted assets and a documented,
hand-maintained bytes-per-note ceiling. Do not raise that ceiling automatically.

### Historical candidate/queue optimization comparison

Run from the main repository with the intended fixes still uncommitted and
`/tmp/qs-baseline` absent. Do not stash, reset, or check out the main working tree.
The legacy two-log report expects the five original operations (plus the cache
pair when present) and checks the
status stage counts and interleaved backlog counts independently of timing.

```bash
GIT_MASTER=1 git worktree add /tmp/qs-baseline HEAD
trap 'GIT_MASTER=1 git worktree remove /tmp/qs-baseline --force' EXIT
ln -s "$PWD/node_modules" /tmp/qs-baseline/node_modules
cp -R test/bench /tmp/qs-baseline/test/bench
cp vitest.bench.config.ts /tmp/qs-baseline/vitest.bench.config.ts

# Absolute --root and --config keep every src alias in the baseline worktree.
set -o pipefail
npx vitest bench --root /tmp/qs-baseline --config /tmp/qs-baseline/vitest.bench.config.ts --run --no-color 2>&1 | tee /tmp/qs-baseline-bench.log
npm run bench -- --run --no-color 2>&1 | tee /tmp/qs-fixed-bench.log
node test/bench/report.mjs /tmp/qs-baseline-bench.log /tmp/qs-fixed-bench.log /tmp/bench-results.md
GIT_MASTER=1 git worktree remove /tmp/qs-baseline --force
trap - EXIT
```

Read the raw output as well as the ratio: counts are semantic improvements;
slower or noisy timings must not be presented as measured speedups.
