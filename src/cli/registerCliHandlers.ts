import type QuartzSyncer from "src/main";
import type { CliHandler, CliParams, CliResult } from "src/cli/types";
import { formatCliOutput } from "src/cli/formatOutput";
import { createStatusHandler } from "src/cli/handlers/statusHandler";
import { createSyncHandler } from "src/cli/handlers/syncHandler";
import { createPublishHandler } from "src/cli/handlers/publishHandler";
import { createDeleteHandler } from "src/cli/handlers/deleteHandler";
import { createMarkHandler } from "src/cli/handlers/markHandler";
import { createTestHandler } from "src/cli/handlers/testHandler";
import { createCacheHandler } from "src/cli/handlers/cacheHandler";
import { createConfigHandler } from "src/cli/handlers/configHandler";
import { createUpgradeHandler } from "src/cli/handlers/upgradeHandler";
import { createVersionHandler } from "src/cli/handlers/versionHandler";
import { createPluginHandler } from "src/cli/handlers/pluginHandler";
import { createQuartzConfigHandler } from "src/cli/handlers/quartzConfigHandler";

type ProtocolHandler = (params: Record<string, string>) => void | string;

type CliRegistrar = {
	registerObsidianProtocolHandler?: (
		command: string,
		handler: ProtocolHandler,
	) => void;
};

const COMMANDS = [
	"quartz-syncer:status",
	"quartz-syncer:sync",
	"quartz-syncer:publish",
	"quartz-syncer:delete",
	"quartz-syncer:mark",
	"quartz-syncer:test",
	"quartz-syncer:cache",
	"quartz-syncer:config",
	"quartz-syncer:upgrade",
	"quartz-syncer:version",
	"quartz-syncer:plugin",
	"quartz-syncer:quartz-config",
] as const;

const COMMAND_LABELS: Record<(typeof COMMANDS)[number], string> = {
	"quartz-syncer:status": "Quartz Syncer: status",
	"quartz-syncer:sync": "Quartz Syncer: sync",
	"quartz-syncer:publish": "Quartz Syncer: publish",
	"quartz-syncer:delete": "Quartz Syncer: delete",
	"quartz-syncer:mark": "Quartz Syncer: mark",
	"quartz-syncer:test": "Quartz Syncer: test",
	"quartz-syncer:cache": "Quartz Syncer: cache",
	"quartz-syncer:config": "Quartz Syncer: config",
	"quartz-syncer:upgrade": "Quartz Syncer: upgrade",
	"quartz-syncer:version": "Quartz Syncer: version",
	"quartz-syncer:plugin": "Quartz Syncer: plugin",
	"quartz-syncer:quartz-config": "Quartz Syncer: quartz-config",
};

export function registerCliHandlers(plugin: QuartzSyncer): void {
	const handlers: Record<string, CliHandler> = {
		"quartz-syncer:status": createStatusHandler(plugin),
		"quartz-syncer:sync": createSyncHandler(plugin),
		"quartz-syncer:publish": createPublishHandler(plugin),
		"quartz-syncer:delete": createDeleteHandler(plugin),
		"quartz-syncer:mark": createMarkHandler(plugin),
		"quartz-syncer:test": createTestHandler(plugin),
		"quartz-syncer:cache": createCacheHandler(plugin),
		"quartz-syncer:config": createConfigHandler(plugin),
		"quartz-syncer:upgrade": createUpgradeHandler(plugin),
		"quartz-syncer:version": createVersionHandler(plugin),
		"quartz-syncer:plugin": createPluginHandler(plugin),
		"quartz-syncer:quartz-config": createQuartzConfigHandler(plugin),
	};

	const registrar = plugin as QuartzSyncer & CliRegistrar;

	const registerProtocol = (command: string): void => {
		if (typeof registrar.registerObsidianProtocolHandler === "function") {
			registrar.registerObsidianProtocolHandler(command, (params) =>
				handleCommand(command, params),
			);
			return;
		}

		plugin.addCommand({
			id: command.replace(/[:/]/g, "-"),
			name: COMMAND_LABELS[command as (typeof COMMANDS)[number]] ??
				`Quartz Syncer: ${command}`,
			callback: () => {
				void handleCommand(command, {});
			},
		});
	};

	const handleCommand = async (
		command: string,
		rawParams: Record<string, string> | undefined,
	): Promise<string> => {
		const params = normalizeCliParams(rawParams);
		const format = params.args.format === "json" ? "json" : "text";
		const handler = handlers[command];
		const result = handler
			? await handler(params)
			: missingCommand(command);
		const output = formatCliOutput(result, format);
		console.debug(output);
		return output;
	};

	for (const command of COMMANDS) {
		registerProtocol(command);
	}
}

function normalizeCliParams(
	rawParams: Record<string, string> | undefined,
): CliParams {
	const args: Record<string, string> = {};
	const flags = new Set<string>();

	if (!rawParams) {
		return { args, flags };
	}

	for (const [key, value] of Object.entries(rawParams)) {
		const trimmedKey = key.trim();
		const trimmedValue = value?.trim();

		if (trimmedKey.includes("=") && (!trimmedValue || trimmedValue === "true")) {
			const [parsedKey, parsedValue] = trimmedKey.split("=", 2);
			if (parsedKey && parsedValue) {
				args[parsedKey] = parsedValue;
				continue;
			}
		}

		if (!trimmedValue || trimmedValue === "true") {
			flags.add(trimmedKey);
			continue;
		}

		args[trimmedKey] = trimmedValue;
	}

	return { args, flags };
}

function missingCommand(command: string): CliResult {
	return {
		success: false,
		error: `Unknown CLI command: ${command}`,
	};
}
