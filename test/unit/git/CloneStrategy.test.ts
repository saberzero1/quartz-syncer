import {
	FULL_CLONE_LIMIT_BYTES,
	resolveCloneStrategy,
} from "src/git/CloneStrategy";

const WITH_FILTER = ["shallow", "filter", "ofs-delta"];
const WITHOUT_FILTER = ["shallow", "ofs-delta"];
const HUGE = 2_300_000_000;
const SMALL = 10_000_000;

describe("resolveCloneStrategy", () => {
	it("filters when the server can, regardless of size", () => {
		expect(resolveCloneStrategy(WITH_FILTER, HUGE).kind).toBe("blobless");
	});

	it("filters when the server can and the size is unknown", () => {
		expect(resolveCloneStrategy(WITH_FILTER, null).kind).toBe("blobless");
	});

	it("still clones small repositories whole without filter support", () => {
		expect(resolveCloneStrategy(WITHOUT_FILTER, SMALL).kind).toBe("full");
	});

	it("refuses a large repository the server cannot filter", () => {
		const result = resolveCloneStrategy(WITHOUT_FILTER, HUGE);
		expect(result.kind).toBe("refuse");

		if (result.kind !== "refuse") throw new Error("unreachable");
		expect(result.reason).toContain("2.1 GB");
		expect(result.reason).toContain("partial clone");
	});

	// The boundary is asserted so it cannot drift silently: the limit itself is
	// still small enough to buffer, only what exceeds it is refused.
	it("permits exactly the limit and refuses one byte more", () => {
		expect(
			resolveCloneStrategy(WITHOUT_FILTER, FULL_CLONE_LIMIT_BYTES).kind,
		).toBe("full");

		expect(
			resolveCloneStrategy(WITHOUT_FILTER, FULL_CLONE_LIMIT_BYTES + 1)
				.kind,
		).toBe("refuse");
	});

	// Surfaced rather than waved through, which is only reasonable because the
	// user can opt back into the old behaviour.
	it("refuses an unmeasurable repository the server cannot filter", () => {
		const result = resolveCloneStrategy(WITHOUT_FILTER, null);
		expect(result.kind).toBe("refuse");

		if (result.kind !== "refuse") throw new Error("unreachable");
		expect(result.reason).toContain("could not be determined");
	});

	it("points every refusal at the setting that overrides it", () => {
		for (const size of [null, HUGE]) {
			const result = resolveCloneStrategy(WITHOUT_FILTER, size);

			if (result.kind !== "refuse") throw new Error("expected refusal");
			expect(result.reason).toContain("Allow large full clones");
		}
	});

	it("honours the override for a large unfilterable repository", () => {
		expect(
			resolveCloneStrategy(WITHOUT_FILTER, HUGE, {
				allowLargeFullClone: true,
			}).kind,
		).toBe("full");
	});

	it("honours the override when the size is unknown", () => {
		expect(
			resolveCloneStrategy(WITHOUT_FILTER, null, {
				allowLargeFullClone: true,
			}).kind,
		).toBe("full");
	});
});
