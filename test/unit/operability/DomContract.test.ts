import { qsDom } from "src/operability/DomContract";

describe("qsDom", () => {
	it("basic role returns data-qs attribute", () => {
		expect(qsDom("pub-center")).toEqual({ "data-qs": "pub-center" });
	});

	it("role with single key returns prefixed key", () => {
		expect(qsDom("pub-row", { path: "notes/foo.md" })).toEqual({
			"data-qs": "pub-row",
			"data-qs-path": "notes/foo.md",
		});
	});

	it("role with multiple keys returns all prefixed keys", () => {
		expect(qsDom("wizard-input", { field: "token", step: "2" })).toEqual({
			"data-qs": "wizard-input",
			"data-qs-field": "token",
			"data-qs-step": "2",
		});
	});

	it("no keys returns only data-qs", () => {
		expect(qsDom("statusbar")).toEqual({ "data-qs": "statusbar" });
	});

	it("empty keys object returns only data-qs", () => {
		expect(qsDom("pub-center", {})).toEqual({ "data-qs": "pub-center" });
	});

	it("idempotent: same args produce equal objects", () => {
		const a = qsDom("pub-row", { path: "foo.md" });
		const b = qsDom("pub-row", { path: "foo.md" });
		expect(a).toEqual(b);
	});

	it("accepts all QSDomRole values", () => {
		const roles = [
			"pub-center",
			"pub-tab",
			"pub-row",
			"pub-checkbox",
			"pub-category",
			"pub-publish-btn",
			"pub-delete-btn",
			"pub-search",
			"pub-progress",
			"wizard",
			"wizard-step",
			"wizard-next",
			"wizard-back",
			"wizard-input",
			"wizard-error",
			"statusbar",
			"settings-test-btn",
			"settings-test-result",
			"notice",
			"diff-view",
		] as const;
		for (const role of roles) {
			const result = qsDom(role);
			expect(result["data-qs"]).toBe(role);
		}
	});
});
