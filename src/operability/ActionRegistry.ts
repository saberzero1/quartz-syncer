import { Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import type { PublicationService } from "src/services/PublicationService";
import type { OnboardingService } from "src/services/OnboardingService";
import type { Action, ActionResult } from "./types";
import type { PublishStatus } from "src/publisher/types";
import type { PublicationCenterController } from "src/views/PublicationCenter/PublicationCenter";
import { createGitBackend } from "src/git/GitBackendFactory";
import {
	externalFileExists,
	externalIsDirectorySync,
} from "src/utils/external-fs";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { getValueByPath, setValueByPath } from "src/cli/handlers/cliUtils";
import type { PublicationCenterManager } from "src/operability/PublicationCenterManager";
import type { QuartzHubManager } from "src/operability/QuartzHubManager";

type PublishStatusSummary = {
	unpublished: number;
	changed: number;
	published: number;
	deleted: number;
	media: number;
	arbitrary: number;
	stale: boolean;
};

type PluginManagerLike = {
	disablePlugin?: (id: string) => Promise<void> | void;
	disablePluginAndSave?: (id: string) => Promise<void> | void;
	enablePlugin?: (id: string) => Promise<void> | void;
	enablePluginAndSave?: (id: string) => Promise<void> | void;
};

export class ActionRegistry {
	private operating = false;

	constructor(
		private plugin: QuartzSyncer,
		private getPublicationService: () => PublicationService | null,
		private getOnboardingService: () => OnboardingService | null,
		private getPublicationCenterManager: () => PublicationCenterManager | null,
		private getQuartzHubManager: () => QuartzHubManager | null,
	) {}

	getPublishStatusSummary(): PublishStatusSummary | null {
		const cachedStatus =
			this.plugin.statusCache.getCachedStatusEvenIfStale();

		if (!cachedStatus) {
			return null;
		}

		return {
			unpublished: cachedStatus.unpublished.length,
			changed: cachedStatus.changed.length,
			published: cachedStatus.published.length,
			deleted: cachedStatus.deleted.length,
			media: cachedStatus.media.length,
			arbitrary: cachedStatus.arbitrary.length,
			stale: this.plugin.statusCache.isStale(),
		};
	}

	getCachedStatus(): PublishStatus | null {
		return this.plugin.statusCache.getCachedStatusEvenIfStale();
	}

	async dispatch(action: Action): Promise<ActionResult> {
		switch (action.name) {
			case "status.refresh":
				return this.withLock(() => this.refreshStatus());
			case "connection.test":
				return this.withLock(() => this.testConnection());
			case "settings.get":
				return this.getSetting(action.params.key);
			case "settings.set":
				return this.withLock(() =>
					this.setSetting(action.params.key, action.params.value),
				);
			case "plugin.reload":
				return this.withLock(() =>
					this.reloadPlugin(action.params.confirm),
				);
			case "pub.publish":
				return this.withLock(() =>
					this.publishPending(
						action.params.message,
						action.params.confirm,
					),
				);
			case "pub.delete":
				return this.withLock(() =>
					this.deletePending(action.params.confirm),
				);
			case "pub.open":
				return this.openPublicationCenter();
			case "pub.close":
				return this.closePublicationCenter();
			case "pub.select":
				return this.selectPublicationPaths(action.params.paths);
			case "pub.deselect":
				return this.deselectPublicationPaths(action.params.paths);
			case "pub.selectAll":
				return this.selectAllPublicationPaths();
			case "pub.deselectAll":
				return this.deselectAllPublicationPaths();
			case "hub.open":
				return this.openQuartzHub();
			case "hub.close":
				return this.closeQuartzHub();
			case "hub.setup.link":
				return this.withLock(() =>
					this.linkLocalRepo(action.params.path),
				);
			case "hub.setup.clone":
				return this.withLock(() =>
					this.cloneAndLinkRepo(
						action.params.url,
						action.params.dest,
						action.params.confirm,
					),
				);
			case "onboarding.start":
			case "onboarding.setToken":
			case "onboarding.createRepo":
			case "onboarding.connectRepo":
			case "onboarding.configure":
				return this.onboardingUnavailable();
			case "env.emulateMobile":
				return this.emulateMobile(
					action.params.enabled,
					action.params.confirm,
				);
			default:
				return { success: false, error: "Unknown action" };
		}
	}

	private async withLock<T>(
		operation: () => Promise<ActionResult<T>>,
	): Promise<ActionResult<T>> {
		if (this.operating) {
			return { success: false, error: "Operation in progress" };
		}

		this.operating = true;

		try {
			return await operation();
		} finally {
			this.operating = false;
		}
	}

	private async refreshStatus(): Promise<ActionResult> {
		const service = this.getPublicationService();

		if (!service) {
			return { success: false, error: "Publisher not available" };
		}

		try {
			const status = await service.getStatus();
			this.plugin.statusCache.setStatus(status);

			return { success: true, data: status };
		} catch (error) {
			return { success: false, error: toErrorMessage(error) };
		}
	}

	private async publishPending(
		message: string | undefined,
		confirm: boolean,
	): Promise<ActionResult> {
		if (!confirm) {
			return { success: false, error: "Confirmation required" };
		}

		const service = this.getPublicationService();

		if (!service) {
			return { success: false, error: "Publisher not available" };
		}

		const cachedStatus =
			this.plugin.statusCache.getCachedStatusEvenIfStale();

		if (!cachedStatus) {
			return {
				success: false,
				error: "Publish status not loaded. Run status.refresh first.",
			};
		}

		const files = [...cachedStatus.unpublished, ...cachedStatus.changed];

		if (files.length === 0) {
			return {
				success: true,
				data: { filesPublished: 0, filesDeleted: 0 },
			};
		}

		try {
			const result = await service.publish(files, message);

			return {
				success: result.success,
				data: result,
				error: result.success
					? undefined
					: (result.error ?? "Publish failed"),
			};
		} catch (error) {
			return { success: false, error: toErrorMessage(error) };
		}
	}

	private async deletePending(confirm: boolean): Promise<ActionResult> {
		if (!confirm) {
			return { success: false, error: "Confirmation required" };
		}

		const service = this.getPublicationService();

		if (!service) {
			return { success: false, error: "Publisher not available" };
		}

		const deleteCachedStatus =
			this.plugin.statusCache.getCachedStatusEvenIfStale();

		if (!deleteCachedStatus) {
			return {
				success: false,
				error: "Publish status not loaded. Run status.refresh first.",
			};
		}

		const paths = deleteCachedStatus.deleted;

		if (paths.length === 0) {
			return {
				success: true,
				data: { filesPublished: 0, filesDeleted: 0 },
			};
		}

		try {
			const result = await service.delete(paths);

			return {
				success: result.success,
				data: result,
				error: result.success
					? undefined
					: (result.error ?? "Delete failed"),
			};
		} catch (error) {
			return { success: false, error: toErrorMessage(error) };
		}
	}

	private openPublicationCenter(): ActionResult {
		const manager = this.getPublicationCenterManager();
		if (!manager) {
			return { success: false, error: "Publication Center unavailable" };
		}
		manager.open();
		return { success: true };
	}

	private closePublicationCenter(): ActionResult {
		const manager = this.getPublicationCenterManager();
		if (!manager) {
			return { success: false, error: "Publication Center unavailable" };
		}
		manager.close();
		return { success: true };
	}

	private openQuartzHub(): ActionResult {
		const manager = this.getQuartzHubManager();
		if (!manager) {
			return { success: false, error: "Quartz Hub unavailable" };
		}
		manager.open();
		return { success: true };
	}

	private closeQuartzHub(): ActionResult {
		const manager = this.getQuartzHubManager();
		if (!manager) {
			return { success: false, error: "Quartz Hub unavailable" };
		}
		manager.close();
		return { success: true };
	}

	private async linkLocalRepo(path: string): Promise<ActionResult> {
		if (!path) {
			return { success: false, error: "Path is required" };
		}

		const trimmed = path.trim();
		const { QuartzHubService } = await import(
			"src/services/QuartzHubService"
		);
		const service = new QuartzHubService(this.plugin);
		const validation = service.validateRepoPath(trimmed);

		if (!validation.ok) {
			return { success: false, error: validation.message };
		}

		this.plugin.settings.quartzRepoPath = trimmed;
		this.plugin.settings.enableSystemCommands = true;
		await this.plugin.saveSettings();

		return { success: true, data: { path: trimmed } };
	}

	private async cloneAndLinkRepo(
		url: string,
		dest: string,
		confirm: true | undefined,
	): Promise<ActionResult> {
		if (!confirm) {
			return { success: false, error: "Confirmation required" };
		}

		if (!url || !dest) {
			return {
				success: false,
				error: "URL and destination path are required",
			};
		}

		const gitRunner = this.plugin.gitRunner;
		const npmRunner = this.plugin.npmRunner;

		if (!gitRunner) {
			return { success: false, error: "Git runner unavailable" };
		}

		if (!npmRunner) {
			return { success: false, error: "Npm runner unavailable" };
		}

		const parentDir = dest.substring(0, dest.lastIndexOf("/")) || "/";
		const dirName = dest.substring(dest.lastIndexOf("/") + 1);

		const cloneResult = await gitRunner.clone(url, dirName, {
			cwd: parentDir,
		});
		if (!cloneResult.ok) {
			return {
				success: false,
				error: `Clone failed: ${cloneResult.error}`,
			};
		}

		const installResult = await npmRunner.install({ cwd: dest });
		if (!installResult.ok) {
			return {
				success: false,
				error: `npm install failed: ${installResult.error}`,
			};
		}

		this.plugin.settings.quartzRepoPath = dest;
		this.plugin.settings.enableSystemCommands = true;
		await this.plugin.saveSettings();

		return { success: true, data: { path: dest } };
	}

	private selectPublicationPaths(paths: string[]): ActionResult {
		const controller = this.getPublicationCenterController();
		if (!controller) {
			return { success: false, error: "Publication Center unavailable" };
		}
		controller.setSelected(paths);
		return { success: true };
	}

	private deselectPublicationPaths(paths: string[]): ActionResult {
		const controller = this.getPublicationCenterController();
		if (!controller) {
			return { success: false, error: "Publication Center unavailable" };
		}
		const remaining = new Set(controller.getSelected());
		for (const path of paths) {
			remaining.delete(path);
		}
		controller.setSelected([...remaining]);
		return { success: true };
	}

	private selectAllPublicationPaths(): ActionResult {
		const controller = this.getPublicationCenterController();
		if (!controller) {
			return { success: false, error: "Publication Center unavailable" };
		}
		controller.selectAll();
		return { success: true };
	}

	private deselectAllPublicationPaths(): ActionResult {
		const controller = this.getPublicationCenterController();
		if (!controller) {
			return { success: false, error: "Publication Center unavailable" };
		}
		controller.deselectAll();
		return { success: true };
	}

	private onboardingUnavailable(): ActionResult {
		const service = this.getOnboardingService();
		if (!service) {
			return { success: false, error: "Onboarding service unavailable" };
		}
		return { success: false, error: "Not implemented in v1" };
	}

	private getPublicationCenterController(): PublicationCenterController | null {
		const manager = this.getPublicationCenterManager();
		if (!manager) return null;
		return manager.getController() ?? manager.open();
	}

	private getSetting(key: string): ActionResult {
		const settings = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;
		const value = getValueByPath(settings, key);

		if (value === undefined) {
			return { success: false, error: `Setting not found: ${key}` };
		}

		return { success: true, data: { key, value } };
	}

	private async setSetting(
		key: string,
		value: unknown,
	): Promise<ActionResult> {
		const settings = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;

		setValueByPath(settings, key, value);
		await this.plugin.saveSettings();

		return { success: true, data: { key, value } };
	}

	private async testConnection(): Promise<ActionResult> {
		if (this.plugin.settings.quartzRepoPath) {
			return this.testLocalConnection();
		}

		if (!this.plugin.settings.gitRemoteUrl) {
			return { success: false, error: "Repository not configured" };
		}

		try {
			const gitSettings = this.plugin.getGitSettingsWithSecret();
			const backend = createGitBackend(
				{
					remoteUrl: gitSettings.remoteUrl,
					branch: gitSettings.branch,
					corsProxyUrl: gitSettings.corsProxyUrl,
					auth: gitSettings.auth,
				},
				this.plugin.app,
			);

			const result = await backend.testConnection();

			if (!result.ok) {
				return {
					success: false,
					error: result.error ?? "Connection failed",
				};
			}

			return { success: true, data: result };
		} catch (error) {
			return { success: false, error: toErrorMessage(error) };
		}
	}

	private async testLocalConnection(): Promise<ActionResult> {
		const repoPath = this.plugin.settings.quartzRepoPath;
		const checks: Array<{
			check: string;
			passed: boolean;
			detail?: string;
		}> = [];

		const exists = await externalFileExists(repoPath);
		checks.push({
			check: "Path exists",
			passed: exists,
			detail: exists ? repoPath : `${repoPath} not found`,
		});

		if (!exists) {
			return {
				success: false,
				data: { mode: "local", checks },
				error: "Local repository path does not exist",
			};
		}

		const isDir = externalIsDirectorySync(repoPath);
		checks.push({
			check: "Is directory",
			passed: isDir,
			detail: isDir ? undefined : "Path is not a directory",
		});

		const source = new LocalFileSource(repoPath);
		const version = await QuartzVersionDetector.detectQuartzVersion(source);
		checks.push({
			check: "Quartz config detected",
			passed: version !== "unknown",
			detail: version === "unknown" ? "No config files found" : version,
		});

		const contentFolder = this.plugin.settings.contentFolder || "content";
		const contentExists = await externalFileExists(
			`${repoPath}/${contentFolder}`,
		);
		checks.push({
			check: "Content folder exists",
			passed: contentExists,
			detail: contentExists
				? contentFolder
				: `${contentFolder} not found`,
		});

		const allPassed = checks.every((check) => check.passed);

		return {
			success: allPassed,
			data: {
				mode: "local",
				path: repoPath,
				quartzVersion: version !== "unknown" ? version : null,
				checks,
				contentFolder,
			},
			error: allPassed ? undefined : "Local repository validation failed",
		};
	}

	private async reloadPlugin(confirm: boolean): Promise<ActionResult> {
		if (!confirm) {
			return { success: false, error: "Confirmation required" };
		}

		if (!Platform.isDesktopApp) {
			return {
				success: false,
				error: "Plugin reload is only available on desktop",
			};
		}

		const manager = this.getPluginManager();
		const disable = manager?.disablePluginAndSave ?? manager?.disablePlugin;
		const enable = manager?.enablePluginAndSave ?? manager?.enablePlugin;

		if (!disable || !enable) {
			return {
				success: false,
				error: "Plugin manager does not support reload",
			};
		}

		const windowRef = window as unknown as { __QS_RELOADING__?: boolean };
		windowRef.__QS_RELOADING__ = true;

		try {
			await Promise.resolve(disable(this.plugin.manifest.id));
			await Promise.resolve(enable(this.plugin.manifest.id));
			return { success: true };
		} catch (error) {
			return { success: false, error: toErrorMessage(error) };
		} finally {
			windowRef.__QS_RELOADING__ = false;
		}
	}

	private emulateMobile(
		enabled: boolean,
		confirm: true | undefined,
	): ActionResult {
		if (!confirm) {
			return {
				success: false,
				error: "Destructive action requires confirm: true",
			};
		}

		const appWithEmulate = this.plugin.app as unknown as {
			emulateMobile?: (enabled: boolean) => void;
		};

		if (typeof appWithEmulate.emulateMobile !== "function") {
			return {
				success: false,
				error: "emulateMobile not available in this Obsidian version",
			};
		}

		appWithEmulate.emulateMobile(enabled);
		return { success: true, data: { mobileEmulation: enabled } };
	}

	private getPluginManager(): PluginManagerLike | null {
		const app = this.plugin.app as unknown as {
			plugins?: PluginManagerLike;
		};
		return app.plugins ?? null;
	}
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
