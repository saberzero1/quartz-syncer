<script lang="ts">
	import { getIcon, ProgressBarComponent } from "obsidian";
	import TreeNode from "src/models/TreeNode";
	import {
		IPublishStatusManager,
		PublishStatus,
	} from "src/publisher/PublishStatusManager";
	import { LoadingController } from "src/models/ProgressBar";
	import TreeView from "src/ui/TreeView/TreeView.svelte";
	import { onMount } from "svelte";
	import Publisher from "src/publisher/Publisher";
	import Icon from "src/ui/Icon.svelte";
	import { CompiledPublishFile } from "src/publishFile/PublishFile";

	export let publishStatusManager: IPublishStatusManager;
	export let publisher: Publisher;
	export let showDiff: (path: string) => void;
	export let close: () => void;

	let publishStatus: PublishStatus;
	let showPublishingView: boolean = false;
	let progressText = "Preparing to load...";
	let progressIndexText = "Notes processed: 0/0";
	let controller: LoadingController;
	let publishController: LoadingController;

	/**
	 * The tree representing the published notes.
	 * It is built from the publish status and updated reactively.
	 */
	async function getPublishStatus() {
		publishStatus = await publishStatusManager.getPublishStatus(controller);
	}

	onMount(getPublishStatus);

	/**
	 * The tree representing the published notes.
	 * It is built from the publish status and updated reactively.
	 *
	 * @param tree - The root node of the tree.
	 * @param filePath - The path to insert into the tree.
	 */
	function insertIntoTree(tree: TreeNode, filePath: string): void {
		let currentNode = tree;

		const pathComponents = filePath.split("/");

		// Check if the file is a remote-only file (deleted note)
		// These files are not present in the local vault,
		// and are therefore automatically marked for deletion.
		const isRemoteOnlyFile = publishStatus.deletedNotePaths.some(
			(note) => note.path === filePath,
		);

		for (let i = 0; i < pathComponents.length; i++) {
			const part = pathComponents[i];

			if (!currentNode.children) {
				currentNode.children = [];
			}

			let childNode = currentNode.children.find(
				(child) => child.name === part,
			);

			if (!childNode) {
				childNode = {
					name: part,
					isRoot: false,
					path: pathComponents.slice(0, i + 1).join("/"),
					indeterminate: false,
					checked: isRemoteOnlyFile,
				};
				currentNode.children.push(childNode);
			}

			currentNode = childNode;
		}
	}

	/**
	 * Converts an array of file paths into a tree structure.
	 * Each path is split by '/' and inserted into the tree.
	 *
	 * @param filePaths - An array of file paths to convert into a tree.
	 * @param rootName - The name of the root node in the tree.
	 * @returns A TreeNode representing the root of the tree.
	 */
	function filePathsToTree(
		filePaths: string[],
		rootName: string = "root",
	): TreeNode {
		const root: TreeNode = {
			name: rootName,
			isRoot: true,
			path: "/",
			indeterminate: false,
			checked: false,
		};

		for (const filePath of filePaths) {
			insertIntoTree(root, filePath);
		}

		return root;
	}

	/**
	 * A Svelte action that initializes a progress bar component
	 * and provides methods to update its progress and text.
	 *
	 * @param node - The HTML element to attach the progress bar to.
	 * @returns An object with a destroy method to clean up the action.
	 */
	function loadingProgressBar(node: HTMLElement) {
		const progressBar = new ProgressBarComponent(node);

		controller = {
			setProgress: (percentage) => {
				progressBar.setValue(percentage);
			},
			setIndexText: (indexText) => {
				progressIndexText = indexText;
			},
			setText: (message) => {
				progressText = message;
			},
		};

		return {
			destroy() {},
		};
	}

	/**
	 * A Svelte action that initializes a progress bar component
	 * specifically for the publishing process.
	 * It provides methods to update the progress of the publishing action.
	 *
	 * @param node - The HTML element to attach the progress bar to.
	 * @returns An object with a destroy method to clean up the action.
	 */
	function publishProgressBarAction(node: HTMLElement) {
		const progressBar = new ProgressBarComponent(node);

		publishController = {
			setProgress: (progress) => {
				progressBar.setValue(progress);
			},
			setIndexText: () => {},
			setText: () => {},
		};

		return {
			destroy() {},
		};
	}

	/**
	 * Returns an icon element with the specified name.
	 * If the icon is not found, it returns null.
	 *
	 * @returns An HTML element representing the icon, or null if not found.
	 */
	const rotatingCog = () => {
		let cog = getIcon("cog");
		cog?.classList.add("quartz-syncer-rotate", "quartz-syncer-cog");

		return cog;
	};

	$: publishedNotesTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.publishedNotes.map((note) => note.getVaultPath()),
			"Unchanged notes" +
				(publishStatus.publishedNotes.length > 0
					? ` (${
							publishStatus.publishedNotes.length === 1
								? "1 note"
								: `${publishStatus.publishedNotes.length} notes`
						})`
					: ""),
		);

	$: changedNotesTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.changedNotes.map((note) => note.getVaultPath()),
			"Changed notes" +
				(publishStatus.changedNotes.length > 0
					? ` (${
							publishStatus.changedNotes.length === 1
								? "1 note"
								: `${publishStatus.changedNotes.length} notes`
						})`
					: ""),
		);

	$: deletedNoteTree =
		publishStatus &&
		filePathsToTree(
			[
				...publishStatus.deletedNotePaths,
				...publishStatus.deletedBlobPaths,
			].map((path) => path.path),
			"Published notes (select to unpublish)" +
				(publishStatus.changedNotes.length +
					publishStatus.publishedNotes.length >
				0
					? ` (${
							publishStatus.changedNotes.length +
								publishStatus.publishedNotes.length ===
							1
								? "1 note"
								: `${
										publishStatus.changedNotes.length +
										publishStatus.publishedNotes.length
									} notes`
						})`
					: ""),
		);

	$: unpublishedNoteTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.unpublishedNotes.map((note) => note.getVaultPath()),
			"Unpublished notes" +
				(publishStatus.unpublishedNotes.length > 0
					? ` (${
							publishStatus.unpublishedNotes.length === 1
								? "1 note"
								: `${publishStatus.unpublishedNotes.length} notes`
						})`
					: ""),
		);

	$: publishProgress =
		((publishedPaths.length + failedPublish.length) /
			(unpublishedToPublish.length +
				changedToPublish.length +
				pathsToDelete.length)) *
		100;

	$: publishController?.setProgress(publishProgress);

	/**
	 * Traverses the tree and collects the paths of all leaf nodes that are checked.
	 * This is used to determine which notes are marked for publishing.
	 *
	 * @param tree - The root node of the tree to traverse.
	 * @returns An array of paths for the checked leaf nodes.
	 */
	const traverseTree = (tree: TreeNode): Array<string> => {
		const paths: Array<string> = [];

		if (tree.children) {
			for (const child of tree.children) {
				paths.push(...traverseTree(child));
			}
		} else {
			if (tree.checked) {
				paths.push(tree.path);
			}
		}

		return paths;
	};

	let unpublishedToPublish: Array<CompiledPublishFile> = [];
	let changedToPublish: Array<CompiledPublishFile> = [];
	let pathsToDelete: Array<string> = [];

	let processingPaths: Array<string> = [];
	let publishedPaths: Array<string> = [];
	let failedPublish: Array<string> = [];

	const publishMarkedNotes = async () => {
		if (!unpublishedNoteTree || !changedNotesTree) return;

		if (!publishStatus) {
			throw new Error("Publish status is undefined");
		}

		const unpublishedPaths = traverseTree(unpublishedNoteTree!);
		const changedPaths = traverseTree(changedNotesTree!);

		pathsToDelete = traverseTree(deletedNoteTree!);

		const notesToDelete = pathsToDelete.filter((path) =>
			publishStatus.deletedNotePaths.some((p) => p.path === path),
		);

		const blobsToDelete = pathsToDelete.filter((path) =>
			publishStatus.deletedBlobPaths.some((p) => p.path === path),
		);

		unpublishedToPublish =
			publishStatus.unpublishedNotes.filter((note) =>
				unpublishedPaths.includes(note.getVaultPath()),
			) ?? [];

		changedToPublish =
			publishStatus?.changedNotes.filter((note) =>
				changedPaths.includes(note.getVaultPath()),
			) ?? [];

		showPublishingView = true;

		const allNotesToPublish = unpublishedToPublish.concat(changedToPublish);

		processingPaths = [
			...allNotesToPublish.map((note) => note.getVaultPath()),
		];
		await publisher.publishBatch(allNotesToPublish);

		publishedPaths = [...processingPaths];
		processingPaths = [];

		const allPathsToDelete = [...notesToDelete, ...blobsToDelete];
		if (allPathsToDelete.length > 0) {
			processingPaths = [...allPathsToDelete];
			await publisher.deleteBatch(allPathsToDelete);

			publishedPaths = [...publishedPaths, ...allPathsToDelete];
			processingPaths = [];
		}
	};

	const emptyNode: TreeNode = {
		name: "",
		isRoot: false,
		path: "",
		indeterminate: false,
		checked: false,
	};
