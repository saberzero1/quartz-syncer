import { TCompilerStep } from "src/compiler/SyncerPageCompiler";
import { PublishFile } from "src/publishFile/PublishFile";
import { App } from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import {
	integrationRegistry,
	PatternMatch,
	CompileContext,
	PluginIntegration,
} from "./integrations";
import {
	getPerfMetrics,
	perfMetricsEnabled,
} from "src/operability/PerfMetrics";

export class PluginCompiler {
	app: App;
	settings: QuartzSyncerSettings;

	constructor(app: App, settings: QuartzSyncerSettings) {
		this.app = app;
		this.settings = settings;
	}

	compile: TCompilerStep = (file: PublishFile) => {
		return async (text: string) =>
			(await this.compileWithEvidence(file)(text)).text;
	};

	compileWithEvidence = (file: PublishFile) => {
		return async (text: string) => {
			const startedAt = perfMetricsEnabled ? performance.now() : 0;
			let compiledText = text;

			const vaultDependentIntegrations =
				integrationRegistry.getVaultDependentEnabled(this.settings);
			const availableAtStart = new Set(
				vaultDependentIntegrations
					.filter((integration) => integration.isAvailable())
					.map((integration) => integration.id),
			);
			const enabledIntegrations = integrationRegistry.getEnabled(
				this.settings,
			);
			const enabledVaultDependent = new Set(
				enabledIntegrations
					.filter((integration) => integration.isVaultDependent)
					.map((integration) => integration.id),
			);
			const observedVaultDependent = new Set<string>();
			const successfulVaultDependent = new Set<string>();
			const failedVaultDependent = new Set<string>();

			const context: CompileContext = {
				app: this.app,
				file,
			};

			for (const integration of enabledIntegrations) {
				if (integration.shouldTransformFile?.(file)) {
					compiledText = await integration.transformFile!(
						file,
						compiledText,
						context,
					);

					if (integration.isVaultDependent) {
						observedVaultDependent.add(integration.id);
						failedVaultDependent.add(integration.id);
					}
				}
			}

			for (const integration of enabledIntegrations) {
				const result = await this.compilePatterns(
					integration,
					compiledText,
					context,
				);
				compiledText = result.text;
				if (result.matched && integration.isVaultDependent) {
					observedVaultDependent.add(integration.id);
					if (result.failed) {
						failedVaultDependent.add(integration.id);
						successfulVaultDependent.delete(integration.id);
					} else if (!failedVaultDependent.has(integration.id)) {
						successfulVaultDependent.add(integration.id);
					}
				}
			}

			const availableAtEnd = new Set(
				vaultDependentIntegrations
					.filter((integration) => integration.isAvailable())
					.map((integration) => integration.id),
			);
			for (const source of successfulVaultDependent) {
				if (
					!availableAtStart.has(source) ||
					!availableAtEnd.has(source)
				) {
					successfulVaultDependent.delete(source);
				}
			}
			const allVaultDependentAvailable = vaultDependentIntegrations.every(
				(integration) =>
					availableAtStart.has(integration.id) &&
					enabledVaultDependent.has(integration.id) &&
					availableAtEnd.has(integration.id) &&
					!failedVaultDependent.has(integration.id),
			);
			file.correctDynamicContentAfterCompile(
				observedVaultDependent,
				allVaultDependentAvailable,
			);
			if (perfMetricsEnabled) {
				getPerfMetrics()?.addDuration("integrationMs", startedAt);
			}

			return {
				text: compiledText,
				successfulVaultDependentExecutions: successfulVaultDependent,
			};
		};
	};

	private async compilePatterns(
		integration: PluginIntegration,
		text: string,
		context: CompileContext,
	): Promise<{ text: string; matched: boolean; failed: boolean }> {
		let compiledText = text;
		let matched = false;
		let failed = false;
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
				matched = true;
				const result = await integration.compile(patternMatch, context);
				if (!result.successful) failed = true;

				compiledText = compiledText.replace(
					patternMatch.fullMatch,
					result.text,
				);
			}
		}

		return { text: compiledText, matched, failed };
	}

	getEnabledIntegrations(): PluginIntegration[] {
		return integrationRegistry.getEnabled(this.settings);
	}

	getCollectedAssets(): Map<string, { scss?: string }> {
		return integrationRegistry.getCollectedAssets(this.settings);
	}
}
