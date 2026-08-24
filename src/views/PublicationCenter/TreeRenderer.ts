import { setIcon } from "obsidian";
import type { PublishStatus } from "src/publisher/types";
import { getSpecialFileType } from "src/publishFile/PublishFile";
import type { PublishFile } from "src/publishFile/PublishFile";
import { getMediaIcon, isTextMediaFile } from "src/utils/mediaTypes";
import {
	PublishCategory,
	SelectableCategory,
	TreeEntry,
	TreeState,
} from "src/views/PublicationCenter/TreeState";

type TreeNode = {
	name: string;
	path: string;
	kind: "folder" | "file";
	children: TreeNode[];
	category?: PublishCategory;
	file?: PublishFile;
};

type RenderOptions = {
	onFileClick: (path: string) => void;
	onStateChange: () => void;
};

const fileTypeIcons: Record<string, string> = {
	excalidraw: "pen-tool",
	canvas: "layout-dashboard",
	base: "database",
	markdown: "file-text",
};

function getFileIcon(name: string, path: string): string {
	const extension = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1)
		: "";
	const specialType = getSpecialFileType({ extension, path, name });

	if (specialType) {
		return fileTypeIcons[specialType] ?? "file";
	}

	return fileTypeIcons.markdown ?? "file-text";
}

const categoryLabels: Record<PublishCategory, string> = {
	unpublished: "Unpublished",
	changed: "Changed",
	deleted: "Deleted",
	published: "Published",
	"media-linked": "Linked media",
	"media-unlinked": "Unlinked media",
	arbitrary: "Custom files",
};

const categoryIcons: Record<PublishCategory, string> = {
	unpublished: "plus",
	changed: "pencil",
	deleted: "trash",
	published: "check",
	"media-linked": "paperclip",
	"media-unlinked": "alert-triangle",
	arbitrary: "package",
};

type FileRow = {
	row: HTMLElement;
	checkbox: HTMLInputElement;
	statsEl?: HTMLSpanElement;
};

type FolderRow = {
	row: HTMLElement;
	checkbox: HTMLInputElement;
	childrenEl: HTMLElement;
	toggleEl: HTMLButtonElement;
};

type CategoryRow = {
	headerEl: HTMLElement;
	childrenEl: HTMLElement;
	toggleEl: HTMLElement;
	checkbox: HTMLInputElement;
	labelEl: HTMLSpanElement;
	countEl: HTMLSpanElement;
	category: SelectableCategory;
};

export class PublicationTree {
	private fileRows = new Map<string, FileRow>();
	private folderRows = new Map<string, FolderRow>();
	private categoryRows = new Map<SelectableCategory, CategoryRow>();
	private categoryTrees = new Map<SelectableCategory, TreeNode>();
	private emptyFilterEl: HTMLDivElement | null = null;

	constructor(
		private containerEl: HTMLElement,
		private treeState: TreeState,
		private options: RenderOptions,
	) {}

	mount(status: PublishStatus): void {
		this.unmount();
		const visibleCategories = this.treeState.getVisibleCategories();
		const entries = buildEntries(status, visibleCategories);
		this.treeState.setEntries(entries);

		const entriesByCategory = new Map<SelectableCategory, TreeEntry[]>();
		for (const category of visibleCategories) {
			entriesByCategory.set(category, []);
		}
		for (const entry of entries) {
			entriesByCategory.get(entry.category)?.push(entry);
		}

		for (const category of visibleCategories) {
			const categoryEntries = entriesByCategory.get(category) ?? [];
			const tree = buildTree(categoryEntries);
			this.categoryTrees.set(category, tree);
			this.renderCategorySection(category, tree);
		}

		this.emptyFilterEl = this.containerEl.createDiv({
			cls: "tree-empty-filter",
			text: "No files match your search.",
		});

		this.update();
	}

