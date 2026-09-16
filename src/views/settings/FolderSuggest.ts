import { App, AbstractInputSuggest, normalizePath } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<string> {
	private folders: string[];
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);

		this.inputEl = inputEl;

		this.folders = this.app.vault
			.getAllFolders(true)
			.map((folder) => normalizePath(folder.path));
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
		this.inputEl.dispatchEvent(new Event("input"));
		this.close();
	}
}
