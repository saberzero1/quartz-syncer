import assert from "node:assert";
import { RepositoryConnection } from "./RepositoryConnection";

const mockFetch = jest.fn();
const mockResolveRef = jest.fn();
const mockCheckout = jest.fn();
const mockBranch = jest.fn();
const mockListRemotes = jest.fn();
const mockDeleteRemote = jest.fn();
const mockAddRemote = jest.fn();
const mockMerge = jest.fn();
const mockFindMergeBase = jest.fn();
const mockWalk = jest.fn();
const mockReadBlob = jest.fn();
const mockAdd = jest.fn();
const mockCommit = jest.fn();
const mockPush = jest.fn();
const mockTREE = jest.fn();
const mockClone = jest.fn();
const mockReadCommit = jest.fn();
const mockReadTree = jest.fn();
const mockRemove = jest.fn();

jest.mock("isomorphic-git", () => ({
	__esModule: true,
	default: {
		fetch: (...args: unknown[]) => mockFetch(...args),
		resolveRef: (...args: unknown[]) => mockResolveRef(...args),
		checkout: (...args: unknown[]) => mockCheckout(...args),
		branch: (...args: unknown[]) => mockBranch(...args),
		listRemotes: (...args: unknown[]) => mockListRemotes(...args),
		deleteRemote: (...args: unknown[]) => mockDeleteRemote(...args),
		addRemote: (...args: unknown[]) => mockAddRemote(...args),
		merge: (...args: unknown[]) => mockMerge(...args),
		findMergeBase: (...args: unknown[]) => mockFindMergeBase(...args),
		walk: (...args: unknown[]) => mockWalk(...args),
		readBlob: (...args: unknown[]) => mockReadBlob(...args),
		add: (...args: unknown[]) => mockAdd(...args),
		commit: (...args: unknown[]) => mockCommit(...args),
		push: (...args: unknown[]) => mockPush(...args),
		clone: (...args: unknown[]) => mockClone(...args),
		readCommit: (...args: unknown[]) => mockReadCommit(...args),
		readTree: (...args: unknown[]) => mockReadTree(...args),
		remove: (...args: unknown[]) => mockRemove(...args),
		TREE: (...args: unknown[]) => mockTREE(...args),
	},
	TREE: (...args: unknown[]) => mockTREE(...args),
}));

jest.mock("@isomorphic-git/lightning-fs", () => {
	return jest.fn().mockImplementation(() => ({
		promises: {
			mkdir: jest.fn().mockResolvedValue(undefined),
			writeFile: jest.fn().mockResolvedValue(undefined),
			readFile: jest.fn().mockResolvedValue(new Uint8Array()),
			unlink: jest.fn().mockResolvedValue(undefined),
			stat: jest.fn().mockResolvedValue({ type: "dir" }),
		},
	}));
});

