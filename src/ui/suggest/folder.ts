import { App, AbstractInputSuggest } from "obsidian";

/**
 * FolderSuggest class.
 * This class extends AbstractInputSuggest to provide folder suggestions based on user input.
 * It filters the list of folders in the vault and displays them as suggestions.
 */
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

	/**
	 * Returns the suggestions to display based on the user's input.
	 *
	 * @param inputStr - The user's input string.
	 * @returns An array of folder paths that match the input string.
	 */
	getSuggestions(inputStr: string): string[] {
		const inputLower = inputStr.toLowerCase();

		return this.folders.filter((folder) =>
			folder.toLowerCase().includes(inputLower),
		);
	}

	/**
	 * Renders a suggestion in the dropdown.
	 *
	 * @param folder - The folder path to render.
	 * @param el - The HTML element to render the suggestion in.
	 */
	renderSuggestion(folder: string, el: HTMLElement): void {
		el.setText(folder);
	}

	/**
	 * Handles the selection of a suggestion.
	 *
	 * @param folder - The selected folder path.
	 */
	selectSuggestion(folder: string): void {
		this.inputEl.value = folder;
		const event = new Event("input");
		this.inputEl.dispatchEvent(event);
		this.close();
	}
}
