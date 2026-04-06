/**
 * Returns the appropriate Buffer implementation for the current platform.
 *
 * On mobile (Capacitor/WebView) there is no native Node.js Buffer, so the
 * supplied polyfill is used instead. On desktop (Electron/Node.js) the native
 * Buffer is available and must be preferred because it supports additional
 * encodings such as "base64url" that polyfills typically do not.
 *
 * This mirrors the approach used by the Obsidian Git plugin:
 * https://github.com/Vinzent03/obsidian-git/blob/master/polyfill_buffer.js
 *
 * @param isMobile - Whether the plugin is running on a mobile device.
 * @param polyfill - The Buffer polyfill to use when isMobile is true.
 */
export function resolveBuffer(
	isMobile: boolean,
	polyfill: typeof Buffer,
): typeof Buffer {
	return isMobile ? polyfill : globalThis.Buffer;
}
