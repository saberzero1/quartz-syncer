import { Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import type { IOperabilityEventSink } from "src/operability/types";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type {
	QuartzPluginEntry,
	QuartzV5Config,
} from "src/quartz/QuartzConfigTypes";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";

import {
	getPluginName,
	getPluginSourceKey,
} from "src/quartz/QuartzPluginUtils";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { PluginBrowserModal } from "src/views/PluginBrowser/PluginBrowserModal";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
} from "src/utils/external-fs";

type PluginsTabOptions = {
	onRefresh?: () => void;
};

export function renderPluginsTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	eventSink?: IOperabilityEventSink,
	options?: PluginsTabOptions,
): void {
	const repoPath = plugin.settings.quartzRepoPath.trim();
	const resolvedRepoPath = repoPath ? expandTilde(repoPath) : "";

	const header = container.createDiv({ cls: "qs-hub-plugins-header" });
	header.createEl("h3", { text: "Plugins" });

	const actionRow = container.createDiv({ cls: "qs-hub-plugins-actions" });
	const browseButton = actionRow.createEl("button", {
		text: "Browse community plugins",
	});

	const listSection = container.createDiv({ cls: "qs-hub-plugins-list" });

	const state = {
		config: null as QuartzV5Config | null,
		configService: null as QuartzConfigService | null,
		isLoading: true,
		isSaving: false,
	};

	const manager = new QuartzPluginManager();

	const setLoading = (value: boolean) => {
		state.isLoading = value;
		renderList();
	};

	const setSaving = (value: boolean) => {
		state.isSaving = value;
		renderList();
	};

	const renderList = () => {
		listSection.empty();

		if (state.isLoading) {
			listSection.createEl("p", { text: "Loading..." });
			return;
		}

		if (!state.config) {
			listSection.createEl("p", {
				text: "Quartz configuration is unavailable.",
			});
			return;
		}

		if (state.config.plugins.length === 0) {
			listSection.createEl("p", { text: "No plugins installed." });
			return;
		}

		const listEl = listSection.createDiv({ cls: "qs-hub-plugin-list" });

		for (const entry of state.config.plugins) {
			const row = listEl.createDiv({ cls: "qs-hub-plugin-row" });
			row.createDiv({
				cls: "qs-hub-plugin-name",
				text: getPluginName(entry.source),
			});
			row.createDiv({
				cls: "qs-hub-plugin-source",
				text: `Source: ${getPluginSourceKey(entry.source)}`,
			});
			row.createDiv({
				cls: "qs-hub-plugin-status",
				text: entry.enabled ? "Enabled" : "Disabled",
			});

			const actions = row.createDiv({ cls: "qs-hub-plugin-actions" });
			const toggleButton = actions.createEl("button", {
				text: entry.enabled ? "Disable" : "Enable",
			});
			const removeButton = actions.createEl("button", { text: "Remove" });

			toggleButton.disabled = state.isSaving;
			removeButton.disabled = state.isSaving;

			toggleButton.addEventListener("click", () => {
				void togglePlugin(entry);
			});
			removeButton.addEventListener("click", () => {
				void removePlugin(entry);
			});
		}
	};

	const togglePlugin = async (entry: QuartzPluginEntry): Promise<void> => {
		if (!state.config || !state.configService) return;
		if (state.isSaving) return;
		setSaving(true);

		const original = entry.enabled;
		entry.enabled = !original;
		try {
			await state.configService.writeConfig(state.config);
		} catch (error) {
			entry.enabled = original;
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to update plugin: ${message}`);
		} finally {
			setSaving(false);
		}
	};

	const removePlugin = async (entry: QuartzPluginEntry): Promise<void> => {
		if (!state.config || !state.configService) return;
		if (state.isSaving) return;

		setSaving(true);
		const sourceKey = getPluginSourceKey(entry.source);
		try {
			manager.removePlugin(state.config, sourceKey);
			await state.configService.writeConfig(state.config);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to remove plugin: ${message}`);
		} finally {
			setSaving(false);
		}
	};

	browseButton.addEventListener("click", () => {
		if (!resolvedRepoPath) {
			new Notice("Set a local Quartz repo path first.");
			return;
		}
		void openPluginBrowser(plugin, resolvedRepoPath, eventSink);
	});

	const hasRepoPath = !!resolvedRepoPath;
	const validRepo =
		hasRepoPath &&
		externalFileExistsSync(resolvedRepoPath) &&
		externalIsDirectorySync(resolvedRepoPath);

	if (!validRepo) {
		browseButton.disabled = true;
		listSection.createEl("p", {
			text: "Set a valid local Quartz repo path to manage plugins.",
		});
		return;
	}

	void (async () => {
		setLoading(true);
		try {
			const repo = new LocalFileSource(resolvedRepoPath);
			const configService = new QuartzConfigService(repo);
			const config = await configService.readConfig();
			state.config = config;
			state.configService = configService;
			options?.onRefresh?.();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to read Quartz config: ${message}`);
		} finally {
			setLoading(false);
		}
	})();
}

async function openPluginBrowser(
	plugin: QuartzSyncer,
	repoPath: string,
	eventSink: IOperabilityEventSink | undefined,
): Promise<void> {
	if (!plugin.settings.enableSystemCommands) {
		new Notice("Enable system commands before browsing plugins.");
		return;
	}
	if (!plugin.quartzRunner) {
		new Notice("Quartz runner is unavailable.");
		return;
	}

	const repo = new LocalFileSource(repoPath);
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
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Failed to read Quartz config: ${message}`);
		return;
	}

	const registry = plugin.pluginRegistry;
	const manager = new QuartzPluginManager();

	const onInstall = async (source: string) => {
		try {
			await manager.installPlugin(config, source, {
				runner: plugin.settings.enableSystemCommands
					? plugin.quartzRunner
					: null,
				cwd: repoPath,
			});
			await configService.writeConfig(config);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to install plugin: ${message}`);
		}
	};

	new PluginBrowserModal(
		plugin.app,
		registry,
		config,
		onInstall,
		eventSink,
	).open();
}
