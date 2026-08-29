import { vi } from "vitest";

const mockApi = {
	isReady: true,
	isDestroyed: false,
	getFilesWithTag: vi.fn().mockReturnValue(new Set()),
	getFilesWithTagInBody: vi.fn().mockReturnValue(new Set()),
	getFilesWithTagInFrontmatter: vi.fn().mockReturnValue(new Set()),
	getAllTagsWithFiles: vi.fn().mockReturnValue(new Map()),
	getBacklinksForFile: vi.fn().mockReturnValue(new Set()),
	getBacklinksFromBody: vi.fn().mockReturnValue(new Set()),
	getBacklinksFromFrontmatter: vi.fn().mockReturnValue(new Set()),
	getAllBacklinksWithFiles: vi.fn().mockReturnValue(new Map()),
	getUnresolvedBacklinks: vi.fn().mockReturnValue(new Set()),
	getFilesEmbedding: vi.fn().mockReturnValue(new Set()),
	getAllEmbedsWithFiles: vi.fn().mockReturnValue(new Map()),
	getFilesWithHeading: vi.fn().mockReturnValue(new Set()),
	getAllHeadingsWithFiles: vi.fn().mockReturnValue(new Map()),
	getFilesWithFrontmatterKey: vi.fn().mockReturnValue(new Set()),
	getFilesWithFrontmatterValue: vi.fn().mockReturnValue(new Set()),
	getAllFrontmatterKeysWithFiles: vi.fn().mockReturnValue(new Map()),
	getFilesWithAlias: vi.fn().mockReturnValue(new Set()),
	getAllAliasesWithFiles: vi.fn().mockReturnValue(new Map()),
	getFileWithBlockId: vi.fn().mockReturnValue(null),
	getFilesWithTasks: vi.fn().mockReturnValue(new Set()),
	getFilesWithTaskStatus: vi.fn().mockReturnValue(new Set()),
	getAllTaskStatusesWithFiles: vi.fn().mockReturnValue(new Map()),
	getFilesWithOpenTasks: vi.fn().mockReturnValue(new Set()),
	getFilesWithCompletedTasks: vi.fn().mockReturnValue(new Set()),
	on: vi.fn(),
	off: vi.fn(),
	offref: vi.fn(),
	destroy: vi.fn(),
};

export const getAPI = vi.fn().mockReturnValue({
	api: mockApi,
	release: vi.fn(),
});

export const hasAPI = vi.fn().mockReturnValue(true);

export const createExtendedMetadataCache = vi.fn().mockReturnValue(mockApi);

export const apiVersion = { major: 0, minor: 1, version: "0.5.1" };
