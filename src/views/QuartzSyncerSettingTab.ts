import {
	Platform,
	PluginSettingTab,
	App,
	normalizePath,
	type SettingDefinitionItem,
} from "obsidian";
import type QuartzSyncer from "src/main";
import { createGitBackend } from "src/git/GitBackendFactory";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginUpdateChecker } from "src/quartz/QuartzPluginUpdateChecker";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { RemoteFileSource } from "src/quartz/RemoteFileSource";
import { frontmatterSettingDefinitions } from "src/views/settings/FrontmatterSettings";
import {
	CSS_SNIPPET_CONTROL_PREFIX,
	integrationSettingDefinitions,
} from "src/views/settings/IntegrationSettings";
import {
	IGNORED_FOLDER_CONTROL_PREFIX,
	performanceSettingDefinitions,
} from "src/views/settings/PerformanceSettings";
import {
	applyDynamicToggleValue,
	DynamicOptionListCache,
	resolveDynamicToggleValue,
	type DynamicToggleSetBinding,
} from "src/views/settings/DynamicToggleSet";
import { uiSettingDefinitions } from "src/views/settings/UISettings";
import { GitSettingsPage } from "src/views/settings/GitSettingsPage";
import { ManualSetupModal } from "src/views/ManualSetupModal";
import { OnboardingWizard } from "src/views/OnboardingWizard/OnboardingWizard";
import { QuartzSettingsPage } from "src/views/settings/QuartzSettingsPage";

type PluginUpdateState =
	| "not-checked"
	| "checking"
	| "failed"
	| "v5-required"
	| "complete";

type PluginUpdateCache = {
	state: PluginUpdateState;
	updates?: number;
};

/**
 * Quartz Syncer settings tab.
 *
 * Uses the Obsidian 1.13 declarative settings API exclusively
 * (minAppVersion is 1.13.0 — no display() fallback needed).
 *
 * Phase 0: stub pages only. Functional controls added in Phase 0.4.
 */
