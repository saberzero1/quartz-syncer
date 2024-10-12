export const FRONTMATTER_REGEX = /^\s*?---\n([\s\S]*?)\n---/g;
export const BLOCKREF_REGEX = /(\^\w+(\n|$))/g;

export const CODE_FENCE_REGEX = /`(.*?)`/g;

export const CODEBLOCK_REGEX = /```.*?\n[\s\S]+?```/g;

export const EXCALIDRAW_REGEX = /:\[\[(\d*?,\d*?)\],.*?\]\]/g;

export const TRANSCLUDED_SVG_REGEX =
	/!\[\[(.*?)(\.(svg))\|(.*?)\]\]|!\[\[(.*?)(\.(svg))\]\]/g;

export const DATAVIEW_LINK_TARGET_BLANK_REGEX =
	/target=["']_blank["'] rel=["']noopener["']/g;

export const IMAGE_REGEX =
	/!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif|webp|bmp))\)/g;

export const TRANSCLUDED_IMAGE_REGEX =
	/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp|bmp))\\?\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp|bmp))\]\]/g;
