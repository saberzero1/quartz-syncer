import QuartzSyncerSettings from "src/models/settings";
import { PluginIntegration, PatternDescriptor, QuartzAssets } from "./types";

export class IntegrationRegistry {
	private integrations: PluginIntegration[] = [];

	register(integration: PluginIntegration): void {
		this.integrations.push(integration);
	}

	getAll(): PluginIntegration[] {
		return [...this.integrations];
	}

	getEnabled(settings: QuartzSyncerSettings): PluginIntegration[] {
		return this.integrations
			.filter((i) => settings[i.settingKey] && i.isAvailable())
			.sort((a, b) => a.priority - b.priority);
	}

	getAvailable(): PluginIntegration[] {
		return this.integrations.filter((i) => i.isAvailable());
	}

	getAllPatterns(settings: QuartzSyncerSettings): PatternDescriptor[] {
		return this.getEnabled(settings).flatMap((i) => i.getPatterns());
	}

	getCollectedAssets(
		settings: QuartzSyncerSettings,
	): Map<string, QuartzAssets> {
		const assets = new Map<string, QuartzAssets>();

		for (const integration of this.getEnabled(settings)) {
			if (integration.assets.scss) {
				assets.set(integration.id, integration.assets);
			}
		}

		return assets;
	}

	getById(id: string): PluginIntegration | undefined {
		return this.integrations.find((i) => i.id === id);
	}
}

export const integrationRegistry = new IntegrationRegistry();
