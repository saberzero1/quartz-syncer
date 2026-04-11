import { GitSettings } from "src/views/SettingsView/Views/GitSettings";
import { PerformanceSettings } from "src/views/SettingsView/Views/PerformanceSettings";
import { FrontmatterSettings } from "src/views/SettingsView/Views/FrontmatterSettings";
import { IntegrationSettings } from "src/views/SettingsView/Views/IntegrationSettings";
import { UISettings } from "src/views/SettingsView/Views/UISettings";
import { QuartzV5SettingsTab } from "src/views/SettingsView/Views/QuartzV5SettingsTab";

type QuartzSyncerSettingTabCollection = (
	| GitSettings
	| FrontmatterSettings
	| IntegrationSettings
	| PerformanceSettings
	| UISettings
	| QuartzV5SettingsTab
)[];

export default QuartzSyncerSettingTabCollection;
