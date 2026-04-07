/*
 * Retrieved from: https://github.com/Vinzent03/obsidian-git/blob/master/polyfill_buffer.js
 * Date of retrieval: 2026-04-07
 * MIT License
 * Copyright (c) 2020 Vinzent03, Denis Olehov
 */
import { Platform } from "obsidian";
let buffer;
if (Platform.isMobileApp) {
	buffer = require("buffer/index.js").Buffer;
} else {
	buffer = global.Buffer;
}

export const Buffer = buffer;
