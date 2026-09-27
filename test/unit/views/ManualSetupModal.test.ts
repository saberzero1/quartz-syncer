import {
	App,
	buttonComponents,
	notices,
	resetNotices,
	resetButtonComponents,
	resetTextComponents,
	textComponents,
} from "obsidian";
import { DEFAULT_SETTINGS } from "src/main";
import type QuartzSyncer from "src/main";
import { ManualSetupModal } from "src/views/ManualSetupModal";

const { createGitBackend, setTestConnection } = vi.hoisted(() => {
	let testConnection: () => Promise<unknown> = async () => ({
		ok: true,
		readAccess: true,
		writeAccess: true,
		hasCredential: true,
		credentialVerified: true,
	});

	return {
		createGitBackend: vi.fn(() => ({
			testConnection: () => testConnection(),
		})),
		setTestConnection: (next: () => Promise<unknown>) => {
			testConnection = next;
		},
	};
});

vi.mock("src/git/GitBackendFactory", () => ({ createGitBackend }));

function makePlugin(
	overrides: Partial<{ token: string; remoteUrl: string }> = {},
): QuartzSyncer {
	return {
		app: {},
		settings: {
			...DEFAULT_SETTINGS,
			gitRemoteUrl: overrides.remoteUrl ?? "",
		},
		saveSettings: vi.fn().mockResolvedValue(undefined),
		getEventSink: () => null,
		secretStorageService: {
			getToken: vi.fn(() => overrides.token ?? ""),
			setToken: vi.fn(),
		},
	} as unknown as QuartzSyncer;
}

function openModal(plugin: QuartzSyncer): ManualSetupModal {
	resetTextComponents();
	resetButtonComponents();
	resetNotices();
	const modal = new ManualSetupModal(new App(), plugin);
	modal.onOpen();

	return modal;
}

/** Drives the field an agent would address via [data-qs-field="<field>"]. */
function setField(field: string, value: string): void {
	const record = textComponents.find(
		(component) => component.inputEl.attributes["data-qs-field"] === field,
	);

	if (!record) throw new Error(`No text field tagged ${field}`);
	record.handler?.(value);
}

function clickAction(value: string): void {
	const record = buttonComponents.find(
		(component) => component.buttonEl.attributes["data-qs-value"] === value,
	);

	if (!record) throw new Error(`No button tagged ${value}`);
	void record.handler?.();
}

describe("ManualSetupModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setTestConnection(async () => ({
			ok: true,
			readAccess: true,
			writeAccess: true,
			hasCredential: true,
			credentialVerified: true,
		}));
	});

	it("seeds its fields from persisted settings", () => {
		const plugin = makePlugin({ remoteUrl: "https://example.com/r.git" });
		openModal(plugin);

		const url = textComponents.find(
			(component) =>
				component.inputEl.attributes["data-qs-field"] === "url",
		);

		expect(url?.value).toBe("https://example.com/r.git");
	});

	it("carries the DOM contract attributes an agent drives it through", () => {
		openModal(makePlugin());

		const fields = textComponents
			.map((component) => component.inputEl.attributes["data-qs-field"])
			.filter(Boolean);

		expect(fields).toEqual(
			expect.arrayContaining(["url", "branch", "token"]),
		);
		expect(
			buttonComponents.map(
				(component) => component.buttonEl.attributes["data-qs-value"],
			),
		).toEqual(expect.arrayContaining(["test", "save"]));
	});

	it("refuses to save without a remote URL", async () => {
		const plugin = makePlugin();
		openModal(plugin);

		clickAction("save");
		await Promise.resolve();

		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(notices).toContain("Remote URL is required.");
	});

	// SSH remotes are the common paste mistake, and isomorphic-git speaks only
	// HTTP(S), so these have to fail loudly rather than save an unusable
	// remote. scp-style and ssh:// fail through different branches: the former
	// is not a parseable URL at all, the latter parses but is rejected on
	// protocol.
	it("refuses to save an scp-style SSH remote", async () => {
		const plugin = makePlugin();
		openModal(plugin);
		setField("url", "git@github.com:user/quartz.git");

		clickAction("save");
		await Promise.resolve();

		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(notices.at(-1)).toContain("valid remote URL");
	});

	it("refuses to save an ssh:// remote", async () => {
		const plugin = makePlugin();
		openModal(plugin);
		setField("url", "ssh://git@github.com/user/quartz.git");

		clickAction("save");
		await Promise.resolve();

		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(notices.at(-1)).toContain("HTTP and HTTPS");
	});

	it("refuses to save when authentication needs a token and none exists", async () => {
		const plugin = makePlugin();
		openModal(plugin);
		setField("url", "https://github.com/user/quartz.git");

		clickAction("save");
		await Promise.resolve();

		expect(plugin.saveSettings).not.toHaveBeenCalled();
		expect(notices.at(-1)).toContain("Access token is required");
	});

	it("persists the remote and stores the token on a valid save", async () => {
		const plugin = makePlugin();
		openModal(plugin);
		setField("url", "https://github.com/user/quartz.git");
		setField("branch", "main");
		setField("token", "secret-token");
		setField("content-folder", "docs");

		clickAction("save");
		await vi.waitFor(() =>
			expect(plugin.saveSettings).toHaveBeenCalledTimes(1),
		);

		expect(plugin.settings.gitRemoteUrl).toBe(
			"https://github.com/user/quartz.git",
		);
		expect(plugin.settings.gitBranch).toBe("main");
		expect(plugin.settings.contentFolder).toBe("docs");
		expect(plugin.settings.gitProviderHint).toBe("github");
		expect(plugin.secretStorageService.setToken).toHaveBeenCalledWith(
			"secret-token",
		);
	});

	it("reports an unverified credential rather than a bare read-only result", async () => {
		setTestConnection(async () => ({
			ok: true,
			readAccess: true,
			writeAccess: false,
			hasCredential: true,
			credentialVerified: false,
		}));
		const plugin = makePlugin();
		const modal = openModal(plugin);
		setField("url", "https://github.com/user/quartz.git");

		clickAction("test");
		await vi.waitFor(() =>
			expect(createGitBackend).toHaveBeenCalledTimes(1),
		);
		await vi.waitFor(() =>
			expect(
				(modal as unknown as { testStatusEl: { setText: unknown } })
					.testStatusEl,
			).toBeTruthy(),
		);

		const setText = (
			modal as unknown as {
				testStatusEl: { setText: { mock: { calls: string[][] } } };
			}
		).testStatusEl.setText;
		const messages = setText.mock.calls.map((call) => call[0]);

		expect(messages.at(-1)).toContain("could not be verified");
	});

	it("does not run a connection test without a remote URL", async () => {
		openModal(makePlugin());

		clickAction("test");
		await Promise.resolve();

		expect(createGitBackend).not.toHaveBeenCalled();
	});
});