jest.mock("obsidian", () => ({
	normalizePath: (p: string) => p.replace(/\\/g, "/").replace(/^\//, ""),
	requestUrl: jest.fn(),
}));

function createConnection(): RepositoryConnection {
	return new RepositoryConnection({
		gitSettings: {
			remoteUrl: "https://github.com/test/repo.git",
			branch: "main",
			auth: { type: "none" as const },
		},
		contentFolder: "content",
		vaultPath: "/",
	});
}

function setupDefaultMocks(): void {
	mockFetch.mockResolvedValue(undefined);
	mockCheckout.mockResolvedValue(undefined);
	mockBranch.mockResolvedValue(undefined);
	mockAdd.mockResolvedValue(undefined);
	mockPush.mockResolvedValue(undefined);
	mockAddRemote.mockResolvedValue(undefined);
	mockDeleteRemote.mockResolvedValue(undefined);
	mockCommit.mockResolvedValue("commit123");
	mockTREE.mockReturnValue({ _marker: "TREE" });

	mockListRemotes.mockResolvedValue([
		{ remote: "origin", url: "https://github.com/test/repo.git" },
	]);

	mockResolveRef.mockImplementation(
		(opts: { ref: string }): Promise<string> => {
			if (opts.ref === "origin/main") return Promise.resolve("ours123");
			if (opts.ref === "main") return Promise.resolve("ours123");
			if (opts.ref === "remotes/upstream/v5")
				return Promise.resolve("theirs456");
			return Promise.resolve("unknown");
		},
	);
}

describe("upgradeFromUpstream — conflict resolution", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setupDefaultMocks();
	});

	it("Test 1: clean merge (no conflicts)", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		mockMerge.mockResolvedValue({
			oid: "merge123",
			alreadyMerged: false,
		});

		mockReadBlob.mockRejectedValue(new Error("not found"));

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, false);
		assert.ok(result.oid);
		assert.ok(mockMerge.mock.calls.length > 0);
	});

	it("Test 2: already merged", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		mockMerge.mockResolvedValue({
			oid: "abc",
			alreadyMerged: true,
		});

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, true);
		assert.strictEqual(mockCommit.mock.calls.length, 0);
	});

	it("Test 3: findMergeBase returns empty", async () => {
		mockFindMergeBase.mockResolvedValue([]);

		const connection = createConnection();

		await assert.rejects(
			() =>
				connection.upgradeFromUpstream(
					"https://github.com/jackyzha0/quartz.git",
					"v5",
				),
			(error: Error) => {
				assert.ok(
					error.message.includes("Cannot determine merge base"),
				);
				return true;
			},
		);
	});

	it("Test 4: framework file modified by user (preflight fails)", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				await opts.map("package.json", [
					{
						type: async () => "blob",
						oid: async () => "ours_pkg_oid",
					},
					{
						type: async () => "blob",
						oid: async () => "base_pkg_oid",
					},
				]);
				return [];
			},
		);

		const connection = createConnection();

		await assert.rejects(
			() =>
				connection.upgradeFromUpstream(
					"https://github.com/jackyzha0/quartz.git",
					"v5",
				),
			(error: Error) => {
				assert.ok(error.message.includes("Cannot auto-upgrade"));
				assert.ok(error.message.includes("package.json"));
				return true;
			},
		);
	});

	it("Test 5: multiple framework files modified (preflight fails)", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				await opts.map("package.json", [
					{
						type: async () => "blob",
						oid: async () => "ours_pkg_oid",
					},
					{
						type: async () => "blob",
						oid: async () => "base_pkg_oid",
					},
				]);
				await opts.map("tsconfig.json", [
					{
						type: async () => "blob",
						oid: async () => "ours_ts_oid",
					},
					{
						type: async () => "blob",
						oid: async () => "base_ts_oid",
					},
				]);
				return [];
			},
		);

		const connection = createConnection();

		await assert.rejects(
			() =>
				connection.upgradeFromUpstream(
					"https://github.com/jackyzha0/quartz.git",
					"v5",
				),
			(error: Error) => {
				assert.ok(error.message.includes("Cannot auto-upgrade"));
				assert.ok(error.message.includes("package.json"));
				assert.ok(error.message.includes("tsconfig.json"));
				return true;
			},
		);
	});

	it("Test 6: user-owned file conflict resolved via mergeDriver", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		mockMerge.mockImplementation(
			async (opts: {
				mergeDriver?: (args: {
					branches: string[];
					contents: string[];
					path: string;
				}) => Promise<{ cleanMerge: boolean; mergedText: string }>;
			}) => {
				if (opts.mergeDriver) {
					await opts.mergeDriver({
						branches: ["base", "ours", "theirs"],
						contents: [
							"base-content",
							"our-config",
							"their-config",
						],
						path: "quartz.config.yaml",
					});
				}
				return { oid: "merge_user_owned", alreadyMerged: false };
			},
		);

		mockReadBlob.mockImplementation(async (opts: { filepath: string }) => {
			if (opts.filepath === "quartz.config.yaml") {
				return {
					blob: new TextEncoder().encode("our-config"),
					oid: "blob_oid",
				};
			}
			throw new Error("not found");
		});

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, false);
		assert.ok(result.oid);
	});

	it("Test 7: lockfile conflict auto-resolved", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		mockMerge.mockImplementation(
			async (opts: {
				mergeDriver?: (args: {
					branches: string[];
					contents: string[];
					path: string;
				}) => Promise<{ cleanMerge: boolean; mergedText: string }>;
			}) => {
				if (opts.mergeDriver) {
					await opts.mergeDriver({
						branches: ["base", "ours", "theirs"],
						contents: ["base-lock", "our-lock", "their-lock"],
						path: "quartz.lock.json",
					});
				}
				return { oid: "merge_lockfile", alreadyMerged: false };
			},
		);

		mockReadBlob.mockRejectedValue(new Error("not found"));

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, false);
		assert.ok(result.oid);
	});

	it("Test 8: delete conflict handled", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		const mergeError = new Error("Merge conflict") as Error & {
			data: { filepaths: string[] };
		};
		mergeError.data = {
			filepaths: ["quartz.config.yaml", "content/notes/hello.md"],
		};

		mockMerge.mockRejectedValue(mergeError);

		mockReadBlob.mockImplementation(async (opts: { filepath: string }) => {
			if (opts.filepath === "quartz.config.yaml") {
				return {
					blob: new TextEncoder().encode("user-config"),
					oid: "blob_config",
				};
			}
			throw new Error("not found");
		});

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, false);
		assert.ok(result.oid);
		assert.ok(mockCommit.mock.calls.length > 0);
	});

	it("Test 9: snapshot restores user files after clean merge", async () => {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);
				return [];
			},
		);

		mockMerge.mockResolvedValue({
			oid: "merge_clean",
			alreadyMerged: false,
		});

		const configContent = new TextEncoder().encode("user-quartz-config");

		mockReadBlob.mockImplementation(async (opts: { filepath: string }) => {
			if (opts.filepath === "quartz.config.yaml") {
				return { blob: configContent, oid: "blob_config" };
			}
			if (opts.filepath === "quartz.lock.json") {
				return {
					blob: new TextEncoder().encode("lock-content"),
					oid: "blob_lock",
				};
			}
			throw new Error("not found");
		});

		const connection = createConnection();
		const result = await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		assert.strictEqual(result.alreadyMerged, false);
		assert.ok(result.oid);

		const addCalls = mockAdd.mock.calls as { filepath: string }[][];
		const restoredFiles = addCalls
			.map((call) => call[0]?.filepath)
			.filter(Boolean);
		assert.ok(
			restoredFiles.includes("quartz.config.yaml"),
			"quartz.config.yaml should be restored after merge",
		);
	});
});

