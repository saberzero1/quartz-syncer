import { type App, Modal, Notice, Setting } from "obsidian";

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return "";

	if (typeof value === "object") return JSON.stringify(value);

	return `${value as string | number | boolean}`;
}

import type {
	QuartzPluginEntry,
	QuartzPluginManifest,
	QuartzLayoutPosition,
	QuartzDisplayMode,
} from "src/quartz/QuartzConfigTypes";
import {
	getPluginName,
	getPluginSourceKey,
} from "src/quartz/QuartzPluginUtils";
import type { QuartzPluginManifestService } from "src/quartz/QuartzPluginManifestService";
import type { PluginUpdateStatus } from "src/quartz/QuartzPluginUpdateChecker";
import type { QuartzV5Config } from "src/quartz/QuartzConfigTypes";
import { ConfirmModal } from "src/ui/ConfirmModal";

const LAYOUT_POSITIONS: QuartzLayoutPosition[] = [
	"left",
	"right",
	"beforeBody",
	"afterBody",
	"body",
];

const DISPLAY_MODES: QuartzDisplayMode[] = [
	"all",
	"mobile-only",
	"desktop-only",
];

export interface PluginOptionsModalContext {
	plugin: QuartzPluginEntry;
	index: number;
	total: number;
	config: QuartzV5Config;
	manifest: QuartzPluginManifest | null;
	manifestService: QuartzPluginManifestService | null;
	updateStatus: PluginUpdateStatus | undefined;
	onDirty: () => void;
	onMovePlugin: (from: number, to: number) => void;
	onRemovePlugin: (key: string) => void;
	onUpdatePlugin: (name: string, commit: string) => Promise<void>;
}

export class PluginOptionsModal extends Modal {
	private ctx: PluginOptionsModalContext;

	constructor(app: App, ctx: PluginOptionsModalContext) {
		super(app);
		this.ctx = ctx;
	}

	async onOpen(): Promise<void> {
		const name = getPluginName(this.ctx.plugin.source);
		this.modalEl.addClass("quartz-syncer-plugin-options-modal");
		this.titleEl.setText(name);

		if (!this.ctx.manifest && this.ctx.manifestService) {
			const manifest = await this.ctx.manifestService.fetchManifest(
				this.ctx.plugin.source,
			);
			this.ctx.manifest = manifest;
		}

		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();

		this.renderActions();
		this.renderOptions();

		if (this.ctx.plugin.layout) {
			this.renderLayoutControls();
		}
	}

	private renderActions(): void {
		const { plugin, index, total, updateStatus } = this.ctx;
		const name = getPluginName(plugin.source);

		const setting = new Setting(this.contentEl)
			.setName("Actions")
			.setHeading();

		setting.addToggle((toggle) =>
			toggle
				.setTooltip("Enable or disable this plugin")
				.setValue(plugin.enabled)
				.onChange((value) => {
					plugin.enabled = value;
					this.ctx.onDirty();
				}),
		);

		const actionRow = new Setting(this.contentEl);

		actionRow.addButton((button) =>
			button
				.setButtonText("Move up")
				.setDisabled(index === 0)
				.onClick(() => {
					this.ctx.onMovePlugin(index, index - 1);
					this.close();
				}),
		);

		actionRow.addButton((button) =>
			button
				.setButtonText("Move down")
				.setDisabled(index === total - 1)
				.onClick(() => {
					this.ctx.onMovePlugin(index, index + 1);
					this.close();
				}),
		);

		if (updateStatus?.hasUpdate && updateStatus.remoteCommit) {
			const commit = updateStatus.remoteCommit;

			actionRow.addButton((button) =>
				button
					.setButtonText(`Update to ${commit.slice(0, 7)}`)
					.onClick(async () => {
						await this.ctx.onUpdatePlugin(name, commit);
						this.close();
					}),
			);
		}

		actionRow.addButton((button) =>
			button
				.setButtonText("Remove")
				.setDestructive()
				.onClick(async () => {
					const confirmed = await new ConfirmModal(
						this.app,
						"Remove plugin",
						`Remove plugin "${name}"?`,
						"Remove",
					).await();

					if (!confirmed) return;

					const key = getPluginSourceKey(plugin.source);
					this.ctx.onRemovePlugin(key);
					this.close();
				}),
		);
	}

