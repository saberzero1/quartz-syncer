/**
 * Shared plumbing for settings groups whose items are generated at render
 * time from an external list (vault folders, CSS snippet files, etc.) and
 * bound to a `string[]` field in settings via per-item toggles.
 */

/** Live view of an externally-sourced option list, refreshed on demand. */
export interface DynamicOptionListState {
	options: string[] | null;
	loading: boolean;
	refresh: () => void;
}

/**
 * Caches an async (or sync) list of options and notifies the setting tab to
 * re-render when a refresh completes. One instance per dynamic group.
 */
export class DynamicOptionListCache {
	private options: string[] | null = null;
	private loading = false;

	constructor(
		private readonly fetchOptions: () => Promise<string[]> | string[],
		private readonly onUpdate: () => void,
	) {}

	get state(): DynamicOptionListState {
		return {
			options: this.options,
			loading: this.loading,
			refresh: () => this.refresh(),
		};
	}

	/** Triggers the first fetch if nothing has been loaded yet. No-op otherwise. */
	ensureLoaded(): void {
		if (this.options === null && !this.loading) this.refresh();
	}

	/** Fetches and caches options. Pass a fetcher to override the constructor default for this call. */
	refresh(fetchOverride?: () => Promise<string[]> | string[]): void {
		if (this.loading) return;
		this.loading = true;

		Promise.resolve((fetchOverride ?? this.fetchOptions)())
			.then((options) => {
				this.options = options;
			})
			.catch(() => {
				this.options = [];
			})
			.finally(() => {
				this.loading = false;
				this.onUpdate();
			});
	}
}

/** Binds a `cssSnippet::`-style control key prefix to a `string[]` settings field. */
export interface DynamicToggleSetBinding {
	prefix: string;
	getSelected: () => string[];
	setSelected: (values: string[]) => void | Promise<void>;
}

/** Resolves a control value for `key` if it matches a registered binding, else undefined. */
export function resolveDynamicToggleValue(
	bindings: DynamicToggleSetBinding[],
	key: string,
): boolean | undefined {
	const binding = bindings.find((b) => key.startsWith(b.prefix));
	if (!binding) return undefined;

	const name = key.slice(binding.prefix.length);
	return binding.getSelected().includes(name);
}

/** Applies a control value for `key` if it matches a registered binding. Returns whether it did. */
export async function applyDynamicToggleValue(
	bindings: DynamicToggleSetBinding[],
	key: string,
	value: unknown,
): Promise<boolean> {
	const binding = bindings.find((b) => key.startsWith(b.prefix));
	if (!binding) return false;

	const name = key.slice(binding.prefix.length);
	const selected = new Set(binding.getSelected());

	if (value) {
		selected.add(name);
	} else {
		selected.delete(name);
	}

	await binding.setSelected(Array.from(selected));
	return true;
}