describe("mergeDriver behavior", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		setupDefaultMocks();
	});

	async function captureMergeDriver(): Promise<
		(args: {
			branches: string[];
			contents: string[];
			path: string;
		}) => Promise<{ cleanMerge: boolean; mergedText: string }>
	> {
		mockFindMergeBase.mockResolvedValue(["base123"]);

		mockWalk.mockImplementation(
			async (opts: {
				map: (
					filepath: string,
					entries: (null | {
						type: () => Promise<string>;
						oid: () => Promise<string>;
					})[],
				) => Promise<string | undefined>;
			}) => {
				await opts.map(".", [null, null]);

				return [];
			},
		);

		mockReadBlob.mockRejectedValue(new Error("not found"));

		let capturedDriver: (args: {
			branches: string[];
			contents: string[];
			path: string;
		}) => Promise<{ cleanMerge: boolean; mergedText: string }>;

		mockMerge.mockImplementation(
			(opts: { mergeDriver: typeof capturedDriver }) => {
				capturedDriver = opts.mergeDriver;

				return Promise.resolve({
					oid: "merge123",
					alreadyMerged: false,
				});
			},
		);

		const connection = createConnection();
		await connection.upgradeFromUpstream(
			"https://github.com/jackyzha0/quartz.git",
			"v5",
		);

		return capturedDriver!;
	}

	it("returns ours for user-owned files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base content", "our content", "their content"],
			path: "quartz.config.yaml",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "our content");
	});

	it("returns theirs for framework files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base content", "our content", "their content"],
			path: "package.json",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "their content");
	});

	it("returns ours for content directory files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", "our note", "their note"],
			path: "content/notes/hello.md",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "our note");
	});

	it("returns ours for .github files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", "our workflow", "their workflow"],
			path: ".github/workflows/deploy.yaml",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "our workflow");
	});

	it("returns ours for syncer style files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", "our scss", "their scss"],
			path: "quartz/styles/syncer/_datacore.scss",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "our scss");
	});

	it("returns ours for static asset files", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", "our icon", "their icon"],
			path: "quartz/static/icon.png",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "our icon");
	});

	it("handles undefined ours gracefully", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", undefined as unknown as string, "their content"],
			path: "quartz.lock.json",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "");
	});

	it("handles undefined theirs gracefully", async () => {
		const driver = await captureMergeDriver();

		const result = await driver({
			branches: ["base", "ours", "theirs"],
			contents: ["base", "our content", undefined as unknown as string],
			path: "tsconfig.json",
		});

		assert.strictEqual(result.cleanMerge, true);
		assert.strictEqual(result.mergedText, "");
	});
});
