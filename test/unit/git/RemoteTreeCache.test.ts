import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteTreeCache } from "src/git/RemoteTreeCache";
import type { GitBackend, TreeEntry } from "src/git/types";
import type { IndexedDBStore } from "src/cache/IndexedDBStore";

const { mockCreateStore, getMockStore } = vi.hoisted(() => {
	let currentStoreData = new Map<string, unknown>();

	const mockStoreInstance: IndexedDBStore = {
		getItem: vi.fn((key: string) =>
			Promise.resolve((currentStoreData.get(key) as never) ?? null),
		),
		setItem: vi.fn((key: string, value: unknown) => {
			currentStoreData.set(key, value);
			return Promise.resolve();
		}),
		removeItem: vi.fn((key: string) => {
			currentStoreData.delete(key);
			return Promise.resolve();
		}),
		keys: vi.fn(() => Promise.resolve(Array.from(currentStoreData.keys()))),
		iterate: vi.fn(
			async (callback: (value: unknown, key: string) => void) => {
				for (const [key, value] of currentStoreData.entries()) {
					callback(value, key);
				}
			},
		),
		close: vi.fn(),
	};

	const mockCreateStore = vi.fn(() => mockStoreInstance);

	const getMockStore = () => ({
		instance: mockStoreInstance,
		reset: () => {
			currentStoreData = new Map();
			vi.mocked(mockStoreInstance.getItem).mockClear();
			vi.mocked(mockStoreInstance.setItem).mockClear();
			vi.mocked(mockStoreInstance.removeItem).mockClear();
			vi.mocked(mockStoreInstance.keys).mockClear();
			vi.mocked(mockStoreInstance.iterate).mockClear();
			vi.mocked(mockStoreInstance.close).mockClear();
		},
	});

	return { mockCreateStore, getMockStore };
});

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: mockCreateStore,
	dropStore: vi.fn(),
}));

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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("RemoteTreeCache", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getMockStore().reset();
		mockCreateStore.mockClear();
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

	it("removeEntries filters matching paths from cache", async () => {
		const entries = [
			makeTreeEntry("content/a.md"),
			makeTreeEntry("content/b.md"),
			makeTreeEntry("content/c.md"),
		];
		const backend = makeGitBackend(entries);
		const cache = new RemoteTreeCache(backend, "main");

		await cache.get();
		cache.removeEntries(["content/a.md", "content/c.md"]);

		const result = await cache.get();
		expect(result).toHaveLength(1);
		expect(result[0]?.path).toBe("content/b.md");
		expect(backend.readTree).toHaveBeenCalledTimes(1);
	});

	it("removeEntries is a no-op when cache is empty", () => {
		const backend = makeGitBackend();
		const cache = new RemoteTreeCache(backend, "main");

		cache.removeEntries(["content/a.md"]);
		expect(cache.isCached).toBe(false);
	});

	it("removeEntries with no matching paths leaves cache unchanged", async () => {
		const entries = [makeTreeEntry("content/a.md")];
		const backend = makeGitBackend(entries);
		const cache = new RemoteTreeCache(backend, "main");

		await cache.get();
		cache.removeEntries(["content/nonexistent.md"]);

		const result = await cache.get();
		expect(result).toHaveLength(1);
		expect(result[0]?.path).toBe("content/a.md");
	});

	describe("persistence", () => {
		const REMOTE_URL = "https://github.com/user/repo.git";
		const VAULT = "my-vault";
		const PLUGIN_ID = "quartz-syncer";

		it("refresh() persists a record with generation, remoteUrl, branch, entries, and time; subsequent get() does not call readTree again", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const backend = makeGitBackend(entries);
			const cache = new RemoteTreeCache(backend, "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await cache.refresh();

			const store = getMockStore().instance;
			expect(store.setItem).toHaveBeenCalledWith(
				"tree",
				expect.objectContaining({
					generation: 1,
					remoteUrl: REMOTE_URL,
					branch: "main",
					entries,
					time: expect.any(Number),
				}),
			);

			const fresh = new RemoteTreeCache(makeGitBackend(entries), "main");
			fresh.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);
			await fresh.loadPersisted();

			const result = await fresh.get();
			expect(result).toEqual(entries);
			const freshBackend = fresh["gitBackend"] as GitBackend;
			expect(freshBackend.readTree).not.toHaveBeenCalled();
		});

		it("rejects a persisted record whose remoteUrl differs from the current remoteUrl, falls through to readTree, and removes the stale record", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const staleRecord = {
				generation: 1,
				remoteUrl: "https://github.com/OTHER/repo.git",
				branch: "main",
				entries,
				time: Date.now(),
			};
			getMockStore().instance;
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				staleRecord as never,
			);

			const backend = makeGitBackend(entries);
			const cache = new RemoteTreeCache(backend, "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await cache.loadPersisted();

			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);
			expect(cache.isCached).toBe(false);

			await cache.get();
			expect(backend.readTree).toHaveBeenCalledTimes(1);
		});

		it("rejects a persisted record whose branch differs from the current branch, falls through to readTree, and removes the stale record", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const staleRecord = {
				generation: 1,
				remoteUrl: REMOTE_URL,
				branch: "other-branch",
				entries,
				time: Date.now(),
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				staleRecord as never,
			);

			const backend = makeGitBackend(entries);
			const cache = new RemoteTreeCache(backend, "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await cache.loadPersisted();

			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);
			expect(cache.isCached).toBe(false);

			await cache.get();
			expect(backend.readTree).toHaveBeenCalledTimes(1);
		});

		it("rejects a legacy record shaped {entries, time} with no generation/remoteUrl/branch, removes it, and falls through to readTree", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const legacyRecord = { entries, time: Date.now() };
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				legacyRecord as never,
			);

			const backend = makeGitBackend(entries);
			const cache = new RemoteTreeCache(backend, "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await cache.loadPersisted();

			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);
			expect(cache.isCached).toBe(false);

			await cache.get();
			expect(backend.readTree).toHaveBeenCalledTimes(1);
		});

		it("rejects a record with a mismatched generation number and removes it", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const wrongGenRecord = {
				generation: 99,
				remoteUrl: REMOTE_URL,
				branch: "main",
				entries,
				time: Date.now(),
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				wrongGenRecord as never,
			);

			const cache = new RemoteTreeCache(makeGitBackend(entries), "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await cache.loadPersisted();

			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);
			expect(cache.isCached).toBe(false);
		});

		it("rejects a record older than 7 days and accepts a record just under 7 days old", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const now = Date.now();

			const expiredRecord = {
				generation: 1,
				remoteUrl: REMOTE_URL,
				branch: "main",
				entries,
				time: now - SEVEN_DAYS_MS - 1,
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				expiredRecord as never,
			);

			const cacheExpired = new RemoteTreeCache(
				makeGitBackend(entries),
				"main",
			);
			cacheExpired.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);
			await cacheExpired.loadPersisted();

			expect(cacheExpired.isCached).toBe(false);
			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);

			getMockStore().reset();

			const freshRecord = {
				generation: 1,
				remoteUrl: REMOTE_URL,
				branch: "main",
				entries,
				time: now - SEVEN_DAYS_MS + 1000,
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				freshRecord as never,
			);

			const cacheFresh = new RemoteTreeCache(
				makeGitBackend(entries),
				"main",
			);
			cacheFresh.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);
			await cacheFresh.loadPersisted();

			expect(cacheFresh.isCached).toBe(true);
			expect(getMockStore().instance.removeItem).not.toHaveBeenCalled();
		});

		it("rejects a malformed record where entries is not an array, without throwing", async () => {
			const malformedRecord = {
				generation: 1,
				remoteUrl: REMOTE_URL,
				branch: "main",
				entries: "not-an-array",
				time: Date.now(),
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				malformedRecord as never,
			);

			const cache = new RemoteTreeCache(makeGitBackend(), "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			await expect(cache.loadPersisted()).resolves.toBeUndefined();
			expect(cache.isCached).toBe(false);
			expect(getMockStore().instance.removeItem).toHaveBeenCalledWith(
				"tree",
			);
		});

		it("get() awaits in-flight loadPersisted() and returns persisted entries without calling readTree", async () => {
			const entries = [makeTreeEntry("content/a.md")];
			const persistedRecord = {
				generation: 1,
				remoteUrl: REMOTE_URL,
				branch: "main",
				entries,
				time: Date.now(),
			};
			vi.mocked(getMockStore().instance.getItem).mockResolvedValueOnce(
				persistedRecord as never,
			);

			const backend = makeGitBackend(entries);
			const cache = new RemoteTreeCache(backend, "main");
			cache.enablePersistence(VAULT, PLUGIN_ID, REMOTE_URL);

			const loadPromise = cache.loadPersisted();
			const getPromise = cache.get();

			const [, result] = await Promise.all([loadPromise, getPromise]);

			expect(result).toEqual(entries);
			expect(backend.readTree).not.toHaveBeenCalled();
		});

		it("loadPersisted() with persistence never enabled is a no-op and does not throw", async () => {
			const cache = new RemoteTreeCache(makeGitBackend(), "main");

			await expect(cache.loadPersisted()).resolves.toBeUndefined();
			expect(cache.isCached).toBe(false);
		});
	});
});
