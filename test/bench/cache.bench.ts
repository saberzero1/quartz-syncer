import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import {
	DATA_STORE_CACHE_VERSION,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import { markdownFiles, NOTE_COUNT, mediaOptions, report } from "./fixtures";
import {
	CACHE_ASSET_COUNT,
	CACHE_ASSET_MEAN_BYTES,
	CACHE_NOTE_BODY,
	cacheAsset,
} from "./cache-fixture";

test("cache composition and entry deserialization", async ({ bench }) => {
	const mediaNoteCount = Math.round(NOTE_COUNT * 0.055);
	const assets = Array.from({ length: CACHE_ASSET_COUNT }, (_, index) => {
		const asset = cacheAsset(index);
		return {
			...asset,
			payload: Buffer.alloc(asset.bytes, index + 1).toString("base64"),
		};
	});
	const current = markdownFiles.map((file, index) => {
		// Spread 550 single-embed notes throughout the vault, reusing 39 assets.
		const ordinal = Math.floor((index * mediaNoteCount) / NOTE_COUNT);
		const hasMedia =
			Math.floor(((index + 1) * mediaNoteCount) / NOTE_COUNT) > ordinal;
		const asset = hasMedia ? assets[ordinal % assets.length]! : undefined;
		const entry: QuartzSyncerCache = {
			version: DATA_STORE_CACHE_VERSION,
			time: 1_700_000_000_000,
			sourceMtime: 1_700_000_000_000,
			localHash: "a".repeat(40),
			localData: [
				CACHE_NOTE_BODY + (asset ? `\n![[${asset.path}]]\n` : ""),
				{
					blobs: asset
						? [{ path: asset.path, vaultPath: asset.path }]
						: [],
				},
			],
			remoteData: null,
			hasDynamicContent: false,
			mediaLinks: asset ? [asset.path] : [],
		};
		return { key: `file:${file.path}`, entry };
	});
	const byPath = new Map(assets.map((asset) => [asset.path, asset]));
	// Synthetic historical shape only. Never imported from or passed to live code.
	const old = current.map(({ key, entry }) => ({
		key,
		entry: {
			...entry,
			localData: [
				entry.localData![0],
				{
					blobs: entry.localData![1].blobs.map(({ path }) => ({
						path,
						content: byPath.get(path)!.payload,
					})),
				},
			],
		},
	}));
	const references = current.flatMap(
		({ entry }) => entry.localData![1].blobs,
	);
	expect(references).toHaveLength(mediaNoteCount);
	expect(new Set(references.map(({ path }) => path)).size).toBe(39);
	for (const [shape, entries] of [
		["current-deferred", current],
		["synthetic-old-base64", old],
	] as const) {
		// Count UTF-8 JSON bytes of records including keys, not JS heap/IDB disk size.
		const serializedBytes = Buffer.byteLength(
			JSON.stringify(
				Object.fromEntries(
					entries.map(({ key, entry }) => [key, entry]),
				),
			),
		);
		const binaryPayloadBytes = entries.reduce((sum, { entry }) => {
			// Inspect the actual modeled records, rather than assigning zero based
			// on the shape label. Prose and paths cannot match this payload pattern.
			const json = JSON.stringify(entry);
			return (
				sum +
				Array.from(
					json.matchAll(/"([A-Za-z0-9+/]{128,}={0,2})"/g),
				).reduce(
					(bytes, match) => bytes + Buffer.byteLength(match[1]!),
					0,
				)
			);
		}, 0);
		let clonedCount = 0;
		const measurement = await bench(
			`Cache / ${shape} / ${NOTE_COUNT} entries`,
			{
				async: false,
				afterEach: () => expect(clonedCount).toBe(NOTE_COUNT),
			},
			() => {
				clonedCount = 0;
				// IDB reads clone independent values, not a shared whole-cache graph.
				for (const { entry } of entries) {
					const clone: unknown = structuredClone(entry);
					if (clone !== entry) clonedCount++;
				}
			},
		).run(mediaOptions);
		report(measurement, {
			kind: `cache-${shape}`,
			shape,
			cacheVersion: DATA_STORE_CACHE_VERSION,
			noteCount: NOTE_COUNT,
			mediaNoteCount,
			distinctAssets: assets.length,
			assetMeanBytes: CACHE_ASSET_MEAN_BYTES,
			distinctAssetBytes: assets.reduce(
				(sum, asset) => sum + asset.bytes,
				0,
			),
			referencesPerAsset: mediaNoteCount / assets.length,
			serializedBytes,
			bytesPerNote: serializedBytes / NOTE_COUNT,
			binaryPayloadBytes,
			binarySharePercent: (binaryPayloadBytes / serializedBytes) * 100,
			entryDeserializationMs: measurement.latency.mean / NOTE_COUNT,
		});
	}
});
