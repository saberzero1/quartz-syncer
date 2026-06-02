interface DatacoreApi {
	executeJs(
		query: string,
		el: HTMLElement,
		component: unknown,
		filePath: string,
	): void;
	executeJsx(
		query: string,
		el: HTMLElement,
		component: unknown,
		filePath: string,
	): void;
	executeTs(
		query: string,
		el: HTMLElement,
		component: unknown,
		filePath: string,
	): void;
	executeTsx(
		query: string,
		el: HTMLElement,
		component: unknown,
		filePath: string,
	): void;
}

export type { DatacoreApi };
