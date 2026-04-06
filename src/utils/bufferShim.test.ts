/**
 * Regression test for issue #120.
 *
 * Reported behavior:
 * - When Quartz Syncer is enabled alongside TaskNotes, the Google Calendar
 *   OAuth integration fails with "Failed to connect: Unknown encoding base64url".
 *
 * Root cause:
 * - esbuild-buffer-shim.js was unconditionally overwriting `globalThis.Buffer`
 *   with the `buffer-es6` polyfill, which does not support the "base64url"
 *   encoding. This replaced the native Electron/Node.js Buffer that does
 *   support "base64url".
 *
 * Fix:
 * - Adopted the same platform-aware approach used by the Obsidian Git plugin:
 *   on mobile (no native Buffer), the polyfill is injected; on desktop
 *   (Electron/Node.js), the native Buffer is used.
 */

describe("Buffer shim: base64url encoding compatibility (issue #120)", () => {
	it("supports base64url encoding without throwing", () => {
		expect(() =>
			Buffer.from("test-data").toString("base64url" as BufferEncoding),
		).not.toThrow();
	});

	it("produces a valid base64url string (no +, /, or = characters)", () => {
		const result = Buffer.from("test-data").toString(
			"base64url" as BufferEncoding,
		);

		expect(result).toBeDefined();
		expect(result).not.toContain("+");
		expect(result).not.toContain("/");
		expect(result).not.toContain("=");
	});

	it("encodes known bytes to expected base64url value", () => {
		// [104, 101, 108, 108, 111] = "hello"
		// base64("hello") = "aGVsbG8=" → base64url = "aGVsbG8"
		const result = Buffer.from([104, 101, 108, 108, 111]).toString(
			"base64url" as BufferEncoding,
		);

		expect(result).toBe("aGVsbG8");
	});
});
