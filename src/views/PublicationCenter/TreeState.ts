export type PublishCategory =
	| "unpublished"
	| "changed"
	| "deleted"
	| "published"
	| "media-linked"
	| "media-unlinked"
	| "arbitrary";

export type SelectableCategory = PublishCategory;

export type TreeEntry = {
	path: string;
	category: PublishCategory;
};

export type TreeTab = "publish" | "advanced";

export class TreeState {
	selectedFiles = new Set<string>();
	expandedFolders = new Set<string>();
	filterText = "";
	tab: TreeTab = "publish";
	linkedMediaFiles = new Map<string, Set<string>>();
	private categoryFiles = new Map<SelectableCategory, Set<string>>();
	private folderFiles = new Map<string, Set<string>>();
	private fileCategories = new Map<string, PublishCategory>();
	private knownFiles = new Set<string>();
	private autoSelectedMedia = new Set<string>();

	setEntries(entries: TreeEntry[]): void {
		this.categoryFiles = new Map<SelectableCategory, Set<string>>([
			["unpublished", new Set<string>()],
			["changed", new Set<string>()],
			["deleted", new Set<string>()],
			["published", new Set<string>()],
			["media-linked", new Set<string>()],
			["media-unlinked", new Set<string>()],
			["arbitrary", new Set<string>()],
		]);
		this.folderFiles = new Map<string, Set<string>>();
		this.fileCategories = new Map<string, PublishCategory>();

		for (const entry of entries) {
			this.fileCategories.set(entry.path, entry.category);
			this.categoryFiles.get(entry.category)?.add(entry.path);

			const segments = entry.path.split("/");
			let currentPath = "";

			for (let index = 0; index < segments.length - 1; index += 1) {
				const segment = segments[index];
				if (!segment) continue;
				currentPath = currentPath
					? `${currentPath}/${segment}`
					: segment;
				const files = this.folderFiles.get(currentPath) ?? new Set();
				files.add(entry.path);
				this.folderFiles.set(currentPath, files);
			}
		}

		const filterSet =
			this.knownFiles.size > 0
				? this.knownFiles
				: new Set(this.fileCategories.keys());
		this.selectedFiles = new Set(
			[...this.selectedFiles].filter((path) => filterSet.has(path)),
		);

		if (this.expandedFolders.size === 0) {
			for (const folder of this.folderFiles.keys()) {
				const isTopLevel = !folder.includes("/");
				if (isTopLevel) this.expandedFolders.add(folder);
			}
		}
	}

	setKnownFiles(paths: Iterable<string>): void {
		this.knownFiles = new Set(paths);
		this.selectedFiles = new Set(
			[...this.selectedFiles].filter((path) => this.knownFiles.has(path)),
		);
	}

	setLinkedMediaFiles(map: Map<string, Set<string>>): void {
		this.linkedMediaFiles = map;
	}

	getVisibleCategories(): PublishCategory[] {
		if (this.tab === "advanced") {
			return ["media-linked", "media-unlinked", "arbitrary"];
		}

		return ["unpublished", "changed", "published", "deleted"];
	}

	toggleFile(path: string): void {
		if (this.selectedFiles.has(path)) {
			this.selectedFiles.delete(path);
			if (this.tab === "publish") {
				this.autoDeselectLinkedMedia(path);
			} else {
				this.autoSelectedMedia.delete(path);
			}
			return;
		}
		this.selectedFiles.add(path);
		if (this.tab === "publish") {
			this.autoSelectLinkedMedia(path);
		} else {
			this.autoSelectedMedia.delete(path);
		}
	}

	toggleFolder(path: string): void {
		const files = this.folderFiles.get(path);
		if (!files || files.size === 0) return;

		const allSelected = [...files].every((filePath) =>
			this.selectedFiles.has(filePath),
		);

		for (const filePath of files) {
			if (allSelected) {
				this.selectedFiles.delete(filePath);
				if (this.tab === "publish") {
					this.autoDeselectLinkedMedia(filePath);
				} else {
					this.autoSelectedMedia.delete(filePath);
				}
			} else {
				this.selectedFiles.add(filePath);
				if (this.tab === "publish") {
					this.autoSelectLinkedMedia(filePath);
				} else {
					this.autoSelectedMedia.delete(filePath);
				}
			}
		}
	}

