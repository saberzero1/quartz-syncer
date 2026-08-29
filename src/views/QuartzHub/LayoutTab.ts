import { Notice } from "obsidian";
import type QuartzSyncer from "src/main";
import type { IOperabilityEventSink } from "src/operability/types";
import { QuartzConfigService } from "src/quartz/QuartzConfigService";
import type {
	QuartzDisplayMode,
	QuartzLayoutPosition,
	QuartzPageType,
	QuartzPluginEntry,
	QuartzV5Config,
} from "src/quartz/QuartzConfigTypes";
import { LocalFileSource } from "src/quartz/LocalFileSource";
import {
	getPluginName,
	getPluginSourceKey,
} from "src/quartz/QuartzPluginUtils";
import {
	expandTilde,
	externalFileExistsSync,
	externalIsDirectorySync,
} from "src/utils/external-fs";

type LayoutState = {
	config: QuartzV5Config | null;
	configService: QuartzConfigService | null;
	isLoading: boolean;
	isSaving: boolean;
	errorMessage: string | null;
};

const KNOWN_POSITIONS: Array<{ key: QuartzLayoutPosition; label: string }> = [
	{ key: "left", label: "Left" },
	{ key: "right", label: "Right" },
	{ key: "beforeBody", label: "Before body" },
	{ key: "afterBody", label: "After body" },
	{ key: "body", label: "Body" },
];

const KNOWN_POSITION_KEYS = new Set(
	KNOWN_POSITIONS.map((position) => position.key),
);

