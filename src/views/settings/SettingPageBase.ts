import * as obsidian from "obsidian";

class SettingPagePolyfill {
	rootEl!: HTMLElement;
	containerEl!: HTMLElement;
	titlebarEl!: HTMLElement;
	title = "";
	description = "";

	display(): void {}
}

const RealSettingPage =
	"SettingPage" in obsidian
		? (obsidian as unknown as { SettingPage: typeof SettingPagePolyfill })
				.SettingPage
		: SettingPagePolyfill;

export const SettingPageBase: typeof SettingPagePolyfill = RealSettingPage;
