import { describe, expect, it } from "vitest";
import { satisfiesQuartzVersion } from "src/quartz/QuartzVersionRange";

describe("satisfiesQuartzVersion", () => {
	it("reads the ranges plugins declare", () => {
		const cases: [string, string, boolean][] = [
			[">=5.1.0", "5.1.0", true],
			[">=5.1.0", "5.0.0", false],
			[">=5.1.0", "5.1.0-beta.1", true],
			[">5.0", "5.0.3", false],
			[">5.0", "5.1.0", true],
			["<6", "5.9.9", true],
			["<=5.0", "5.0.7", true],
			["<=5.0", "5.1.0", false],
			[">5", "5.9.0", false],
			["^5.1.0", "5.4.2", true],
			["^5.1.0", "6.0.0", false],
			["~5.1.0", "5.1.9", true],
			["~5.1.0", "5.2.0", false],
			["5.1.0", "5.1.0", true],
			["5.x", "5.3.0", true],
			[">=5.0.0 <5.1.0", "5.1.0", false],
			["<5.0.0 || >=5.1.0", "5.1.2", true],
			["*", "4.0.0", true],
		];
		for (const [range, version, expected] of cases) {
			expect(
				satisfiesQuartzVersion(range, version),
				`${range} @ ${version}`,
			).toBe(expected);
		}
	});

	it("can't tell for missing or unreadable values", () => {
		expect(satisfiesQuartzVersion("unspecified", "5.1.0")).toBeNull();
		expect(satisfiesQuartzVersion(">=5.1.0", null)).toBeNull();
		expect(satisfiesQuartzVersion(undefined, "5.1.0")).toBeNull();
	});
});
