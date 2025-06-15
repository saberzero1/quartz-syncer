import { QuartzSettings } from "src/views/SettingsView/Views/QuartzSettings";
import { GithubSettings } from "src/views/SettingsView/Views/GithubSettings";
import { PerformanceSettings } from "src/views/SettingsView/Views/PerformanceSettings";
import { FrontmatterSettings } from "src/views/SettingsView/Views/FrontmatterSettings";
import { IntegrationSettings } from "src/views/SettingsView/Views/IntegrationSettings";
import { ThemesSettings } from "src/views/SettingsView/Views/ThemesSettings";

/**
 * QuartzSyncerSettingTabCollection type.
 * This type represents a collection of setting tabs for the QuartzSyncer plugin.
 */
type QuartzSyncerSettingTabCollection = (
	| QuartzSettings
	| GithubSettings
	| FrontmatterSettings
	| IntegrationSettings
	| PerformanceSettings
	| ThemesSettings
)[];

export default QuartzSyncerSettingTabCollection;
