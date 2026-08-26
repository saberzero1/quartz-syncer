import { Notice, Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import { QuartzPluginManager } from "src/quartz/QuartzPluginManager";
import { QuartzPluginRegistry } from "src/quartz/QuartzPluginRegistry";
import { QuartzVersionDetector } from "src/quartz/QuartzVersionDetector";
import { PluginBrowserModal } from "src/views/PluginBrowser/PluginBrowserModal";
import { launchQuartzPreview } from "src/views/QuartzPreview/QuartzPreviewModal";
import { TerminalOutputModal } from "src/views/TerminalOutput/TerminalOutputModal";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
	getModule,
	joinPath,
} from "src/utils/external-fs";

type OverviewTabOptions = {
	onNavigateToSetup?: () => void;
};

type RepoValidation = {
	ok: boolean;
	message: string;
};

export function renderOverviewTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	eventSink?: IOperabilityEventSink,
	options?: OverviewTabOptions,
): void {
	const repoPath = plugin.settings.quartzRepoPath.trim();
	const repoValidation = validateRepoPath(repoPath);
	const resolvedRepoPath = repoPath ? expandTilde(repoPath) : "";
	const actionsDisabled = !repoValidation.ok;
	const processRunnerDisabled = plugin.processRunner?.isDisabled ?? false;
	let isOperating = false;

	const statusSection = container.createDiv({ cls: "qs-hub-status" });
	statusSection.setAttrs(qsDom("hub-status"));

	const repoRow = createStatusRow(statusSection, "Repository");
	const versionRow = createStatusRow(statusSection, "Quartz version");
	const binaryRow = createStatusRow(statusSection, "Binaries");
	const serveRow = createStatusRow(statusSection, "Preview server");
	serveRow.row.setAttrs(qsDom("hub-serve-status"));

	queueMicrotask(() => {
		if (!container.isConnected) return;
		repoRow.valueEl.empty();
		repoRow.valueEl.createSpan({
			text: repoPath ? repoPath : "Not set",
		});
		if (options?.onNavigateToSetup) {
			const changeButton = repoRow.valueEl.createEl("button", {
				text: "Change",
			});
			changeButton.addEventListener("click", () => {
				options.onNavigateToSetup?.();
			});
		}
		if (!repoValidation.ok) {
			repoRow.valueEl.createSpan({
				text: ` (${repoValidation.message})`,
			});
		}
	});

	void (async () => {
		if (!container.isConnected) return;
		versionRow.valueEl.setText("Detecting...");
		if (!repoValidation.ok) {
			versionRow.valueEl.setText("Not detected");
			return;
		}
		try {
			const repo = new LocalFileSource(resolvedRepoPath);
			const version =
				await QuartzVersionDetector.getQuartzPackageVersion(repo);
			if (!container.isConnected) return;
			versionRow.valueEl.setText(version ?? "Not detected");
		} catch (error) {
			if (!container.isConnected) return;
			const message =
				error instanceof Error ? error.message : String(error);
			versionRow.valueEl.setText(`Detection failed: ${message}`);
		}
	})();

	void (async () => {
		if (!container.isConnected) return;
		binaryRow.valueEl.setText("Detecting...");
		if (!plugin.binaryDetector) {
			binaryRow.valueEl.setText("Binary detection is unavailable.");
			return;
		}
		try {
			const info = await plugin.binaryDetector.detectAll();
			if (!container.isConnected) return;
			binaryRow.valueEl.empty();
			for (const entry of info) {
				const status = entry.available ? "✓" : "✗";
				const version = entry.version ? ` (${entry.version})` : "";
				binaryRow.valueEl.createDiv({
					text: `${entry.name}: ${status}${version}`,
				});
			}
		} catch (error) {
			if (!container.isConnected) return;
			const message =
				error instanceof Error ? error.message : String(error);
			binaryRow.valueEl.setText(`Detection failed: ${message}`);
		}
	})();

	queueMicrotask(() => {
		if (!container.isConnected) return;
		serveRow.valueEl.setText("Detecting...");
		if (plugin.quartzRunner?.isServing) {
			serveRow.valueEl.setText("Server running on port 8080 ");
			const stopButton = serveRow.valueEl.createEl("button", {
				text: "Stop",
			});
			stopButton.addEventListener("click", () => {
				plugin.quartzRunner?.stopServe();
				serveRow.row.remove();
			});
		} else {
			serveRow.row.remove();
		}
	});

	const actionsSection = container.createDiv({ cls: "qs-hub-actions" });

	if (!plugin.settings.enableSystemCommands) {
		actionsSection.createDiv({
			cls: "qs-hub-callout",
			text: "Enable system commands in settings to run local Quartz actions.",
		});
		return;
	}

	if (processRunnerDisabled) {
		actionsSection.createDiv({
			cls: "qs-hub-callout",
			text: "System commands are temporarily disabled after repeated errors.",
		});
	}

	const actionButtons: HTMLButtonElement[] = [];
	const updateActionState = () => {
		const shouldDisable =
			isOperating || actionsDisabled || processRunnerDisabled;
		for (const button of actionButtons) {
			button.disabled = shouldDisable;
		}
	};

	const setOperating = (value: boolean) => {
		isOperating = value;
		updateActionState();
	};

	const registerAction = (
		label: string,
		value: string,
		onClick: () => void,
	): HTMLButtonElement => {
		const button = actionsSection.createEl("button", { text: label });
		button.setAttrs(qsDom("hub-action", { value }));
		button.addEventListener("click", () => {
			if (button.disabled) return;
			onClick();
		});
		actionButtons.push(button);
		return button;
	};

	const requireRepoPath = (): string | null => {
		if (!repoPath) {
			new Notice("Set a local Quartz repo path first.");
			return null;
		}
		if (!repoValidation.ok) {
			new Notice(repoValidation.message);
			return null;
		}
		return resolvedRepoPath;
	};

	const runTerminalAction = (
		title: string,
		executor: (options: {
			onStdout: (line: string) => void;
			onStderr: (line: string) => void;
			signal: AbortSignal;
		}) => Promise<void>,
	) => {
		if (!requireRepoPath()) return;
		setOperating(true);
		new TerminalOutputModal(
			plugin.app,
			title,
			async (options) => {
				try {
					await executor(options);
				} finally {
					setOperating(false);
				}
			},
			eventSink,
		).open();
	};

	registerAction("Preview", "preview", () => {
		const resolved = requireRepoPath();
		if (!resolved) return;
		if (!plugin.quartzRunner) {
			new Notice("Quartz runner is unavailable.");
			return;
		}
		launchQuartzPreview(plugin.app, plugin.quartzRunner, resolved);
	});

	registerAction("Build", "build", () => {
		if (!plugin.quartzRunner) {
			new Notice("Quartz runner is unavailable.");
			return;
		}
		runTerminalAction(
			"Build Quartz",
			async ({ onStdout, onStderr, signal }) => {
				const result = await plugin.quartzRunner?.build({
					cwd: resolvedRepoPath,
					signal,
					onStdout,
					onStderr,
				});
				if (!result?.ok) {
					throw new Error(result?.error ?? "Quartz build failed");
				}
			},
		);
	});

	registerAction("Update", "update", () => {
		if (!plugin.quartzRunner) {
			new Notice("Quartz runner is unavailable.");
			return;
		}
		runTerminalAction(
			"Update Quartz",
			async ({ onStdout, onStderr, signal }) => {
				const result = await plugin.quartzRunner?.update({
					cwd: resolvedRepoPath,
					signal,
					onStdout,
					onStderr,
				});
				if (!result?.ok) {
					throw new Error(result?.error ?? "Quartz update failed");
				}
			},
		);
	});

	registerAction("Install deps", "install-deps", () => {
		if (!plugin.npmRunner) {
			new Notice("Npm runner is unavailable.");
			return;
		}
		runTerminalAction(
			"Install dependencies",
			async ({ onStdout, onStderr, signal }) => {
				const result = await plugin.npmRunner?.install({
					cwd: resolvedRepoPath,
					signal,
					onStdout,
					onStderr,
				});
				if (!result?.ok) {
					throw new Error(result?.error ?? "npm install failed");
				}
			},
		);
	});

	registerAction("Plugins", "plugins", () => {
		const resolved = requireRepoPath();
		if (!resolved) return;
		void openPluginBrowser(plugin, resolved, eventSink);
	});

	registerAction("Open folder", "open-folder", () => {
		const resolved = requireRepoPath();
		if (!resolved) return;
		try {
			const electron = getModule<{
				shell: { openPath: (p: string) => Promise<string> };
			}>("electron");
			void electron.shell.openPath(resolved).then((result) => {
				if (result) {
					new Notice(result);
				}
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to open folder: ${message}`);
		}
	});

	updateActionState();
}

function createStatusRow(
	container: HTMLElement,
	label: string,
): { row: HTMLDivElement; valueEl: HTMLDivElement } {
	const row = container.createDiv({ cls: "qs-hub-status-row" });
	row.createSpan({ text: label });
	const valueEl = row.createDiv({ text: "Detecting..." });
	return { row, valueEl };
}

function validateRepoPath(repoPath: string): RepoValidation {
	if (!repoPath.trim()) {
		return { ok: false, message: "Set a local Quartz repository path." };
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
		"quartz.config.default.yaml",
		"quartz.config.default.yml",
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

	let config;
	const configService = new QuartzConfigService(repo);

	try {
		config = await configService.readConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Failed to read Quartz config: ${message}`);
		return;
	}

	const registry = new QuartzPluginRegistry();
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
