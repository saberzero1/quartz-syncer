import { LoadingController } from "src/models/ProgressBar";
import Logger from "js-logger";

/**
 * A LoadingController that logs progress instead of updating UI elements.
 * Used by CLI handlers where no visual progress bar is available.
 */
export class CliProgressController implements LoadingController {
	setProgress(percentage: number): void {
		Logger.debug(`CLI progress: ${percentage}%`);
	}

	setIndexText(indexText: string): void {
		Logger.debug(`CLI index: ${indexText}`);
	}

	setText(message: string): void {
		Logger.debug(`CLI status: ${message}`);
	}
}