</script>

<div>
	{#if publishStatus}
		<hr class="quartz-syncer-publisher-title-separator" />
	{/if}
	{#if !publishStatus}
		<div class="quartz-syncer-publisher-loading-msg">
			<div
				use:loadingProgressBar
				class="quartz-syncer-progress-bar-container"
			/>
			<div class="quartz-syncer-progress-bar-text">
				{progressIndexText}
			</div>
			<div class="quartz-syncer-progress-bar-text">{progressText}</div>
		</div>
	{:else if !showPublishingView}
		<TreeView tree={unpublishedNoteTree ?? emptyNode} {showDiff} />

		<TreeView
			tree={changedNotesTree ?? emptyNode}
			{showDiff}
			enableShowDiff={true}
		/>

		<TreeView tree={deletedNoteTree ?? emptyNode} {showDiff} />

		<TreeView
			readOnly={true}
			tree={publishedNotesTree ?? emptyNode}
			{showDiff}
		/>

		<hr class="quartz-syncer-publisher-footer-separator" />

		<div class="quartz-syncer-publisher-footer">
			<button
				class="quartz-syncer-publisher-button"
				on:click={publishMarkedNotes}>PUBLISH SELECTED CHANGES</button
			>
		</div>
	{:else}
		<div>
			<div class="quartz-syncer-publisher-callout">
				<div class="quartz-syncer-publisher-callout-title-inner">
					Publishing Notes
				</div>
				<div>
					{`${publishedPaths.length} of ${
						unpublishedToPublish.length +
						changedToPublish.length +
						pathsToDelete.length
					} notes published`}
				</div>

				{#if failedPublish.length > 0}
					<div>
						{`(${failedPublish.length} failed)`}
					</div>
				{/if}
				<div class="quartz-syncer-publisher-loading-container">
					<div
						use:publishProgressBarAction
						class="quartz-syncer-progress-bar-container"
					/>
				</div>
			</div>

			{#each unpublishedToPublish.concat(changedToPublish) as note}
				<div class="quartz-syncer-publisher-note-list">
					{#if processingPaths.includes(note.getVaultPath())}
						{@html rotatingCog()?.outerHTML}
					{:else if publishedPaths.includes(note.getVaultPath())}
						<Icon name="check" />
					{:else if failedPublish.includes(note.getVaultPath())}
						<Icon name="cross" />
					{:else}
						<Icon name="clock" />
					{/if}
					{note.file.name}
					{#if publishedPaths.includes(note.getVaultPath())}
						<span class="quartz-syncer-publisher-published">
							- PUBLISHED</span
						>
					{/if}
				</div>
			{/each}

			{#each pathsToDelete as path}
				<div class="quartz-syncer-publisher-note-list">
					{#if processingPaths.includes(path)}
						{@html rotatingCog()?.outerHTML}
					{:else if publishedPaths.includes(path)}
						<Icon name="check" />
					{:else}
						<Icon name="clock" />
					{/if}
					{path.split("/").last()}

					{#if publishedPaths.includes(path)}
						<span class="quartz-syncer-publisher-deleted">
							- DELETED</span
						>
					{/if}
				</div>
			{/each}

			<hr class="quartz-syncer-publisher-footer-separator" />

			<div class="quartz-syncer-publisher-footer">
				<button class="quartz-syncer-publisher-button" on:click={close}
					>DONE</button
				>
			</div>
		</div>
	{/if}
</div>
