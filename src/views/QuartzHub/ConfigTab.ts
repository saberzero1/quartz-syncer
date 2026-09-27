import { Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import { qsDom } from "src/operability/DomContract";
import type { IOperabilityEventSink } from "src/operability/types";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { V4_MANAGEMENT_UNSUPPORTED } from "src/quartz/QuartzCompatibility";
import type { QuartzV5Config } from "src/quartz/QuartzConfigTypes";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
} from "src/utils/external-fs";

type ConfigState = {
	config: QuartzV5Config | null;
	configService: QuartzConfigService | null;
	isLoading: boolean;
	isSaving: boolean;
	errorMessage: string | null;
};

export function renderConfigTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	_eventSink?: IOperabilityEventSink,
): void {
	const repoPath = plugin.settings.quartzRepoPath.trim();
	const resolvedRepoPath = repoPath ? expandTilde(repoPath) : "";

	const section = container.createDiv({ cls: "qs-hub-setup-section" });
	section.createEl("h3", { text: "Config" });
	const content = section.createDiv();

	const state: ConfigState = {
		config: null,
		configService: null,
		isLoading: true,
		isSaving: false,
		errorMessage: null,
	};

	let saveButton: HTMLButtonElement | null = null;
	let pageTitleInput: HTMLInputElement | null = null;
	let pageTitleSuffixInput: HTMLInputElement | null = null;
	let baseUrlInput: HTMLInputElement | null = null;
	let localeInput: HTMLInputElement | null = null;
	let enableSpaInput: HTMLInputElement | null = null;
	let enablePopoversInput: HTMLInputElement | null = null;

	const render = () => {
		content.empty();
		saveButton = null;
		pageTitleInput = null;
		pageTitleSuffixInput = null;
		baseUrlInput = null;
		localeInput = null;
		enableSpaInput = null;
		enablePopoversInput = null;

		if (state.isLoading) {
			const loadingEl = content.createEl("p", { text: "Loading..." });
			loadingEl.setAttrs(qsDom("hub-state", { value: "loading" }));
			return;
		}

		if (state.errorMessage) {
			const errorEl = content.createEl("p", { text: state.errorMessage });
			errorEl.setAttrs(qsDom("hub-state", { value: "error" }));
			return;
		}

		if (!state.config) {
			const unavailableEl = content.createEl("p", {
				text: "Quartz configuration is unavailable.",
			});
			unavailableEl.setAttrs(
				qsDom("hub-state", { value: "unavailable" }),
			);
			return;
		}

		renderForm(state.config);
	};

	const renderForm = (config: QuartzV5Config) => {
		const fields = content.createDiv({ cls: "qs-hub-config-fields" });

		const createTextField = (
			label: string,
			field: string,
			value: string,
		) => {
			const row = fields.createDiv({ cls: "qs-hub-config-field" });
			row.createDiv({ cls: "qs-hub-config-label", text: label });
			const input = row.createEl("input", {
				cls: "qs-hub-config-input",
				type: "text",
			});
			input.setAttrs(qsDom("hub-config-input", { field }));
			input.value = value;
			return input;
		};

		const createToggleField = (
			label: string,
			field: string,
			checked: boolean,
		) => {
			const row = fields.createDiv({ cls: "qs-hub-config-field" });
			row.createDiv({ cls: "qs-hub-config-label", text: label });
			const input = row.createEl("input", {
				cls: "qs-hub-config-input",
				type: "checkbox",
			});
			input.setAttrs(qsDom("hub-config-input", { field }));
			input.checked = checked;
			return input;
		};

		pageTitleInput = createTextField(
			"Page title",
			"page-title",
			config.configuration.pageTitle,
		);
		pageTitleSuffixInput = createTextField(
			"Page title suffix",
			"title-suffix",
			config.configuration.pageTitleSuffix ?? "",
		);
		baseUrlInput = createTextField(
			"Base URL",
			"base-url",
			config.configuration.baseUrl ?? "",
		);
		localeInput = createTextField(
			"Locale",
			"locale",
			config.configuration.locale,
		);
		enableSpaInput = createToggleField(
			"Enable SPA",
			"spa",
			config.configuration.enableSPA,
		);
		enablePopoversInput = createToggleField(
			"Enable popovers",
			"popover",
			config.configuration.enablePopovers ?? false,
		);

		const actions = content.createDiv({ cls: "qs-hub-config-actions" });
		saveButton = actions.createEl("button", { text: "Save" });
		saveButton.setAttrs(qsDom("hub-config-action", { value: "save" }));
		saveButton.disabled = state.isSaving;
		saveButton.addEventListener("click", () => {
			void saveConfig();
		});
	};

	const setLoading = (value: boolean) => {
		state.isLoading = value;
		render();
	};

	const setSaving = (value: boolean) => {
		state.isSaving = value;
		if (saveButton) {
			saveButton.disabled = value;
		}
	};

	const saveConfig = async () => {
		if (state.isSaving) return;
		if (!state.configService) return;
		if (
			!pageTitleInput ||
			!pageTitleSuffixInput ||
			!baseUrlInput ||
			!localeInput ||
			!enableSpaInput ||
			!enablePopoversInput
		) {
			return;
		}

		setSaving(true);
		try {
			const latestConfig = await state.configService.readConfig();
			const configuration = latestConfig.configuration;

			configuration.pageTitle = pageTitleInput.value;
			const suffixValue = pageTitleSuffixInput.value.trim();
			configuration.pageTitleSuffix = suffixValue || undefined;
			const baseUrlValue = baseUrlInput.value.trim();
			configuration.baseUrl = baseUrlValue || undefined;
			configuration.locale = localeInput.value.trim();
			configuration.enableSPA = enableSpaInput.checked;
			configuration.enablePopovers = enablePopoversInput.checked;

			await state.configService.writeConfig(latestConfig);
			state.config = latestConfig;
			new Notice("Quartz configuration saved.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to save config: ${message}`);
		} finally {
			setSaving(false);
		}
	};

	const hasRepoPath = !!resolvedRepoPath;
	const validRepo =
		hasRepoPath &&
		externalFileExistsSync(resolvedRepoPath) &&
		externalIsDirectorySync(resolvedRepoPath);

	if (!validRepo) {
		state.isLoading = false;
		state.errorMessage =
			"Set a valid local Quartz repo path to edit configuration.";
		render();
		return;
	}

	void (async () => {
		setLoading(true);
		try {
			if (!(await plugin.quartzCompatibility.supportsV5Management())) {
				state.errorMessage = V4_MANAGEMENT_UNSUPPORTED;
				return;
			}

			const repo = new LocalFileSource(resolvedRepoPath);
			const configService = new QuartzConfigService(repo);
			const config = await configService.readConfig();
			state.config = config;
			state.configService = configService;
			state.errorMessage = null;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			state.errorMessage = `Failed to read Quartz config: ${message}`;
			new Notice(state.errorMessage);
		} finally {
			setLoading(false);
		}
	})();
}
