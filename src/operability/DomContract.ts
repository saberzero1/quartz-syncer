export type QSDomRole =
	| "pub-center"
	| "pub-tab"
	| "pub-row"
	| "pub-checkbox"
	| "pub-category"
	| "pub-publish-btn"
	| "pub-delete-btn"
	| "pub-search"
	| "pub-progress"
	| "wizard"
	| "wizard-step"
	| "wizard-next"
	| "wizard-back"
	| "wizard-input"
	| "wizard-error"
	| "statusbar"
	| "settings-test-btn"
	| "settings-test-result"
	| "notice"
	| "diff-view";

/**
 * Generates stable DOM attributes for the operability DOM contract.
 * All agent/test automation uses [data-qs="..."] selectors exclusively.
 *
 * @param role - The semantic role identifier (e.g., "pub-row", "wizard-step")
 * @param keys - Optional key-value pairs for additional identification (e.g., { path: "notes/foo.md" })
 * @returns An object of attributes to set on a DOM element via el.setAttrs()
 *
 * @example
 * // In view code:
 * el.setAttrs(qsDom("pub-row", { path: file.path }));
 * // Produces: { "data-qs": "pub-row", "data-qs-path": "notes/foo.md" }
 *
 * // Agent queries:
 * // obsidian dev:dom selector='[data-qs="pub-row"]' total
 * // obsidian dev:dom selector='[data-qs="pub-row"][data-qs-path="notes/foo.md"]' text
 */
export function qsDom(
	role: QSDomRole,
	keys?: Record<string, string>,
): Record<string, string> {
	const attributes: Record<string, string> = {
		"data-qs": role,
	};

	if (!keys) {
		return attributes;
	}

	for (const [key, value] of Object.entries(keys)) {
		attributes[`data-qs-${key}`] = value;
	}

	return attributes;
}