	selectAll(category: SelectableCategory): void {
		const files = this.categoryFiles.get(category);
		if (!files) return;
		for (const path of files) {
			this.selectedFiles.add(path);
			if (this.tab === "publish") {
				this.autoSelectLinkedMedia(path);
			} else {
				this.autoSelectedMedia.delete(path);
			}
		}
	}

	deselectCategory(category: SelectableCategory): void {
		const files = this.categoryFiles.get(category);
		if (!files) return;
		for (const path of files) {
			this.selectedFiles.delete(path);
			if (this.tab === "publish") {
				this.autoDeselectLinkedMedia(path);
			} else {
				this.autoSelectedMedia.delete(path);
			}
		}
	}

	deselectAll(): void {
		this.selectedFiles.clear();
		this.autoSelectedMedia.clear();
	}

	getSelectedFiles(): string[] {
		return [...this.selectedFiles];
	}

	getSelectedCount(category: SelectableCategory): number {
		let count = 0;
		for (const path of this.selectedFiles) {
			if (this.fileCategories.get(path) === category) {
				count += 1;
			}
		}
		return count;
	}

	getCategory(path: string): PublishCategory | undefined {
		return this.fileCategories.get(path);
	}

	getFolderSelectionState(path: string): {
		checked: boolean;
		indeterminate: boolean;
	} {
		const files = this.folderFiles.get(path);
		if (!files || files.size === 0) {
			return { checked: false, indeterminate: false };
		}

		let selectedCount = 0;

		for (const filePath of files) {
			if (this.selectedFiles.has(filePath)) {
				selectedCount += 1;
			}
		}

		if (selectedCount === 0) {
			return { checked: false, indeterminate: false };
		}

		if (selectedCount === files.size) {
			return { checked: true, indeterminate: false };
		}

		return { checked: false, indeterminate: true };
	}

	matchesFilter(path: string): boolean {
		if (!this.filterText) return true;

		return path.toLowerCase().includes(this.filterText.toLowerCase());
	}

	getCategoryCount(category: SelectableCategory): number {
		return this.categoryFiles.get(category)?.size ?? 0;
	}

	isFolderExpanded(path: string): boolean {
		return this.expandedFolders.has(path);
	}

	toggleFolderExpanded(path: string): void {
		if (this.expandedFolders.has(path)) {
			this.expandedFolders.delete(path);
			return;
		}
		this.expandedFolders.add(path);
	}

	private autoSelectLinkedMedia(filePath: string): void {
		const linked = this.linkedMediaFiles.get(filePath);
		if (!linked || linked.size === 0) return;
		for (const mediaPath of linked) {
			this.selectedFiles.add(mediaPath);
			this.autoSelectedMedia.add(mediaPath);
		}
	}

	private autoDeselectLinkedMedia(filePath: string): void {
		const linked = this.linkedMediaFiles.get(filePath);
		if (!linked || linked.size === 0) return;
		for (const mediaPath of linked) {
			if (
				this.autoSelectedMedia.has(mediaPath) &&
				!this.isMediaLinkedBySelectedNotes(mediaPath, filePath)
			) {
				this.selectedFiles.delete(mediaPath);
				this.autoSelectedMedia.delete(mediaPath);
			}
		}
	}

	private isMediaLinkedBySelectedNotes(
		mediaPath: string,
		excludeNote?: string,
	): boolean {
		for (const [notePath, mediaLinks] of this.linkedMediaFiles) {
			if (excludeNote && notePath === excludeNote) continue;
			if (!this.selectedFiles.has(notePath)) continue;
			if (mediaLinks.has(mediaPath)) return true;
		}
		return false;
	}
}