	private renderOptions(): void {
		const { plugin } = this.ctx;

		if (!plugin.options) {
			plugin.options = {};
		}

		new Setting(this.contentEl).setName("Options").setHeading();

		const manifest = this.ctx.manifest;
		const schema = manifest?.optionSchema ?? manifest?.configSchema ?? null;

		const optionKeys = new Set<string>([
			...Object.keys(plugin.options),
			...(schema ? Object.keys(schema) : []),
		]);

		if (optionKeys.size === 0) {
			new Setting(this.contentEl).setDesc(
				manifest
					? "This plugin has no configurable options."
					: "No manifest available. You can still add options manually.",
			);
		}

		for (const optKey of optionKeys) {
			this.renderOptionField(plugin, optKey, schema);
		}

		let newOptionKey = "";

		new Setting(this.contentEl)
			.setDesc("Add a custom option key.")
			.addText((text) =>
				text.setPlaceholder("optionKey").onChange((value) => {
					newOptionKey = value;
				}),
			)
			.addButton((button) =>
				button.setButtonText("Add option").onClick(() => {
					if (!newOptionKey.trim() || !plugin.options) return;

					if (plugin.options[newOptionKey.trim()] !== undefined) {
						new Notice(
							`Option "${newOptionKey.trim()}" already exists.`,
						);

						return;
					}

					plugin.options[newOptionKey.trim()] = "";
					this.ctx.onDirty();
					this.render();
				}),
			);
	}

	private renderOptionField(
		plugin: QuartzPluginEntry,
		optKey: string,
		schema: Record<string, unknown> | null,
	): void {
		const currentValue = plugin.options![optKey];

		const schemaEntry = schema?.[optKey] as
			| Record<string, unknown>
			| undefined;
		const label = (schemaEntry?.title as string) ?? optKey;
		const desc = (schemaEntry?.description as string) ?? "";
		const schemaType = schemaEntry?.type as string | undefined;
		const schemaDefault = schemaEntry?.default;

		const effectiveType = this.resolveEffectiveType(
			currentValue,
			schemaType,
		);

		const setting = new Setting(this.contentEl)
			.setName(label)
			.setDesc(desc);

		switch (effectiveType) {
			case "boolean":
				this.renderBooleanOption(
					setting,
					plugin,
					optKey,
					schemaDefault,
				);
				break;

			case "number":
			case "integer":
				this.renderNumberOption(
					setting,
					plugin,
					optKey,
					schemaEntry,
					effectiveType === "integer",
				);
				break;

			case "array":
				this.renderArrayOption(setting, plugin, optKey, schemaEntry);
				break;

			case "object":
				this.renderJsonOption(setting, plugin, optKey);
				break;

			default:
				this.renderStringOption(setting, plugin, optKey, schemaEntry);
				break;
		}
	}

	private resolveEffectiveType(
		currentValue: unknown,
		schemaType: string | undefined,
	): string {
		if (schemaType) return schemaType;

		if (typeof currentValue === "boolean") return "boolean";

		if (typeof currentValue === "number") return "number";

		if (Array.isArray(currentValue)) return "array";

		if (
			currentValue !== null &&
			currentValue !== undefined &&
			typeof currentValue === "object"
		) {
			return "object";
		}

		return "string";
	}

	private renderBooleanOption(
		setting: Setting,
		plugin: QuartzPluginEntry,
		optKey: string,
		schemaDefault: unknown,
	): void {
		const currentValue = plugin.options![optKey];

		const effectiveValue =
			typeof currentValue === "boolean"
				? currentValue
				: typeof schemaDefault === "boolean"
					? schemaDefault
					: false;

		setting.addToggle((toggle) =>
			toggle.setValue(effectiveValue).onChange((value) => {
				plugin.options![optKey] = value;
				this.ctx.onDirty();
			}),
		);
	}

	private renderNumberOption(
		setting: Setting,
		plugin: QuartzPluginEntry,
		optKey: string,
		schemaEntry: Record<string, unknown> | undefined,
		integerOnly: boolean,
	): void {
		const currentValue = plugin.options![optKey];

		setting.addText((text) =>
			text
				.setValue(
					currentValue !== undefined
						? stringifyValue(currentValue)
						: schemaEntry?.default !== undefined
							? stringifyValue(schemaEntry.default)
							: "",
				)
				.setPlaceholder(
					schemaEntry?.default !== undefined
						? stringifyValue(schemaEntry.default)
						: integerOnly
							? "0"
							: "0.0",
				)
				.onChange((value) => {
					const trimmed = value.trim();

					if (!trimmed) {
						plugin.options![optKey] = undefined;
						this.ctx.onDirty();
						setting.setErrorMessage(null);

						return;
					}

					const num = integerOnly
						? parseInt(trimmed, 10)
						: parseFloat(trimmed);

					if (isNaN(num)) {
						setting.setErrorMessage(
							integerOnly
								? "Must be a whole number."
								: "Must be a number.",
						);

						return;
					}

					const min = schemaEntry?.minimum as number | undefined;
					const max = schemaEntry?.maximum as number | undefined;

					if (min !== undefined && num < min) {
						setting.setErrorMessage(`Minimum value is ${min}.`);

						return;
					}

					if (max !== undefined && num > max) {
						setting.setErrorMessage(`Maximum value is ${max}.`);

						return;
					}

					setting.setErrorMessage(null);
					plugin.options![optKey] = num;
					this.ctx.onDirty();
				}),
		);
	}

