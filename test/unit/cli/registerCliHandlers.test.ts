import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliData as ObsidianCliData } from "obsidian";
import {
	COMMAND_REGISTRY,
	COMPILE_CAPABLE_COMMANDS,
	normalizeCliParams,
	registerCliHandlers,
} from "src/cli/registerCliHandlers";
import type QuartzSyncer from "src/main";
import type { CommandMeta } from "src/cli/types";
import type { Publisher } from "src/publisher/Publisher";
import { buildPlugin } from "./handlers/helpers";

vi.mock("src/cli/handlers/cliUtils", async (importOriginal) => ({
	...(await importOriginal<typeof import("src/cli/handlers/cliUtils")>()),
	createRepositoryAdapter: () => ({}),
}));

const metaFor = (name: string): CommandMeta => {
	const meta = COMMAND_REGISTRY.find((entry) => entry.name === name);

	if (!meta) throw new Error(`not in registry: ${name}`);

	return meta;
};

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
		plugin,
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

	// Obsidian delivers `value=true` as the string "true", byte-identical to a
	// bare flag. Normalizing that into `flags` made every boolean setting
	// impossible to enable from the CLI, `ENABLE_DEVELOPER_TOOLS` included.
	it("sets a boolean setting to true through the full dispatch path", async () => {
		const { registered, plugin } = setup();

		const output = await dispatch(registered, "quartz-syncer:config", {
			action: "set",
			key: "enableSystemCommands",
			value: "true",
			format: "json",
		} as unknown as ObsidianCliData);

		expect(JSON.parse(output)).toEqual({
			success: true,
			data: { key: "enableSystemCommands", value: true },
		});
		expect(plugin.settings.enableSystemCommands).toBe(true);
	});

	it("clears a string setting to empty through the full dispatch path", async () => {
		const { registered, plugin } = setup();

		const output = await dispatch(registered, "quartz-syncer:config", {
			action: "set",
			key: "gitBranch",
			value: "",
			format: "json",
		} as unknown as ObsidianCliData);

		expect(JSON.parse(output)).toEqual({
			success: true,
			data: { key: "gitBranch", value: "" },
		});
		expect(plugin.settings.gitBranch).toBe("");
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

describe("normalizeCliParams", () => {
	// The whole classification rests on this: Obsidian cannot distinguish a
	// bare flag from `name=true`, so the registry has to, and it only can
	// while no single name means both things.
	it("never declares a name as both an argument and a flag", () => {
		for (const entry of COMMAND_REGISTRY) {
			const flagNames: string[] = entry.flags.map((flag) => flag.name);
			const collisions = entry.args
				.map((arg) => arg.name as string)
				.filter((name) => flagNames.includes(name));

			expect({ command: entry.name, collisions }).toEqual({
				command: entry.name,
				collisions: [],
			});
		}
	});

	it.each(["true", "false", "", "0", "a=b"])(
		"keeps %j as the value of a declared argument",
		(given) => {
			const params = normalizeCliParams(
				{ action: "set", key: "useDataview", value: given },
				metaFor("quartz-syncer:config"),
			);

			expect(params.args.value).toBe(given);
			expect(params.flags.has("value")).toBe(false);
		},
	);

	it("treats a bare declared flag as a flag", () => {
		const params = normalizeCliParams(
			{ action: "reset", force: "true" },
			metaFor("quartz-syncer:config"),
		);

		expect(params.flags.has("force")).toBe(true);
		expect(params.args.force).toBeUndefined();
	});

	// `force=false` arrives as the string "false", which is not flag-shaped,
	// so it must stay out of `flags` and leave the destructive path disarmed.
	it("does not arm a destructive flag given an explicit false", () => {
		const params = normalizeCliParams(
			{ action: "unpublish", path: "notes/post.md", force: "false" },
			metaFor("quartz-syncer:delete"),
		);

		expect(params.flags.has("force")).toBe(false);
	});

	it("keeps quartz-sync's true/false arguments as values", () => {
		const params = normalizeCliParams(
			{ commit: "true", push: "true", pull: "false" },
			metaFor("quartz-syncer:quartz-sync"),
		);

		expect(params.args).toMatchObject({
			commit: "true",
			push: "true",
			pull: "false",
		});
		expect([...params.flags]).toEqual([]);
	});

	it("falls back to flag classification for undeclared names", () => {
		const params = normalizeCliParams(
			{ mystery: "true", riddle: "answer" },
			metaFor("quartz-syncer:status"),
		);

		expect(params.flags.has("mystery")).toBe(true);
		expect(params.args.riddle).toBe("answer");
	});

	it("derives verbose from the flag set", () => {
		const meta = metaFor("quartz-syncer:status");

		expect(normalizeCliParams({ verbose: "true" }, meta).verbose).toBe(
			true,
		);

		expect(normalizeCliParams({ format: "json" }, meta).verbose).toBe(
			false,
		);
	});

	it("returns empty params when Obsidian passes no data", () => {
		const params = normalizeCliParams(undefined, metaFor("quartz-syncer"));

		expect(params).toEqual({
			args: {},
			flags: new Set(),
			verbose: false,
		});
	});

	// Defensive path: Obsidian splits `name=value` itself today. If it ever
	// stops, the value still has to survive whole, further `=` included.
	it("splits a key that still carries its own value", () => {
		const params = normalizeCliParams(
			{ "value=a=b": "true" },
			metaFor("quartz-syncer:config"),
		);

		expect(params.args.value).toBe("a=b");
		expect(params.flags.has("value")).toBe(false);
	});
});
