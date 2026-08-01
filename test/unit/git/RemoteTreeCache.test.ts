import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteTreeCache } from "src/git/RemoteTreeCache";
import type { GitBackend, TreeEntry } from "src/git/types";

const makeTreeEntry = (path: string): TreeEntry => ({
	path,
	sha: `sha-${path}`,
	type: "blob",
});

const makeGitBackend = (
	entries: TreeEntry[] = [makeTreeEntry("content/a.md")],
): GitBackend =>
	({
		readTree: vi.fn().mockResolvedValue(entries),
	}) as unknown as GitBackend;

describe("RemoteTreeCache", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fetches on first get()", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		expect(cache.isCached).toBe(false);

		const result = await cache.get();

		expect(result).toHaveLength(1);
		expect(result[0]?.path).toBe("content/a.md");
		expect(backend.readTree).toHaveBeenCalledWith("main");
		expect(cache.isCached).toBe(true);
	});

	it("returns cached result on subsequent get()", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		await cache.get();
		await cache.get();
		await cache.get();

		expect(backend.readTree).toHaveBeenCalledTimes(1);
	});

	it("refresh() fetches fresh data", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		await cache.get();
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		await cache.refresh();
		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent refresh() calls", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		const p1 = cache.refresh();
		const p2 = cache.refresh();
		const p3 = cache.refresh();

		const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

		expect(backend.readTree).toHaveBeenCalledTimes(1);
		expect(r1).toBe(r2);
		expect(r2).toBe(r3);
	});

	it("invalidate() clears cache", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		await cache.get();
		expect(cache.isCached).toBe(true);

		cache.invalidate();
		expect(cache.isCached).toBe(false);
		expect(cache.age).toBe(Infinity);

		await cache.get();
		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("age returns time since last fetch", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		expect(cache.age).toBe(Infinity);

		await cache.get();

		expect(cache.age).toBe(0);

		vi.advanceTimersByTime(5000);

		expect(cache.age).toBe(5000);
	});

	it("startPeriodicFetch fetches immediately and on interval", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		cache.startPeriodicFetch(30);

		await vi.advanceTimersByTimeAsync(0);
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(backend.readTree).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(backend.readTree).toHaveBeenCalledTimes(3);
	});

	it("stopPeriodicFetch stops the timer", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		cache.startPeriodicFetch(30);
		await vi.advanceTimersByTimeAsync(0);
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		cache.stopPeriodicFetch();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(backend.readTree).toHaveBeenCalledTimes(1);
	});

	it("startPeriodicFetch with interval < 1 does nothing", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		cache.startPeriodicFetch(0);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(backend.readTree).not.toHaveBeenCalled();
	});

	it("startPeriodicFetch replaces previous timer", async () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		cache.startPeriodicFetch(10);
		await vi.advanceTimersByTimeAsync(0);

		cache.startPeriodicFetch(60);
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(10_000);
		expect(backend.readTree).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(50_000);
		expect(backend.readTree).toHaveBeenCalledTimes(3);
	});
});
