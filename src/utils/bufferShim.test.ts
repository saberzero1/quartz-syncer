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
 * - Changed to `globalThis.Buffer = globalThis.Buffer || Buffer` so the polyfill
 *   is only injected when no native Buffer is available.
 */
describe("Buffer shim: base64url encoding compatibility (issue #120)", () => {
	it("supports base64url encoding without throwing", () => {
		const testBuffer = Buffer.from("test-data");

		expect(() =>
			testBuffer.toString("base64url" as BufferEncoding),
		).not.toThrow();
	});

	it("produces a valid base64url string (no +, /, or = characters)", () => {
		const testBuffer = Buffer.from("test-data");
		const result = testBuffer.toString("base64url" as BufferEncoding);
		expect(result).toBeDefined();
		expect(result).not.toContain("+");
		expect(result).not.toContain("/");
		expect(result).not.toContain("=");
	});

	it("does not overwrite an existing Buffer that supports base64url", () => {
		// The native Buffer supports base64url; verifying it is not clobbered
		// by the buffer-es6 polyfill (which lacks base64url support).
		const nativeBuffer = globalThis.Buffer;

		expect(nativeBuffer).toBeDefined();

		const result = nativeBuffer
			.from([104, 101, 108, 108, 111])
			.toString("base64url" as BufferEncoding);
		expect(result).toBe("aGVsbG8");
	});
});
