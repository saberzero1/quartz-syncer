import { App, Notice, Platform, Setting } from "obsidian";
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
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";
import type {
	QuartzPluginSource,
	QuartzV5Config,
} from "src/quartz/QuartzConfigTypes";
import { PluginBrowserModal } from "src/views/PluginBrowser/PluginBrowserModal";
import { TerminalOutputModal } from "src/views/TerminalOutput/TerminalOutputModal";
import { QuartzPreviewModal } from "src/views/QuartzPreview/QuartzPreviewModal";
import type { BinaryInfo } from "src/process/types";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import { RemoteFileSource } from "src/quartz/RemoteFileSource";

export class QuartzSettingsPage extends SettingPageBase {
	private app: App;
	private plugin: QuartzSyncer;
	private versionStatusEl: HTMLElement | null = null;
	private binaryStatusEl: HTMLElement | null = null;
	private repoPathStatusEl: HTMLElement | null = null;
	private binaryInfo: BinaryInfo[] | null = null;

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
		this.renderPluginBrowser();

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

	private renderPluginBrowser(): void {
		new Setting(this.containerEl)
			.setName("Plugin browser")
			.setDesc("Browse and install Quartz community plugins.")
			.addButton((button) => {
				button
					.setButtonText("Open plugin browser")
					.setCta()
					.onClick(() => {
						void this.openPluginBrowser();
					});
			});
	}

	private renderDesktopSettings(): void {
		new Setting(this.containerEl)
			.setName("Desktop commands")
			.setDesc("Configure local Quartz tools and system command access.")
			.setHeading();

		this.renderBinaryDetection();
		this.renderQuartzRepoPath();
		this.renderSystemCommandsToggle();
		this.renderQuartzActions();
	}

	private renderBinaryDetection(): void {
		const setting = new Setting(this.containerEl)
			.setName("Binary detection")
			.setDesc(
				"Detect git, npm, npx, and node availability on this device.",
			);

		this.binaryStatusEl = setting.controlEl.createDiv({
			cls: "qs-binary-status",
		});

		setting.addButton((button) => {
			button.setButtonText("Refresh detection").onClick(() => {
				void this.refreshBinaryDetection(true);
			});
		});

		void this.refreshBinaryDetection(false);
	}

	private async refreshBinaryDetection(forceRefresh: boolean): Promise<void> {
		if (!this.binaryStatusEl) return;
		this.binaryStatusEl.empty();
		this.binaryStatusEl.setText("Detecting...");

		if (!this.plugin.binaryDetector) {
			this.binaryStatusEl.setText("Binary detection is unavailable.");
			return;
		}

		if (forceRefresh) {
			this.plugin.binaryDetector.clearCache();
		}

		try {
			this.binaryInfo = await this.plugin.binaryDetector.detectAll();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.binaryStatusEl.setText(`Detection failed: ${message}`);
			return;
		}

		this.renderBinaryInfo();
	}

	private renderBinaryInfo(): void {
		if (!this.binaryStatusEl || !this.binaryInfo) return;
		this.binaryStatusEl.empty();

		for (const info of this.binaryInfo) {
			const status = info.available ? "✓" : "✗";
			const version = info.version ? ` (${info.version})` : "";
			const warning = this.getVersionWarning(info);
			const row = this.binaryStatusEl.createDiv({
				text: `${info.name}: ${status}${version}`,
			});
			if (warning) {
				row.createSpan({
					text: ` ⚠ ${warning}`,
					cls: "qs-binary-version-warning",
				});
			}
		}
	}

