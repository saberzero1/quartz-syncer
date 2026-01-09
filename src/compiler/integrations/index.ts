export * from "./types";
export { integrationRegistry, IntegrationRegistry } from "./registry";
export { AssetSyncer, AssetSyncResult } from "./AssetSyncer";

import { integrationRegistry } from "./registry";
import { DataviewIntegration } from "./dataview";
import { DatacoreIntegration } from "./datacore";
import { ExcalidrawIntegration } from "./excalidraw";
import { FantasyStatblocksIntegration } from "./fantasy-statblocks";
import { AutoCardLinkIntegration } from "./auto-card-link";

export {
	DataviewIntegration,
	DatacoreIntegration,
	ExcalidrawIntegration,
	FantasyStatblocksIntegration,
	AutoCardLinkIntegration,
};

integrationRegistry.register(AutoCardLinkIntegration);
integrationRegistry.register(DataviewIntegration);
integrationRegistry.register(DatacoreIntegration);
integrationRegistry.register(ExcalidrawIntegration);
integrationRegistry.register(FantasyStatblocksIntegration);
