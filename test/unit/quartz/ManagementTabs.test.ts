import { App, Modal } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	QuartzCompatibility,
	V4_MANAGEMENT_UNSUPPORTED,
} from "src/quartz/QuartzCompatibility";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type { QuartzVersion } from "src/quartz/QuartzConfigTypes";
import { QuartzTemplateService } from "src/quartz/QuartzTemplateService";
import { renderConfigTab } from "src/views/QuartzHub/ConfigTab";
import { renderLayoutTab } from "src/views/QuartzHub/LayoutTab";
import { renderPluginsTab } from "src/views/QuartzHub/PluginsTab";
import { renderTemplatesTab } from "src/views/QuartzHub/TemplatesTab";
import { buildPlugin } from "../cli/handlers/helpers";

vi.mock("src/utils/external-fs", () => ({
	expandTilde: (path: string) => path,
	externalFileExistsSync: () => true,
	externalIsDirectorySync: () => true,
}));

function createdElements(element: HTMLElement): HTMLElement[] {
	const children = [element.createDiv, element.createEl, element.createSpan]
		.flatMap((create) => vi.mocked(create).mock.results)
		.filter((result) => result.type === "return")
		.map((result) => result.value as HTMLElement);
	return [element, ...children.flatMap(createdElements)];
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe.each([
	["config", renderConfigTab],
	["layout", renderLayoutTab],
	["plugins", renderPluginsTab],
	["templates", renderTemplatesTab],
] as const)("%s tab", (_name, renderTab) => {
	it.each<QuartzVersion>(["v4", "unknown"])(
		"renders the support boundary instead of the editor for %s",
		async (version) => {
			const plugin = buildPlugin();
			plugin.settings.quartzRepoPath = "/repo";
			plugin.quartzCompatibility = new QuartzCompatibility(plugin);
			vi.spyOn(
				plugin.quartzCompatibility,
				"getVersion",
			).mockResolvedValue(version);
			const readConfig = vi.spyOn(
				QuartzConfigService.prototype,
				"readConfig",
			);
			const listTemplates = vi.spyOn(
				QuartzTemplateService.prototype,
				"listTemplateNames",
			);
			const container = new Modal(new App()).contentEl;

			renderTab(container, plugin);

			await vi.waitFor(() => {
				const calls = createdElements(container).flatMap(
					(element) => vi.mocked(element.createEl).mock.calls,
				);
				expect(calls).toContainEqual([
					"p",
					{ text: V4_MANAGEMENT_UNSUPPORTED },
				]);
				expect(calls.some(([tag]) => tag === "input")).toBe(false);
			});
			expect(readConfig).not.toHaveBeenCalled();
			expect(listTemplates).not.toHaveBeenCalled();
		},
	);
});