export function renderLayoutTab(
	container: HTMLElement,
	plugin: QuartzSyncer,
	_eventSink?: IOperabilityEventSink,
): void {
	const repoPath = plugin.settings.quartzRepoPath.trim();
	const resolvedRepoPath = repoPath ? expandTilde(repoPath) : "";

	const state: LayoutState = {
		config: null,
		configService: null,
		isLoading: true,
		isSaving: false,
		errorMessage: null,
	};

	const setLoading = (value: boolean) => {
		state.isLoading = value;
		render();
	};

	const setSaving = (value: boolean) => {
		state.isSaving = value;
		render();
	};

	const render = () => {
		container.empty();

		if (state.isLoading) {
			container.createEl("p", { text: "Loading..." });
			return;
		}

		if (state.errorMessage) {
			container.createEl("p", { text: state.errorMessage });
			return;
		}

		if (!state.config) {
			container.createEl("p", {
				text: "Quartz configuration is unavailable.",
			});
			return;
		}

		renderPositions(state.config);
		renderGroups(state.config);
		renderPageTypeOverrides(state.config);
	};

	const renderPositions = (config: QuartzV5Config) => {
		const section = container.createDiv({ cls: "qs-hub-setup-section" });
		section.createEl("h3", { text: "Positions" });

		const positionsMap = new Map<
			QuartzLayoutPosition,
			QuartzPluginEntry[]
		>();
		for (const position of KNOWN_POSITIONS) {
			positionsMap.set(position.key, []);
		}

		const unassigned: QuartzPluginEntry[] = [];
		const unknownPositions = new Map<string, QuartzPluginEntry[]>();

		for (const entry of config.plugins) {
			const position = entry.layout?.position;
			if (!position) {
				unassigned.push(entry);
				continue;
			}
			if (KNOWN_POSITION_KEYS.has(position)) {
				positionsMap.get(position)?.push(entry);
				continue;
			}
			const list = unknownPositions.get(position) ?? [];
			list.push(entry);
			unknownPositions.set(position, list);
		}

		for (const position of KNOWN_POSITIONS) {
			const entries = positionsMap.get(position.key) ?? [];
			renderPositionGroup(section, position.label, entries, {
				open: true,
			});
		}

		for (const [position, entries] of unknownPositions.entries()) {
			renderPositionGroup(section, `Other: ${position}`, entries, {
				open: false,
			});
		}

		renderPositionGroup(section, "Unassigned", unassigned, {
			open: false,
			allowPriority: false,
			fallbackText:
				"Plugins without layout positions are listed here for reference.",
		});
	};

	const renderGroups = (config: QuartzV5Config) => {
		const section = container.createDiv({ cls: "qs-hub-setup-section" });
		section.createEl("h3", { text: "Groups" });
		const groups = config.layout?.groups;

		if (!groups || Object.keys(groups).length === 0) {
			section.createEl("p", { text: "No layout groups configured." });
			return;
		}

		const list = section.createDiv();
		for (const groupName of Object.keys(groups)) {
			const group = groups[groupName];
			const row = list.createDiv();
			row.createEl("strong", { text: groupName });
			row.createDiv({
				text: `Priority: ${formatNumber(group?.priority)}`,
			});
			row.createDiv({
				text: `Direction: ${group?.direction ?? "inherit"}`,
			});
			row.createDiv({
				text: `Gap: ${group?.gap ?? "inherit"}`,
			});
			row.createDiv({
				text: `Wrap: ${group?.wrap ?? "inherit"}`,
			});
		}
	};

	const renderPageTypeOverrides = (config: QuartzV5Config) => {
		const section = container.createDiv({ cls: "qs-hub-setup-section" });
		section.createEl("h3", { text: "Page type overrides" });
		const overrides = config.layout?.byPageType;

		if (!overrides || Object.keys(overrides).length === 0) {
			section.createEl("p", {
				text: "No page type overrides configured.",
			});
			return;
		}

		for (const pageType of Object.keys(overrides)) {
			const override = overrides[pageType as QuartzPageType];
			if (!override) continue;
			const details = section.createEl("details", {
				cls: "qs-hub-layout-override",
			});
			details.createEl("summary", { text: pageType });
			const body = details.createDiv();

			body.createDiv({
				text: `Template: ${override.template ?? "inherit"}`,
			});
			const excluded = override.exclude ?? [];
			body.createDiv({
				text:
					excluded.length > 0
						? `Exclude: ${excluded.join(", ")}`
						: "Exclude: none",
			});

			const positions = override.positions;
			if (!positions || Object.keys(positions).length === 0) {
				body.createDiv({ text: "Position overrides: none" });
				continue;
			}
			body.createDiv({ text: "Position overrides:" });
			const list = body.createDiv();
			for (const positionName of Object.keys(positions)) {
				const listItems =
					positions[positionName as QuartzLayoutPosition] ?? [];
				const display = listItems.length
					? listItems.map(getPluginName).join(", ")
					: "none";
				list.createDiv({
					text: `${positionName}: ${display}`,
				});
			}
		}
	};

	const renderPositionGroup = (
		section: HTMLElement,
		label: string,
		entries: QuartzPluginEntry[],
		options?: {
			open?: boolean;
			allowPriority?: boolean;
			fallbackText?: string;
		},
	) => {
		const details = section.createEl("details", {
			cls: "qs-hub-layout-position",
		});
		details.open = options?.open ?? true;
		details.createEl("summary", {
			text: `${label} (${entries.length})`,
		});

		if (entries.length === 0) {
			details.createEl("p", { text: "No plugins assigned." });
			return;
		}

		if (options?.fallbackText) {
			details.createEl("p", { text: options.fallbackText });
		}

		const list = details.createDiv({ cls: "qs-hub-layout-list" });
		entries.sort(sortByPriorityAndName);

		for (const entry of entries) {
			renderPluginRow(list, entry, {
				allowPriority: options?.allowPriority ?? true,
			});
		}
	};

	const renderPluginRow = (
		list: HTMLElement,
		entry: QuartzPluginEntry,
		options: { allowPriority: boolean },
	) => {
		const row = list.createDiv({ cls: "qs-hub-layout-row" });
		row.createDiv({
			cls: "qs-hub-layout-name",
			text: getPluginName(entry.source),
		});

		const meta = row.createDiv({ cls: "qs-hub-layout-meta" });
		const display = formatDisplay(entry.layout?.display);
		const group = entry.layout?.group ?? "none";
		meta.createDiv({ text: `Display: ${display}` });
		meta.createDiv({ text: `Group: ${group}` });

		if (!options.allowPriority) {
			meta.createDiv({ text: "Priority: n/a" });
			return;
		}

		const priorityWrap = row.createDiv({ cls: "qs-hub-layout-priority" });
		priorityWrap.createSpan({ text: "Priority" });
		const input = priorityWrap.createEl("input", {
			type: "number",
		});
		input.value =
			entry.layout?.priority !== undefined
				? String(entry.layout.priority)
				: "";
		input.disabled = state.isSaving;

		input.addEventListener("change", () => {
			const nextValue = parsePriority(input.value);
			void updatePriority(getPluginSourceKey(entry.source), nextValue);
		});
	};

	const updatePriority = async (
		sourceKey: string,
		priority: number | null,
	): Promise<void> => {
		if (!state.configService) return;
		if (state.isSaving) return;
		setSaving(true);
		try {
			const latestConfig = await state.configService.readConfig();
			const target = latestConfig.plugins.find(
				(entry) => getPluginSourceKey(entry.source) === sourceKey,
			);
			if (!target) {
				throw new Error("Plugin not found in configuration.");
			}
			if (!target.layout) {
				target.layout = {};
			}
			if (priority === null) {
				delete target.layout.priority;
			} else {
				target.layout.priority = priority;
			}
			await state.configService.writeConfig(latestConfig);
			state.config = latestConfig;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Failed to update priority: ${message}`);
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
			"Set a valid local Quartz repo path to view layout configuration.";
		render();
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

function sortByPriorityAndName(
	a: QuartzPluginEntry,
	b: QuartzPluginEntry,
): number {
	const priorityA = a.layout?.priority ?? 0;
	const priorityB = b.layout?.priority ?? 0;
	if (priorityA !== priorityB) {
		return priorityA - priorityB;
	}
	return getPluginName(a.source).localeCompare(getPluginName(b.source));
}

function formatDisplay(value: QuartzDisplayMode | undefined): string {
	if (value === "mobile-only") return "Mobile only";
	if (value === "desktop-only") return "Desktop only";
	return "All";
}

function parsePriority(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function formatNumber(value: number | undefined): string {
	return value === undefined ? "inherit" : String(value);
}
