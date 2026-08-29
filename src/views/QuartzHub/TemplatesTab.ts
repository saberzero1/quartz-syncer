import { Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import type { IOperabilityEventSink } from "src/operability/types";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import { QuartzTemplateService } from "src/quartz/QuartzTemplateService";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
} from "src/utils/external-fs";

type TemplatesState = {
	templates: string[];
	isLoading: boolean;
	isApplying: boolean;
	error: string | null;
};

export function renderTemplatesTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	eventSink?: IOperabilityEventSink,
): void {
	void eventSink;

	const repoPath = plugin.settings.quartzRepoPath.trim();
	const resolvedRepoPath = repoPath ? expandTilde(repoPath) : "";

	const header = container.createDiv({ cls: "qs-hub-templates-header" });
	header.createEl("h3", { text: "Templates" });

	const listSection = container.createDiv({ cls: "qs-hub-templates-list" });

	const state: TemplatesState = {
		templates: [],
		isLoading: true,
		isApplying: false,
		error: null,
	};

	const setLoading = (value: boolean) => {
		state.isLoading = value;
		renderList();
	};

	const setApplying = (value: boolean) => {
		state.isApplying = value;
		renderList();
	};

	const setError = (message: string | null) => {
		state.error = message;
		renderList();
	};

	const renderList = () => {
		listSection.empty();

		if (state.isLoading) {
			listSection.createEl("p", { text: "Loading..." });
			return;
		}

		if (state.error) {
			listSection.createEl("p", { text: state.error });
			return;
		}

		if (state.templates.length === 0) {
			listSection.createEl("p", { text: "No templates found." });
			return;
		}

		const listEl = listSection.createDiv({ cls: "qs-hub-template-list" });

		for (const templateName of state.templates) {
			const row = listEl.createDiv({ cls: "qs-hub-template-row" });
			row.createDiv({
				cls: "qs-hub-template-name",
				text: templateName,
			});
			const actions = row.createDiv({ cls: "qs-hub-template-actions" });
			const applyButton = actions.createEl("button", { text: "Apply" });
			applyButton.disabled = state.isApplying;
			applyButton.addEventListener("click", () => {
				void applyTemplate(templateName);
			});
		}
	};

	const applyTemplate = async (templateName: string): Promise<void> => {
		if (state.isApplying) return;
		// eslint-disable-next-line no-alert -- intentional confirmation for destructive template application
		const confirmed = window.confirm(
			"Applying this template will replace your current configuration, plugins, and layout. Continue?",
		);
		if (!confirmed) return;

		setApplying(true);

		try {
			const repo = new LocalFileSource(resolvedRepoPath);
			const configService = new QuartzConfigService(repo);
			const templateService = new QuartzTemplateService(repo);
			const config = await configService.readConfig();
			const template = await templateService.readTemplate(templateName);

			if (!template) {
				new Notice(`Template "${templateName}" could not be read.`);
				return;
			}

			templateService.applyTemplate(config, template);
			await configService.writeConfig(config);
			new Notice(`Applied template "${templateName}".`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to apply template: ${message}`);
		} finally {
			setApplying(false);
		}
	};

	const hasRepoPath = !!resolvedRepoPath;
	const validRepo =
		hasRepoPath &&
		externalFileExistsSync(resolvedRepoPath) &&
		externalIsDirectorySync(resolvedRepoPath);

	if (!validRepo) {
		setLoading(false);
		setError("Set a valid local Quartz repo path to browse templates.");
		return;
	}

	void (async () => {
		setLoading(true);
		setError(null);
		try {
			const repo = new LocalFileSource(resolvedRepoPath);
			const templateService = new QuartzTemplateService(repo);
			state.templates = await templateService.listTemplateNames();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			setError(`Failed to load templates: ${message}`);
		} finally {
			setLoading(false);
		}
	})();
}
