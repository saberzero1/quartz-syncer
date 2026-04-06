import { Platform } from "obsidian";
import { Buffer as PolyfillBuffer } from "buffer";

const buffer = Platform.isMobileApp ? PolyfillBuffer : globalThis.Buffer;

export const Buffer = buffer;
