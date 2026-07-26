declare function createDiv(o?: DomElementInfo | string): HTMLDivElement;
declare function createSpan(o?: DomElementInfo | string): HTMLSpanElement;
declare function createEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	o?: DomElementInfo | string,
): HTMLElementTagNameMap[K];
declare function createFragment(
	callback?: (el: DocumentFragment) => void,
): DocumentFragment;

interface DomElementInfo {
	cls?: string | string[];
	text?: string | DocumentFragment;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	parent?: Node;
	value?: string;
	type?: string;
	prepend?: boolean;
	placeholder?: string;
	href?: string;
}
