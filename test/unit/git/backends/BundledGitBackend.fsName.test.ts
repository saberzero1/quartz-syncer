import type { App } from "obsidian";
import { BundledGitBackend } from "src/git/backends/BundledGitBackend";
import type { GitBackendConfig } from "src/git/types";

const fsNames: string[] = [];

vi.mock("isomorphic-git", () => ({ default: {} }));

vi.mock("@isomorphic-git/lightning-fs", () => {
	class MockLightningFS {
		promises = {};

		constructor(name: string) {
			fsNames.push(name);
		}
	}

	return { default: MockLightningFS };
});

function makeApp(appId: string): App {
	return { appId } as App;
}

function makeConfig(remoteUrl: string, branch: string): GitBackendConfig {
	return { remoteUrl, branch, auth: { type: "none" } };
}

const REMOTE = "https://github.com/user/repo.git";

function nameFor(appId: string, remoteUrl: string, branch: string): string {
	fsNames.length = 0;
	new BundledGitBackend(makeConfig(remoteUrl, branch), makeApp(appId));
	const name = fsNames[0];

	if (name === undefined) throw new Error("LightningFS was not constructed");

	return name;
}

describe("BundledGitBackend LightningFS naming", () => {
	beforeEach(() => {
		fsNames.length = 0;
	});

	it("includes a generation segment and the vault appId", () => {
		const name = nameFor("vault-a", REMOTE, "v5");

		expect(name).toMatch(/^quartz-syncer-\d+-vault-a-[a-z0-9]+$/);
	});

	it("does not use the legacy quartz-syncer-{hash} scheme", () => {
		const name = nameFor("vault-a", REMOTE, "v5");

		expect(name).not.toMatch(/^quartz-syncer-[a-z0-9]+$/);
	});

	it("gives two vaults sharing a remote and branch different databases", () => {
		const a = nameFor("vault-a", REMOTE, "v5");
		const b = nameFor("vault-b", REMOTE, "v5");

		expect(a).not.toBe(b);
	});

	it("is stable for the same vault, remote and branch", () => {
		expect(nameFor("vault-a", REMOTE, "v5")).toBe(
			nameFor("vault-a", REMOTE, "v5"),
		);
	});

	it("differs per branch for the same vault", () => {
		expect(nameFor("vault-a", REMOTE, "v5")).not.toBe(
			nameFor("vault-a", REMOTE, "v4"),
		);
	});

	it("differs per remote for the same vault and branch", () => {
		expect(nameFor("vault-a", REMOTE, "v5")).not.toBe(
			nameFor("vault-a", "https://github.com/user/other.git", "v5"),
		);
	});
});
