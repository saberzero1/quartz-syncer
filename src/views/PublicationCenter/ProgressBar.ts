/**
 * This interface defines the "contract" for the UI controller.
 * Our data loader will call these methods to update the UI.
 */
export interface LoadingController {
	/** Updates the progress bar's value (0-100). */
	setProgress(percentage: number): void;
	/** Updates a descriptive text element. */
	setText(message: string): void;
}
