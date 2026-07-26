import { App, Notice, Setting, SettingPage } from "obsidian";
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

export class QuartzSettingsPage extends SettingPage {
	private app: App;
	private plugin: QuartzSyncer;
	private versionStatusEl: HTMLElement | null = null;

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
	}

	private renderVersionDetection(): void {
		const setting = new Setting(this.containerEl)
			.setName("Quartz version")
			.setDesc("Detected configuration format in your Quartz repository.");

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
			const version = await QuartzVersionDetector.detectQuartzVersion(
				repo,
			);
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

		return new GitBackendRepositoryAdapter(
			backend,
			branch,
		) as unknown as RepositoryConnection;
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
			manager.addPlugin(config, source);
			await configService.writeConfig(config);
		};

		new PluginBrowserModal(this.app, registry, config, onInstall).open();
	}
}
