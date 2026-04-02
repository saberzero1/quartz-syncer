import type QuartzSyncer from "main";
import { createQuartzConfigHandler } from "src/cli/handlers/quartzConfigHandler";
import { CliData, RegisterFn } from "src/cli/types";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type { QuartzV5Config } from "src/quartz/QuartzConfigTypes";

jest.mock("src/repositoryConnection/RepositoryConnection");
jest.mock("src/quartz/QuartzConfigService");

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

const createSampleConfig = (): QuartzV5Config => ({
	configuration: {
		pageTitle: "Quartz Site",
		pageTitleSuffix: "Notes",
		enableSPA: true,
		enablePopovers: false,
		locale: "en-US",
		baseUrl: "https://example.com",
		theme: {
			fontOrigin: "googleFonts",
			cdnCaching: true,
			typography: {
				header: "Inter",
				body: "Source Sans",
				code: "Fira Code",
			},
			colors: {
				lightMode: {
					light: "#ffffff",
					lightgray: "#f2f2f2",
					gray: "#999999",
					darkgray: "#555555",
					dark: "#222222",
					secondary: "#ffcc00",
					tertiary: "#00ccff",
					highlight: "#ffeb3b",
					textHighlight: "#fff9c4",
				},
				darkMode: {
					light: "#dddddd",
					lightgray: "#bbbbbb",
					gray: "#888888",
					darkgray: "#444444",
					dark: "#111111",
					secondary: "#cc9900",
					tertiary: "#0099cc",
					highlight: "#ffee58",
					textHighlight: "#b2ebf2",
				},
			},
		},
	},
	plugins: [],
});

describe("quartzConfigHandler", () => {
	let handler: (params: CliData) => Promise<string>;
	let readConfigMock: jest.Mock;
	let writeConfigMock: jest.Mock;

	const register: RegisterFn = (_cmd, _desc, _flags, h) => {
		handler = h as (params: CliData) => Promise<string>;
	};

	beforeEach(() => {
		jest.clearAllMocks();
		readConfigMock = jest.fn().mockResolvedValue(createSampleConfig());
		writeConfigMock = jest.fn().mockResolvedValue(undefined);

		(RepositoryConnection as unknown as jest.Mock).mockImplementation(
			() => ({}),
		);

		(QuartzConfigService as unknown as jest.Mock).mockImplementation(
			() => ({
				readConfig: readConfigMock,
				writeConfig: writeConfigMock,
			}),
		);

		createQuartzConfigHandler(register, createMockPlugin());
	});

	it("lists config values as flattened key/value lines", async () => {
		const result = await handler({ action: "list" } as CliData);

		expect(result).toContain('pageTitle="Quartz Site"');
		expect(result).toContain('theme.typography.header="Inter"');
		expect(result).toContain("enableSPA=true");
	});

	it("gets a config value by key", async () => {
		const result = await handler({
			action: "get",
			key: "theme.fontOrigin",
		} as CliData);

		expect(result).toBe('theme.fontOrigin="googleFonts"');
	});

	it("returns error for unknown config key", async () => {
		const result = await handler({
			action: "get",
			key: "theme.nope",
		} as CliData);

		expect(result).toBe("Error: Unknown config key.");
	});

	it("sets a writable key and writes config", async () => {
		const result = await handler({
			action: "set",
			key: "pageTitle",
			value: "My Site",
		} as CliData);

		expect(result).toBe("Updated pageTitle.");
		expect(writeConfigMock).toHaveBeenCalledTimes(1);
		const [writtenConfig, message] = writeConfigMock.mock.calls[0];
		expect(writtenConfig.configuration.pageTitle).toBe("My Site");
		expect(message).toBe("Update Quartz config: pageTitle");
	});

	it("rejects non-writable key", async () => {
		const result = await handler({
			action: "set",
			key: "analytics.provider",
			value: "plausible",
		} as CliData);

		expect(result).toBe("Error: Config key is not writable via CLI.");
		expect(writeConfigMock).not.toHaveBeenCalled();
	});

	it("validates boolean values", async () => {
		const result = await handler({
			action: "set",
			key: "enableSPA",
			value: "maybe",
		} as CliData);

		expect(result).toBe(
			"Error: Invalid value for enableSPA. Expected boolean.",
		);
	});

	it("validates theme.fontOrigin enum", async () => {
		const result = await handler({
			action: "set",
			key: "theme.fontOrigin",
			value: "remote",
		} as CliData);

		expect(result).toBe(
			"Error: Invalid value for theme.fontOrigin. Expected googleFonts or local.",
		);
	});

	it("defaults to list when action is missing", async () => {
		const result = await handler({} as CliData);

		expect(result).toContain("pageTitle=");
	});
});