export class QuartzSyncerSettingTab extends PluginSettingTab {
	plugin: QuartzSyncer;
	private pluginUpdateStatus: PluginUpdateCache = {
		state: "not-checked",
	};
	private cssSnippetCache = new DynamicOptionListCache(
		() => this.listCssSnippetFiles(),
		() => this.update(),
	);
	private ignoredFolderCache = new DynamicOptionListCache(
		() => this.listVaultFolders(),
		() => this.update(),
	);
	private readonly dynamicToggleBindings: DynamicToggleSetBinding[] = [
		{
			prefix: CSS_SNIPPET_CONTROL_PREFIX,
			getSelected: () => this.plugin.settings.copyCssSnippets,
			setSelected: async (values) => {
				this.plugin.settings.copyCssSnippets = values;
				await this.plugin.saveSettings();
			},
		},
		{
			prefix: IGNORED_FOLDER_CONTROL_PREFIX,
			getSelected: () => this.plugin.settings.ignoredFolders,
			setSelected: async (values) => {
				this.plugin.settings.ignoredFolders = values;
				await this.plugin.saveSettings();
			},
		},
	];

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		const resolved = resolveDynamicToggleValue(
			this.dynamicToggleBindings,
			key,
		);
		if (resolved !== undefined) return resolved;
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const handled = await applyDynamicToggleValue(
			this.dynamicToggleBindings,
			key,
			value,
		);
		if (handled) return;
		await super.setControlValue(key, value);
	}

	private listCssSnippetFiles(): Promise<string[]> {
		const snippetsDir = normalizePath(
			`${this.app.vault.configDir}/snippets`,
		);

		return this.app.vault.adapter.list(snippetsDir).then(({ files }) =>
			files
				.map((path) => path.split("/").pop() ?? "")
				.filter((name) => name.endsWith(".css"))
				.sort(),
		);
	}

	private listVaultFolders(): string[] {
		return this.app.vault
			.getAllFolders()
			.map((folder) => folder.path)
			.sort();
	}

	/** Top-level folders only — keeps the list short for vaults with deep nesting. */
	private listTopLevelVaultFolders(): string[] {
		return this.app.vault
			.getAllFolders()
			.map((folder) => folder.path)
			.filter((path) => !path.includes("/"))
			.sort();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		this.cssSnippetCache.ensureLoaded();

		return [
			...this.buildOverviewItems(),
			{
				type: "page",
				name: "Git",
				desc: "Configure your Git remote, authentication, and branch.",
				page: () => new GitSettingsPage(this.app, this.plugin),
			},
			...(Platform.isDesktopApp
				? [
						{
							type: "page" as const,
							name: "Quartz",
							desc: "Quartz site configuration, plugins, and templates.",
							page: () =>
								new QuartzSettingsPage(this.app, this.plugin),
						},
					]
				: []),
			{
				type: "page",
				name: "Frontmatter",
				desc: "Note properties and frontmatter settings.",
				items: frontmatterSettingDefinitions(this.plugin),
			},
			{
				type: "page",
				name: "Integration",
				desc: "Plugin integrations for Dataview, Excalidraw, and more.",
				items: integrationSettingDefinitions(
					this.plugin,
					this.cssSnippetCache.state,
				),
			},
			{
				type: "page",
				name: "Performance",
				desc: "Caching and performance optimization.",
				items: performanceSettingDefinitions(this.plugin, {
					...this.ignoredFolderCache.state,
					refreshTopLevel: () =>
						this.ignoredFolderCache.refresh(() =>
							this.listTopLevelVaultFolders(),
						),
				}),
			},
			{
				type: "page",
				name: "UI",
				desc: "Customize the appearance and behavior of Quartz Syncer.",
				items: uiSettingDefinitions(),
			},
		];
	}

	private buildOverviewItems(): SettingDefinitionItem[] {
		const version = this.plugin.manifest.version;
		const items: SettingDefinitionItem[] = [
			{
				name: `Quartz Syncer v${version}`,
				desc: this.buildLinksFragment(),
			},
		];

		if (this.plugin.settings.gitRemoteUrl) {
			items.push({
				name: "Status",
				desc: this.buildStatusFragment(),
			});
		} else {
			items.push({
				name: Platform.isDesktopApp
					? "Run setup wizard"
					: "Run manual setup",
				desc: "No repository configured. Set up your Quartz site connection to get started.",
				action: () => {
					if (Platform.isDesktopApp) {
						new OnboardingWizard(this.app, this.plugin).open();
					} else {
						new ManualSetupModal(this.app, this.plugin).open();
					}
				},
			});
		}

		return items;
	}

	private buildLinksFragment(): DocumentFragment {
		const frag = createFragment();

		frag.createSpan({ text: "Publish your notes to " });

		frag.createEl("a", {
			text: "Quartz",
			href: "https://quartz.jzhao.xyz/",
		});

		frag.createSpan({ text: ". " });

		frag.createEl("a", {
			text: "Documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/",
		});

		frag.createSpan({ text: " · " });

		frag.createEl("a", {
			text: "Setup guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide",
		});

		frag.createSpan({ text: " · " });

		frag.createEl("a", {
			text: "Troubleshooting",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/",
		});

		return frag;
	}

	private buildStatusFragment(): DocumentFragment {
		const frag = createFragment();
		const addLine = (label: string, value: string): void => {
			frag.createSpan({ text: `${label}: ` });
			frag.createSpan({ text: value });
			frag.createEl("br");
		};

		addLine(
			"Repository",
			this.formatRepoUrl(this.plugin.settings.gitRemoteUrl),
		);
		addLine("Branch", this.plugin.settings.gitBranch);
		addLine(
			"Authentication",
			this.plugin.secretStorageService.hasToken()
				? "Token stored securely"
				: "No token set",
		);

		frag.createSpan({ text: "Quartz plugins: " });
		const statusEl = frag.createSpan({
			text: this.getPluginUpdateStatusText(),
		});
		frag.createSpan({ text: " " });
		const checkLink = frag.createEl("a", {
			text: "Check now",
			href: "#",
		});
		checkLink.addEventListener("click", (event) => {
			event.preventDefault();
			void this.runPluginUpdateCheck(statusEl);
		});

		return frag;
	}

	private formatRepoUrl(url: string): string {
		return url.replace(/^https?:\/\//, "").replace(/\.git$/, "");
	}

	private getPluginUpdateStatusText(): string {
		switch (this.pluginUpdateStatus.state) {
			case "checking":
				return "Checking…";
			case "failed":
				return "Check failed";
			case "v5-required":
				return "Quartz v5 required";
			case "complete": {
				const updateCount = this.pluginUpdateStatus.updates ?? 0;
				if (updateCount > 0) {
					return `${updateCount} update${
						updateCount === 1 ? "" : "s"
					} available`;
				}
				return "All up to date";
			}
			case "not-checked":
			default:
				return "Not checked";
		}
	}

	private async runPluginUpdateCheck(statusEl: HTMLElement): Promise<void> {
		if (this.pluginUpdateStatus.state === "checking") {
			return;
		}

		this.pluginUpdateStatus = { state: "checking" };
		statusEl.setText(this.getPluginUpdateStatusText());

		try {
			this.pluginUpdateStatus = await this.fetchPluginUpdateStatus();
		} catch {
			this.pluginUpdateStatus = { state: "failed" };
		}

		statusEl.setText(this.getPluginUpdateStatusText());
	}

	private async fetchPluginUpdateStatus(): Promise<PluginUpdateCache> {
		const gitSettings = this.plugin.getGitSettingsWithSecret();
		const backend = createGitBackend(
			{
				remoteUrl: gitSettings.remoteUrl,
				branch: gitSettings.branch,
				corsProxyUrl: gitSettings.corsProxyUrl,
				auth: gitSettings.auth,
			},
			this.app,
		);

		const repo = new RemoteFileSource(backend, gitSettings.branch);
		const version = await QuartzVersionDetector.detectQuartzVersion(repo);

		if (version !== "v5-yaml" && version !== "v5-json") {
			return { state: "v5-required" };
		}

		const configService = new QuartzConfigService(repo);
		const config = await configService.readConfig();
		const lockFile = await configService.readLockFile();
		const checker = new QuartzPluginUpdateChecker(
			gitSettings.auth,
			gitSettings.corsProxyUrl,
		);
		const status = await checker.checkUpdates(config.plugins, lockFile);
		const updates = status.filter((entry) => entry.hasUpdate).length;

		return { state: "complete", updates };
	}
}
