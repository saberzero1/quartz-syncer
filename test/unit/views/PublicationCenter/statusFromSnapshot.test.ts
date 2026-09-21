import { describe, expect, it } from "vitest";
import { statusFromSnapshot } from "src/views/PublicationCenter/statusFromSnapshot";
import type { StatusSnapshot } from "src/services/StatusCacheService";

const baseSnapshot = (): StatusSnapshot => ({
	schemaVersion: 2,
	destination: "none",
	unpublished: ["notes/a.md"],
	changed: ["notes/b.md"],
	published: ["notes/c.md"],
	deleted: ["notes/d.md"],
	media: [],
	arbitrary: [],
	mediaLinks: {},
	timestamp: 100,
});

describe("statusFromSnapshot", () => {
	it("restores an explicit dynamic set", () => {
		const status = statusFromSnapshot({
			...baseSnapshot(),
			dynamic: ["notes/b.md"],
		});

		expect(status.dynamic).toEqual(new Set(["notes/b.md"]));
	});

	it("keeps an explicitly empty dynamic set empty", () => {
		const status = statusFromSnapshot({
			...baseSnapshot(),
			dynamic: [],
		});

		expect(status.dynamic).toEqual(new Set());
	});

	it("treats a v2 snapshot without the field as fully unknown", () => {
		const snapshot = baseSnapshot();
		expect("dynamic" in snapshot).toBe(false);

		const status = statusFromSnapshot(snapshot);

		expect(status.dynamic).toEqual(
			new Set(["notes/a.md", "notes/b.md", "notes/c.md"]),
		);
	});

	it("treats a v1 snapshot as fully unknown even if it carries dynamic", () => {
		const { schemaVersion: _omitted, ...v1 } = baseSnapshot();

		const status = statusFromSnapshot({
			...v1,
			dynamic: ["notes/b.md"],
		} as StatusSnapshot);

		expect(status.dynamic).toEqual(
			new Set(["notes/a.md", "notes/b.md", "notes/c.md"]),
		);
	});

	it("does not confuse a legacy snapshot with an empty one", () => {
		const legacy = statusFromSnapshot(baseSnapshot());
		const empty = statusFromSnapshot({ ...baseSnapshot(), dynamic: [] });

		expect(legacy.dynamic).not.toEqual(empty.dynamic);
	});

	it("restores the non-dynamic fields unchanged", () => {
		const status = statusFromSnapshot({
			...baseSnapshot(),
			mediaLinks: { "media/img.png": ["notes/a.md"] },
			dynamic: [],
		});

		expect(status.unpublished.map((f) => f.getVaultPath())).toEqual([
			"notes/a.md",
		]);
		expect(status.changed.map((f) => f.getVaultPath())).toEqual([
			"notes/b.md",
		]);
		expect(status.published.map((f) => f.getVaultPath())).toEqual([
			"notes/c.md",
		]);
		expect(status.deleted).toEqual(["notes/d.md"]);
		expect(status.mediaLinks).toEqual(
			new Map([["media/img.png", ["notes/a.md"]]]),
		);
	});
});
