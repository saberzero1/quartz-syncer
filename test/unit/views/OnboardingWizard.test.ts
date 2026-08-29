import { describe, expect, it } from "vitest";
import {
	isValidRepoName,
	getRepoNameError,
	formatWizardError,
} from "src/views/OnboardingWizard/OnboardingWizard";
import {
	AuthError,
	ConflictError,
	NetworkError,
	NotFoundError,
	RateLimitError,
} from "src/git/errors";

describe("isValidRepoName", () => {
	it("accepts valid repo names", () => {
		expect(isValidRepoName("my-site")).toBe(true);
		expect(isValidRepoName("quartz")).toBe(true);
		expect(isValidRepoName("My.Site.2024")).toBe(true);
		expect(isValidRepoName("a")).toBe(true);
		expect(isValidRepoName("a-b")).toBe(true);
		expect(isValidRepoName("repo_name")).toBe(true);
		expect(isValidRepoName("123")).toBe(true);
	});

	it("rejects names starting with period or hyphen", () => {
		expect(isValidRepoName(".hidden")).toBe(false);
		expect(isValidRepoName("-start")).toBe(false);
	});

	it("rejects names ending with period or hyphen", () => {
		expect(isValidRepoName("end-")).toBe(false);
		expect(isValidRepoName("end.")).toBe(false);
	});

	it("rejects names with invalid characters", () => {
		expect(isValidRepoName("has spaces")).toBe(false);
		expect(isValidRepoName("has@special")).toBe(false);
		expect(isValidRepoName("path/slash")).toBe(false);
	});

	it("rejects empty names", () => {
		expect(isValidRepoName("")).toBe(false);
	});

	it("rejects names exceeding 100 characters", () => {
		expect(isValidRepoName("a".repeat(100))).toBe(true);
		expect(isValidRepoName("a".repeat(101))).toBe(false);
	});
});

describe("getRepoNameError", () => {
	it("returns null for valid names", () => {
		expect(getRepoNameError("my-site")).toBeNull();
		expect(getRepoNameError("quartz")).toBeNull();
		expect(getRepoNameError("a")).toBeNull();
	});

	it("returns error for empty names", () => {
		expect(getRepoNameError("")).toBe("Repository name is required");
	});

	it("returns error for names exceeding 100 characters", () => {
		expect(getRepoNameError("a".repeat(101))).toBe(
			"Repository name must be 100 characters or fewer",
		);
	});

	it("returns error for invalid characters", () => {
		expect(getRepoNameError("has spaces")).toBe(
			"Repository name can only contain letters, numbers, hyphens, periods, and underscores",
		);
	});

	it("returns error for names starting with period or hyphen", () => {
		expect(getRepoNameError(".hidden")).toBe(
			"Repository name cannot start with a period or hyphen",
		);
		expect(getRepoNameError("-start")).toBe(
			"Repository name cannot start with a period or hyphen",
		);
	});

	it("returns error for names ending with period or hyphen", () => {
		expect(getRepoNameError("end.")).toBe(
			"Repository name cannot end with a period or hyphen",
		);
		expect(getRepoNameError("end-")).toBe(
			"Repository name cannot end with a period or hyphen",
		);
	});
});

describe("formatWizardError", () => {
	it("maps ConflictError to friendly message", () => {
		expect(formatWizardError(new ConflictError())).toBe(
			"A repository with this name already exists on your account.",
		);
	});

	it("maps AuthError to friendly message", () => {
		expect(formatWizardError(new AuthError())).toBe(
			"Your token doesn't have permission for this action. Check your token's scopes.",
		);
	});

	it("maps NotFoundError to friendly message", () => {
		expect(formatWizardError(new NotFoundError())).toBe(
			"The Quartz template repository is not available.",
		);
	});

	it("maps NetworkError to friendly message", () => {
		expect(formatWizardError(new NetworkError())).toBe(
			"Unable to connect to GitHub. Check your internet connection.",
		);
	});

	it("maps RateLimitError to friendly message", () => {
		expect(formatWizardError(new RateLimitError())).toBe(
			"GitHub API rate limit reached. Please wait a moment and try again.",
		);
	});

	it("falls back to error.message for unknown Error types", () => {
		expect(formatWizardError(new Error("something broke"))).toBe(
			"something broke",
		);
	});

	it("falls back to String() for non-Error values", () => {
		expect(formatWizardError("raw string")).toBe("raw string");
		expect(formatWizardError(42)).toBe("42");
	});
});
