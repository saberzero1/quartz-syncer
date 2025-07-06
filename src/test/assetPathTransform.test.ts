import { describe, it, expect } from "@jest/globals";
import { getSyncerPathForNote, getRewriteRules } from "../utils/utils";

describe("Asset Path Transformation", () => {
	it("should encode spaces in asset paths correctly", () => {
		// Test the logic used in SyncerPageCompiler
		const testPaths = [
			"A Assets/travolta.webp",
			"z_assets/albert_dente.webp",
			"My Images/test image.png",
			"simple.jpg",
		];

		const expectedPaths = [
			"/img/user/A%20Assets/travolta.webp",
			"/img/user/z_assets/albert_dente.webp",
			"/img/user/My%20Images/test%20image.png",
			"/img/user/simple.jpg",
		];

		testPaths.forEach((path, index) => {
			const quartzPath = `/img/user/${path.replace(/ /g, "%20")}`;
			expect(quartzPath).toBe(expectedPaths[index]);
		});
	});

	it("should handle assets with special characters", () => {
		// Test edge cases that might be encountered
		const testCases = [
			{
				path: "assets/file with spaces.png",
				expected: "/img/user/assets/file%20with%20spaces.png",
			},
			{
				path: "folder/no-spaces.jpg",
				expected: "/img/user/folder/no-spaces.jpg",
			},
			{
				path: "multiple  spaces.gif",
				expected: "/img/user/multiple%20%20spaces.gif",
			},
		];

		testCases.forEach(({ path, expected }) => {
			const quartzPath = `/img/user/${path.replace(/ /g, "%20")}`;
			expect(quartzPath).toBe(expected);
		});
	});

	it("should properly handle vaultPath rewriting for assets", () => {
		// This test demonstrates the core issue mentioned in the PR comment
		// Assets should have their vaultPath prefixes removed before adding /img/user/

		// Case 1: Default vault path (should work fine)
		const defaultRules = getRewriteRules("/");
		const assetPath1 = "z_assets/albert_dente.webp";
		const rewrittenPath1 = getSyncerPathForNote(assetPath1, defaultRules);
		const expectedQuartzPath1 = `/img/user/${rewrittenPath1.replace(/ /g, "%20")}`;

		expect(expectedQuartzPath1).toBe(
			"/img/user/z_assets/albert_dente.webp",
		);

		// Case 2: Custom vault path (this is the problematic case)
		const customRules = getRewriteRules("MyVault/");
		const assetPath2 = "MyVault/z_assets/albert_dente.webp";
		const rewrittenPath2 = getSyncerPathForNote(assetPath2, customRules);
		const expectedQuartzPath2 = `/img/user/${rewrittenPath2.replace(/ /g, "%20")}`;

		// Should be "/img/user/z_assets/albert_dente.webp", NOT "/img/user/MyVault/z_assets/albert_dente.webp"
		expect(expectedQuartzPath2).toBe(
			"/img/user/z_assets/albert_dente.webp",
		);

		// Case 3: Custom vault path with spaces
		const assetPath3 = "MyVault/A Assets/travolta.webp";
		const rewrittenPath3 = getSyncerPathForNote(assetPath3, customRules);
		const expectedQuartzPath3 = `/img/user/${rewrittenPath3.replace(/ /g, "%20")}`;
		// Should be "/img/user/A%20Assets/travolta.webp", NOT "/img/user/MyVault/A%20Assets/travolta.webp"
		expect(expectedQuartzPath3).toBe("/img/user/A%20Assets/travolta.webp");
	});
});
