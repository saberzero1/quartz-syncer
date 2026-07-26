import { setIcon } from "obsidian";
import type { PublishStatus } from "src/publisher/types";
import type { PublishFile } from "src/publishFile/PublishFile";
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

const selectableCategories: ReadonlySet<PublishCategory> = new Set([
	"unpublished",
	"changed",
	"deleted",
]);

const categoryLabels: Record<PublishCategory, string> = {
	unpublished: "Unpublished",
	changed: "Changed",
	deleted: "Deleted",
	published: "Published",
};

const categoryIcons: Partial<Record<PublishCategory, string>> = {
	unpublished: "plus",
	changed: "pencil",
	deleted: "trash",
};

export function renderPublicationTree(
	containerEl: HTMLElement,
	treeState: TreeState,
	status: PublishStatus,
	options: RenderOptions,
): void {
	containerEl.empty();
	const entries = buildEntries(status);
	treeState.setEntries(entries);
	const tree = buildTree(entries);

	for (const node of tree.children) {
		renderNode(containerEl, node, 0, treeState, options);
	}
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

function renderNode(
	containerEl: HTMLElement,
	node: TreeNode,
	level: number,
	treeState: TreeState,
	options: RenderOptions,
): void {
	if (node.kind === "folder") {
		const row = containerEl.createDiv({ cls: "tree-item tree-folder" });
		row.style.paddingLeft = `${level * 16}px`;

		const toggleButton = row.createEl("button", {
			cls: "tree-toggle",
		});
		setIcon(
			toggleButton,
			treeState.isFolderExpanded(node.path)
				? "chevron-down"
				: "chevron-right",
		);
		toggleButton.addEventListener("click", (event) => {
			event.stopPropagation();
			treeState.toggleFolderExpanded(node.path);
			options.onStateChange();
		});

		const checkbox = row.createEl("input", {
			type: "checkbox",
			cls: "tree-checkbox",
		});
		const folderState = treeState.getFolderSelectionState(node.path);
		checkbox.checked = folderState.checked;
		checkbox.indeterminate = folderState.indeterminate;
		checkbox.addEventListener("change", (event) => {
			event.stopPropagation();
			treeState.toggleFolder(node.path);
			options.onStateChange();
		});

		row.createSpan({ cls: "tree-label", text: node.name });

		if (treeState.isFolderExpanded(node.path)) {
			const childrenContainer = containerEl.createDiv({
				cls: "tree-children",
			});
			for (const child of node.children) {
				renderNode(
					childrenContainer,
					child,
					level + 1,
					treeState,
					options,
				);
			}
		}
		return;
	}

	const row = containerEl.createDiv({ cls: "tree-item tree-file" });
	row.style.paddingLeft = `${level * 16}px`;

	const checkbox = row.createEl("input", {
		type: "checkbox",
		cls: "tree-checkbox",
	});
	const category = node.category ?? "published";
	const isSelectable = selectableCategories.has(category);
	checkbox.disabled = !isSelectable;
	checkbox.checked = treeState.selectedFiles.has(node.path);
	checkbox.addEventListener("change", (event) => {
		event.stopPropagation();
		if (!isSelectable) return;
		treeState.toggleFile(node.path);
		options.onStateChange();
	});

	const label = row.createSpan({ cls: "tree-label", text: node.name });
	label.addEventListener("click", () => {
		options.onFileClick(node.path);
	});

	const badge = row.createSpan({
		cls: `category-badge category-${category}`,
	});
	const icon = categoryIcons[category];
	if (icon) {
		const iconEl = badge.createSpan({ cls: "category-icon" });
		setIcon(iconEl, icon);
	}
	badge.createSpan({ text: categoryLabels[category] });
}

export function renderCategoryControls(
	containerEl: HTMLElement,
	treeState: TreeState,
	category: SelectableCategory,
	options: { onStateChange: () => void },
): void {
	const row = containerEl.createDiv({ cls: "category-controls" });
	row.createSpan({ text: categoryLabels[category] });

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
}
