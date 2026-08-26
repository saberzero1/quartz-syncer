import { Notice, Platform } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import { TerminalOutputModal } from "src/views/TerminalOutput/TerminalOutputModal";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
	getModule,
	joinPath,
} from "src/utils/external-fs";

type SetupTabOptions = {
	onNavigateToOverview?: () => void;
};

type RepoValidation = {
	ok: boolean;
	message: string;
};

export function renderSetupTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	eventSink?: IOperabilityEventSink,
	options?: SetupTabOptions,
): void {
	const linkSection = container.createDiv({ cls: "qs-hub-setup-section" });
	linkSection.createEl("h3", { text: "Link existing repository" });

	const linkInput = linkSection.createEl("input", {
		type: "text",
		placeholder: "/path/to/Quartz",
	});
	linkInput.setAttrs(qsDom("hub-setup-link-path"));
	linkInput.value = plugin.settings.quartzRepoPath;

	const linkStatus = linkSection.createDiv({
		cls: "qs-hub-setup-status",
		text: "Detecting...",
	});

	const linkButton = linkSection.createEl("button", { text: "Link" });
	linkButton.setAttrs(qsDom("hub-setup-link"));

	const cloneSection = container.createDiv({ cls: "qs-hub-setup-section" });
	cloneSection.createEl("h3", { text: "Clone from remote" });

	const urlInput = cloneSection.createEl("input", {
		type: "text",
		placeholder: "https://github.com/user/quartz.git",
	});
	urlInput.setAttrs(qsDom("hub-setup-clone-url"));

	const destInput = cloneSection.createEl("input", {
		type: "text",
		placeholder: "/path/to/Quartz",
	});
	destInput.setAttrs(qsDom("hub-setup-clone-dest"));

	const cloneButton = cloneSection.createEl("button", { text: "Clone" });
	cloneButton.setAttrs(qsDom("hub-setup-clone"));

	let isOperating = false;
	let validationTimer: number | null = null;

	const setOperating = (value: boolean) => {
		isOperating = value;
		updateLinkState();
		updateCloneState();
	};

	const updateLinkState = () => {
		const result = validateRepoPath(linkInput.value.trim());
		linkStatus.setText(result.message);
		linkButton.disabled = !result.ok || isOperating;
	};

	const updateCloneState = () => {
		const hasInputs =
			Boolean(urlInput.value.trim()) && Boolean(destInput.value.trim());
		cloneButton.disabled = !hasInputs || isOperating;
	};

	const scheduleValidation = () => {
		if (validationTimer) {
			window.clearTimeout(validationTimer);
		}
		validationTimer = window.setTimeout(() => {
			updateLinkState();
		}, 300);
	};

	linkInput.addEventListener("input", scheduleValidation);
	updateLinkState();

	linkButton.addEventListener(
		"click",
		() =>
			void (async () => {
				const value = linkInput.value.trim();
				const validation = validateRepoPath(value);
				if (!validation.ok) {
					new Notice(validation.message);
					return;
				}
				setOperating(true);
				try {
					plugin.settings.quartzRepoPath = value;
					await plugin.saveSettings();
					new Notice("Linked successfully.");
					options?.onNavigateToOverview?.();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					new Notice(`Failed to link repository: ${message}`);
				} finally {
					setOperating(false);
				}
			})(),
	);

	urlInput.addEventListener("input", updateCloneState);
	destInput.addEventListener("input", updateCloneState);
	updateCloneState();

	cloneButton.addEventListener("click", () => {
		const url = urlInput.value.trim();
		const dest = destInput.value.trim();
		if (!url || !dest) {
			new Notice("Provide both a git URL and destination path.");
			return;
		}
		if (!plugin.settings.enableSystemCommands) {
			new Notice(
				"Enable system commands in settings to clone repositories.",
			);
			return;
		}
		if (!plugin.gitRunner) {
			new Notice("Git runner is unavailable.");
			return;
		}
		if (!plugin.npmRunner) {
			new Notice("Npm runner is unavailable.");
			return;
		}
		const resolvedDest = expandTilde(dest);
		const pathModule = getModule<{
			dirname: (path: string) => string;
			basename: (path: string) => string;
			resolve: (...paths: string[]) => string;
		}>("path");
		const fullDestPath = pathModule.resolve(resolvedDest);
		const parentDir = pathModule.dirname(fullDestPath);
		const destName = pathModule.basename(fullDestPath);
		if (!externalIsDirectorySync(parentDir)) {
			new Notice("Destination parent directory does not exist.");
			return;
		}
		if (externalFileExistsSync(fullDestPath)) {
			new Notice("Destination path already exists.");
			return;
		}
		setOperating(true);
		new TerminalOutputModal(
			plugin.app,
			"Clone Quartz repository",
			async ({ onStdout, onStderr, signal }) => {
				try {
					const cloneResult = await plugin.gitRunner?.clone(
						url,
						destName,
						{
							cwd: parentDir,
							signal,
							onStdout,
							onStderr,
						},
					);
					if (!cloneResult?.ok) {
						throw new Error(
							cloneResult?.error ?? "git clone failed",
						);
					}

					const installResult = await plugin.npmRunner?.install({
						cwd: fullDestPath,
						signal,
						onStdout,
						onStderr,
					});
					if (!installResult?.ok) {
						throw new Error(
							installResult?.error ?? "npm install failed",
						);
					}

					plugin.settings.quartzRepoPath = fullDestPath;
					await plugin.saveSettings();
					new Notice("Quartz repository cloned and linked.");
					options?.onNavigateToOverview?.();
				} finally {
					setOperating(false);
				}
			},
			eventSink,
		).open();
	});
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
