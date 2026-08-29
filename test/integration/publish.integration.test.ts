import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HttpClient } from "src/git/HttpClient";
import { GitHubApiService } from "src/github/GitHubApiService";
import { NotFoundError } from "src/git/errors";
import { TEST_BRANCH, TEST_TOKEN } from "./setup";

const shouldRun = !!TEST_TOKEN;

describe.skipIf(!shouldRun)("Real-world publish", () => {
	let http: HttpClient;
	const owner = "saberzero1";
	const repo = "quartz-syncer-testing-bench";
	const authHeaders = {
		Authorization: `Bearer ${TEST_TOKEN}`,
		Accept: "application/vnd.github+json",
	};
	const testFilePath = `content/test-${Date.now()}.md`;
	const testContent = `---\ntitle: Test note\npublish: true\n---\n\nThis is a test note published by Quartz Syncer integration tests.\n`;
	let bootstrapPath: string | null = null;
	let bootstrapBranch: string | null = null;

	const getRepoDetails = async () => {
		return http.get<{ default_branch: string; full_name: string }>(
			`https://api.github.com/repos/${owner}/${repo}`,
			authHeaders,
		);
	};

	const getBranchSha = async (branch: string): Promise<string> => {
		const response = await http.get<{ object: { sha: string } }>(
			`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
			authHeaders,
		);
		return response.data.object.sha;
	};

	const ensureTestBranch = async (): Promise<void> => {
		try {
			await http.get(
				`https://api.github.com/repos/${owner}/${repo}/branches/${TEST_BRANCH}`,
				authHeaders,
			);
			return;
		} catch (error) {
			if (!(error instanceof NotFoundError)) {
				throw error;
			}
		}

		let repoDetails = await getRepoDetails();
		let defaultBranch = repoDetails.data.default_branch;
		let baseSha: string | null = null;

		try {
			baseSha = await getBranchSha(defaultBranch);
		} catch (error) {
			if (!(error instanceof NotFoundError)) {
				throw error;
			}
			bootstrapPath = "content/.integration-bootstrap.md";
			bootstrapBranch = defaultBranch;
			const bootstrapContent = Buffer.from(
				"Bootstrap commit for integration tests.",
			).toString("base64");
			const createResponse = await http.put<{ commit: { sha: string } }>(
				`https://api.github.com/repos/${owner}/${repo}/contents/${bootstrapPath}`,
				authHeaders,
				{
					message: "test: bootstrap integration branch",
					content: bootstrapContent,
				},
			);
			baseSha = createResponse.data.commit.sha;
			repoDetails = await getRepoDetails();
			defaultBranch = repoDetails.data.default_branch;
			bootstrapBranch = defaultBranch;
		}

		if (!baseSha) {
			throw new Error("Unable to determine base SHA for test branch.");
		}

		await http.post(
			`https://api.github.com/repos/${owner}/${repo}/git/refs`,
			authHeaders,
			{
				ref: `refs/heads/${TEST_BRANCH}`,
				sha: baseSha,
			},
		);
	};

	beforeAll(async () => {
		http = new HttpClient();
		await ensureTestBranch();
	});

	it("validates token has access", async () => {
		const response = await http.get<{ full_name: string }>(
			`https://api.github.com/repos/${owner}/${repo}`,
			authHeaders,
		);
		expect(response.status).toBe(200);
		expect(response.data.full_name).toBe(`${owner}/${repo}`);
	});

	it("reads the repository tree", async () => {
		const response = await http.get<{ tree: { path: string }[] }>(
			`https://api.github.com/repos/${owner}/${repo}/git/trees/${TEST_BRANCH}?recursive=1`,
			authHeaders,
		);
		expect(response.status).toBe(200);
		expect(Array.isArray(response.data.tree)).toBe(true);
	});

	it("publishes a test file via GitHub API", async () => {
		const content = Buffer.from(testContent).toString("base64");
		const response = await http.put<{ content: { sha: string } }>(
			`https://api.github.com/repos/${owner}/${repo}/contents/${testFilePath}`,
			authHeaders,
			{
				message: "test: publish integration test note",
				content,
				branch: TEST_BRANCH,
			},
		);
		expect(response.status).toBe(201);
		expect(response.data.content.sha).toBeDefined();
	});

	it("verifies the published file exists via contents API", async () => {
		const response = await http.get<{ name: string; path: string }>(
			`https://api.github.com/repos/${owner}/${repo}/contents/${testFilePath}?ref=${TEST_BRANCH}`,
			authHeaders,
		);
		expect(response.status).toBe(200);
		expect(response.data.path).toBe(testFilePath);
	});

	it("creates a file via GitHubApiService.createFile", async () => {
		const service = new GitHubApiService(TEST_TOKEN ?? "", http);
		const filePath = `content/test-createFile-${Date.now()}.md`;
		const fileContent =
			"---\ntitle: createFile test\npublish: true\n---\n\nCreated via GitHubApiService.createFile integration test.\n";

		await service.createFile(
			owner,
			repo,
			filePath,
			fileContent,
			"test: integration test createFile",
			TEST_BRANCH,
		);

		const verifyResponse = await http.get<{
			path: string;
			content: string;
		}>(
			`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${TEST_BRANCH}`,
			authHeaders,
		);
		expect(verifyResponse.status).toBe(200);
		expect(verifyResponse.data.path).toBe(filePath);

		const decoded = atob(verifyResponse.data.content.replace(/\n/g, ""));
		expect(decoded).toContain("title: createFile test");

		const fileResp = await http.get<{ sha: string }>(
			`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${TEST_BRANCH}`,
			authHeaders,
		);
		await http.delete(
			`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
			authHeaders,
			{
				message: "test: cleanup createFile integration test",
				sha: fileResp.data.sha,
				branch: TEST_BRANCH,
			},
		);
	});

	afterAll(async () => {
		if (!TEST_TOKEN) return;
		try {
			const fileResp = await http.get<{ sha: string }>(
				`https://api.github.com/repos/${owner}/${repo}/contents/${testFilePath}?ref=${TEST_BRANCH}`,
				authHeaders,
			);
			await http.delete(
				`https://api.github.com/repos/${owner}/${repo}/contents/${testFilePath}`,
				authHeaders,
				{
					message: "test: cleanup integration test note",
					sha: fileResp.data.sha,
					branch: TEST_BRANCH,
				},
			);
		} catch {
			// Cleanup failure is not a test failure
		}

		if (bootstrapPath && bootstrapBranch) {
			try {
				const bootstrapResp = await http.get<{ sha: string }>(
					`https://api.github.com/repos/${owner}/${repo}/contents/${bootstrapPath}?ref=${bootstrapBranch}`,
					authHeaders,
				);
				await http.delete(
					`https://api.github.com/repos/${owner}/${repo}/contents/${bootstrapPath}`,
					authHeaders,
					{
						message: "test: cleanup integration bootstrap",
						sha: bootstrapResp.data.sha,
						branch: bootstrapBranch,
					},
				);
			} catch {
				// Cleanup failure is not a test failure
			}
		}
	});
});
