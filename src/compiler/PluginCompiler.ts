import { PublishFile } from "src/publishFile/PublishFile";
import { App } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import type { TStyledCompilerStep } from "src/compiler/SyncerPageCompiler";
import {
	integrationRegistry,
	PatternMatch,
	CompileContext,
	PluginIntegration,
} from "./integrations";

export class PluginCompiler {
	app: App;
	settings: QuartzSyncerSettings;

	constructor(app: App, settings: QuartzSyncerSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * @param styles - Optional mutable collector for CSS discovered while
	 * compiling this file (e.g. Dataview's `dv.view()` `view.css`).
	 */
	compile: TStyledCompilerStep = (file: PublishFile, styles?: string[]) => {
		return async (text: string) => {
			let compiledText = text;

			const enabledIntegrations = integrationRegistry.getEnabled(
				this.settings,
			);

			const context: CompileContext = {
				app: this.app,
				file,
				styles,
			};

			for (const integration of enabledIntegrations) {
				if (integration.shouldTransformFile?.(file)) {
					compiledText = await integration.transformFile!(
						file,
						compiledText,
						context,
					);
				}
			}

			for (const integration of enabledIntegrations) {
				compiledText = await this.compilePatterns(
					integration,
					compiledText,
					context,
				);
			}

			return compiledText;
		};
	};

	private async compilePatterns(
		integration: PluginIntegration,
		text: string,
		context: CompileContext,
	): Promise<string> {
		let compiledText = text;
		const patterns = integration.getPatterns();

		for (const descriptor of patterns) {
			const regex = new RegExp(
				descriptor.pattern.source,
				descriptor.pattern.flags,
			);
			const matches: PatternMatch[] = [];

			let match;

			// Match against the original text intentionally — not compiledText.
			// This prevents cascading replacements where pattern A's output
			// could trigger false matches in pattern B.
			while ((match = regex.exec(text)) !== null) {
				matches.push({
					descriptor,
					fullMatch: match[0],
					captures: match.slice(1),
				});
			}

			for (const patternMatch of matches) {
				const replacement = await integration.compile(
					patternMatch,
					context,
				);

				compiledText = compiledText.replace(
					patternMatch.fullMatch,
					replacement,
				);
			}
		}

		return compiledText;
	}

	getEnabledIntegrations(): PluginIntegration[] {
		return integrationRegistry.getEnabled(this.settings);
	}

	getCollectedAssets(): Map<string, { scss?: string }> {
		return integrationRegistry.getCollectedAssets(this.settings);
	}
}