	update(): void {
		for (const [path, row] of this.fileRows) {
			row.checkbox.checked = this.treeState.selectedFiles.has(path);
			row.row.classList.toggle(
				"tree-item-selected",
				row.checkbox.checked,
			);
		}

		for (const [path, row] of this.folderRows) {
			const folderState = this.treeState.getFolderSelectionState(path);
			row.checkbox.checked = folderState.checked;
			row.checkbox.indeterminate = folderState.indeterminate;
		}

		for (const [category, catRow] of this.categoryRows) {
			const count = this.treeState.getCategoryCount(category);
			const selected = this.treeState.getSelectedCount(category);
			catRow.countEl.setText(`(${count})`);
			catRow.headerEl.classList.toggle("qs-hidden", count === 0);
			catRow.childrenEl.classList.toggle("qs-hidden", count === 0);
			catRow.checkbox.checked = count > 0 && selected === count;
			catRow.checkbox.indeterminate = selected > 0 && selected < count;
		}

		const filterActive = !!this.treeState.filterText;
		let hasVisibleNodes = false;

		for (const [category, tree] of this.categoryTrees) {
			const catRow = this.categoryRows.get(category);
			if (!catRow) continue;

			if (this.treeState.getCategoryCount(category) === 0) continue;

			let categoryHasVisible = false;
			for (const node of tree.children) {
				const isVisible = this.updateVisibility(node, filterActive);
				if (isVisible) categoryHasVisible = true;
			}

			if (filterActive) {
				catRow.headerEl.classList.toggle(
					"tree-hidden",
					!categoryHasVisible,
				);
				catRow.childrenEl.classList.toggle(
					"tree-hidden",
					!categoryHasVisible,
				);
			}

			if (categoryHasVisible) hasVisibleNodes = true;
		}

		for (const [, catRow] of this.categoryRows) {
			const isExpanded =
				filterActive ||
				this.treeState.isFolderExpanded(
					`__category__${catRow.category}`,
				);
			setIcon(
				catRow.toggleEl,
				isExpanded ? "chevron-down" : "chevron-right",
			);
			if (
				!catRow.childrenEl.classList.contains("qs-hidden") ||
				!filterActive
			) {
				catRow.childrenEl.style.display = isExpanded ? "" : "none";
			}
		}

		for (const [path, row] of this.folderRows) {
			const isExpanded =
				filterActive || this.treeState.isFolderExpanded(path);
			setIcon(
				row.toggleEl,
				isExpanded ? "chevron-down" : "chevron-right",
			);
			row.childrenEl.style.display = isExpanded ? "" : "none";
		}

		if (this.emptyFilterEl) {
			const showEmpty = filterActive && !hasVisibleNodes;
			this.emptyFilterEl.classList.toggle("tree-hidden", !showEmpty);
		}
	}

	updateFileStats(path: string, added: number, removed: number): void {
		const row = this.fileRows.get(path);
		if (row?.statsEl) {
			row.statsEl.setText(`+${added} / -${removed}`);
		}
	}

	unmount(): void {
		this.containerEl.empty();
		this.fileRows.clear();
		this.folderRows.clear();
		this.categoryRows.clear();
		this.categoryTrees.clear();
		this.emptyFilterEl = null;
	}

