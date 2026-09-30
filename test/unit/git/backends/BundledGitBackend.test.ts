import git from "@saberzero1/isomorphic-git";
import type { App } from "obsidian";
import { BundledGitBackend } from "src/git/backends/BundledGitBackend";
import type { GitBackendConfig } from "src/git/types";

vi.mock("@saberzero1/isomorphic-git", () => ({
	default: {
		resolveRef: vi.fn(),
		readCommit: vi.fn(),
		walk: vi.fn(),
		TREE: vi.fn(),
		readBlob: vi.fn(),
		readTree: vi.fn(),
		writeBlob: vi.fn(),
		writeTree: vi.fn(),
		writeCommit: vi.fn(),
		writeRef: vi.fn(),
		fetchObjects: vi.fn(),
		add: vi.fn(),
		commit: vi.fn(),
		push: vi.fn(),
		remove: vi.fn(),
		listFiles: vi.fn(),
		getRemoteInfo: vi.fn(),
		listServerRefs: vi.fn(),
		clone: vi.fn(),
		fetch: vi.fn(),
		checkout: vi.fn(),
		branch: vi.fn(),
		Errors: { NotFoundError: { code: "NotFoundError" } },
	},
}));

function treeOf(...names: string[]) {
	return {
		oid: "tree-sha",
		tree: names.map((path) => ({
			mode: "100644",
			path,
			oid: `${path}-oid`,
			type: "blob" as const,
		})),
	};
}

/** Make the backend's readTree() report these repo paths as present. */
function remoteTreeContains(paths: string[]): void {
	gitMock.walk.mockImplementation(async ({ map }) => {
		if (!map) return undefined;

		for (const path of paths) {
			await map(path, [
				{
					type: vi.fn().mockResolvedValue("blob"),
					oid: vi.fn().mockResolvedValue(`${path}-oid`),
					mode: vi.fn().mockResolvedValue(100644),
					content: vi.fn().mockResolvedValue(new Uint8Array()),
					stat: vi.fn().mockResolvedValue({}),
				},
			]);
		}

		return undefined;
	});
}

const fetchRepositorySizeMock = vi.hoisted(() =>
	vi.fn<() => Promise<number | null>>(),
);

vi.mock("src/git/RepositorySize", () => ({
	fetchRepositorySize: () => fetchRepositorySizeMock(),
	identifyHost: () => null,
}));

vi.mock("@isomorphic-git/lightning-fs", () => {
	class MockLightningFS {
		promises = {
			readFile: vi.fn().mockResolvedValue(Buffer.from("data")),
			writeFile: vi.fn().mockResolvedValue(undefined),
			unlink: vi.fn().mockResolvedValue(undefined),
			readdir: vi.fn().mockResolvedValue([]),
			mkdir: vi.fn().mockResolvedValue(undefined),
			rmdir: vi.fn().mockResolvedValue(undefined),
			stat: vi
				.fn()
				.mockRejectedValue(
					Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
				),
			lstat: vi.fn().mockResolvedValue({ isFile: () => true }),
			readlink: vi.fn().mockResolvedValue(""),
			symlink: vi.fn().mockResolvedValue(undefined),
		};
	}
	return { default: MockLightningFS };
});

const gitMock = vi.mocked(git);

const baseConfig: GitBackendConfig = {
	remoteUrl: "https://github.com/user/repo.git",
	branch: "main",
	auth: { type: "none" },
};

const mockApp = { appId: "test-vault-id" } as App;

