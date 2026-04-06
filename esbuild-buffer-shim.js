import { Platform } from "obsidian";
import { Buffer as PolyfillBuffer } from "buffer-es6";

const buffer = Platform.isMobileApp ? PolyfillBuffer : globalThis.Buffer;

export const Buffer = buffer;
