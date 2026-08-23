import { describe, expect, it } from "vitest";
import { detectGitProvider } from "src/utils/gitProviderDetection";

describe("detectGitProvider", () => {
	it("detects GitHub from github.com URL", () => {
		expect(detectGitProvider("https://github.com/user/repo.git")).toBe(
			"github",
		);
	});

	it("detects GitHub from subdomain URL", () => {
		expect(
			detectGitProvider("https://api.github.com/repos/user/repo"),
		).toBe("github");
	});

	it("detects GitLab from gitlab.com URL", () => {
		expect(detectGitProvider("https://gitlab.com/user/repo.git")).toBe(
			"gitlab",
		);
	});

	it("detects Bitbucket from bitbucket.org URL", () => {
		expect(detectGitProvider("https://bitbucket.org/user/repo.git")).toBe(
			"bitbucket",
		);
	});

	it("detects Gitea for codeberg.org URL", () => {
		expect(detectGitProvider("https://codeberg.org/user/repo.git")).toBe(
			"gitea",
		);
	});

	it("returns 'custom' for unknown host", () => {
		expect(detectGitProvider("https://git.example.com/repo.git")).toBe(
			"custom",
		);
	});

	it("returns 'custom' for invalid URL", () => {
		expect(detectGitProvider("not-a-url")).toBe("custom");
	});
});
