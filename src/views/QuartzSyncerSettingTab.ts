import {
	Platform,
	PluginSettingTab,
	App,
	type SettingDefinitionItem,
} from "obsidian";
import type QuartzSyncer from "src/main";
import { createRepositoryAdapter } from "src/cli/handlers/cliUtils";
import {
	checkPublishReadiness,
	describeBlocker,
	describeBlockerResolution,
	describeReadinessIssue,
	resolvePublishTarget,
	type ResolvedPublishTarget,
} from "src/publisher/PublishTargetResolver";
import { qsDom } from "src/operability/DomContract";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginUpdateChecker } from "src/quartz/QuartzPluginUpdateChecker";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { frontmatterSettingDefinitions } from "src/views/settings/FrontmatterSettings";
import { integrationSettingDefinitions } from "src/views/settings/IntegrationSettings";
import { performanceSettingDefinitions } from "src/views/settings/PerformanceSettings";
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

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
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
							page: () => new QuartzSettingsPage(this.plugin),
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
				items: integrationSettingDefinitions(),
			},
			{
				type: "page",
				name: "Performance",
				desc: "Caching and performance optimization.",
				items: performanceSettingDefinitions(this.plugin),
			},
			{
				type: "page",
				name: "UI",
				desc: "Customize the appearance and behavior of Quartz Syncer.",
				items: uiSettingDefinitions(),
			},
		];
	}

	// The base implementation persists via saveData, which skips saveSettings
	// and therefore skips publisher, status-cache and compatibility
	// invalidation. Without this, changing "Publish to" would update the
	// setting while the cached Publisher kept writing to the old destination.
	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] =
			value;
		await this.plugin.saveSettings();
	}

	private buildOverviewItems(): SettingDefinitionItem[] {
		const version = this.plugin.manifest.version;
		const items: SettingDefinitionItem[] = [
			{
				name: `Quartz Syncer v${version}`,
				desc: this.buildLinksFragment(),
			},
		];

		const target = resolvePublishTarget(this.plugin.settings);

		items.push({
			name: "Publish to",
			desc: this.buildPublishTargetDesc(target),
			// Rendered imperatively rather than declaratively because a
			// `control` definition never exposes its <select>, and the publish
			// destination has to be readable and settable through the DOM
			// contract. Persistence still routes through setControlValue, so
			// the publisher and status-cache invalidation below is preserved.
			render: (setting) => {
				setting.addDropdown((dropdown) => {
					const current = this.getControlValue("publishTarget");
					dropdown.addOptions({
						remote: "Remote repository",
						local: "Local folder (desktop only)",
					});
					dropdown.setValue(
						typeof current === "string" ? current : "remote",
					);
					dropdown.onChange((value) => {
						void this.setControlValue("publishTarget", value);
					});
					dropdown.selectEl.setAttrs(
						qsDom("settings-input", { field: "publish-target" }),
					);
				});
			},
		});

		if (target.effective) {
			items.push({
				name: "Status",
				desc: this.buildStatusFragment(),
			});
		} else {
			items.push(this.buildUnresolvedTargetItem(target));
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

	private buildUnresolvedTargetItem(
		target: ResolvedPublishTarget,
	): SettingDefinitionItem {
		const resolution = describeBlockerResolution(
			target.blocker ?? "none-configured",
			Platform.isDesktopApp,
		);

		return {
			name: resolution.name,
			desc: resolution.desc,
			action: () => {
				if (resolution.opens === "hub") {
					this.plugin.getQuartzHubManager()?.open();

					return;
				}

				if (Platform.isDesktopApp) {
					new OnboardingWizard(this.app, this.plugin).open();
				} else {
					new ManualSetupModal(this.app, this.plugin).open();
				}
			},
		};
	}

	private buildPublishTargetDesc(
		target: ResolvedPublishTarget,
	): DocumentFragment {
		const frag = createFragment();

		frag.createSpan({
			text: "Where publishing writes. The local repo path is still used for Quartz site management regardless of this choice. ",
		});

		if (target.blocker) {
			frag.createEl("br");

			frag.createSpan({
				text: describeBlocker(target.blocker, this.plugin.settings),
				cls: "quartz-syncer-publish-target-warning",
				attr: qsDom("settings-status", { field: "readiness" }),
			});
		}

		const issues = checkPublishReadiness(
			this.plugin.settings,
			target.effective,
			{ hasToken: this.plugin.secretStorageService.hasToken() },
		);

		for (const issue of issues) {
			frag.createEl("br");

			frag.createSpan({
				text: describeReadinessIssue(issue),
				cls: "quartz-syncer-publish-target-warning",
				attr: qsDom("settings-status", { field: "readiness" }),
			});
		}

		return frag;
	}

	private buildStatusFragment(): DocumentFragment {
		const frag = createFragment();
		const grid = frag.createDiv({ cls: "qs-settings-status" });

		const addRow = (
			label: string,
			value: string,
			tone?: "ok" | "warn" | "error",
		): HTMLSpanElement => {
			const row = grid.createDiv({ cls: "qs-settings-status-row" });
			row.createSpan({
				cls: "qs-settings-status-label",
				text: label,
			});
			const valueEl = row.createDiv({
				cls: "qs-settings-status-value",
			});
			if (tone) {
				valueEl.createSpan({ cls: `qs-dot qs-dot-${tone}` });
			}
			return valueEl.createSpan({ text: value });
		};

		if (resolvePublishTarget(this.plugin.settings).effective === "local") {
			addRow("Repository", this.plugin.settings.quartzRepoPath);
			addRow("Mode", "Local folder");
		} else {
			addRow(
				"Repository",
				this.formatRepoUrl(this.plugin.settings.gitRemoteUrl),
			);
			addRow("Branch", this.plugin.settings.gitBranch);
			const hasToken = this.plugin.secretStorageService.hasToken();
			addRow(
				"Authentication",
				hasToken ? "Token stored securely" : "No token set",
				hasToken ? "ok" : "error",
			);
		}

		const pluginsRow = grid.createDiv({ cls: "qs-settings-status-row" });
		pluginsRow.createSpan({
			cls: "qs-settings-status-label",
			text: "Quartz plugins",
		});
		const pluginsValue = pluginsRow.createDiv({
			cls: "qs-settings-status-value",
		});
		pluginsValue.createSpan({
			cls: `qs-dot qs-dot-${this.getPluginUpdateTone()}`,
		});
		const statusEl = pluginsValue.createSpan({
			text: this.getPluginUpdateStatusText(),
			attr: qsDom("settings-status", { field: "plugin-updates" }),
		});
		const checkLink = pluginsValue.createEl("a", {
			cls: "qs-settings-status-link",
			text: "Check now",
			href: "#",
		});
		checkLink.addEventListener("click", (event) => {
			event.preventDefault();
			void this.runPluginUpdateCheck(statusEl);
		});

		return frag;
	}

	private getPluginUpdateTone(): "ok" | "warn" | "error" | "idle" {
		switch (this.pluginUpdateStatus.state) {
			case "failed":
				return "error";
			case "v5-required":
				return "warn";
			case "complete":
				return (this.pluginUpdateStatus.updates ?? 0) > 0
					? "warn"
					: "ok";
			case "checking":
			case "not-checked":
			default:
				return "idle";
		}
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
		const repo = createRepositoryAdapter(this.plugin);

		if (!repo) {
			return { state: "failed" };
		}

		const gitSettings = this.plugin.getGitSettingsWithSecret();
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
