import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusCacheService } from "src/services/StatusCacheService";
import type { PublishFile } from "src/publishFile/PublishFile";
import type { PublishStatus } from "src/publisher/types";

const { createInstance, setStore, setThrowOnGet, getStore } = vi.hoisted(() => {
	let currentStore = new Map<string, unknown>();
	let throwOnGet = false;
	const setStore = (store: Map<string, unknown>) => {
		currentStore = store;
	};
	const setThrowOnGet = (value: boolean) => {
		throwOnGet = value;
	};
	const getStore = () => currentStore;
	const createInstance = vi.fn(() => ({
		getItem: vi.fn((key: string) => {
			if (throwOnGet) {
				return Promise.reject(new Error("get failed"));
			}
			return Promise.resolve(currentStore.get(key));
		}),
		setItem: vi.fn((key: string, value: unknown) => {
			currentStore.set(key, value);
			return Promise.resolve();
		}),
		removeItem: vi.fn((key: string) => {
			currentStore.delete(key);
			return Promise.resolve();
		}),
	}));

	return {
		createInstance,
		setStore,
		setThrowOnGet,
		getStore,
	};
});

const { setDesktop, getPlatform } = vi.hoisted(() => {
	let isDesktop = true;
	return {
		setDesktop: (value: boolean) => {
			isDesktop = value;
		},
		getPlatform: () => ({
			Platform: {
				get isDesktopApp() {
					return isDesktop;
				},
			},
		}),
	};
});

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: createInstance,
}));

vi.mock("obsidian", () => getPlatform());

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

const stubFile = (path: string) =>
	({
		file: { path, stat: { mtime: 1000 } },
		getVaultPath: () => path,
	}) as unknown as PublishFile;

const buildStatus = (
	overrides: Partial<PublishStatus> = {},
): PublishStatus => ({
	unpublished: [stubFile("notes/a.md")],
	changed: [stubFile("notes/b.md")],
	published: [stubFile("notes/c.md")],
	deleted: ["notes/d.md"],
	media: [
		{
			repoPath: "media/img.png",
			vaultPath: "media/img.png",
			sha: "abc",
			linked: true,
		},
	],
	arbitrary: [
		{
			vaultPath: "arb.txt",
			repoPath: "arb.txt",
			status: "published",
			sha: "def",
		},
	],
	mediaLinks: new Map([["media/img.png", ["notes/a.md"]]]),
	...overrides,
});

