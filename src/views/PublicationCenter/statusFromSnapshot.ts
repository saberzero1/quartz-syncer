import type { PublishFile } from "src/publishFile/PublishFile";
import type { PublishStatus } from "src/publisher/types";
import type { StatusSnapshot } from "src/services/StatusCacheService";

const stub = (path: string) =>
	({
		file: { path },
		getVaultPath: () => path,
	}) as unknown as PublishFile;

/**
 * Rebuild a status from a persisted snapshot.
 *
 * Snapshots older than `STATUS_SNAPSHOT_VERSION` 2 predate the `dynamic` field
 * and cannot distinguish "nothing is dynamic" from "never recorded". Treating
 * that as an empty set would mark every restored row static and skip
 * resolution entirely, so it resolves to every known path — the safe direction
 * used throughout the cache layer. From v2 on, an explicitly empty array
 * means empty.
 */
export function statusFromSnapshot(snapshot: StatusSnapshot): PublishStatus {
	const unpublished = snapshot.unpublished.map(stub);
	const changed = snapshot.changed.map(stub);
	const published = snapshot.published.map(stub);

	const recordsDynamic =
		(snapshot.schemaVersion ?? 1) >= 2 && snapshot.dynamic !== undefined;

	const dynamic = recordsDynamic
		? new Set(snapshot.dynamic)
		: new Set(
				[...unpublished, ...changed, ...published].map((file) =>
					file.getVaultPath(),
				),
			);

	return {
		unpublished,
		changed,
		published,
		deleted: [...snapshot.deleted],
		media: [...snapshot.media],
		arbitrary: [...snapshot.arbitrary],
		mediaLinks: new Map(Object.entries(snapshot.mediaLinks)),
		dynamic,
	};
}
