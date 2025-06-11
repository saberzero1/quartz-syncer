import { App, AbstractInputSuggest } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<string> {
	private folders: string[];
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);

		this.inputEl = inputEl;

		this.folders = this.app.vault
			.getAllFolders(true)
			.map((folder) =>
				folder.path.endsWith("/") ? folder.path : folder.path + "/",
			);
	}

	getSuggestions(inputStr: string): string[] {
		const inputLower = inputStr.toLowerCase();

		return this.folders.filter((folder) =>
			folder.toLowerCase().includes(inputLower),
		);
	}

	renderSuggestion(folder: string, el: HTMLElement): void {
		el.setText(folder);
	}

	selectSuggestion(folder: string): void {
		this.inputEl.value = folder;
		const event = new Event("input");
		this.inputEl.dispatchEvent(event);
		this.close();
	}
}
