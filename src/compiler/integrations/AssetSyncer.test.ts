import { AssetSyncer } from "./AssetSyncer";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import QuartzSyncerSettings from "src/models/settings";

jest.mock("src/repositoryConnection/RepositoryConnection");
jest.mock("./registry", () => ({
	integrationRegistry: {
		getCollectedAssets: jest
			.fn()
			.mockReturnValue(
				new Map([
					["test-integration", { scss: "body { color: blue; }" }],
				]),
			),
	},
}));

const SYNCER_IMPORT = '@use "./syncer";';

function encode(content: string): string {
	return Buffer.from(content, "utf-8").toString("base64");
}

function mockConnection(customScssContent?: string) {
	return {
		getContent: jest.fn().mockResolvedValue({ tree: [] }),
		getRawFile: jest.fn().mockImplementation((path: string) => {
			if (
				path === "quartz/styles/custom.scss" &&
				customScssContent !== undefined
			) {
				return Promise.resolve({
					content: encode(customScssContent),
					sha: "abc",
					path,
					type: "file",
				});
			}

			throw new Error("Not found");
		}),
	} as unknown as RepositoryConnection;
}

function createSyncer(manageSyncerStyles = true) {
	return new AssetSyncer({
		manageSyncerStyles,
	} as QuartzSyncerSettings);
}

describe("AssetSyncer", () => {
	describe("insertSyncerImport (via collectAssets)", () => {
		it("inserts import into empty custom.scss", async () => {
			const syncer = createSyncer();
			const connection = mockConnection("");

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(`${SYNCER_IMPORT}\n`);
		});

		it('inserts import after @use "./base.scss"', async () => {
			const existing = '@use "./base.scss";\n\nbody { color: red; }\n';
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				'@use "./base.scss";\n' +
					`${SYNCER_IMPORT}\n` +
					"\nbody { color: red; }\n",
			);
		});

		it('inserts import after @use "./base"', async () => {
			const existing = '@use "./base";\n\nbody { color: red; }\n';
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				'@use "./base";\n' +
					`${SYNCER_IMPORT}\n` +
					"\nbody { color: red; }\n",
			);
		});

		it('inserts import after @use "./variables.scss" as *', async () => {
			const existing =
				'@use "./variables.scss" as *;\n\nbody { color: red; }\n';
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				'@use "./variables.scss" as *;\n' +
					`${SYNCER_IMPORT}\n` +
					"\nbody { color: red; }\n",
			);
		});

		it('inserts import after @use "./variables" as *', async () => {
			const existing =
				'@use "./variables" as *;\n\nbody { color: red; }\n';
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				'@use "./variables" as *;\n' +
					`${SYNCER_IMPORT}\n` +
					"\nbody { color: red; }\n",
			);
		});

		it("inserts import after @use './variables.scss' as * (single quotes)", async () => {
			const existing =
				"@use './variables.scss' as *;\n\nbody { color: red; }\n";
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				"@use './variables.scss' as *;\n" +
					`${SYNCER_IMPORT}\n` +
					"\nbody { color: red; }\n",
			);
		});

		it("prepends import when no known first-line pattern exists", async () => {
			const existing = "body { color: red; }\n";
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBe(
				`${SYNCER_IMPORT}\n\nbody { color: red; }\n`,
			);
		});

		it("does not insert import if already present", async () => {
			const existing = `@use "./base.scss";\n${SYNCER_IMPORT}\n\nbody { color: red; }\n`;
			const syncer = createSyncer();
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				false,
			);
		});
	});

	describe("removeSyncerImport (via collectAssets with manageSyncerStyles=false)", () => {
		it("removes syncer import from custom.scss", async () => {
			const existing = `@use "./base.scss";\n${SYNCER_IMPORT}\n\nbody { color: red; }\n`;
			const syncer = createSyncer(false);
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			const customScss = result.filesToStage.get(
				"quartz/styles/custom.scss",
			);
			expect(customScss).toBeDefined();
			expect(customScss).not.toContain(SYNCER_IMPORT);
		});

		it("does not modify custom.scss when syncer import is not present", async () => {
			const existing = '@use "./base.scss";\n\nbody { color: red; }\n';
			const syncer = createSyncer(false);
			const connection = mockConnection(existing);

			const result = await syncer.collectAssets(connection);

			expect(result.success).toBe(true);
			expect(result.filesToStage.has("quartz/styles/custom.scss")).toBe(
				false,
			);
		});
	});
});
