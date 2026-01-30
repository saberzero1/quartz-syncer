export type FileType =
	| "markdown"
	| "base"
	| "excalidraw"
	| "folder"
	| "unknown";

type TreeNode = {
	name: string;
	children?: TreeNode[];
	isRoot: boolean;
	path: string;
	checked: boolean;
	indeterminate: boolean;
	fileType?: FileType;
};

export default TreeNode;
