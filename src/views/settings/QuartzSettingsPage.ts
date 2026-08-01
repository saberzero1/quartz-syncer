import { App, Notice, Platform, Setting } from "obsidian";
import { SettingPageBase } from "./SettingPageBase";
import type QuartzSyncer from "src/main";
import { createGitBackend } from "src/git/GitBackendFactory";
import type { GitBackend, FileChange } from "src/git/types";
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
import type {
	RepositoryConnection,
	RepositoryDirectoryEntry,
	RepositoryFile,
} from "src/repositoryConnection/RepositoryConnection";

class GitBackendRepositoryAdapter {
	private backend: GitBackend;
	private branch: string;

	constructor(backend: GitBackend, branch: string) {
		this.backend = backend;
		this.branch = branch;
	}

	async getRawFile(path: string): Promise<RepositoryFile | undefined> {
		const entries = await this.backend.readTree(this.branch);
		const match = entries.find(
			(entry) => entry.path === path && entry.type === "blob",
		);

		if (!match) return undefined;

		const blob = await this.backend.readBlob(match.sha);
		const content = Buffer.from(blob).toString("base64");

		return {
			content,
			sha: match.sha,
			path,
			type: "file",
		};
	}

	async writeRawFiles(
		files: Map<string, string>,
		commitMessage = "Update Quartz configuration via Syncer",
	): Promise<void> {
		const changes: FileChange[] = [];

		for (const [path, content] of files.entries()) {
			changes.push({ path, content, encoding: "utf-8" });
		}

		await this.backend.writeFiles(this.branch, commitMessage, changes);
	}

	async listDirectory(path: string): Promise<RepositoryDirectoryEntry[]> {
		const entries = await this.backend.readTree(this.branch);
		const prefix = path.endsWith("/") ? path : `${path}/`;
		const results = new Map<string, "blob" | "tree">();

		for (const entry of entries) {
			if (!entry.path.startsWith(prefix)) continue;
			const remainder = entry.path.slice(prefix.length);
			if (!remainder) continue;
			const parts = remainder.split("/");
			const name = parts[0];
			if (!name) continue;

			if (parts.length === 1 && entry.type === "blob") {
				results.set(name, "blob");
			} else {
				results.set(name, "tree");
			}
		}

		return [...results.entries()].map(([name, type]) => ({ name, type }));
	}

	async hasCommitInHistory(_targetOid: string): Promise<boolean> {
		return false;
	}

	async upgradeFromUpstream(
		_upstreamUrl: string,
		_upstreamBranch: string,
	): Promise<{ oid: string; alreadyMerged: boolean }> {
		throw new Error("Upgrade is not available in this build.");
	}
}

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
			this.binaryStatusEl.createDiv({
				text: `${info.name}: ${status}${version}`,
			});
		}
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

	private validateQuartzRepoPath(path: string): {
		ok: boolean;
		message: string;
	} {
		if (!path.trim()) {
			return {
				ok: false,
				message: "Set a local Quartz repository path.",
			};
		}

		const requireFn = (
			window as Window & { require?: (module: string) => unknown }
		).require;
		if (!requireFn) {
			return {
				ok: false,
				message: "Filesystem access unavailable in this environment.",
			};
		}

		const fs = requireFn("fs") as typeof import("fs");
		const pathModule = requireFn("path") as typeof import("path");

		try {
			if (!fs.existsSync(path)) {
				return { ok: false, message: "Path does not exist." };
			}
			const stat = fs.statSync(path);
			if (!stat.isDirectory()) {
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
				fs.existsSync(pathModule.join(path, candidate)),
			);

			if (!hasConfig) {
				return {
					ok: false,
					message: "Quartz config not found in this directory.",
				};
			}
			return { ok: true, message: "Quartz repo detected." };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			return { ok: false, message: `Validation failed: ${message}` };
		}
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

	private createRepositoryAdapter(): RepositoryConnection {
		const backend = this.createBackend();
		const branch = this.plugin.settings.gitBranch || "v4";

		return new GitBackendRepositoryAdapter(backend, branch);
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
