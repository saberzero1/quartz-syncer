import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliData as ObsidianCliData } from "obsidian";
import {
	COMMAND_REGISTRY,
	COMPILE_CAPABLE_COMMANDS,
	registerCliHandlers,
} from "src/cli/registerCliHandlers";
import type QuartzSyncer from "src/main";
import type { Publisher } from "src/publisher/Publisher";
import { buildPlugin } from "./handlers/helpers";

vi.mock("src/cli/handlers/cliUtils", () => ({
	createRepositoryAdapter: () => ({}),
}));

type Dispatch = (data: ObsidianCliData) => Promise<string>;

const setup = (publisherOverrides: Partial<Publisher> = {}) => {
	const registered = new Map<string, Dispatch>();
	const beginDynamicSession = vi.fn();
	const endDynamicSession = vi.fn();
	const publisher = {
		beginDynamicSession,
		endDynamicSession,
		getPublishStatus: vi.fn().mockResolvedValue({
			unpublished: [],
			changed: [],
			published: [],
			deleted: [],
			media: [],
			arbitrary: [],
		}),
		publishBatch: vi
			.fn()
			.mockResolvedValue({ success: true, filesPublished: 0 }),
		deleteBatch: vi
			.fn()
			.mockResolvedValue({ success: true, filesDeleted: 0 }),
		...publisherOverrides,
	} as unknown as Publisher;

	const getPublisher = vi.fn(() => publisher);
	const plugin = buildPlugin({
		getPublisher: getPublisher as unknown as () => Publisher | null,
		registerCliHandler: vi.fn(
			(
				name: string,
				_description: string,
				_flags: unknown,
				callback: Dispatch,
			) => {
				registered.set(name, callback);
			},
		),
	} as unknown as Partial<QuartzSyncer>);

	registerCliHandlers(plugin);

	return {
		registered,
		getPublisher,
		beginDynamicSession,
		endDynamicSession,
	};
};

const dispatch = async (
	registered: Map<string, Dispatch>,
	command: string,
	data: ObsidianCliData = {} as ObsidianCliData,
) => {
	const callback = registered.get(command);

	if (!callback) throw new Error(`not registered: ${command}`);

	return callback(data);
};

describe("registerCliHandlers dispatch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers every command with the callback as the fourth argument", () => {
		const { registered } = setup();

		expect(typeof registered.get("quartz-syncer:version")).toBe("function");
		expect(registered.size).toBe(COMMAND_REGISTRY.length);
	});

	// Pinned deliberately. A new publishing command that forgets
	// `compiles: true` loses session dedup silently — dynamic notes recompile
	// on every invocation with no error. Changing this list must be a
	// conscious edit, not an omission.
	it("pins the exact set of compile-capable commands", () => {
		const compiling = [...COMPILE_CAPABLE_COMMANDS].sort();

		expect(compiling).toEqual([
			"quartz-syncer:delete",
			"quartz-syncer:diff",
			"quartz-syncer:media",
			"quartz-syncer:publish",
			"quartz-syncer:status",
			"quartz-syncer:sync",
		]);
	});

	// The registry/handler bijection is enforced by the compiler:
	// `Record<CommandName, CliHandler>` makes a missing or misspelled key a
	// build error. This asserts the runtime consequence — every registry entry
	// actually dispatches — so a future refactor that loosens the type back to
	// `Record<string, CliHandler>` is still caught here.
	it("dispatches every registry entry to a real handler", async () => {
		const { registered } = setup();

		expect(registered.size).toBe(COMMAND_REGISTRY.length);

		for (const entry of COMMAND_REGISTRY) {
			expect(registered.has(entry.name)).toBe(true);

			const output = await dispatch(registered, entry.name, {
				help: "true",
			} as unknown as ObsidianCliData);
			expect(output).not.toContain("Unknown CLI command");
		}
	});

	it("returns the command metadata for the help flag", async () => {
		const { registered } = setup();

		const output = await dispatch(registered, "quartz-syncer:sync", {
			help: "true",
			format: "json",
		} as unknown as ObsidianCliData);
		const parsed = JSON.parse(output) as {
			success: boolean;
			data: { name: string; flags: Array<{ name: string }> };
		};

		expect(parsed.success).toBe(true);
		expect(parsed.data.name).toBe("quartz-syncer:sync");
		expect(parsed.data.flags.map((flag) => flag.name)).toContain("force");
	});

	it("emits JSON only when format=json is requested", async () => {
		const { registered } = setup();

		const json = await dispatch(registered, "quartz-syncer:status", {
			format: "json",
		} as unknown as ObsidianCliData);
		expect(() => JSON.parse(json)).not.toThrow();

		const text = await dispatch(registered, "quartz-syncer:status");
		expect(text.startsWith("{")).toBe(false);
	});

	it.each(["quartz-syncer:version", "quartz-syncer"])(
		"%s completes without constructing a Publisher",
		async (command) => {
			const { registered, getPublisher } = setup();

			await dispatch(registered, command);

			expect(getPublisher).not.toHaveBeenCalled();
		},
	);

	it("short-circuits the help flag before constructing a Publisher", async () => {
		const { registered, getPublisher } = setup();

		const output = await dispatch(registered, "quartz-syncer:version", {
			help: "true",
		} as unknown as ObsidianCliData);

		expect(getPublisher).not.toHaveBeenCalled();
		expect(output).toContain("quartz-syncer:version");
	});

	it.each([
		"quartz-syncer:publish",
		"quartz-syncer:sync",
		"quartz-syncer:diff",
	])("%s opens and discards exactly one session", async (command) => {
		const {
			registered,
			getPublisher,
			beginDynamicSession,
			endDynamicSession,
		} = setup();

		await dispatch(registered, command);

		expect(getPublisher).toHaveBeenCalled();
		expect(beginDynamicSession).toHaveBeenCalledTimes(1);
		expect(endDynamicSession).toHaveBeenCalledTimes(1);
	});

	it("discards the session when the handler rejects", async () => {
		const { registered, beginDynamicSession, endDynamicSession } = setup({
			getPublishStatus: vi
				.fn()
				.mockRejectedValue(new Error("compile exploded")),
		} as unknown as Partial<Publisher>);

		await expect(
			dispatch(registered, "quartz-syncer:publish"),
		).rejects.toThrow("compile exploded");

		expect(beginDynamicSession).toHaveBeenCalledTimes(1);
		expect(endDynamicSession).toHaveBeenCalledTimes(1);
		expect(endDynamicSession.mock.calls.length).toBe(
			beginDynamicSession.mock.calls.length,
		);
	});
});