describe("BundledGitBackend", () => {
	beforeEach(() => {
		gitMock.resolveRef.mockResolvedValue("commit-sha");
		gitMock.readCommit.mockResolvedValue({
			commit: { tree: "tree-sha" },
		} as ReturnType<typeof git.readCommit> extends Promise<infer R>
			? R
			: never);
		gitMock.walk.mockResolvedValue(undefined);
		gitMock.TREE.mockReturnValue(
			"tree" as unknown as ReturnType<typeof git.TREE>,
		);
		gitMock.readBlob.mockResolvedValue({
			blob: new Uint8Array([1]),
			oid: "blob-oid",
		});
		gitMock.add.mockResolvedValue(undefined);
		gitMock.readTree.mockResolvedValue(
			treeOf("a.md", "b.md", "c.md") as unknown as Awaited<
				ReturnType<typeof git.readTree>
			>,
		);
		gitMock.writeBlob.mockResolvedValue("written-blob-oid");
		gitMock.writeTree.mockResolvedValue("written-tree-oid");
		gitMock.writeCommit.mockResolvedValue("new-sha");
		gitMock.writeRef.mockResolvedValue(undefined);
		fetchRepositorySizeMock.mockResolvedValue(null);
		gitMock.fetchObjects.mockResolvedValue({ packfile: undefined });
		remoteTreeContains(["content/a.md", "content/b.md", "content/c.md"]);
		gitMock.listFiles.mockResolvedValue([
			"content/a.md",
			"content/b.md",
			"content/c.md",
		]);
		gitMock.commit.mockResolvedValue("new-sha");
		gitMock.push.mockResolvedValue(
			undefined as unknown as ReturnType<typeof git.push> extends Promise<
				infer R
			>
				? R
				: never,
		);
		gitMock.remove.mockResolvedValue(undefined);
		// GitHub advertises `filter`; without it the backend correctly falls
		// back to a full clone and the blobless assertions would be vacuous.
		gitMock.getRemoteInfo.mockResolvedValue({
			capabilities: new Set(["shallow", "filter", "ofs-delta"]),
		} as unknown as Awaited<ReturnType<typeof git.getRemoteInfo>>);
		gitMock.listServerRefs.mockResolvedValue([]);
		gitMock.clone.mockResolvedValue(undefined);
		gitMock.fetch.mockResolvedValue(
			undefined as unknown as ReturnType<
				typeof git.fetch
			> extends Promise<infer R>
				? R
				: never,
		);
		gitMock.checkout.mockResolvedValue(undefined);
		gitMock.branch.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it("writeFiles clones blobless, writes objects, and pushes", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		expect(gitMock.clone).toHaveBeenCalledWith(
			expect.objectContaining({
				url: baseConfig.remoteUrl,
				ref: "main",
				filter: "blob:none",
				noCheckout: true,
			}),
		);
		expect(gitMock.writeBlob).toHaveBeenCalledWith(
			expect.objectContaining({
				blob: new TextEncoder().encode("hello"),
			}),
		);
		expect(gitMock.writeCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				commit: expect.objectContaining({
					message: "Update files\n",
					parent: ["commit-sha"],
				}),
			}),
		);
		expect(gitMock.writeRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: "refs/heads/main",
				value: "new-sha",
			}),
		);
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);

		expect(gitMock.writeCommit.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.push.mock.invocationCallOrder[0]!,
		);
	});

	describe("a server that cannot filter", () => {
		beforeEach(() => {
			gitMock.getRemoteInfo.mockResolvedValue({
				capabilities: new Set(["shallow", "ofs-delta"]),
			} as unknown as Awaited<ReturnType<typeof git.getRemoteInfo>>);
		});

		it("falls back to a full clone when the repository is small", async () => {
			fetchRepositorySizeMock.mockResolvedValue(10_000_000);

			const backend = new BundledGitBackend(baseConfig, mockApp);
			await backend.readTree("main");

			expect(gitMock.clone).toHaveBeenCalledWith(
				expect.not.objectContaining({ filter: "blob:none" }),
			);
			expect(gitMock.clone).toHaveBeenCalledWith(
				expect.objectContaining({ depth: 1, noCheckout: true }),
			);
		});

		it("refuses a large repository instead of cloning it whole", async () => {
			fetchRepositorySizeMock.mockResolvedValue(2_300_000_000);

			const backend = new BundledGitBackend(baseConfig, mockApp);

			await expect(backend.readTree("main")).rejects.toThrow(
				/Allow large full clones/,
			);
			expect(gitMock.clone).not.toHaveBeenCalled();
		});

		it("refuses when the size cannot be determined", async () => {
			fetchRepositorySizeMock.mockResolvedValue(null);

			const backend = new BundledGitBackend(baseConfig, mockApp);

			await expect(backend.readTree("main")).rejects.toThrow(
				/could not be determined/,
			);
			expect(gitMock.clone).not.toHaveBeenCalled();
		});

		it("clones anyway once the user opts in", async () => {
			fetchRepositorySizeMock.mockResolvedValue(2_300_000_000);

			const backend = new BundledGitBackend(
				{ ...baseConfig, allowLargeFullClone: true },
				mockApp,
			);
			await backend.readTree("main");

			expect(gitMock.clone).toHaveBeenCalledWith(
				expect.not.objectContaining({ filter: "blob:none" }),
			);
		});

		// A connection failure must not read as "cannot filter" and fall
		// through to the unbounded clone this check exists to prevent.
		it("propagates a failure to reach the remote", async () => {
			gitMock.getRemoteInfo.mockRejectedValue(new Error("offline"));

			const backend = new BundledGitBackend(baseConfig, mockApp);

			await expect(backend.readTree("main")).rejects.toThrow("offline");
			expect(gitMock.clone).not.toHaveBeenCalled();
		});
	});

	it("writeFiles never materializes a working tree", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		// A checkout would pull back every blob the filter omitted, which is
		// the entire cost this transport exists to avoid.
		expect(gitMock.checkout).not.toHaveBeenCalled();
		expect(gitMock.add).not.toHaveBeenCalled();
		expect(gitMock.commit).not.toHaveBeenCalled();
	});

	it("writeFiles preserves the existing mode of a replaced entry", async () => {
		gitMock.readTree.mockResolvedValue({
			oid: "tree-sha",
			tree: [
				{ mode: "100755", path: "run.sh", oid: "old", type: "blob" },
				{ mode: "120000", path: "link", oid: "old2", type: "blob" },
			],
		} as unknown as Awaited<ReturnType<typeof git.readTree>>);

		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.writeFiles("main", "Update", [
			{ path: "run.sh", content: "#!/bin/sh\n" },
		]);

		const written = gitMock.writeTree.mock.calls[0]?.[0].tree;
		expect(written).toContainEqual(
			expect.objectContaining({ path: "run.sh", mode: "100755" }),
		);
		expect(written).toContainEqual(
			expect.objectContaining({ path: "link", mode: "120000" }),
		);
	});

	it("readTree resolves ref and walks tree", async () => {
		const entry = {
			type: vi.fn().mockResolvedValue("blob"),
			oid: vi.fn().mockResolvedValue("blob-sha"),
			mode: vi.fn().mockResolvedValue(100644),
			content: vi.fn().mockResolvedValue(new Uint8Array()),
			stat: vi.fn().mockResolvedValue({}),
		};
		gitMock.walk.mockImplementation(async ({ map }) => {
			if (!map) return undefined;
			await map("notes/test.md", [entry]);
			return undefined;
		});

		const backend = new BundledGitBackend(baseConfig, mockApp);
		const entries = await backend.readTree("main");

		expect(gitMock.resolveRef).toHaveBeenCalledWith(
			expect.objectContaining({ ref: "origin/main" }),
		);
		expect(entries).toEqual([
			{ path: "notes/test.md", sha: "blob-sha", type: "blob" },
		]);
	});

	it("deleteFiles removes and pushes", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(result).toEqual({ sha: "new-sha", removedCount: 2 });
		expect(gitMock.writeCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				commit: expect.objectContaining({ message: "Remove files\n" }),
			}),
		);
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
		expect(gitMock.writeCommit.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.push.mock.invocationCallOrder[0]!,
		);
	});

	it("auth callback returns correct credentials", () => {
		const bearerBackend = new BundledGitBackend(
			{ ...baseConfig, auth: { type: "bearer", secret: "token" } },
			mockApp,
		);
		const basicBackend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "basic", username: "user", secret: "pass" },
			},
			mockApp,
		);
		const noneBackend = new BundledGitBackend(
			{ ...baseConfig, auth: { type: "none" } },
			mockApp,
		);

		type WithGetAuth = { getAuth: () => unknown };
		expect((bearerBackend as unknown as WithGetAuth).getAuth()).toEqual({
			username: "x-access-token",
			password: "token",
		});
		expect((basicBackend as unknown as WithGetAuth).getAuth()).toEqual({
			username: "user",
			password: "pass",
		});
		expect(
			(noneBackend as unknown as WithGetAuth).getAuth(),
		).toBeUndefined();
	});

	it("writeFiles throws when clone fails", async () => {
		gitMock.clone.mockRejectedValueOnce(new Error("clone failed"));

		const backend = new BundledGitBackend(baseConfig, mockApp);
		await expect(
			backend.writeFiles("main", "Update files", [
				{ path: "content/test.md", content: "hello" },
			]),
		).rejects.toThrow("clone failed");
	});

	it("writeFiles throws when push fails after all retries", async () => {
		vi.useFakeTimers();
		gitMock.push.mockRejectedValue(new Error("push failed"));

		const backend = new BundledGitBackend(baseConfig, mockApp);
		const writePromise = backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);
		const rejection = expect(writePromise).rejects.toThrow("push failed");

		await vi.runAllTimersAsync();

		await rejection;
		expect(gitMock.push).toHaveBeenCalledTimes(4);
	});

	it("writeFiles succeeds after push retry", async () => {
		vi.useFakeTimers();
		gitMock.push
			.mockRejectedValueOnce(new Error("push failed"))
			.mockRejectedValueOnce(new Error("push failed"))
			.mockResolvedValueOnce(
				undefined as unknown as ReturnType<
					typeof git.push
				> extends Promise<infer R>
					? R
					: never,
			);

		const backend = new BundledGitBackend(baseConfig, mockApp);
		const writePromise = backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		await vi.advanceTimersByTimeAsync(3000);

		await expect(writePromise).resolves.toEqual({ sha: "new-sha" });
		expect(gitMock.push).toHaveBeenCalledTimes(3);
	});

	it("deleteFiles skips a path absent from the remote tree", async () => {
		remoteTreeContains(["content/b.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(result).toEqual({ sha: "new-sha", removedCount: 1 });
		expect(gitMock.push).toHaveBeenCalledTimes(1);
	});

	it("deleteFiles rejects without pushing when writing the tree fails", async () => {
		gitMock.writeTree.mockRejectedValue(
			new Error("object store is corrupt"),
		);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		await expect(
			backend.deleteFiles("main", "Remove files", [
				"content/a.md",
				"content/b.md",
			]),
		).rejects.toThrow("object store is corrupt");

		expect(gitMock.writeCommit).not.toHaveBeenCalled();
		expect(gitMock.push).not.toHaveBeenCalled();
	});

	it("deleteFiles commits and pushes the survivors when one path is already absent", async () => {
		remoteTreeContains(["content/a.md", "content/c.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
			"content/c.md",
		]);

		expect(result).toEqual({ sha: "new-sha", removedCount: 2 });
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
	});

	it("deleteFiles makes no commit when every path is absent", async () => {
		remoteTreeContains(["content/other.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(result).toEqual({ sha: "", removedCount: 0 });
		expect(gitMock.writeCommit).not.toHaveBeenCalled();
		expect(gitMock.push).not.toHaveBeenCalled();
	});

	it("deleteFiles removes a directory prefix as one requested path", async () => {
		remoteTreeContains(["content/blog/a.md", "content/blog/b.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/blog",
		]);

		// One path was requested, so one removal is reported even though the
		// prefix expanded to two blobs in the tree.
		expect(result).toEqual({ sha: "new-sha", removedCount: 1 });
	});

	it("deleteFiles throws when clone fails", async () => {
		gitMock.clone.mockRejectedValueOnce(new Error("clone failed"));

		const backend = new BundledGitBackend(baseConfig, mockApp);
		await expect(
			backend.deleteFiles("main", "Remove files", ["content/a.md"]),
		).rejects.toThrow("clone failed");
	});

	it("readTree throws when resolveRef fails", async () => {
		gitMock.resolveRef.mockRejectedValueOnce(new Error("resolve failed"));
		const backend = new BundledGitBackend(baseConfig, mockApp);

		await expect(backend.readTree("main")).rejects.toThrow(
			"resolve failed",
		);
	});

	it("readBlob throws when blob read fails", async () => {
		gitMock.readBlob.mockRejectedValueOnce(new Error("blob failed"));
		const backend = new BundledGitBackend(baseConfig, mockApp);

		await expect(backend.readBlob("blob-sha")).rejects.toThrow(
			"blob failed",
		);
	});

	it("testConnection returns error when getRemoteInfo fails", async () => {
		gitMock.getRemoteInfo.mockRejectedValueOnce(new Error("no remote"));
		const backend = new BundledGitBackend(baseConfig, mockApp);

		await expect(backend.testConnection()).resolves.toEqual({
			ok: false,
			readAccess: false,
			writeAccess: false,
			hasCredential: false,
			credentialVerified: false,
			error: "no remote",
		});
	});

	it("testConnection does not vouch for a token when the read was anonymous", async () => {
		gitMock.getRemoteInfo.mockResolvedValue(
			{} as unknown as Awaited<ReturnType<typeof git.getRemoteInfo>>,
		);
		gitMock.listServerRefs.mockRejectedValue(new Error("401"));

		const backend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "bearer", secret: "expired-token" },
			},
			mockApp,
		);

		await expect(backend.testConnection()).resolves.toEqual({
			ok: true,
			readAccess: true,
			writeAccess: false,
			hasCredential: true,
			credentialVerified: false,
		});
	});

	it("testConnection verifies the token when the read is challenged", async () => {
		gitMock.getRemoteInfo.mockImplementation(
			async (options: Parameters<typeof git.getRemoteInfo>[0]) => {
				(options as { onAuth?: () => unknown }).onAuth?.();
				return {} as Awaited<ReturnType<typeof git.getRemoteInfo>>;
			},
		);
		gitMock.listServerRefs.mockRejectedValue(new Error("403"));

		const backend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "bearer", secret: "read-only-token" },
			},
			mockApp,
		);

		const result = await backend.testConnection();

		expect(result.credentialVerified).toBe(true);
		expect(result.writeAccess).toBe(false);
	});

	it("testConnection verifies the token when the push probe succeeds", async () => {
		gitMock.getRemoteInfo.mockResolvedValue(
			{} as unknown as Awaited<ReturnType<typeof git.getRemoteInfo>>,
		);
		gitMock.listServerRefs.mockResolvedValue(
			[] as unknown as Awaited<ReturnType<typeof git.listServerRefs>>,
		);

		const backend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "bearer", secret: "good-token" },
			},
			mockApp,
		);

		await expect(backend.testConnection()).resolves.toEqual({
			ok: true,
			readAccess: true,
			writeAccess: true,
			hasCredential: true,
			credentialVerified: true,
		});
	});

	it("testConnection reports no credential when none is configured", async () => {
		gitMock.getRemoteInfo.mockResolvedValue(
			{} as unknown as Awaited<ReturnType<typeof git.getRemoteInfo>>,
		);
		gitMock.listServerRefs.mockRejectedValue(new Error("401"));

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.testConnection();

		expect(result.hasCredential).toBe(false);
		expect(result.credentialVerified).toBe(false);
	});
});
