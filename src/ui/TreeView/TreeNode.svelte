<script lang="ts" context="module">
	// retain module scoped expansion state for each tree node
	export const _expansionState: Record<string, boolean> = {
		/* treeNodeId: expanded <boolean> */
	};
</script>

<!-- TreeView with checkbox https://svelte.dev/repl/eca6f6392e294247b4f379fde3069274?version=3.46.6 -->

<script lang="ts">
	import { createEventDispatcher } from "svelte";

	import TreeNode from "src/models/TreeNode";
	import Icon from "src/ui/Icon.svelte";
	export let tree: TreeNode;
	export let readOnly: boolean = false;
	export let enableShowDiff: boolean = false;
	const dispatch = createEventDispatcher();

	let { isRoot } = tree;

	let expanded = _expansionState[tree.path] || false;

	/**
	 * Toggle the expansion state of the current node.
	 * This function updates the expanded state and toggles the arrow icon.
	 * It is called when the user clicks on the node's name or the arrow icon.
	 */
	const toggleExpansion = () => {
		expanded = _expansionState[tree.path] = !expanded;
	};

	$: arrowDown = expanded;

	/**
	 * Toggle the check state of the current node.
	 * This function updates the node's checked state and emits a 'toggle' event
	 * to notify the parent component to rebuild the entire tree's state.
	 */
	const toggleCheck = () => {
		// update the current node's state here, the UI only need to represent it,
		// don't need to bind the check state to the UI
		tree.checked = !tree.checked;

		// emit node 'toggle' event, notify parent compnent to rebuild the entire tree's state
		dispatch("toggle", {
			node: tree,
		});
	};

	/**
	 * Dispatch a 'toggle' event when the checkbox is clicked.
	 * This is used to update the tree's state in the parent component.
	 *
	 * @param e - The event object containing the node that was toggled.
	 */
	const dispatchChecked = (e: { detail: { node: TreeNode } }) => {
		dispatch("toggle", { node: e.detail.node });
	};

	/**
	 * Set the indeterminate state of the checkbox.
	 * This is used to indicate that the node's children are in a mixed state.
	 *
	 * @param node - The HTMLInputElement representing the checkbox.
	 * @param params - An object containing the indeterminate state.
	 */
	const setIndeterminate = (
		node: HTMLInputElement,
		params: { indeterminate: boolean },
	) => {
		node.indeterminate = params.indeterminate;
	};

	/**
	 * Show the diff for the current node.
	 * This function dispatches a 'showDiff' event with the current node.
	 *
	 * @param e - The MouseEvent that triggered the function.
	 */
	const showDiff = (e: MouseEvent) => {
		e.stopPropagation();
		dispatch("showDiff", { node: tree });
	};

	/**
	 * Dispatch a 'showDiff' event with the current node.
	 * This is used to notify the parent component to show the diff for the node.
	 *
	 * @param node - The TreeNode for which to show the diff.
	 */
	const dispatchShowDiff = (node: TreeNode) => {
		dispatch("showDiff", { node });
	};
</script>

<ul class:isRoot>
	<li>
		{#if tree.children}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<span>
				<span on:click={toggleExpansion} class="arrow" class:arrowDown>
					<Icon name="chevron-right" />
				</span>
				{#if !isRoot}
					<Icon name="folder" />
					{#if !readOnly}
						<input
							type="checkbox"
							data-label={tree.name}
							checked={tree.checked}
							use:setIndeterminate={{
								indeterminate: tree.indeterminate,
							}}
							on:click={toggleCheck}
						/>
					{/if}
					<span on:click={toggleExpansion}>{tree.name}</span>
				{:else}
					{#if !readOnly}
						<input
							type="checkbox"
							data-label={tree.name}
							checked={tree.checked}
							use:setIndeterminate={{
								indeterminate: tree.indeterminate,
							}}
							on:click={toggleCheck}
						/>
					{/if}

					<span class="root-header" on:click={toggleExpansion}
						>{tree.name}</span
					>
				{/if}
			</span>
			{#if expanded}
				{#each tree.children as child}
					<svelte:self
						on:toggle={dispatchChecked}
						on:showDiff={(e) => dispatchShowDiff(e.detail.node)}
						{enableShowDiff}
						{readOnly}
						tree={child}
					/>
				{/each}
			{/if}
		{:else if !isRoot}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<span>
				<span class="no-arrow" />
				<Icon name="file" />
				{#if !readOnly}
					<input
						type="checkbox"
						data-label={tree.name}
						checked={tree.checked}
						use:setIndeterminate={{
							indeterminate: tree.indeterminate,
						}}
						on:click={toggleCheck}
					/>
				{/if}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<span on:click={toggleExpansion}>{tree.name}</span>
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				{#if enableShowDiff}
					<span
						title="Show changes"
						class="quartz-syncer-icon-diff"
						on:click={showDiff}
					>
						<Icon name="file-diff" />
					</span>
				{/if}
			</span>
		{/if}
	</li>
</ul>
