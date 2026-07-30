import { PluginSettingTab, App, type SettingDefinitionItem } from "obsidian";
import type QuartzSyncer from "src/main";
import { frontmatterSettingDefinitions } from "src/views/settings/FrontmatterSettings";
import { integrationSettingDefinitions } from "src/views/settings/IntegrationSettings";
import { performanceSettingDefinitions } from "src/views/settings/PerformanceSettings";
import { uiSettingDefinitions } from "src/views/settings/UISettings";
import { GitSettingsPage } from "src/views/settings/GitSettingsPage";
import { QuartzSettingsPage } from "src/views/settings/QuartzSettingsPage";

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

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			text: "Quartz Syncer requires Obsidian 1.13 or later for the full settings experience. Please update Obsidian.",
		});
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...this.buildOverviewItems(),
			{
				type: "page",
				name: "Git",
				desc: "Configure your Git remote, authentication, and branch.",
				page: () =>
					new GitSettingsPage(
						this.app,
						this.plugin,
					) as unknown as import("obsidian").SettingPage,
			},
			{
				type: "page",
				name: "Quartz",
				desc: "Quartz site configuration, plugins, and templates.",
				page: () =>
					new QuartzSettingsPage(
						this.app,
						this.plugin,
					) as unknown as import("obsidian").SettingPage,
			},
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

	private buildOverviewItems(): SettingDefinitionItem[] {
		const version = this.plugin.manifest.version;

		return [
			{
				name: `Quartz Syncer v${version}`,
				desc: this.buildLinksFragment(),
			},
		];
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
}
