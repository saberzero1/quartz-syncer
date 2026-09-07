import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemotePublishBackend } from "src/publisher/RemotePublishBackend";
import type { GitBackend, TreeEntry, FileChange } from "src/git/types";
import { createStore } from "src/cache/IndexedDBStore";

const { getItem } = vi.hoisted(() => ({
	getItem: vi.fn(),
}));

vi.mock("src/cache/IndexedDBStore", () => ({
	createStore: vi.fn(() => ({ getItem })),
}));

const makeGitBackend = (overrides: Partial<GitBackend> = {}): GitBackend =>
	({
		readTree: vi.fn().mockResolvedValue([]),
		readBlob: vi.fn().mockResolvedValue(new Uint8Array()),
		writeFiles: vi.fn().mockResolvedValue({ sha: "abc123" }),
		deleteFiles: vi.fn().mockResolvedValue({ sha: "def456" }),
		getRemoteInfo: vi.fn().mockResolvedValue({}),
		testConnection: vi.fn().mockResolvedValue({
			ok: true,
			readAccess: true,
			writeAccess: true,
		}),
		listBranches: vi.fn().mockResolvedValue([]),
		...overrides,
	}) as unknown as GitBackend;

describe("RemotePublishBackend", () => {
	let gitBackend: GitBackend;
	let backend: RemotePublishBackend;

	beforeEach(() => {
		vi.mocked(createStore).mockClear();
		getItem.mockReset();
		gitBackend = makeGitBackend();
		backend = new RemotePublishBackend(gitBackend, "main");
	});

	it("isLocal returns false", () => {
		expect(backend.isLocal).toBe(false);
	});

	it("forwards appId and remote identity to tree persistence and loads the cached tree", async () => {
		const appId = "319a0eefd0e81b84";
		const remoteUrl = "https://github.com/user/repo.git";
		const entries: TreeEntry[] = [
			{ path: "content/cached.md", sha: "cached-sha", type: "blob" },
		];
		getItem.mockResolvedValue({
			generation: 1,
			remoteUrl,
			branch: "main",
			entries,
			time: Date.now(),
		});

		backend.enableTreePersistence(appId, "quartz-syncer", remoteUrl);

		expect(createStore).toHaveBeenCalledExactlyOnceWith(
			"319a0eefd0e81b84-quartz-syncer-tree",
		);
		await expect(backend.getCachedTree("main")).resolves.toEqual(entries);
		expect(getItem).toHaveBeenCalledExactlyOnceWith("tree");
		expect(gitBackend.readTree).not.toHaveBeenCalled();
	});

	it("writeFiles delegates to gitBackend.writeFiles with same args", async () => {
		const files: FileChange[] = [
			{ path: "content/notes/a.md", content: "hello", encoding: "utf-8" },
		];

		await backend.writeFiles("main", "Publish notes", files);

		expect(gitBackend.writeFiles).toHaveBeenCalledWith(
			"main",
			"Publish notes",
			files,
		);
	});

	it("writeFiles returns the result from gitBackend.writeFiles", async () => {
		const files: FileChange[] = [
			{ path: "content/notes/a.md", content: "hello", encoding: "utf-8" },
		];

		const result = await backend.writeFiles("main", "Publish notes", files);

		expect(result).toEqual({ sha: "abc123" });
	});

	it("deleteFiles delegates to gitBackend.deleteFiles with same args", async () => {
		const paths = ["content/notes/a.md", "content/notes/b.md"];

		await backend.deleteFiles("main", "Delete notes", paths);

		expect(gitBackend.deleteFiles).toHaveBeenCalledWith(
			"main",
			"Delete notes",
			paths,
		);
	});

	it("deleteFiles returns the result from gitBackend.deleteFiles", async () => {
		const paths = ["content/notes/a.md"];

		const result = await backend.deleteFiles("main", "Delete notes", paths);

		expect(result).toEqual({ sha: "def456" });
	});

	it("getTree delegates to gitBackend.readTree", async () => {
		const entries: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha1", type: "blob" },
		];
		vi.mocked(gitBackend.readTree).mockResolvedValue(entries);

		const result = await backend.getTree("main");

		expect(gitBackend.readTree).toHaveBeenCalledWith("main");
		expect(result).toEqual(entries);
	});

	it("readBlob delegates to gitBackend.readBlob", async () => {
		const data = new Uint8Array([1, 2, 3]);
		vi.mocked(gitBackend.readBlob).mockResolvedValue(data);

		const result = await backend.readBlob("sha-abc");

		expect(gitBackend.readBlob).toHaveBeenCalledWith("sha-abc");
		expect(result).toBe(data);
	});

	it("getCachedTree returns tree entries from cache (triggers readTree on first call)", async () => {
		const entries: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha1", type: "blob" },
			{ path: "content/images/img.png", sha: "sha2", type: "blob" },
		];
		vi.mocked(gitBackend.readTree).mockResolvedValue(entries);

		const result = await backend.getCachedTree("main");

		expect(result).toEqual(entries);
		expect(gitBackend.readTree).toHaveBeenCalledWith("main");
	});

	it("refreshTreeCache calls through to tree cache (triggers readTree)", async () => {
		const entries: TreeEntry[] = [
			{ path: "content/notes/a.md", sha: "sha1", type: "blob" },
		];
		vi.mocked(gitBackend.readTree).mockResolvedValue(entries);

		const result = await backend.refreshTreeCache();

		expect(gitBackend.readTree).toHaveBeenCalledWith("main");
		expect(result).toEqual(entries);
	});

	it("invalidateTreeCache does not throw", () => {
		expect(() => backend.invalidateTreeCache()).not.toThrow();
	});

	it("removeTreeEntries does not throw", () => {
		expect(() =>
			backend.removeTreeEntries(["content/notes/a.md"]),
		).not.toThrow();
	});

	it("removeTreeEntries with empty array does not throw", () => {
		expect(() => backend.removeTreeEntries([])).not.toThrow();
	});

	it("writeFiles passes through branch and message correctly", async () => {
		const files: FileChange[] = [];

		await backend.writeFiles(
			"feature-branch",
			"Custom commit message",
			files,
		);

		expect(gitBackend.writeFiles).toHaveBeenCalledWith(
			"feature-branch",
			"Custom commit message",
			files,
		);
	});

	it("deleteFiles passes through branch and message correctly", async () => {
		const paths: string[] = [];

		await backend.deleteFiles(
			"feature-branch",
			"Custom delete message",
			paths,
		);

		expect(gitBackend.deleteFiles).toHaveBeenCalledWith(
			"feature-branch",
			"Custom delete message",
			paths,
		);
	});
});
