import { describe, expect, it } from "vitest";
import { TreeState } from "src/views/PublicationCenter/TreeState";

function fixture(): TreeState {
	const state = new TreeState();
	state.setEntries([
		{ path: "notes/dynamic.md", category: "changed" },
		{ path: "notes/changed.md", category: "changed" },
		{ path: "notes/published.md", category: "published" },
	]);
	return state;
}

describe("TreeState category moves", () => {
	it("updates the path category without resetting selection or folder state", () => {
		const state = fixture();
		state.selectFile("notes/dynamic.md");
		state.filterText = "dynamic";
		const folders = new Set(state.expandedFolders);

		state.moveCategory("notes/dynamic.md", "published");

		expect(state.getCategory("notes/dynamic.md")).toBe("published");
		expect(state.getSelectedFiles()).toEqual(["notes/dynamic.md"]);
		expect(state.getSelectedCount("changed")).toBe(0);
		expect(state.getSelectedCount("published")).toBe(1);
		expect(state.getFolderSelectionState("notes")).toEqual({
			checked: false,
			indeterminate: true,
		});
		expect(state.expandedFolders).toEqual(folders);
		expect(state.filterText).toBe("dynamic");
	});

	it("increments the changed count when a published path moves to changed", () => {
		const state = fixture();

		state.moveCategory("notes/published.md", "changed");

		expect(state.getCategory("notes/published.md")).toBe("changed");
		expect(state.getCategoryCount("changed")).toBe(3);
		expect(state.getCategoryCount("published")).toBe(0);
	});

	it("increments the published count when a changed path moves to published", () => {
		const state = fixture();

		state.moveCategory("notes/dynamic.md", "published");

		expect(state.getCategoryCount("changed")).toBe(1);
		expect(state.getCategoryCount("published")).toBe(2);
	});

	it("selects only remaining changed paths after a move to published", () => {
		const state = fixture();
		state.moveCategory("notes/dynamic.md", "published");

		state.selectAll("changed");

		expect(state.getSelectedFiles()).toEqual(["notes/changed.md"]);
		expect(state.getSelectedCount("changed")).toBe(1);
		expect(state.getSelectedCount("published")).toBe(0);
	});
});
