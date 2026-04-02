import type QuartzSyncer from "main";
import { createMarkHandler } from "src/cli/handlers/markHandler";
import { CliData, RegisterFn } from "src/cli/types";
import { resolvePathPattern } from "src/cli/pathResolver";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";

jest.mock("src/cli/pathResolver", () => ({
	resolvePathPattern: jest.fn(),
}));
jest.mock("src/publishFile/ObsidianFrontMatterEngine");

describe("markHandler", () => {
	let handler: (params: CliData) => Promise<string>;

	const register: RegisterFn = (_cmd, _desc, _flags, h) => {
		handler = h as (params: CliData) => Promise<string>;
	};

	const createMockPlugin = (): QuartzSyncer =>
		({
			app: {
				metadataCache: {},
				vault: { getFileByPath: jest.fn(), getFiles: jest.fn() },
				fileManager: {},
			},
			settings: {
				git: {
					remoteUrl: "https://github.com/test/repo.git",
					branch: "main",
				},
				publishFrontmatterKey: "publish",
				useCache: true,
				contentFolder: "content",
				vaultPath: "/",
			},
			getGitSettingsWithSecret: jest.fn().mockReturnValue({
				remoteUrl: "https://github.com/test/repo.git",
				branch: "main",
				auth: {},
				corsProxyUrl: "",
			}),
			datastore: {
				allFiles: jest.fn(),
				getLastUpdateTimestamp: jest.fn(),
				setLastUpdateTimestamp: jest.fn(),
				recreate: jest.fn(),
				persister: { removeItem: jest.fn() },
				fileKey: jest.fn((path: string) => `file:${path}`),
			},
			saveSettings: jest.fn(),
		}) as unknown as QuartzSyncer;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("marks a single file", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [{ path: "notes/post.md", extension: "md" }],
			mode: "exact",
			pattern: "notes/post.md",
		});

		const apply = jest.fn().mockResolvedValue(undefined);
		const set = jest.fn().mockReturnValue({ apply });
		const get = jest.fn();

		(ObsidianFrontMatterEngine as jest.Mock).mockImplementation(() => ({
			get,
			set,
		}));

		createMarkHandler(register, createMockPlugin());

		const result = await handler({
			path: "notes/post.md",
			extension: "md",
		} as CliData);

		expect(result).toContain("Updated 1 file.");
		expect(set).toHaveBeenCalledWith("publish", true);
		expect(apply).toHaveBeenCalled();
	});

	it("includes applied values in verbose text mode", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [
				{ path: "notes/post.md", extension: "md" },
				{ path: "notes/second.md", extension: "md" },
			],
			mode: "exact",
			pattern: "notes/*.md",
		});

		const apply = jest.fn().mockResolvedValue(undefined);
		const set = jest.fn().mockReturnValue({ apply });
		const get = jest.fn();

		(ObsidianFrontMatterEngine as jest.Mock).mockImplementation(() => ({
			get,
			set,
		}));

		createMarkHandler(register, createMockPlugin());

		const result = await handler({
			path: "notes/*.md",
			verbose: "true",
		} as CliData);

		expect(result).toContain("notes/post.md → true");
		expect(result).toContain("notes/second.md → true");
	});

	it("unmarks with value=false", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [{ path: "notes/post.md", extension: "md" }],
			mode: "exact",
			pattern: "notes/post.md",
		});

		const apply = jest.fn().mockResolvedValue(undefined);
		const set = jest.fn().mockReturnValue({ apply });
		const get = jest.fn();

		(ObsidianFrontMatterEngine as jest.Mock).mockImplementation(() => ({
			get,
			set,
		}));

		createMarkHandler(register, createMockPlugin());

		const result = await handler({
			path: "notes/post.md",
			value: "false",
		} as CliData);

		expect(result).toContain("Updated 1 file.");
		expect(set).toHaveBeenCalledWith("publish", false);
		expect(apply).toHaveBeenCalled();
	});

	it("toggles current value", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [{ path: "notes/post.md", extension: "md" }],
			mode: "exact",
			pattern: "notes/post.md",
		});

		const apply = jest.fn().mockResolvedValue(undefined);
		const set = jest.fn().mockReturnValue({ apply });
		const get = jest.fn().mockReturnValue(true);

		(ObsidianFrontMatterEngine as jest.Mock).mockImplementation(() => ({
			get,
			set,
		}));

		createMarkHandler(register, createMockPlugin());

		const result = await handler({
			path: "notes/post.md",
			value: "toggle",
		} as CliData);

		expect(result).toContain("Updated 1 file.");
		expect(set).toHaveBeenCalledWith("publish", false);
		expect(apply).toHaveBeenCalled();
	});

	it("dry-run shows matches without modifying", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [{ path: "notes/post.md", extension: "md" }],
			mode: "exact",
			pattern: "notes/post.md",
		});

		const apply = jest.fn();
		const set = jest.fn().mockReturnValue({ apply });
		const get = jest.fn();

		(ObsidianFrontMatterEngine as jest.Mock).mockImplementation(() => ({
			get,
			set,
		}));

		createMarkHandler(register, createMockPlugin());

		const result = await handler({
			path: "notes/post.md",
			"dry-run": "true",
		} as CliData);

		expect(result).toContain("Dry run: 1 file matched.");
		expect(set).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
	});

	it("returns error when path is missing", async () => {
		createMarkHandler(register, createMockPlugin());
		const result = await handler({} as CliData);

		expect(result).toBe("Error: Missing required flag: path");
	});

	it("returns error when no files match", async () => {
		(resolvePathPattern as jest.Mock).mockReturnValue({
			files: [],
			mode: "glob",
			pattern: "notes/*.md",
		});

		createMarkHandler(register, createMockPlugin());
		const result = await handler({ path: "notes/*.md" } as CliData);

		expect(result).toBe(
			"Error: No publishable files matched the provided path.",
		);
	});
});