	private getVersionWarning(info: BinaryInfo): string | null {
		if (!info.available || !info.version) return null;

		const major = parseMajorVersion(info.version);
		if (major === null) return null;

		if (info.name === "node" && major < 18) {
			return "Node.js ≥18 required for Quartz v5";
		}

		if (info.name === "npm" && major < 8) {
			return "npm ≥8 required for modern lockfile support";
		}

		return null;
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

	private renderQuartzActions(): void {
		if (!this.plugin.settings.enableSystemCommands) return;

		const setting = new Setting(this.containerEl)
			.setName("Quartz actions")
			.setDesc("Run Quartz CLI commands locally.");

		setting.addButton((button) => {
			button
				.setButtonText("Update Quartz")
				.setCta()
				.onClick(() => {
					const repoPath = this.getRepoPathOrNotice();
					if (!repoPath) return;
					if (!this.plugin.quartzRunner) {
						new Notice("Quartz runner is unavailable.");
						return;
					}
					new TerminalOutputModal(
						this.app,
						"Update Quartz",
						async ({ onStdout, onStderr, signal }) => {
							const result =
								await this.plugin.quartzRunner?.update({
									cwd: repoPath,
									signal,
									onStdout,
									onStderr,
								});
							if (!result?.ok) {
								throw new Error(
									result?.error ?? "Quartz update failed",
								);
							}
						},
					).open();
				});
		});

		setting.addButton((button) => {
			button.setButtonText("Install dependencies").onClick(() => {
				const repoPath = this.getRepoPathOrNotice();
				if (!repoPath) return;
				if (!this.plugin.npmRunner) {
					new Notice("Npm runner is unavailable.");
					return;
				}
				new TerminalOutputModal(
					this.app,
					"Install dependencies",
					async ({ onStdout, onStderr, signal }) => {
						const result = await this.plugin.npmRunner?.install({
							cwd: repoPath,
							signal,
							onStdout,
							onStderr,
						});
						if (!result?.ok) {
							throw new Error(
								result?.error ?? "npm install failed",
							);
						}
					},
				).open();
			});
		});

		setting.addButton((button) => {
			button.setButtonText("Build preview").onClick(() => {
				const repoPath = this.getRepoPathOrNotice();
				if (!repoPath) return;
				if (!this.plugin.quartzRunner) {
					new Notice("Quartz runner is unavailable.");
					return;
				}
				new QuartzPreviewModal(
					this.app,
					this.plugin.quartzRunner,
					repoPath,
				).open();
			});
		});
	}

	private getRepoPathOrNotice(): string | null {
		const repoPath = this.plugin.settings.quartzRepoPath.trim();
		if (!repoPath) {
			new Notice("Set a local Quartz repo path first.");
			return null;
		}
		const validation = this.validateQuartzRepoPath(repoPath);
		if (!validation.ok) {
			new Notice(validation.message);
			return null;
		}
		return repoPath;
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

	private async openPluginBrowser(): Promise<void> {
		if (!this.plugin.settings.gitRemoteUrl) {
			new Notice("Set a git remote URL before browsing plugins.");
			return;
		}

		const repo = this.createRepositoryAdapter();

		const version = await QuartzVersionDetector.detectQuartzVersion(repo);

		if (version === "v4" || version === "unknown") {
			new Notice(
				"Quartz v5 configuration not detected. Configure quartz.config.yaml first.",
			);
			return;
		}

		let config: QuartzV5Config;
		const configService = new QuartzConfigService(repo);

		try {
			config = await configService.readConfig();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to read Quartz config: ${message}`);
			return;
		}

		const registry = new QuartzPluginRegistry();
		const manager = new QuartzPluginManager();

		const onInstall = async (source: QuartzPluginSource) => {
			try {
				await manager.installPlugin(config, source, {
					runner: this.plugin.settings.enableSystemCommands
						? this.plugin.quartzRunner
						: null,
					cwd: this.plugin.settings.quartzRepoPath,
				});
				await configService.writeConfig(config);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				new Notice(`Failed to install plugin: ${message}`);
			}
		};

		new PluginBrowserModal(this.app, registry, config, onInstall).open();
	}
}

function parseMajorVersion(versionString: string): number | null {
	const cleaned = versionString.replace(/^v/i, "").trim();
	const major = parseInt(cleaned.split(".")[0] ?? "", 10);

	return Number.isNaN(major) ? null : major;
}
