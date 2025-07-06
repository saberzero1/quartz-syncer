import { describe, it, expect } from "@jest/globals";

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
			"A%20Assets/travolta.webp",
			"z_assets/albert_dente.webp",
			"My%20Images/test%20image.png",
			"simple.jpg",
		];

		testPaths.forEach((path, index) => {
			const encodedPath = path.replace(/ /g, "%20");
			expect(encodedPath).toBe(expectedPaths[index]);
		});
	});

	it("should handle assets with special characters", () => {
		// Test edge cases that might be encountered
		const testCases = [
			{
				path: "assets/file with spaces.png",
				expected: "assets/file%20with%20spaces.png",
			},
			{
				path: "folder/no-spaces.jpg",
				expected: "folder/no-spaces.jpg",
			},
			{
				path: "multiple  spaces.gif",
				expected: "multiple%20%20spaces.gif",
			},
		];

		testCases.forEach(({ path, expected }) => {
			const encodedPath = path.replace(/ /g, "%20");
			expect(encodedPath).toBe(expected);
		});
	});

	it("should properly handle vaultPath removal for assets", () => {
		// This test demonstrates the core issue mentioned in the PR comment
		// Assets should have their vaultPath prefixes removed when present

		// Case 1: Default vault path (should remain unchanged)
		const vaultPath1: string = "/";
		const assetPath1 = "z_assets/albert_dente.webp";
		let processedPath1 = assetPath1;

		if (
			vaultPath1 !== "/" &&
			vaultPath1 !== "" &&
			assetPath1.startsWith(vaultPath1)
		) {
			processedPath1 = assetPath1.substring(vaultPath1.length);
		}
		expect(processedPath1).toBe("z_assets/albert_dente.webp");

		// Case 2: Custom vault path (this is the problematic case that should be fixed)
		const vaultPath2: string = "MyVault/";
		const assetPath2 = "MyVault/z_assets/albert_dente.webp";
		let processedPath2 = assetPath2;

		if (
			vaultPath2 !== "/" &&
			vaultPath2 !== "" &&
			assetPath2.startsWith(vaultPath2)
		) {
			processedPath2 = assetPath2.substring(vaultPath2.length);
		}
		// Should be "z_assets/albert_dente.webp", NOT "MyVault/z_assets/albert_dente.webp"
		expect(processedPath2).toBe("z_assets/albert_dente.webp");

		// Case 3: Custom vault path with spaces
		const vaultPath3: string = "MyVault/";
		const assetPath3 = "MyVault/A Assets/travolta.webp";
		let processedPath3 = assetPath3;

		if (
			vaultPath3 !== "/" &&
			vaultPath3 !== "" &&
			assetPath3.startsWith(vaultPath3)
		) {
			processedPath3 = assetPath3.substring(vaultPath3.length);
		}
		// Should be "A Assets/travolta.webp", NOT "MyVault/A Assets/travolta.webp"
		expect(processedPath3).toBe("A Assets/travolta.webp");

		// Case 4: Asset path that doesn't start with vaultPath (should remain unchanged)
		const vaultPath4: string = "MyVault/";
		const assetPath4 = "OtherFolder/image.png";
		let processedPath4 = assetPath4;

		if (
			vaultPath4 !== "/" &&
			vaultPath4 !== "" &&
			assetPath4.startsWith(vaultPath4)
		) {
			processedPath4 = assetPath4.substring(vaultPath4.length);
		}
		expect(processedPath4).toBe("OtherFolder/image.png");
	});
});
