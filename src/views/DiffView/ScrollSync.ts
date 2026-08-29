export class ScrollSync {
	private isSyncing = false;
	private rafId: number | null = null;
	private leftHandler: () => void;
	private rightHandler: () => void;

	constructor(
		private leftPane: HTMLElement,
		private rightPane: HTMLElement,
	) {
		this.leftHandler = () => this.syncFrom(this.leftPane, this.rightPane);
		this.rightHandler = () => this.syncFrom(this.rightPane, this.leftPane);

		this.leftPane.addEventListener("scroll", this.leftHandler);
		this.rightPane.addEventListener("scroll", this.rightHandler);
	}

	destroy(): void {
		this.leftPane.removeEventListener("scroll", this.leftHandler);
		this.rightPane.removeEventListener("scroll", this.rightHandler);
		if (this.rafId !== null) {
			window.cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private syncFrom(source: HTMLElement, target: HTMLElement): void {
		if (this.isSyncing) return;
		this.isSyncing = true;
		this.rafId = window.requestAnimationFrame(() => {
			target.scrollTop = source.scrollTop;
			target.scrollLeft = source.scrollLeft;
			this.isSyncing = false;
		});
	}
}
