import { describe, expect, it } from "vitest";
import {
	isValidRepoName,
	getRepoNameError,
	formatWizardError,
	OnboardingWizard,
} from "src/views/OnboardingWizard/OnboardingWizard";
import type { App } from "obsidian";
import type QuartzSyncer from "src/main";
import { GitHubApiService } from "src/github/GitHubApiService";
import {
	AuthError,
	ConflictError,
	NetworkError,
	NotFoundError,
	RateLimitError,
} from "src/git/errors";

function buildWizard() {
	const plugin = { getEventSink: vi.fn() } as unknown as QuartzSyncer;
	const wizard = new OnboardingWizard({} as App, plugin);
	const render = vi.fn();
	wizard["render"] = render;
	return { wizard, render };
}

describe("OnboardingWizard behavior", () => {
	afterEach(() => vi.restoreAllMocks());

	it("does not render when token validation resolves after close", async () => {
		const { wizard, render } = buildWizard();
		let resolveUser: (user: { login: string }) => void = () => {};
		const pending = new Promise<{ login: string }>((resolve) => {
			resolveUser = resolve;
		});
		const service = new GitHubApiService("token");
		vi.spyOn(service, "validateToken").mockReturnValue(pending);
		wizard["getService"] = () => service;
		wizard["token"] = "token";
		wizard["flow"] = "create";
		const result = wizard["handleValidateToken"]();
		wizard.onClose();
		render.mockClear();
		resolveUser({ login: "octo" });
		await result;
		expect(render).not.toHaveBeenCalled();
	});

	it("aborts the controller and cancels a pending template delay on close", async () => {
		const { wizard, render } = buildWizard();
		const service = new GitHubApiService("token");
		const readFile = vi.spyOn(service, "getFileContent").mockResolvedValue({
			content: "{}",
			sha: "1",
		});
		vi.useFakeTimers();
		try {
			const result = wizard["waitForTemplateReady"](
				service,
				"octo",
				"quartz",
				"v5",
			);
			wizard.onClose();
			expect(wizard["abortController"].signal.aborted).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
			await result;
			expect(readFile).not.toHaveBeenCalled();
			expect(render).not.toHaveBeenCalled();
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it("surfaces duplicate repository conflicts without creating from template", async () => {
		const { wizard } = buildWizard();
		const service = new GitHubApiService("token");
		vi.spyOn(service, "getUser").mockResolvedValue({ login: "octo" });
		vi.spyOn(service, "getRepo").mockResolvedValue({
			full_name: "octo/quartz",
			default_branch: "v5",
			clone_url: "https://github.com/octo/quartz.git",
			html_url: "https://github.com/octo/quartz",
			private: false,
		});
		const create = vi.spyOn(service, "createFromTemplate");
		const format = vi.fn(formatWizardError);
		wizard["formatError"] = format;
		wizard["getService"] = () => service;
		wizard["newSiteName"] = "quartz";
		await wizard["handleCreateSite"]();
		expect(wizard["errorMessage"]).toBe(
			"A repository with this name already exists on your account.",
		);
		expect(format).toHaveBeenCalledWith(expect.any(ConflictError));
		expect(create).not.toHaveBeenCalled();
	});
});

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
