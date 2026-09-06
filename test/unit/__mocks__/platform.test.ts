import { Platform, resetPlatform, setPlatform } from "./obsidian";

describe("Platform mock", () => {
	it("defaults to desktop with both flags defined", () => {
		expect(Platform.isDesktopApp).toBe(true);
		expect(Platform.isMobileApp).toBe(false);
	});

	it("switches both flags so mobile branches are reachable", () => {
		setPlatform({ isDesktopApp: false, isMobileApp: true });

		expect(Platform.isDesktopApp).toBe(false);
		expect(Platform.isMobileApp).toBe(true);
	});

	it("is restored between tests by the shared setup", () => {
		expect(Platform.isDesktopApp).toBe(true);
		expect(Platform.isMobileApp).toBe(false);
	});

	it("resets explicitly on demand", () => {
		setPlatform({ isDesktopApp: false, isMobileApp: true });
		resetPlatform();

		expect(Platform.isDesktopApp).toBe(true);
		expect(Platform.isMobileApp).toBe(false);
	});
});
