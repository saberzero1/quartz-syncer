// Deterministic prose and asset sizes shared with the persistence regression test.
export const CACHE_NOTE_BODY = `# Field observations\n\n${"The trail follows the river through woodland. We recorded the weather, compared earlier observations, and linked the photographs for later review.\n\n".repeat(
	7,
)}`;
export const CACHE_ASSET_COUNT = 39;
export const CACHE_ASSET_MEAN_BYTES = 170 * 1024;

export function cacheAsset(index: number) {
	const path = `attachments/field-photo-${index}.png`;
	// Symmetric 94–246 KiB distribution; mean exactly 170 KiB across 39 assets.
	const bytes = CACHE_ASSET_MEAN_BYTES + (index - 19) * 4 * 1024;
	return { path, bytes };
}
