import { DataviewCompiler } from "src/compiler/plugins/DataviewCompiler";
import { DatacoreCompiler } from "./plugins/DatacoreCompiler";
import { FantasyStatblocksCompiler } from "./plugins/FantasyStatblocksCompiler";
import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { App } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";

type IntegrationTarget = {
	compiler:
		| typeof DataviewCompiler
		| typeof DatacoreCompiler
		| typeof FantasyStatblocksCompiler;
	enabled: boolean;
};

/**
 * PluginCompiler is a class that compiles various plugins for the Publish plugin.
 * It provides methods to convert Dataview, Datacore, and Fantasy Statblocks queries in the text to their results.
 */
export class PluginCompiler {
	app: App;
	settings: QuartzSyncerSettings;

	constructor(app: App, settings: QuartzSyncerSettings) {
		this.app = app;
		this.settings = settings;
	}

	integrationTargets = (): IntegrationTarget[] => {
		return [
			{
				compiler: DataviewCompiler,
				enabled: this.settings.useDataview,
			},
			{
				compiler: DatacoreCompiler,
				enabled: this.settings.useDatacore,
			},
			{
				compiler: FantasyStatblocksCompiler,
				enabled: this.settings.useFantasyStatblocks,
			},
		];
	};

	compile: TCompilerStep = (file: PublishFile) => {
		return async (text: string) => {
			let compiledText = text;

			for (const target of this.integrationTargets()) {
				if (target.enabled) {
					const compiler = new target.compiler(this.app);
					compiledText = await compiler.compile(file)(compiledText);
				}
			}

			return compiledText;
		};
	};
}
