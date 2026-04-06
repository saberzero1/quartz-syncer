import { Platform } from "obsidian";
import { Buffer as BufferPolyfill } from "buffer-es6";
import { resolveBuffer } from "./src/utils/bufferPolyfill";

const buffer = resolveBuffer(Platform.isMobileApp, BufferPolyfill);

globalThis.Buffer = buffer;
export const Buffer = buffer;
