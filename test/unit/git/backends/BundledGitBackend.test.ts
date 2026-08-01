import git from "isomorphic-git";
import type { App } from "obsidian";
import { BundledGitBackend } from "src/git/backends/BundledGitBackend";
import type { GitBackendConfig } from "src/git/types";

vi.mock("isomorphic-git", () => ({
	default: {
		resolveRef: vi.fn(),
		readCommit: vi.fn(),
		walk: vi.fn(),
		TREE: vi.fn(),
		readBlob: vi.fn(),
		add: vi.fn(),
		commit: vi.fn(),
		push: vi.fn(),
		remove: vi.fn(),
		getRemoteInfo: vi.fn(),
		listServerRefs: vi.fn(),
		clone: vi.fn(),
		fetch: vi.fn(),
		checkout: vi.fn(),
		branch: vi.fn(),
	},
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

const mockApp = {} as App;

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
		gitMock.commit.mockResolvedValue("new-sha");
		gitMock.push.mockResolvedValue(
			undefined as unknown as ReturnType<typeof git.push> extends Promise<
				infer R
			>
				? R
				: never,
		);
		gitMock.remove.mockResolvedValue(undefined);
		gitMock.getRemoteInfo.mockResolvedValue(
			{} as ReturnType<typeof git.getRemoteInfo> extends Promise<infer R>
				? R
				: never,
		);
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
	});

	it("writeFiles clones, writes, commits, and pushes", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		expect(gitMock.clone).toHaveBeenCalled();
		expect(gitMock.add).toHaveBeenCalled();
		expect(gitMock.commit).toHaveBeenCalled();
		expect(gitMock.push).toHaveBeenCalled();
	});

	it("readTree resolves ref and walks tree", async () => {
		const entry = {
			type: vi.fn().mockResolvedValue("blob"),
			oid: vi.fn().mockResolvedValue("blob-sha"),
		};
		gitMock.walk.mockImplementation(
			async ({
				map,
			}: {
				map: (filepath: string, entries: unknown[]) => Promise<unknown>;
			}) => {
				await map("notes/test.md", [entry]);
				return undefined;
			},
		);

		const backend = new BundledGitBackend(baseConfig, mockApp);
		const entries = await backend.readTree("main");

		expect(gitMock.resolveRef).toHaveBeenCalled();
		expect(entries).toEqual([
			{ path: "notes/test.md", sha: "blob-sha", type: "blob" },
		]);
	});

	it("deleteFiles removes and pushes", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(gitMock.remove).toHaveBeenCalledTimes(2);
		expect(gitMock.commit).toHaveBeenCalled();
		expect(gitMock.push).toHaveBeenCalled();
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
});