	private renderArrayOption(
		setting: Setting,
		plugin: QuartzPluginEntry,
		optKey: string,
		schemaEntry: Record<string, unknown> | undefined,
	): void {
		const currentValue = plugin.options![optKey];
		const arr = Array.isArray(currentValue) ? currentValue : [];

		const itemType = (
			schemaEntry?.items as Record<string, unknown> | undefined
		)?.type as string | undefined;
		const isStringArray = !itemType || itemType === "string";

		if (isStringArray) {
			setting.addText((text) =>
				text
					.setValue(arr.join(", "))
					.setPlaceholder(
						schemaEntry?.default !== undefined
							? (schemaEntry.default as string[]).join(", ")
							: "item1, item2, item3",
					)
					.onChange((value) => {
						const items = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);

						plugin.options![optKey] =
							items.length > 0 ? items : undefined;
						setting.setErrorMessage(null);
						this.ctx.onDirty();
					}),
			);
		} else {
			this.renderJsonOption(setting, plugin, optKey);
		}
	}

	private renderJsonOption(
		setting: Setting,
		plugin: QuartzPluginEntry,
		optKey: string,
	): void {
		const currentValue = plugin.options![optKey];

		const jsonStr =
			currentValue !== undefined
				? JSON.stringify(currentValue, null, 2)
				: "";

		setting.addTextArea((textArea) =>
			textArea
				.setValue(jsonStr)
				.setPlaceholder("{}")
				.onChange((value) => {
					const trimmed = value.trim();

					if (!trimmed) {
						plugin.options![optKey] = undefined;
						setting.setErrorMessage(null);
						this.ctx.onDirty();

						return;
					}

					try {
						plugin.options![optKey] = JSON.parse(
							trimmed,
						) as unknown;
						setting.setErrorMessage(null);
						this.ctx.onDirty();
					} catch {
						setting.setErrorMessage("Invalid JSON.");
					}
				}),
		);
	}

	private renderStringOption(
		setting: Setting,
		plugin: QuartzPluginEntry,
		optKey: string,
		schemaEntry: Record<string, unknown> | undefined,
	): void {
		const currentValue = plugin.options![optKey];
		const enumValues = schemaEntry?.enum as string[] | undefined;

		if (enumValues && enumValues.length > 0) {
			setting.addDropdown((dropdown) => {
				dropdown.addOption("", "— Select —");

				for (const val of enumValues) {
					dropdown.addOption(val, val);
				}

				dropdown
					.setValue(
						typeof currentValue === "string" ? currentValue : "",
					)
					.onChange((value) => {
						plugin.options![optKey] = value || undefined;
						this.ctx.onDirty();
					});
			});

			return;
		}

		setting.addText((text) =>
			text
				.setValue(
					currentValue !== undefined
						? stringifyValue(currentValue)
						: "",
				)
				.setPlaceholder(
					schemaEntry?.default !== undefined
						? stringifyValue(schemaEntry.default)
						: "",
				)
				.onChange((value) => {
					const pattern = schemaEntry?.pattern as string | undefined;

					if (pattern && value.trim()) {
						try {
							const regex = new RegExp(pattern);

							if (!regex.test(value)) {
								setting.setErrorMessage(
									`Must match pattern: ${pattern}`,
								);

								return;
							}
						} catch {
							// Invalid regex in schema — skip validation
						}
					}

					const maxLength = schemaEntry?.maxLength as
						| number
						| undefined;

					if (maxLength !== undefined && value.length > maxLength) {
						setting.setErrorMessage(
							`Maximum length is ${maxLength}.`,
						);

						return;
					}

					setting.setErrorMessage(null);
					plugin.options![optKey] = value || undefined;
					this.ctx.onDirty();
				}),
		);
	}

	private renderLayoutControls(): void {
		const { plugin } = this.ctx;

		if (!plugin.layout) return;

		const layout = plugin.layout;

		new Setting(this.contentEl).setName("Layout").setHeading();

		const layoutSetting = new Setting(this.contentEl).setDesc(
			"Position, priority, and display mode for this plugin's component.",
		);

		layoutSetting.addDropdown((dropdown) => {
			dropdown.addOption("", "No position");

			for (const pos of LAYOUT_POSITIONS) {
				dropdown.addOption(pos, pos);
			}

			dropdown.setValue(layout.position ?? "").onChange((value) => {
				layout.position = (value as QuartzLayoutPosition) || undefined;
				this.ctx.onDirty();
			});
		});

		layoutSetting.addText((text) =>
			text
				.setPlaceholder("Priority")
				.setValue(
					layout.priority !== undefined
						? stringifyValue(layout.priority)
						: "",
				)
				.onChange((value) => {
					const num = parseInt(value, 10);
					layout.priority = isNaN(num) ? undefined : num;
					this.ctx.onDirty();
				}),
		);

		layoutSetting.addDropdown((dropdown) => {
			for (const mode of DISPLAY_MODES) {
				dropdown.addOption(mode, mode);
			}

			dropdown.setValue(layout.display ?? "all").onChange((value) => {
				layout.display = value as QuartzDisplayMode;
				this.ctx.onDirty();
			});
		});
	}
}
