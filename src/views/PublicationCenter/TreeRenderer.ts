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
	"media-linked": "Linked",
	"media-unlinked": "Unlinked",
	arbitrary: "Custom",
};

const categoryIcons: Partial<Record<PublishCategory, string>> = {
	unpublished: "plus",
	changed: "pencil",
	deleted: "trash",
	"media-linked": "paperclip",
	"media-unlinked": "alert-triangle",
	arbitrary: "package",
};

type FileRow = {
	row: HTMLElement;
	checkbox: HTMLInputElement;
};

type FolderRow = {
	row: HTMLElement;
	checkbox: HTMLInputElement;
	childrenEl: HTMLElement;
	toggleEl: HTMLButtonElement;
};

export class PublicationTree {
	private fileRows = new Map<string, FileRow>();
	private folderRows = new Map<string, FolderRow>();
	private treeRoot: TreeNode | null = null;
	private emptyFilterEl: HTMLDivElement | null = null;

	constructor(
		private containerEl: HTMLElement,
		private treeState: TreeState,
		private options: RenderOptions,
	) {}

	mount(status: PublishStatus): void {
		this.unmount();
		const entries = buildEntries(status);
		this.treeState.setEntries(entries);
		this.treeRoot = buildTree(entries);

		for (const node of this.treeRoot.children) {
			this.renderNode(this.containerEl, node, 0);
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
		}

		for (const [path, row] of this.folderRows) {
			const folderState = this.treeState.getFolderSelectionState(path);
			row.checkbox.checked = folderState.checked;
			row.checkbox.indeterminate = folderState.indeterminate;
		}

		if (!this.treeRoot) return;

		const filterActive = !!this.treeState.filterText;
		let hasVisibleNodes = false;
		for (const node of this.treeRoot.children) {
			const isVisible = this.updateVisibility(node, filterActive);
			if (isVisible) hasVisibleNodes = true;
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

	unmount(): void {
		this.containerEl.empty();
		this.fileRows.clear();
		this.folderRows.clear();
		this.treeRoot = null;
		this.emptyFilterEl = null;
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
			diffButton.style.display = "none";
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

		this.fileRows.set(node.path, { row, checkbox });
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

function buildEntries(status: PublishStatus): TreeEntry[] {
	const entries: TreeEntry[] = [];

	for (const file of status.unpublished) {
		entries.push({
			path: file.getVaultPath(),
			category: "unpublished",
		});
	}

	for (const file of status.changed) {
		entries.push({
			path: file.getVaultPath(),
			category: "changed",
		});
	}

	for (const file of status.published) {
		entries.push({
			path: file.getVaultPath(),
			category: "published",
		});
	}

	for (const path of status.deleted) {
		entries.push({
			path,
			category: "deleted",
		});
	}

	for (const entry of status.media) {
		entries.push({
			path: entry.vaultPath,
			category: entry.linked ? "media-linked" : "media-unlinked",
		});
	}

	for (const entry of status.arbitrary) {
		entries.push({
			path: entry.vaultPath,
			category: "arbitrary",
		});
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

export function renderCategoryControls(
	containerEl: HTMLElement,
	treeState: TreeState,
	category: SelectableCategory,
	options: { onStateChange: () => void },
): HTMLSpanElement {
	const row = containerEl.createDiv({ cls: "category-controls" });
	const count = treeState.getCategoryCount(category);
	const label = row.createSpan({
		text: `${categoryLabels[category]} (${count})`,
	});

	const selectButton = row.createEl("button", {
		cls: "category-action",
		text: "Select all",
	});
	selectButton.addEventListener("click", () => {
		treeState.selectAll(category);
		options.onStateChange();
	});

	const deselectButton = row.createEl("button", {
		cls: "category-action",
		text: "Deselect all",
	});
	deselectButton.addEventListener("click", () => {
		treeState.deselectCategory(category);
		options.onStateChange();
	});

	return label;
}
