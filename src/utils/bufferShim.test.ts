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
 *   (Electron/Node.js), the native Buffer is preserved.
 */
import { resolveBuffer } from "./bufferPolyfill";

describe("Buffer shim: base64url encoding compatibility (issue #120)", () => {
	describe("desktop path (isMobile = false)", () => {
		it("returns the native globalThis.Buffer", () => {
			const buffer = resolveBuffer(false, {} as typeof Buffer);

			expect(buffer).toBe(globalThis.Buffer);
		});

		it("supports base64url encoding without throwing", () => {
			const buffer = resolveBuffer(false, {} as typeof Buffer);

			expect(() =>
				buffer
					.from("test-data")
					.toString("base64url" as BufferEncoding),
			).not.toThrow();
		});

		it("produces a valid base64url string (no +, /, or = characters)", () => {
			const buffer = resolveBuffer(false, {} as typeof Buffer);

			const result = buffer
				.from("test-data")
				.toString("base64url" as BufferEncoding);

			expect(result).toBeDefined();
			expect(result).not.toContain("+");
			expect(result).not.toContain("/");
			expect(result).not.toContain("=");
		});
	});

	describe("mobile path (isMobile = true)", () => {
		it("returns the provided polyfill, not the native Buffer", () => {
			const fakePolyfill = {
				from: jest.fn(),
			} as unknown as typeof Buffer;

			const buffer = resolveBuffer(true, fakePolyfill);

			expect(buffer).toBe(fakePolyfill);
			expect(buffer).not.toBe(globalThis.Buffer);
		});

		it("delegates calls to the provided polyfill", () => {
			const mockResult = {
				toString: jest.fn().mockReturnValue("polyfilled"),
			};

			const fakePolyfill = {
				from: jest.fn().mockReturnValue(mockResult),
			} as unknown as typeof Buffer;

			const buffer = resolveBuffer(true, fakePolyfill);

			buffer.from("hello");

			expect(fakePolyfill.from).toHaveBeenCalledWith("hello");
		});
	});
});