	private renderCategorySection(
		category: SelectableCategory,
		tree: TreeNode,
	): void {
		const headerEl = this.containerEl.createDiv({
			cls: "tree-category-header",
		});

		const toggleEl = headerEl.createSpan({ cls: "tree-toggle" });

		const checkbox = headerEl.createEl("input", {
			type: "checkbox",
			cls: "tree-checkbox",
		});
		checkbox.addEventListener("change", (event) => {
			event.stopPropagation();
			const count = this.treeState.getCategoryCount(category);
			const selected = this.treeState.getSelectedCount(category);
			if (selected === count) {
				this.treeState.deselectCategory(category);
			} else {
				this.treeState.selectAll(category);
			}
			this.options.onStateChange();
		});

		const iconEl = headerEl.createSpan({ cls: "category-icon" });
		setIcon(iconEl, categoryIcons[category]);

		const labelEl = headerEl.createSpan({
			cls: "tree-label",
			text: categoryLabels[category],
		});

		const countEl = headerEl.createSpan({
			cls: "tree-category-count",
		});

		headerEl.addEventListener("click", (event) => {
			if (
				event.target === checkbox ||
				(event.target as HTMLElement).closest("input")
			)
				return;
			event.stopPropagation();
			this.treeState.toggleFolderExpanded(`__category__${category}`);
			this.options.onStateChange();
		});

		const childrenEl = this.containerEl.createDiv({
			cls: "tree-children",
		});

		this.categoryRows.set(category, {
			headerEl,
			childrenEl,
			toggleEl,
			checkbox,
			labelEl,
			countEl,
			category,
		});

		for (const node of tree.children) {
			this.renderNode(childrenEl, node, 1);
		}
	}

	private updateVisibility(node: TreeNode, filterActive: boolean): boolean {
		if (node.kind === "file") {
			const isVisible =
				!filterActive || this.treeState.matchesFilter(node.path);
			const row = this.fileRows.get(node.path);
			if (row) {
				row.row.classList.toggle("tree-hidden", !isVisible);
			}
			return isVisible;
		}

		for (const child of node.children) {
			this.updateVisibility(child, filterActive);
		}

		const isVisible = filterActive
			? hasMatchingDescendant(node, this.treeState)
			: true;
		const row = this.folderRows.get(node.path);
		if (row) {
			row.row.classList.toggle("tree-hidden", !isVisible);
		}

		return filterActive ? isVisible : true;
	}

	private renderNode(
		containerEl: HTMLElement,
		node: TreeNode,
		level: number,
	): void {
		if (node.kind === "folder") {
			const row = containerEl.createDiv({ cls: "tree-item tree-folder" });
			row.style.paddingLeft = `${level * 16}px`;

			const toggleButton = row.createEl("button", {
				cls: "tree-toggle",
			});
			toggleButton.addEventListener("click", (event) => {
				event.stopPropagation();
				this.treeState.toggleFolderExpanded(node.path);
				this.options.onStateChange();
			});

			const checkbox = row.createEl("input", {
				type: "checkbox",
				cls: "tree-checkbox",
			});
			checkbox.addEventListener("change", (event) => {
				event.stopPropagation();
				this.treeState.toggleFolder(node.path);
				this.options.onStateChange();
			});

			row.createSpan({ cls: "tree-label", text: node.name });

			const childrenContainer = containerEl.createDiv({
				cls: "tree-children",
			});

			this.folderRows.set(node.path, {
				row,
				checkbox,
				childrenEl: childrenContainer,
				toggleEl: toggleButton,
			});

			for (const child of node.children) {
				this.renderNode(childrenContainer, child, level + 1);
			}
			return;
		}

		const category = node.category ?? "published";

		const row = containerEl.createDiv({ cls: "tree-item tree-file" });
		row.style.paddingLeft = `${level * 16}px`;

		const checkbox = row.createEl("input", {
			type: "checkbox",
			cls: "tree-checkbox",
		});
		checkbox.addEventListener("change", (event) => {
			event.stopPropagation();
			this.treeState.toggleFile(node.path);
			this.options.onStateChange();
		});

		const fileIcon = row.createSpan({ cls: "tree-file-icon" });
		const iconName = category.startsWith("media-")
			? getMediaIcon(node.path)
			: getFileIcon(node.name, node.path);
		setIcon(fileIcon, iconName);

		const label = row.createSpan({ cls: "tree-label", text: node.name });
		label.addEventListener("click", (event) => {
			event.stopPropagation();
			this.treeState.toggleFile(node.path);
			this.options.onStateChange();
		});

		const diffButton = row.createEl("button", {
			cls: "tree-diff-button",
		});
		setIcon(diffButton, "file-diff");
		diffButton.setAttribute("aria-label", "View diff");
		diffButton.addEventListener("click", (event) => {
			event.stopPropagation();
			this.options.onFileClick(node.path);
		});
		if (
			(category.startsWith("media-") && !isTextMediaFile(node.path)) ||
			category === "arbitrary"
		) {
			diffButton.addClass("qs-hidden");
		}

		let statsEl: HTMLSpanElement | undefined;
		if (category === "changed") {
			statsEl = row.createSpan({ cls: "tree-diff-stats" });
		}

		const badge = row.createSpan({
			cls: `category-badge category-${category}`,
		});
		const icon = categoryIcons[category];
		if (icon) {
			const iconEl = badge.createSpan({ cls: "category-icon" });
			setIcon(iconEl, icon);
		}
		badge.createSpan({ text: categoryLabels[category] });

		this.fileRows.set(node.path, { row, checkbox, statsEl });
	}
}

