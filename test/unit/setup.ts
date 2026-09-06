import { afterEach } from "vitest";
import { resetPlatform } from "./__mocks__/obsidian";

afterEach(() => {
	resetPlatform();
});

if (typeof globalThis.window === "undefined") {
	Object.defineProperty(globalThis, "window", {
		value: globalThis,
		writable: true,
	});
}

if (typeof globalThis.document === "undefined") {
	Object.defineProperty(globalThis, "document", {
		value: {
			createElement: () => ({
				style: {},
				addEventListener: () => {},
			}),
			createDocumentFragment: () => ({
				appendChild: () => {},
			}),
		},
		writable: true,
	});
}
