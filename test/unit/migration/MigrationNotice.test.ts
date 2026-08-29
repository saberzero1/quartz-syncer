import { shouldShowMigrationNotice } from "src/views/MigrationNotice";

describe("shouldShowMigrationNotice", () => {
	it("returns true when upgrading from v1.x to v2.x", () => {
		expect(shouldShowMigrationNotice("1.18.0", "2.0.0")).toBe(true);
		expect(shouldShowMigrationNotice("1.0.0", "2.0.0")).toBe(true);
		expect(shouldShowMigrationNotice("1.18.0", "2.0.1")).toBe(true);
	});

	it("returns false when both are v2.x", () => {
		expect(shouldShowMigrationNotice("2.0.0", "2.0.1")).toBe(false);
	});

	it("returns false when both are v1.x", () => {
		expect(shouldShowMigrationNotice("1.17.0", "1.18.0")).toBe(false);
	});

	it("returns false when previous version is empty", () => {
		expect(shouldShowMigrationNotice("", "2.0.0")).toBe(false);
	});

	it("returns false for fresh install (no previous version)", () => {
		expect(shouldShowMigrationNotice("", "2.0.0")).toBe(false);
	});
});
