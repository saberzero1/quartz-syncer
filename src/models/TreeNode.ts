/**
 * TreeNode type.
 * Model representing a node in a tree structure.
 */
type TreeNode = {
	name: string;
	children?: TreeNode[];
	isRoot: boolean;
	path: string;
	checked: boolean;
	indeterminate: boolean;
};

export default TreeNode;
