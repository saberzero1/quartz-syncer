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
		init: vi.fn(),
		clone: vi.fn(),
		fetch: vi.fn(),
	},
}));

const gitMock = vi.mocked(git);

function createApp(adapterOverrides: Partial<App["vault"]["adapter"]> = {}) {
	const adapter = {
		read: vi.fn(),
		readBinary: vi.fn(),
		write: vi.fn(),
		writeBinary: vi.fn(),
		list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
		stat: vi.fn().mockResolvedValue(null),
		mkdir: vi.fn(),
		remove: vi.fn(),
		...adapterOverrides,
	};
	const app = { vault: { adapter } } as App;
	return { app, adapter };
}

const baseConfig: GitBackendConfig = {
	remoteUrl: "https://github.com/user/repo.git",
	branch: "main",
	auth: { type: "none" },
};

describe("BundledGitBackend", () => {
	beforeEach(() => {
		gitMock.resolveRef.mockResolvedValue("commit-sha");
		gitMock.readCommit.mockResolvedValue({ commit: { tree: "tree-sha" } });
		gitMock.walk.mockResolvedValue(undefined);
		gitMock.TREE.mockReturnValue("tree");
		gitMock.readBlob.mockResolvedValue({ blob: new Uint8Array([1]) });
		gitMock.add.mockResolvedValue(undefined);
		gitMock.commit.mockResolvedValue("new-sha");
		gitMock.push.mockResolvedValue(undefined);
		gitMock.remove.mockResolvedValue(undefined);
		gitMock.getRemoteInfo.mockResolvedValue({});
		gitMock.listServerRefs.mockResolvedValue([]);
		gitMock.init.mockResolvedValue(undefined);
		gitMock.clone.mockResolvedValue(undefined);
		gitMock.fetch.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("writeFiles initializes, writes, commits, and pushes", async () => {
		const { app, adapter } = createApp();
		const backend = new BundledGitBackend(baseConfig, app);
		await backend.writeFiles("main", "Update files", [
			{ path: "content/test.md", content: "hello" },
		]);

		expect(gitMock.clone).toHaveBeenCalled();
		expect(gitMock.clone).toHaveBeenCalled();
		expect(adapter.write).toHaveBeenCalled();
		expect(gitMock.add).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: "content/test.md" }),
		);
		expect(gitMock.commit).toHaveBeenCalled();
		expect(gitMock.push).toHaveBeenCalled();
	});

	it("readTree resolves ref and walks tree", async () => {
		const entry = {
			type: vi.fn().mockResolvedValue("blob"),
			oid: vi.fn().mockResolvedValue("blob-sha"),
		};
		gitMock.walk.mockImplementation(async ({ map }) => {
			await map("notes/test.md", [entry]);
			return undefined;
		});

		const { app } = createApp();
		const backend = new BundledGitBackend(baseConfig, app);
		const entries = await backend.readTree("main");

		expect(gitMock.resolveRef).toHaveBeenCalled();
		expect(entries).toEqual([
			{
				path: "notes/test.md",
				sha: "blob-sha",
				type: "blob",
			},
		]);
	});

	it("deleteFiles removes and pushes", async () => {
		const { app } = createApp();
		const backend = new BundledGitBackend(baseConfig, app);
		await backend.deleteFiles("main", "Remove files", [
			"content/a.md",
			"content/b.md",
		]);

		expect(gitMock.remove).toHaveBeenCalledTimes(2);
		expect(gitMock.commit).toHaveBeenCalled();
		expect(gitMock.push).toHaveBeenCalled();
	});

	it("auth callback returns credentials", () => {
		const bearerBackend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "bearer", secret: "token" },
			},
			createApp().app,
		);
		const basicBackend = new BundledGitBackend(
			{
				...baseConfig,
				auth: { type: "basic", username: "user", secret: "pass" },
			},
			createApp().app,
		);
		const noneBackend = new BundledGitBackend(
			{ ...baseConfig, auth: { type: "none" } },
			createApp().app,
		);

		const bearerAuth = (
			bearerBackend as unknown as { getAuth: () => unknown }
		).getAuth();
		const basicAuth = (
			basicBackend as unknown as { getAuth: () => unknown }
		).getAuth();
		const noneAuth = (
			noneBackend as unknown as { getAuth: () => unknown }
		).getAuth();

		expect(bearerAuth).toEqual({
			username: "x-access-token",
			password: "token",
		});
		expect(basicAuth).toEqual({ username: "user", password: "pass" });
		expect(noneAuth).toBeUndefined();
	});
});
