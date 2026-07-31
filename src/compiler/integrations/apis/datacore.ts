import type { EventRef } from "obsidian";

interface DatacoreCore {
	revision?: number;
	on?(evt: "update", callback: (revision: number) => void): EventRef;
	on?(evt: "initialized", callback: () => void): EventRef;
	offref?(ref: EventRef): void;
}

interface DatacoreApi {
	core?: DatacoreCore;
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

export type { DatacoreApi, DatacoreCore };
