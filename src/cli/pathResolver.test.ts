import { resolvePathPattern } from "src/cli/pathResolver";
import { App, TFile, normalizePath, prepareFuzzySearch } from "obsidian";
import { minimatch } from "minimatch";

jest.mock("obsidian", () => {
	return {
		App: jest.fn(),
		TFile: jest.fn(),
		normalizePath: jest.fn((path: string) => path),
		prepareFuzzySearch: jest.fn(),
	};
});

jest.mock("minimatch", () => {
	return {
		minimatch: jest.fn(),
	};
});

describe("resolvePathPattern", () => {
	const mockNormalizePath = normalizePath as jest.Mock;
	const mockPrepareFuzzySearch = prepareFuzzySearch as jest.Mock;
	const mockMinimatch = minimatch as unknown as jest.Mock;

	const createApp = (files: TFile[] = []) => {
		return {
			vault: {
				getFileByPath: jest.fn(),
				getFiles: jest.fn().mockReturnValue(files),
			},
		} as unknown as App;
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns single file in exact mode when found", () => {
		const file = { path: "notes/test.md" } as TFile;
		const app = createApp();
		app.vault.getFileByPath = jest.fn().mockReturnValue(file);

		const result = resolvePathPattern(app, "notes/test.md");

		expect(mockNormalizePath).toHaveBeenCalledWith("notes/test.md");

		expect(result).toEqual({
			files: [file],
			mode: "exact",
			pattern: "notes/test.md",
		});
	});

	it("returns empty array in exact mode when not found", () => {
		const app = createApp();
		app.vault.getFileByPath = jest.fn().mockReturnValue(null);

		const result = resolvePathPattern(app, "missing.md");

		expect(result).toEqual({
			files: [],
			mode: "exact",
			pattern: "missing.md",
		});
	});

	it("filters files with minimatch in glob mode", () => {
		const files = [
			{ path: "notes/a.md" } as TFile,
			{ path: "notes/b.txt" } as TFile,
			{ path: "notes/c.md" } as TFile,
		];
		const app = createApp(files);

		mockMinimatch.mockImplementation((path: string) =>
			path.endsWith(".md"),
		);

		const result = resolvePathPattern(app, "notes/*.md");

		expect(mockMinimatch).toHaveBeenCalledTimes(3);

		expect(result).toEqual({
			files: [files[0], files[2]],
			mode: "glob",
			pattern: "notes/*.md",
		});
	});

	it("uses prepareFuzzySearch for fuzzy mode", () => {
		const files = [
			{ path: "notes/post.md" } as TFile,
			{ path: "notes/poster.md" } as TFile,
			{ path: "notes/other.md" } as TFile,
		];
		const app = createApp(files);

		mockPrepareFuzzySearch.mockReturnValue((path: string) => {
			if (!path.includes("post")) {
				return null;
			}

			return { score: path === "notes/post.md" ? 10 : 5 };
		});

		const result = resolvePathPattern(app, "~post");

		expect(mockPrepareFuzzySearch).toHaveBeenCalledWith("post");

		expect(result).toEqual({
			files: [files[0], files[1]],
			mode: "fuzzy",
			pattern: "post",
		});
	});
});