describe("StatusCacheService", () => {
	beforeEach(() => {
		setStore(new Map());
		setThrowOnGet(false);
		setDesktop(true);
		createInstance.mockClear();
	});

	it.each([
		["", ""],
		["app-id", ""],
		["", "app"],
	])(
		"does not create or access persistence for an empty scope (%s, %s)",
		async (appId, pluginId) => {
			const service = new StatusCacheService(appId, pluginId);
			expect(createInstance).not.toHaveBeenCalled();

			await service.loadPersistedSnapshot();
			expect(service.getSnapshot()).toBeNull();
			service.setStatus(buildStatus());
			await flushPromises();
			service.invalidate();
			await flushPromises();

			expect(createInstance).not.toHaveBeenCalled();
			expect(getStore().size).toBe(0);
		},
	);

	it("creates an appId-scoped store only on first access and reuses it for persistence", async () => {
		const service = new StatusCacheService("app-id", "app");
		expect(createInstance).not.toHaveBeenCalled();

		await service.loadPersistedSnapshot();
		expect(createInstance).toHaveBeenCalledExactlyOnceWith(
			"app-id-app-status",
		);
		service.setStatus(buildStatus());
		await flushPromises();
		expect(getStore().get("status-snapshot")).toEqual(
			service.getSnapshot(),
		);
		service.invalidate();
		await flushPromises();
		expect(getStore().has("status-snapshot")).toBe(false);
		expect(createInstance).toHaveBeenCalledTimes(1);
	});

	it("returns cached status only when not stale", () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus();

		expect(service.getStatus()).toBeNull();
		expect(service.isStale()).toBe(true);

		service.setStatus(status);

		expect(service.isStale()).toBe(false);
		expect(service.getStatus()).toBe(status);

		service.markStale();

		expect(service.isStale()).toBe(true);
		expect(service.getStatus()).toBeNull();
		expect(service.getCachedStatusEvenIfStale()).toBe(status);
	});

	it("setStatus persists a snapshot and clears stale", async () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus();
		service.setStatus(status);
		const storeInstance = createInstance.mock.results[0].value as {
			setItem: ReturnType<typeof vi.fn>;
		};

		await flushPromises();

		expect(service.isStale()).toBe(false);
		expect(service.getCachedStatusEvenIfStale()).toBe(status);
		expect(storeInstance.setItem).toHaveBeenCalledTimes(1);
		const snapshot = getStore().get("status-snapshot") as {
			unpublished: string[];
			changed: string[];
			published: string[];
			deleted: string[];
			mediaLinks: Record<string, string[]>;
			timestamp: number;
		};
		expect(snapshot.unpublished).toEqual(["notes/a.md"]);
		expect(snapshot.changed).toEqual(["notes/b.md"]);
		expect(snapshot.published).toEqual(["notes/c.md"]);
		expect(snapshot.deleted).toEqual(["notes/d.md"]);
		expect(snapshot.mediaLinks).toEqual({
			"media/img.png": ["notes/a.md"],
		});
		expect(snapshot.timestamp).toEqual(expect.any(Number));
	});

	it("setStatus handles missing mediaLinks", async () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus({ mediaLinks: undefined });

		service.setStatus(status);
		await flushPromises();

		const snapshot = getStore().get("status-snapshot") as {
			mediaLinks: Record<string, string[]>;
		};
		expect(snapshot.mediaLinks).toEqual({});
	});

	it("markStale clears diff cache", () => {
		const service = new StatusCacheService("app-id", "app");
		service.cacheDiffContent("notes/a.md", "local", "remote");
		service.cacheDiffContent("notes/b.md", "local", "remote");

		service.markStale();

		expect(service.isStale()).toBe(true);
		expect(service.getDiffContent("notes/a.md")).toBeUndefined();
		expect(service.getDiffContent("notes/b.md")).toBeUndefined();
	});

	it("markStaleFile clears only the specified diff entry", () => {
		const service = new StatusCacheService("app-id", "app");
		service.cacheDiffContent("notes/a.md", "local", "remote");
		service.cacheDiffContent("notes/b.md", "local", "remote");

		service.markStaleFile("notes/a.md");

		expect(service.isStale()).toBe(true);
		expect(service.getDiffContent("notes/a.md")).toBeUndefined();
		expect(service.getDiffContent("notes/b.md")).toEqual({
			local: "local",
			remote: "remote",
		});
	});

	it("patchPublished moves files and evicts only published diffs", async () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus({
			unpublished: [stubFile("notes/a.md"), stubFile("notes/b.md")],
			changed: [stubFile("notes/c.md")],
			published: [stubFile("notes/d.md")],
			deleted: ["notes/e.md"],
		});
		service.setStatus(status);
		service.cacheDiffContent("notes/a.md", "local-a", "remote-a");
		service.cacheDiffContent("notes/c.md", "local-c", "remote-c");
		service.cacheDiffContent("notes/z.md", "local-z", "remote-z");

		service.patchPublished(new Set(["notes/a.md", "notes/c.md"]));
		await flushPromises();

		const updated = service.getCachedStatusEvenIfStale() as PublishStatus;
		expect(updated.unpublished.map((f) => f.getVaultPath())).toEqual([
			"notes/b.md",
		]);
		expect(updated.changed).toEqual([]);
		expect(updated.published.map((f) => f.getVaultPath())).toEqual([
			"notes/d.md",
			"notes/a.md",
			"notes/c.md",
		]);
		expect(service.getDiffContent("notes/a.md")).toBeUndefined();
		expect(service.getDiffContent("notes/c.md")).toBeUndefined();
		expect(service.getDiffContent("notes/z.md")).toEqual({
			local: "local-z",
			remote: "remote-z",
		});
		expect(getStore().has("status-snapshot")).toBe(true);
	});

	it("patchPublished no-ops when cache is empty", async () => {
		const service = new StatusCacheService("app-id", "app");
		await service.loadPersistedSnapshot();
		const storeInstance = createInstance.mock.results[0].value as {
			setItem: ReturnType<typeof vi.fn>;
		};
		service.cacheDiffContent("notes/a.md", "local", "remote");

		service.patchPublished(new Set(["notes/a.md"]));

		expect(service.getCachedStatusEvenIfStale()).toBeNull();
		expect(service.getDiffContent("notes/a.md")).toEqual({
			local: "local",
			remote: "remote",
		});
		expect(storeInstance.setItem).toHaveBeenCalledTimes(0);
	});

	it("patchDeleted removes files and evicts only deleted diffs", async () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus({
			published: [stubFile("notes/a.md"), stubFile("notes/b.md")],
			changed: [stubFile("notes/c.md")],
			deleted: ["notes/d.md", "notes/e.md"],
		});
		service.setStatus(status);
		service.cacheDiffContent("notes/b.md", "local-b", "remote-b");
		service.cacheDiffContent("notes/c.md", "local-c", "remote-c");
		service.cacheDiffContent("notes/z.md", "local-z", "remote-z");

		service.patchDeleted(
			new Set(["notes/b.md", "notes/c.md", "notes/d.md"]),
		);
		await flushPromises();

		const updated = service.getCachedStatusEvenIfStale() as PublishStatus;
		expect(updated.published.map((f) => f.getVaultPath())).toEqual([
			"notes/a.md",
		]);
		expect(updated.changed).toEqual([]);
		expect(updated.deleted).toEqual(["notes/e.md"]);
		expect(service.getDiffContent("notes/b.md")).toBeUndefined();
		expect(service.getDiffContent("notes/c.md")).toBeUndefined();
		expect(service.getDiffContent("notes/z.md")).toEqual({
			local: "local-z",
			remote: "remote-z",
		});
		expect(getStore().has("status-snapshot")).toBe(true);
	});

	it("patchDeleted no-ops when cache is empty", async () => {
		const service = new StatusCacheService("app-id", "app");
		await service.loadPersistedSnapshot();
		const storeInstance = createInstance.mock.results[0].value as {
			setItem: ReturnType<typeof vi.fn>;
		};
		service.cacheDiffContent("notes/a.md", "local", "remote");

		service.patchDeleted(new Set(["notes/a.md"]));

		expect(service.getCachedStatusEvenIfStale()).toBeNull();
		expect(service.getDiffContent("notes/a.md")).toEqual({
			local: "local",
			remote: "remote",
		});
		expect(storeInstance.setItem).toHaveBeenCalledTimes(0);
	});

	it("invalidate clears all state and removes persisted snapshot", async () => {
		const service = new StatusCacheService("app-id", "app");
		const status = buildStatus();
		service.setStatus(status);
		const storeInstance = createInstance.mock.results[0].value as {
			removeItem: ReturnType<typeof vi.fn>;
		};
		await flushPromises();
		service.cacheDiffContent("notes/a.md", "local", "remote");
		service.setInflight(Promise.resolve(status));

		service.invalidate();
		await flushPromises();

		expect(service.getCachedStatusEvenIfStale()).toBeNull();
		expect(service.getSnapshot()).toBeNull();
		expect(service.isStale()).toBe(true);
		expect(service.getInflight()).toBeNull();
		expect(service.getDiffContent("notes/a.md")).toBeUndefined();
		expect(storeInstance.removeItem).toHaveBeenCalledWith(
			"status-snapshot",
		);
		expect(getStore().has("status-snapshot")).toBe(false);
	});

	it("manages inflight state", () => {
		const service = new StatusCacheService("app-id", "app");
		const promise = Promise.resolve(buildStatus());

		expect(service.getInflight()).toBeNull();
		service.setInflight(promise);
		expect(service.getInflight()).toBe(promise);
		service.clearInflight();
		expect(service.getInflight()).toBeNull();
	});

	it("caches and retrieves diff content", () => {
		const service = new StatusCacheService("app-id", "app");

		expect(service.getDiffContent("notes/a.md")).toBeUndefined();

		service.cacheDiffContent("notes/a.md", "local", "remote");

		expect(service.getDiffContent("notes/a.md")).toEqual({
			local: "local",
			remote: "remote",
		});
	});

	it("evicts oldest diff entries when at capacity", () => {
		setDesktop(false);
		const service = new StatusCacheService("app-id", "app");

		for (let index = 0; index < 20; index += 1) {
			service.cacheDiffContent(
				`notes/${index}.md`,
				`local-${index}`,
				`remote-${index}`,
			);
		}

		service.cacheDiffContent("notes/20.md", "local-20", "remote-20");

		expect(service.getDiffContent("notes/0.md")).toBeUndefined();
		expect(service.getDiffContent("notes/1.md")).toEqual({
			local: "local-1",
			remote: "remote-1",
		});
		expect(service.getDiffContent("notes/20.md")).toEqual({
			local: "local-20",
			remote: "remote-20",
		});
	});

	it("clearDiffCache removes all entries", () => {
		const service = new StatusCacheService("app-id", "app");
		service.cacheDiffContent("notes/a.md", "local", "remote");
		service.cacheDiffContent("notes/b.md", "local", "remote");

		service.clearDiffCache();

		expect(service.getDiffContent("notes/a.md")).toBeUndefined();
		expect(service.getDiffContent("notes/b.md")).toBeUndefined();
	});

	it("loadPersistedSnapshot loads stored snapshot", async () => {
		const service = new StatusCacheService("app-id", "app");
		const snapshot = {
			destination: "none",
			unpublished: ["notes/a.md"],
			changed: ["notes/b.md"],
			published: ["notes/c.md"],
			deleted: ["notes/d.md"],
			media: [],
			arbitrary: [],
			mediaLinks: {},
			timestamp: 100,
		};
		getStore().set("status-snapshot", snapshot);

		await service.loadPersistedSnapshot();

		expect(service.getSnapshot()).toEqual(snapshot);
	});

	it("discards a snapshot persisted for a different destination", async () => {
		const service = new StatusCacheService("app-id", "app");
		service.setDestination("remote:https://example.com/r.git#v5");
		getStore().set("status-snapshot", {
			destination: "local:/home/user/quartz",
			unpublished: ["notes/a.md"],
			changed: [],
			published: [],
			deleted: [],
			media: [],
			arbitrary: [],
			mediaLinks: {},
			timestamp: 100,
		});

		await service.loadPersistedSnapshot();

		expect(service.getSnapshot()).toBeNull();
	});

	it("drops cached state when the destination changes", () => {
		const service = new StatusCacheService("app-id", "app");
		service.setDestination("local:/home/user/quartz");
		service.setSummary({
			unpublished: 1,
			changed: 0,
			published: 0,
			deleted: 0,
			media: 0,
			timestamp: 1,
		});

		service.setDestination("remote:https://example.com/r.git#v5");

		expect(service.getSummary()).toBeNull();
		expect(service.getStatus()).toBeNull();
		expect(service.isStale()).toBe(true);
	});

	it("ignores a status that resolved for a previous destination", () => {
		const service = new StatusCacheService("app-id", "app");
		service.setDestination("local:/home/user/quartz");
		service.setDestination("remote:https://example.com/r.git#v5");

		service.setStatus(
			{
				unpublished: [],
				changed: [],
				published: [],
				deleted: [],
				media: [],
				arbitrary: [],
				mediaLinks: new Map(),
			} as unknown as Parameters<StatusCacheService["setStatus"]>[0],
			"local:/home/user/quartz",
		);

		expect(service.getStatus()).toBeNull();
	});

	it("loadPersistedSnapshot keeps null when no data", async () => {
		const service = new StatusCacheService("app-id", "app");

		await service.loadPersistedSnapshot();

		expect(service.getSnapshot()).toBeNull();
	});

	it("loadPersistedSnapshot clears snapshot on error", async () => {
		const service = new StatusCacheService("app-id", "app");
		service.setStatus(buildStatus());
		await flushPromises();

		setThrowOnGet(true);
		await service.loadPersistedSnapshot();

		expect(service.getSnapshot()).toBeNull();
	});

	it("roundtrips persisted snapshot into a new instance", async () => {
		const service = new StatusCacheService("app-id", "app");
		service.setStatus(buildStatus());
		await flushPromises();

		const newService = new StatusCacheService("app-id", "app");
		await newService.loadPersistedSnapshot();

		expect(newService.getSnapshot()).toEqual(
			getStore().get("status-snapshot"),
		);
	});
});
