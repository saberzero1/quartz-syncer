import { Platform } from "obsidian";
let buffer;

if (Platform.isMobileApp) {
	/* eslint-disable-next-line @typescript-eslint/no-require-imports -- Buffer shim is required for Obsidian mobile */
	buffer = require("buffer/index.js").Buffer;
} else {
	/* eslint-disable-next-line obsidianmd/prefer-active-doc, obsidianmd/no-global-this, no-undef -- Buffer shim is required for Obsidian mobile */
	buffer = global.Buffer;
}

export const Buffer = buffer;
