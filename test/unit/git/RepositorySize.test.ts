import type { HttpClient } from "src/git/HttpClient";
import { fetchRepositorySize, identifyHost } from "src/git/RepositorySize";

const makeHttp = (data: unknown, throws = false) =>
	({
		get: vi.fn(async () => {
			if (throws) throw new Error("unavailable");

			return { status: 200, headers: {}, data };
		}),
	}) as unknown as HttpClient;

describe("identifyHost", () => {
	it.each([
		[
			"https://github.com/user/repo.git",
			"github",
			"https://api.github.com/repos/user/repo",
		],
		[
			"git@github.com:user/repo.git",
			"github",
			"https://api.github.com/repos/user/repo",
		],
		[
			"https://gitlab.com/group/sub/repo.git",
			"gitlab",
			"https://gitlab.com/api/v4/projects/group%2Fsub%2Frepo?statistics=true",
		],
		[
			"https://codeberg.org/user/repo.git",
			"gitea",
			"https://codeberg.org/api/v1/repos/user/repo",
		],
		[
			"https://git.example.com/user/repo",
			"gitea",
			"https://git.example.com/api/v1/repos/user/repo",
		],
	])("maps %s", (url, kind, apiUrl) => {
		expect(identifyHost(url)).toEqual({ kind, apiUrl });
	});

	it("returns null for something that is not a remote URL", () => {
		expect(identifyHost("not a url")).toBeNull();
	});
});

describe("fetchRepositorySize", () => {
	it("converts GitHub kibibytes to bytes", async () => {
		const size = await fetchRepositorySize(
			"https://github.com/user/repo.git",
			makeHttp({ size: 2048 }),
		);
		expect(size).toBe(2048 * 1024);
	});

	it("converts Gitea kibibytes to bytes", async () => {
		const size = await fetchRepositorySize(
			"https://codeberg.org/user/repo.git",
			makeHttp({ size: 351731 }),
		);
		expect(size).toBe(351731 * 1024);
	});

	it("reads GitLab statistics, which are already bytes", async () => {
		const size = await fetchRepositorySize(
			"https://gitlab.com/user/repo.git",
			makeHttp({ statistics: { repository_size: 5_000_000 } }),
		);
		expect(size).toBe(5_000_000);
	});

	// GitLab only exposes statistics to sufficiently privileged callers, so an
	// anonymous read succeeds with the field absent rather than failing.
	it("returns null when GitLab omits statistics", async () => {
		const size = await fetchRepositorySize(
			"https://gitlab.com/user/repo.git",
			makeHttp({ id: 1 }),
		);
		expect(size).toBeNull();
	});

	it("returns null when the provider errors", async () => {
		const size = await fetchRepositorySize(
			"https://github.com/user/repo.git",
			makeHttp(null, true),
		);
		expect(size).toBeNull();
	});

	it("returns null for an unparseable remote", async () => {
		expect(await fetchRepositorySize("nonsense", makeHttp({}))).toBeNull();
	});

	it("sends the token in the scheme each provider expects", async () => {
		const gitlab = makeHttp({ statistics: { repository_size: 1 } });
		await fetchRepositorySize(
			"https://gitlab.com/user/repo.git",
			gitlab,
			"tok",
		);
		expect(vi.mocked(gitlab.get).mock.calls[0]?.[1]).toEqual({
			"PRIVATE-TOKEN": "tok",
		});

		const github = makeHttp({ size: 1 });
		await fetchRepositorySize(
			"https://github.com/user/repo.git",
			github,
			"tok",
		);
		expect(vi.mocked(github.get).mock.calls[0]?.[1]).toEqual({
			Authorization: "Bearer tok",
		});
	});
});
