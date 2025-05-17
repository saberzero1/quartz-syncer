import { Setting, App, debounce } from "obsidian";
import SettingView from "./SettingView";
import { FolderSuggest } from "../../ui/suggest/file-suggest";
import { Octokit } from "@octokit/core";
import { isPluginEnabled } from "obsidian-dataview";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.id = "github-settings";
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ cls: "connection-status" },
		);
		this.initializeGitHubHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeGitHubVaultFolder(this.settings.app);
		this.initializeQuartzHeader();
		this.initializeQuartzContentFolder();
		this.initializePublishFrontmatterKeySetting();
		this.initializeUseFullImageResolutionSetting();
		this.initializeShowCreatedTimestampSetting();
		this.initializeShowUpdatedTimestampSetting();
		this.initializeUsePermalinkSetting();
		this.initializePluginIntegrationHeader();
		this.initializeDataviewSetting();
		this.initializeExcalidrawSetting();
	}

	initializeGitHubHeader = () => {
		this.connectionStatusElement.style.cssText = "margin-left: 10px;";
		this.checkConnectionAndSaveSettings();

		const githubSettingsHeader = createEl("h3", {
			text: "GitHub",
		});
		githubSettingsHeader.appendText(" (Connection status: ");
		githubSettingsHeader.append(this.connectionStatusElement);
		githubSettingsHeader.appendText(")");
		githubSettingsHeader.prepend(this.settings.getIcon("github"));

		this.settingsRootElement.prepend(githubSettingsHeader);
	};

	initializeQuartzHeader = () => {
		this.connectionStatusElement.style.cssText = "margin-left: 10px;";

		const quartzSettingsHeader = createEl("h3", {
			text: "Quartz",
		});

		quartzSettingsHeader.prepend(
			this.settings.getIcon("quartz-syncer-icon"),
		);

		this.settingsRootElement.append(quartzSettingsHeader);
	};

	initializePluginIntegrationHeader = () => {
		this.connectionStatusElement.style.cssText = "margin-left: 10px;";

		const pluginIntegrationHeader = createEl("h3", {
			text: "Plugin Integration",
		});

		pluginIntegrationHeader.prepend(this.settings.getIcon("cable"));

		this.settingsRootElement.append(pluginIntegrationHeader);
	};

	checkConnectionAndSaveSettings = async () => {
		this.settings.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	updateConnectionStatus = async () => {
		const oktokit = new Octokit({
			auth: this.settings.settings.githubToken,
		});

		try {
			const response = await oktokit.request(
				"GET /repos/{owner}/{repo}",
				{
					owner: this.settings.settings.githubUserName,
					repo: this.settings.settings.githubRepo,
				},
			);

			// If other permissions are needed, add them here and indicate to user on insufficient permissions
			// Github now advocates for hyper-specific tokens
			if (response.data.permissions?.admin) {
				// Token has "contents" permissions
				this.connectionStatus = "connected";
			}
		} catch (error) {
			this.connectionStatus = "error";
		}
		this.updateConnectionStatusIndicator();
	};

	debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	updateConnectionStatusIndicator = () => {
		if (this.connectionStatus === "loading") {
			this.connectionStatusElement.innerText = "⏳";
		}

		if (this.connectionStatus === "connected") {
			this.connectionStatusElement.innerText = "✅";
		}

		if (this.connectionStatus === "error") {
			this.connectionStatusElement.innerText = "❌";
		}
	};

	private initializeUseFullImageResolutionSetting() {
		new Setting(this.settingsRootElement)
			.setName("Use full image resolution")
			.setDesc(
				"By default, Quartz Syncer will use lower resolution images to save space. If you want to use the full resolution blob, enable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useFullResolutionImages)
					.onChange(async (value) => {
						this.settings.settings.useFullResolutionImages = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeShowCreatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include created timestamp")
			.setDesc("Include the created timestamp in your note's frontmatter")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showCreatedTimestamp)
					.onChange(async (value) => {
						this.settings.settings.showCreatedTimestamp = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeShowUpdatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include modified timestamp")
			.setDesc(
				"Include the modified timestamp in your note's frontmatter",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showUpdatedTimestamp)
					.onChange(async (value) => {
						this.settings.settings.showUpdatedTimestamp = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeUsePermalinkSetting() {
		new Setting(this.settingsRootElement)
			.setName("Always generate permalinks")
			.setDesc(
				"Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter. This will override the default Quartz URL.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.usePermalink)
					.onChange(async (value) => {
						this.settings.settings.usePermalink = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeQuartzContentFolder() {
		new Setting(this.settingsRootElement)
			.setName("Content folder")
			.setDesc(
				'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content"',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.settings.settings.contentFolder)
					.onChange(async (value) => {
						this.settings.settings.contentFolder = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubVaultFolder(app: App) {
		new Setting(this.settingsRootElement)
			.setName("Vault root folder name")
			.setDesc(
				'The folder in your Obsidian vault that Quartz Syncer should consider as your Quartz website root folder. Useful for Obsidian vualts that are not exclusively used for Quartz. By default "/" (the root of your Obsidian vault).',
			)
			.addSearch((text) => {
				new FolderSuggest(app, text.inputEl);

				text.setPlaceholder("/")
					.setValue(this.settings.settings.vaultPath)
					.onChange(async (value) => {
						if (value.length === 0 || !value.endsWith("/")) {
							value += "/";
						}
						this.settings.settings.vaultPath = value;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}

	private initializePublishFrontmatterKeySetting() {
		new Setting(this.settingsRootElement)
			.setName("Publish frontmatter key")
			.setDesc(
				'Frontmatter key used to mark a note as eligible to publish. Quartz Syncer will ignore all notes without this frontmatter key. By default "publish".',
			)
			.addText((text) =>
				text
					.setPlaceholder("publish")
					.setValue(this.settings.settings.publishFrontmatterKey)
					.onChange(async (value) => {
						if (value.length === 0) {
							value = "publish";
						}
						this.settings.settings.publishFrontmatterKey = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubRepoSetting() {
		new Setting(this.settingsRootElement)
			.setName("Repository name")
			.setDesc("The name of your Quartz repository on GitHub.")
			.addText((text) =>
				text
					.setPlaceholder("quartz")
					.setValue(this.settings.settings.githubRepo)
					.onChange(async (value) => {
						if (value.length === 0) {
							value = "quartz";
						}

						this.settings.settings.githubRepo = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubUserNameSetting() {
		new Setting(this.settingsRootElement)
			.setName("Username")
			.setDesc("The username on GitHub that owns the Quartz repository.")
			.addText((text) =>
				text
					.setPlaceholder("username")
					.setValue(this.settings.settings.githubUserName)
					.onChange(async (value) => {
						this.settings.settings.githubUserName = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubTokenSetting() {
		const desc = document.createDocumentFragment();

		desc.createEl("span", undefined, (span) => {
			span.innerText =
				"A GitHub access token with Contents permissions. You can find instructions to generate it in ";

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://saberzero1.github.io/quartz-syncer-docs/Guides/Generating-an-access-token";
				link.innerText = "the documentation.";
			});
		});

		new Setting(this.settingsRootElement)
			.setName("Access token")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("Secret Token")
					.setValue(this.settings.settings.githubToken)
					.onChange(async (value) => {
						this.settings.settings.githubToken = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeDataviewSetting() {
		const dataviewEnabled = isPluginEnabled(this.settings.app);

		new Setting(this.settingsRootElement)
			.setName("Enable Dataview integration")
			.setDesc(
				"Converts Dataview queries into Quartz-compatible markdown.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.useDataview && dataviewEnabled,
					)
					.setDisabled(!dataviewEnabled)
					.onChange(async (value) => {
						this.settings.settings.useDataview =
							value && dataviewEnabled;
						await this.checkConnectionAndSaveSettings();
					}),
			)
			.setClass(
				`${
					dataviewEnabled
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled"
				}`,
			);
	}

	private initializeExcalidrawSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable Excalidraw integration")
			.setDesc(
				"Converts Excalidraw drawings into Quartz-compatible format.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useExcalidraw)
					.setValue(false)
					.setDisabled(true)
					.onChange(async (value) => {
						this.settings.settings.useExcalidraw = value;
						await this.checkConnectionAndSaveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-upcoming");
	}
}
