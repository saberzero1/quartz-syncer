import { App, Platform, Setting } from "obsidian";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
	joinPath,
} from "src/utils/external-fs";
import { SettingPageBase } from "./SettingPageBase";
import type QuartzSyncer from "src/main";
import { createGitBackend } from "src/git/GitBackendFactory";
import type { GitBackend } from "src/git/types";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { RemoteFileSource } from "src/quartz/RemoteFileSource";

export class QuartzSettingsPage extends SettingPageBase {
	private app: App;
	private plugin: QuartzSyncer;
	private versionStatusEl: HTMLElement | null = null;
	private repoPathStatusEl: HTMLElement | null = null;

	constructor(app: App, plugin: QuartzSyncer) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.title = "Quartz";
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Quartz")
			.setDesc("Manage Quartz configuration and plugins.")
			.setHeading();

		this.renderVersionDetection();
		this.renderContentFolder();

		if (Platform.isDesktopApp) {
			this.renderDesktopSettings();
		}
	}

	private renderVersionDetection(): void {
		const setting = new Setting(this.containerEl)
			.setName("Quartz version")
			.setDesc(
				"Detected configuration format in your Quartz repository.",
			);

		this.versionStatusEl = setting.controlEl.createSpan({
			text: "Detecting...",
			cls: "quartz-syncer-quartz-version",
		});

		void this.updateVersionStatus();
	}

	private async updateVersionStatus(): Promise<void> {
		if (!this.versionStatusEl) return;

		if (!this.plugin.settings.gitRemoteUrl) {
			this.versionStatusEl.setText("Connect a git remote to detect.");
			return;
		}

		try {
			const repo = this.createRepositoryAdapter();
			const version =
				await QuartzVersionDetector.detectQuartzVersion(repo);
			const pkgVersion =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);

			const versionLabel =
				version === "v5-yaml"
					? "v5 (YAML)"
					: version === "v5-json"
						? "v5 (JSON)"
						: version === "v4"
							? "v4"
							: "Unknown";

			const suffix = pkgVersion ? ` · Quartz ${pkgVersion}` : "";
			this.versionStatusEl.setText(`${versionLabel}${suffix}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.versionStatusEl.setText(`Detection failed: ${message}`);
		}
	}

	private renderContentFolder(): void {
		new Setting(this.containerEl)
			.setName("Content folder")
			.setDesc("Folder in your Quartz repository that contains notes.")
			.addText((text) =>
				text
					.setPlaceholder("Content")
					.setValue(this.plugin.settings.contentFolder)
					.onChange(async (value) => {
						this.plugin.settings.contentFolder = value || "content";
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderDesktopSettings(): void {
		new Setting(this.containerEl)
			.setName("Desktop commands")
			.setDesc("Configure local Quartz tools and system command access.")
			.setHeading();

		this.renderQuartzRepoPath();
		this.renderSystemCommandsToggle();
		this.renderQuartzHubButton();
	}

	private renderQuartzRepoPath(): void {
		const desc = createFragment();
		desc.createSpan({
			text: "Path to your local Quartz repository for system commands.",
		});
		desc.createEl("br");
		this.repoPathStatusEl = desc.createSpan({ text: "" });

		new Setting(this.containerEl)
			.setName("Local Quartz repo path")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("/path/to/Quartz")
					.setValue(this.plugin.settings.quartzRepoPath)
					.onChange(async (value) => {
						this.plugin.settings.quartzRepoPath = value.trim();
						await this.plugin.saveSettings();
						this.updateRepoPathStatus();
					}),
			);

		this.updateRepoPathStatus();
	}

	private renderSystemCommandsToggle(): void {
		new Setting(this.containerEl)
			.setName("Enable system commands")
			.setDesc("Allow Quartz Syncer to run local git/npm/npx commands.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSystemCommands)
					.onChange(async (value) => {
						this.plugin.settings.enableSystemCommands = value;
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}

	private renderQuartzHubButton(): void {
		new Setting(this.containerEl)
			.setName("Quartz Hub")
			.setDesc("Manage local Quartz tools, plugins, and setup.")
			.addButton((button) => {
				button
					.setButtonText("Open Quartz Hub")
					.setCta()
					.onClick(() => {
						this.plugin.getQuartzHubManager()?.open();
					});
			});
	}

	private updateRepoPathStatus(): void {
		if (!this.repoPathStatusEl) return;
		const result = this.validateQuartzRepoPath(
			this.plugin.settings.quartzRepoPath,
		);
		this.repoPathStatusEl.setText(result.message);
	}

	private validateQuartzRepoPath(repoPath: string): {
		ok: boolean;
		message: string;
	} {
		if (!repoPath.trim()) {
			return {
				ok: false,
				message: "Set a local Quartz repository path.",
			};
		}

		if (!Platform.isDesktopApp) {
			return {
				ok: false,
				message: "Local repo path is only available on desktop.",
			};
		}

		const resolved = expandTilde(repoPath);

		if (!externalFileExistsSync(resolved)) {
			return { ok: false, message: "Path does not exist." };
		}
		if (!externalIsDirectorySync(resolved)) {
			return { ok: false, message: "Path is not a directory." };
		}

		const candidates = [
			"quartz.config.ts",
			"quartz.config.js",
			"quartz.config.mjs",
			"quartz.config.json",
			"quartz.config.yaml",
			"quartz.config.yml",
		];
		const hasConfig = candidates.some((candidate) =>
			externalFileExistsSync(joinPath(resolved, candidate)),
		);

		if (!hasConfig) {
			return {
				ok: false,
				message: "Quartz config not found in this directory.",
			};
		}

		return { ok: true, message: "Quartz repo detected." };
	}

	private createBackend(): GitBackend {
		const gitSettings = this.plugin.getGitSettingsWithSecret();
		return createGitBackend(
			{
				remoteUrl: gitSettings.remoteUrl,
				branch: gitSettings.branch,
				corsProxyUrl: gitSettings.corsProxyUrl,
				auth: gitSettings.auth,
			},
			this.app,
		);
	}

	private createRepositoryAdapter(): QuartzFileSource {
		const backend = this.createBackend();
		const branch = this.plugin.settings.gitBranch || "v5";

		return new RemoteFileSource(backend, branch);
	}
}
