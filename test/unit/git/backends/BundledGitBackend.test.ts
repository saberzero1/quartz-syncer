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
		vi.useRealTimers();
	});

	it("writeFiles clones, writes, commits, and pushes", async () => {
		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		expect(gitMock.clone).toHaveBeenCalledWith(
			expect.objectContaining({ url: baseConfig.remoteUrl, ref: "main" }),
		);
		expect(gitMock.add).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: ["content/test.md"] }),
		);
		expect(gitMock.commit).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Update files" }),
		);
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
		expect(gitMock.clone.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.add.mock.invocationCallOrder[0]!,
		);
		expect(gitMock.add.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.commit.mock.invocationCallOrder[0]!,
		);
		expect(gitMock.commit.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.push.mock.invocationCallOrder[0]!,
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
		await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(gitMock.remove).toHaveBeenCalledTimes(2);
		expect(gitMock.commit).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Remove files" }),
		);
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
		expect(gitMock.remove.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.commit.mock.invocationCallOrder[0]!,
		);
		expect(gitMock.commit.mock.invocationCallOrder[0]).toBeLessThan(
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

	it("deleteFiles skips a path that is absent from the index", async () => {
		gitMock.listFiles.mockResolvedValue(["content/b.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);
		await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(gitMock.remove).toHaveBeenCalledTimes(1);
		expect(gitMock.remove).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: "content/b.md" }),
		);
		expect(gitMock.commit).toHaveBeenCalledTimes(1);
		expect(gitMock.commit).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Remove files" }),
		);
		expect(gitMock.push).toHaveBeenCalledTimes(1);
		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
		expect(gitMock.remove.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.commit.mock.invocationCallOrder[0]!,
		);
		expect(gitMock.commit.mock.invocationCallOrder[0]).toBeLessThan(
			gitMock.push.mock.invocationCallOrder[0]!,
		);
	});

	it("deleteFiles rejects without committing when a remove fails", async () => {
		gitMock.listFiles.mockResolvedValue(["content/a.md", "content/b.md"]);
		gitMock.remove.mockRejectedValue(new Error("index is corrupt"));

		const backend = new BundledGitBackend(baseConfig, mockApp);

		await expect(
			backend.deleteFiles("main", "Remove files", [
				"content/a.md",
				"content/b.md",
			]),
		).rejects.toThrow("index is corrupt");

		expect(gitMock.commit).not.toHaveBeenCalled();
		expect(gitMock.push).not.toHaveBeenCalled();
	});

	it("deleteFiles commits and pushes the survivors when one path is already absent", async () => {
		gitMock.listFiles.mockResolvedValue(["content/a.md", "content/c.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
			"content/c.md",
		]);

		expect(result).toEqual({ sha: "new-sha", removedCount: 2 });
		expect(gitMock.remove).toHaveBeenCalledTimes(2);
		expect(gitMock.commit).toHaveBeenCalledTimes(1);

		expect(gitMock.push).toHaveBeenCalledWith(
			expect.objectContaining({ remote: "origin", ref: "main" }),
		);
	});

	it("deleteFiles makes no commit when every path is absent from the index", async () => {
		gitMock.listFiles.mockResolvedValue(["content/other.md"]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(result).toEqual({ sha: "", removedCount: 0 });
		expect(gitMock.remove).not.toHaveBeenCalled();
		expect(gitMock.commit).not.toHaveBeenCalled();
		expect(gitMock.push).not.toHaveBeenCalled();
	});

	it("deleteFiles removes an indexed directory prefix", async () => {
		gitMock.listFiles.mockResolvedValue([
			"content/blog/a.md",
			"content/blog/b.md",
		]);

		const backend = new BundledGitBackend(baseConfig, mockApp);

		const result = await backend.deleteFiles("main", "Remove files", [
			"content/blog",
		]);

		expect(result).toEqual({ sha: "new-sha", removedCount: 1 });
		expect(gitMock.remove).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: "content/blog" }),
		);
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