function hasMatchingDescendant(node: TreeNode, treeState: TreeState): boolean {
	if (node.kind === "file") {
		return treeState.matchesFilter(node.path);
	}

	return node.children.some((child) =>
		hasMatchingDescendant(child, treeState),
	);
}

export function buildEntries(
	status: PublishStatus,
	visibleCategories: PublishCategory[],
): TreeEntry[] {
	const entries: TreeEntry[] = [];
	const visible = new Set(visibleCategories);

	if (visible.has("unpublished")) {
		for (const file of status.unpublished) {
			entries.push({
				path: file.getVaultPath(),
				category: "unpublished",
			});
		}
	}

	if (visible.has("changed")) {
		for (const file of status.changed) {
			entries.push({
				path: file.getVaultPath(),
				category: "changed",
			});
		}
	}

	if (visible.has("published")) {
		for (const file of status.published) {
			entries.push({
				path: file.getVaultPath(),
				category: "published",
			});
		}
	}

	if (visible.has("deleted")) {
		for (const path of status.deleted) {
			entries.push({
				path,
				category: "deleted",
			});
		}
	}

	if (visible.has("media-linked") || visible.has("media-unlinked")) {
		for (const entry of status.media) {
			const category = entry.linked ? "media-linked" : "media-unlinked";
			if (visible.has(category)) {
				entries.push({
					path: entry.vaultPath,
					category,
				});
			}
		}
	}

	if (visible.has("arbitrary")) {
		for (const entry of status.arbitrary) {
			entries.push({
				path: entry.vaultPath,
				category: "arbitrary",
			});
		}
	}

	return entries;
}

function buildTree(entries: TreeEntry[]): TreeNode {
	const root: TreeNode = {
		name: "",
		path: "",
		kind: "folder",
		children: [],
	};
	const folderMap = new Map<string, TreeNode>([["", root]]);

	for (const entry of entries) {
		const segments = entry.path.split("/");
		let currentPath = "";
		let parentNode = root;

		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index];
			if (!segment) continue;
			const isFile = index === segments.length - 1;
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;

			if (isFile) {
				const fileNode: TreeNode = {
					name: segment,
					path: currentPath,
					kind: "file",
					children: [],
					category: entry.category,
				};
				parentNode.children.push(fileNode);
			} else {
				const existing = folderMap.get(currentPath);
				if (existing) {
					parentNode = existing;
					continue;
				}

				const folderNode: TreeNode = {
					name: segment,
					path: currentPath,
					kind: "folder",
					children: [],
				};
				folderMap.set(currentPath, folderNode);
				parentNode.children.push(folderNode);
				parentNode = folderNode;
			}
		}
	}

	sortTree(root);
	return root;
}

function sortTree(node: TreeNode): void {
	node.children.sort((left, right) => {
		if (left.kind !== right.kind) {
			return left.kind === "folder" ? -1 : 1;
		}
		return left.name.localeCompare(right.name);
	});

	for (const child of node.children) {
		if (child.kind === "folder") {
			sortTree(child);
		}
	}
}
