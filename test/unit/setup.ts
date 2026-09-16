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

/**
 * Obsidian injects `createFragment` as a global. Settings pages build their
 * descriptions with it, so it must exist before any page is constructed.
 */
if (
	typeof (globalThis as { createFragment?: unknown }).createFragment !==
	"function"
) {
	const makeNode = (): Record<string, unknown> => ({
		createSpan: () => makeNode(),
		createEl: () => makeNode(),
		createDiv: () => makeNode(),
		appendChild: () => undefined,
		setText: () => undefined,
		addEventListener: () => undefined,
		addClass: () => undefined,
		removeClass: () => undefined,
		toggleClass: () => undefined,
	});

	Object.defineProperty(globalThis, "createFragment", {
		value: () => makeNode(),
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
