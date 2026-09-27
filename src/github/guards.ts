import { ProviderError } from "src/git/errors";
import type { GitHubRepo, GitHubUser } from "./types";

export function assertGitHubUser(
	value: unknown,
): asserts value is Pick<GitHubUser, "login"> {
	if (
		typeof value !== "object" ||
		value === null ||
		!("login" in value) ||
		typeof value.login !== "string" ||
		value.login.length === 0
	) {
		throw new ProviderError("Invalid GitHub user response");
	}
}

export function assertGitHubRepo(
	value: unknown,
): asserts value is Pick<
	GitHubRepo,
	"full_name" | "default_branch" | "clone_url"
> {
	if (
		typeof value !== "object" ||
		value === null ||
		!("full_name" in value) ||
		typeof value.full_name !== "string" ||
		value.full_name.length === 0 ||
		!("default_branch" in value) ||
		typeof value.default_branch !== "string" ||
		value.default_branch.length === 0 ||
		!("clone_url" in value) ||
		typeof value.clone_url !== "string" ||
		value.clone_url.length === 0
	) {
		throw new ProviderError("Invalid GitHub repository response");
	}
}

export function assertGitHubRepoArray(
	value: unknown,
): asserts value is Pick<
	GitHubRepo,
	"full_name" | "default_branch" | "clone_url"
>[] {
	if (!Array.isArray(value))
		throw new ProviderError("Invalid GitHub repository list response");
	for (const repo of value) assertGitHubRepo(repo);
}

export function assertFileContent(
	value: unknown,
): asserts value is { content: string; sha: string; encoding: string } {
	if (
		typeof value !== "object" ||
		value === null ||
		!("content" in value) ||
		typeof value.content !== "string" ||
		!("sha" in value) ||
		typeof value.sha !== "string" ||
		!("encoding" in value) ||
		typeof value.encoding !== "string"
	) {
		throw new ProviderError("Invalid GitHub file content response");
	}
}
