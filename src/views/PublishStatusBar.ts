/**
 * PublishStatusBar class.
 * This class manages the status bar item that displays the publishing status of notes.
 * It provides methods to increment the counter for published files, update the status text,
 */
export class PublishStatusBar {
	statusBarItem: HTMLElement;
	counter: number;
	numberOfNotesToPublish: number;

	status: HTMLElement;
	constructor(statusBarItem: HTMLElement, numberOfNotesToPublish: number) {
		this.statusBarItem = statusBarItem;
		this.counter = 0;
		this.numberOfNotesToPublish = numberOfNotesToPublish;

		this.statusBarItem.createEl("span", { text: "Quartz Syncer: " });

		this.status = this.statusBarItem.createEl("span", {
			text: `${this.numberOfNotesToPublish} files marked for publishing`,
		});
	}

	/**
	 * Increments the counter by a specified number of increments.
	 * Updates the status text to reflect the current count of published files.
	 *
	 * @param increments - The number of increments to add to the counter.
	 */
	incrementMultiple(increments: number) {
		this.counter += increments;

		this.status.innerText = `⌛Publishing files: ${this.counter}/${this.numberOfNotesToPublish}`;
	}

	/**
	 * Increments the counter by 1.
	 * Updates the status text to reflect the current count of published files.
	 */
	increment() {
		this.status.innerText = `⌛Publishing files: ${++this.counter}/${
			this.numberOfNotesToPublish
		}`;
	}

	/**
	 * Updates the status text to indicate that the publishing process is complete.
	 * Displays the total number of published files and removes the status bar item after a specified duration.
	 *
	 * @param displayDurationMillisec - The duration in milliseconds to display the status before removing it.
	 */
	finish(displayDurationMillisec: number) {
		this.status.innerText = `✅ Published files: ${this.counter}/${this.numberOfNotesToPublish}`;

		setTimeout(() => {
			this.statusBarItem.remove();
		}, displayDurationMillisec);
	}
}
