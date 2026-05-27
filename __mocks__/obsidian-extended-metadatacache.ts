const mockApi = {
	isReady: true,
	isDestroyed: false,
	getFilesWithTag: jest.fn().mockReturnValue(new Set()),
	getFilesWithTagInBody: jest.fn().mockReturnValue(new Set()),
	getFilesWithTagInFrontmatter: jest.fn().mockReturnValue(new Set()),
	getAllTagsWithFiles: jest.fn().mockReturnValue(new Map()),
	getBacklinksForFile: jest.fn().mockReturnValue(new Set()),
	getBacklinksFromBody: jest.fn().mockReturnValue(new Set()),
	getBacklinksFromFrontmatter: jest.fn().mockReturnValue(new Set()),
	getAllBacklinksWithFiles: jest.fn().mockReturnValue(new Map()),
	getUnresolvedBacklinks: jest.fn().mockReturnValue(new Set()),
	getFilesEmbedding: jest.fn().mockReturnValue(new Set()),
	getAllEmbedsWithFiles: jest.fn().mockReturnValue(new Map()),
	getFilesWithHeading: jest.fn().mockReturnValue(new Set()),
	getAllHeadingsWithFiles: jest.fn().mockReturnValue(new Map()),
	getFilesWithFrontmatterKey: jest.fn().mockReturnValue(new Set()),
	getFilesWithFrontmatterValue: jest.fn().mockReturnValue(new Set()),
	getAllFrontmatterKeysWithFiles: jest.fn().mockReturnValue(new Map()),
	getFilesWithAlias: jest.fn().mockReturnValue(new Set()),
	getAllAliasesWithFiles: jest.fn().mockReturnValue(new Map()),
	getFileWithBlockId: jest.fn().mockReturnValue(null),
	getFilesWithTasks: jest.fn().mockReturnValue(new Set()),
	getFilesWithTaskStatus: jest.fn().mockReturnValue(new Set()),
	getAllTaskStatusesWithFiles: jest.fn().mockReturnValue(new Map()),
	getFilesWithOpenTasks: jest.fn().mockReturnValue(new Set()),
	getFilesWithCompletedTasks: jest.fn().mockReturnValue(new Set()),
	on: jest.fn(),
	off: jest.fn(),
	offref: jest.fn(),
	destroy: jest.fn(),
};

export const getAPI = jest.fn().mockReturnValue({
	api: mockApi,
	release: jest.fn(),
});

export const hasAPI = jest.fn().mockReturnValue(true);

export const createExtendedMetadataCache = jest.fn().mockReturnValue(mockApi);

export const apiVersion = { major: 0, minor: 1, version: "0.5.1" };
