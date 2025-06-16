<script lang="ts">
	import Node from "src/ui/TreeView/TreeNode.svelte";
	import TreeNode from "src/models/TreeNode";

	export let tree: TreeNode;
	export let readOnly: boolean = false;
	export let enableShowDiff: boolean = false;
	export let showDiff: (path: string) => void;

	const treeMap: Record<string, TreeNode> = {};

	/**
	 * Initialize the treeMap with the parent-child relationships.
	 * This is used to quickly find the parent of a node when rebuilding the tree.
	 *
	 * @param tree - The root node of the tree.
	 */
	function initTreeMap(tree: TreeNode) {
		if (tree.children) {
			for (const child of tree.children) {
				treeMap[child.path] = tree;
				initTreeMap(child);
			}
		}
	}

	initTreeMap(tree);

	/**
	 * Rebuild the children of a node based on its checked state.
	 * If checkAsParent is true, the children will inherit the parent's checked state.
	 * If false, the children will only be updated based on their own checked state.
	 *
	 * @param node - The node whose children are to be rebuilt.
	 * @param checkAsParent - Whether to set the children's checked state based on the parent's checked state.
	 */
	function rebuildChildren(node: TreeNode, checkAsParent = true) {
		if (node.children) {
			for (const child of node.children) {
				if (checkAsParent) child.checked = !!node.checked;
				rebuildChildren(child, checkAsParent);
			}

			node.indeterminate =
				node.children.some((c) => c.indeterminate) ||
				(node.children.some((c) => !!c.checked) &&
					node.children.some((c) => !c.checked));
		}
	}

	/**
	 * Rebuild the tree state based on the toggled node.
	 * This function updates the checked and indeterminate states of the parent nodes
	 * based on the state of their children.
	 *
	 * @param e - The event object containing the toggled node.
	 * @param checkAsParent - Whether to set the children's checked state based on the parent's checked state.
	 */
	function rebuildTree(
		e: { detail: { node: TreeNode } },
		checkAsParent = true,
	) {
		const node = e.detail.node;
		let parent = treeMap[node.path];
		rebuildChildren(node, checkAsParent);

		while (parent) {
			const allCheck = parent?.children?.every((c) => !!c.checked);

			if (allCheck) {
				parent.indeterminate = false;
				parent.checked = true;
			} else {
				const haveCheckedOrIndetermine = parent?.children?.some(
					(c) => !!c.checked || c.indeterminate,
				);

				if (haveCheckedOrIndetermine) {
					parent.indeterminate = true;
				} else {
					parent.indeterminate = false;
				}
				parent.checked = false;
			}

			parent = treeMap[parent.path];
		}
		tree = tree;
	}

	// init the tree state
	rebuildTree({ detail: { node: tree } }, false);
</script>

<div>
	<Node
		{tree}
		{readOnly}
		{enableShowDiff}
		on:toggle={rebuildTree}
		on:showDiff={(e) => showDiff(e.detail.node.path)}
	/>
</div>
