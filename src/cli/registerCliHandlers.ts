import type QuartzSyncer from "main";
import { RegisterCliHandlerTarget, RegisterFn, CliData } from "./types";
import {
	normalizeCliParams,
	generateCommandHelp,
	withDashAliases,
	formatCliOutput,
} from "./formatOutput";
import { createStatusHandler } from "./handlers/statusHandler";
import { createSyncHandler } from "./handlers/syncHandler";
import { createPublishHandler } from "./handlers/publishHandler";
import { createDeleteHandler } from "./handlers/deleteHandler";
import { createMarkHandler } from "./handlers/markHandler";
import { createTestHandler } from "./handlers/testHandler";
import { createCacheHandler } from "./handlers/cacheHandler";
import { createConfigHandler } from "./handlers/configHandler";
import { createUpgradeHandler } from "./handlers/upgradeHandler";
import { createVersionHandler } from "./handlers/versionHandler";
import { createPluginHandler } from "./handlers/pluginHandler";
import { createQuartzConfigHandler } from "./handlers/quartzConfigHandler";
import { createHelpHandler } from "./handlers/helpHandler";
import Logger from "js-logger";

/**
 * Register all CLI handlers for the plugin.
 * Returns false if registerCliHandler is not available (older Obsidian versions).
 */
export function registerCliHandlers(plugin: QuartzSyncer): boolean {
	const target = plugin as unknown as RegisterCliHandlerTarget;

	if (typeof target.registerCliHandler !== "function") {
		Logger.debug(
			"Skipping CLI handler registration: registerCliHandler is unavailable.",
		);

		return false;
	}

	const rawRegister = target.registerCliHandler.bind(target);

	const register: RegisterFn = (command, description, flags, handler) => {
		const expandedFlags = withDashAliases(flags);

		rawRegister(command, description, expandedFlags, (params: CliData) => {
			const normalized = normalizeCliParams(params);

			if (normalized.help === "true" && command !== "quartz-syncer") {
				const helpText = generateCommandHelp(
					command,
					description,
					flags,
				);

				if (normalized.format === "json") {
					return formatCliOutput(normalized, {
						ok: true,
						command,
						message: helpText,
					});
				}

				return helpText;
			}

			return handler(normalized);
		});
	};

	// Default: Help / usage
	createHelpHandler(register, plugin);

	// Tier 1: Core operations
	createStatusHandler(register, plugin);
	createSyncHandler(register, plugin);
	createPublishHandler(register, plugin);

	// Tier 2: Useful additions
	createDeleteHandler(register, plugin);
	createMarkHandler(register, plugin);
	createTestHandler(register, plugin);

	// Tier 3: Power user / automation
	createCacheHandler(register, plugin);
	createConfigHandler(register, plugin);
	createUpgradeHandler(register, plugin);
	createVersionHandler(register, plugin);
	createPluginHandler(register, plugin);
	createQuartzConfigHandler(register, plugin);

	Logger.info("CLI handlers registered successfully.");

	return true;
}
