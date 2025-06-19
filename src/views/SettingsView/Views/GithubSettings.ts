import {
	Setting,
	App,
	PluginSettingTab,
	debounce,
	normalizePath,
} from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import { FolderSuggest } from "src/ui/suggest/folder";
import { Octokit } from "@octokit/core";

/**
 * GithubSettings class.
 * This class is responsible for managing the frontmatter settings of the Quartz Syncer plugin.
 */
export class GithubSettings extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		settings: SettingView,
		settingsRootElement: HTMLElement,
	) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ text: "pending..." },
		);
	}

	/**
	 * Displays the GitHub settings in the settings tab.
	 * This method initializes the settings UI for managing Quartz Syncer's GitHub settings.
	 */
	display() {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeGitHubHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeGitHubVaultFolder();

		this.settings.settings.lastUsedSettingsTab = "github";
		this.settings.plugin.saveSettings();
	}

	/**
	 * Initializes the GitHub header in the settings tab.
	 * This method sets up the connection status indicator and displays the GitHub repository information.
	 */
	initializeGitHubHeader = () => {
		this.checkConnectionAndSaveSettings();

		const connectionStatusElement = createEl("span");
		connectionStatusElement.appendText(" (status: connection ");
		connectionStatusElement.append(this.connectionStatusElement);
		connectionStatusElement.appendText(")");

		connectionStatusElement.addClass(
			"quartz-syncer-connection-status",
			"quartz-syncer-connection-status-pending",
		);

		new Setting(this.settingsRootElement)
			.setName("GitHub")
			.setDesc(
				"Quartz Syncer will use this GitHub repository to sync your notes.",
			)
			.setHeading()
			.nameEl.append(connectionStatusElement);
	};

	/**
	 * Checks the connection to the GitHub repository and saves the settings.
	 * This method updates the connection status and saves the current settings.
	 */
	checkConnectionAndSaveSettings = async () => {
		this.settings.plugin.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	/**
	 * Updates the connection status by checking the GitHub repository.
	 * This method uses Octokit to verify the connection and updates the UI accordingly.
	 */
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
		} catch (_error) {
			this.connectionStatus = "error";
		}
		this.updateConnectionStatusIndicator();
	};

	debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	/**
	 * Updates the connection status indicator in the UI.
	 * This method updates the text and CSS classes of the connection status element
	 * based on the current connection status.
	 */
	updateConnectionStatusIndicator = () => {
		if (this.connectionStatusElement.parentElement === null) {
			return;
		}

		if (this.connectionStatus === "loading") {
			this.connectionStatusElement.innerText = "pending...";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-success",
				"quartz-syncer-connection-status-failed",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-pending",
			);
		}

		if (this.connectionStatus === "connected") {
			this.connectionStatusElement.innerText = "succesful!";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-failed",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-success",
			);
		}

		if (this.connectionStatus === "error") {
			this.connectionStatusElement.innerText = "failed!";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-success",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-failed",
			);
		}
	};

	/**
	 * Initializes the GitHub vault folder setting in the settings tab.
	 * This method allows the user to specify the root folder of their Quartz website in their Obsidian vault.
	 */
	private initializeGitHubVaultFolder() {
		const app = this.settings.app;

		new Setting(this.settingsRootElement)
			.setName("Vault root folder name")
			.setDesc(
				'The folder in your Obsidian vault that Quartz Syncer should consider as your Quartz website root folder. Useful for Obsidian vaults that are not exclusively used for Quartz. By default "/" (the root of your Obsidian vault).',
			)
			.addSearch((text) => {
				new FolderSuggest(app, text.inputEl);

				text.setPlaceholder("/")
					.setValue(this.settings.settings.vaultPath)
					.onChange(async (value) => {
						value = normalizePath(value.trim());

						if (value === "/") {
							value = "";
						}

						this.settings.settings.vaultPath = `${value}/`;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}

	/**
	 * Initializes the GitHub repository name setting in the settings tab.
	 * This method allows the user to specify the name of their Quartz repository on GitHub.
	 */
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

	/**
	 * Initializes the GitHub username setting in the settings tab.
	 * This method allows the user to specify their GitHub username that owns the Quartz repository.
	 */
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

	/**
	 * Initializes the GitHub access token setting in the settings tab.
	 * This method provides instructions for generating a GitHub access token with the required permissions.
	 */
	private initializeGitHubTokenSetting() {
		const desc = document.createDocumentFragment();

		desc.createEl("span", undefined, (span) => {
			span.innerText =
				'A GitHub access token with "contents" permissions. You can find instructions to generate it in ';

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
}
