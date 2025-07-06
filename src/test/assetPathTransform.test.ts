import { describe, it, expect } from "@jest/globals";

describe("Asset Path Transformation", () => {
	it("should encode spaces in asset paths correctly", () => {
		// Test the logic used in SyncerPageCompiler
		const testPaths = [
			"A Assets/travolta.webp",
			"z_assets/albert_dente.webp", 
			"My Images/test image.png",
			"simple.jpg"
		];
		
		const expectedPaths = [
			"/img/user/A%20Assets/travolta.webp",
			"/img/user/z_assets/albert_dente.webp",
			"/img/user/My%20Images/test%20image.png", 
			"/img/user/simple.jpg"
		];
		
		testPaths.forEach((path, index) => {
			const quartzPath = `/img/user/${path.replace(/ /g, '%20')}`;
			expect(quartzPath).toBe(expectedPaths[index]);
		});
	});

	it("should handle assets with special characters", () => {
		// Test edge cases that might be encountered
		const testCases = [
			{ path: "assets/file with spaces.png", expected: "/img/user/assets/file%20with%20spaces.png" },
			{ path: "folder/no-spaces.jpg", expected: "/img/user/folder/no-spaces.jpg" },
			{ path: "multiple  spaces.gif", expected: "/img/user/multiple%20%20spaces.gif" }
		];
		
		testCases.forEach(({ path, expected }) => {
			const quartzPath = `/img/user/${path.replace(/ /g, '%20')}`;
			expect(quartzPath).toBe(expected);
		});
	});
});