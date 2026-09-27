import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

describe("DOM contract consistency", () => {
	const repoRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../..",
	);

	const declaredRoles = [
		...readFileSync(
			resolve(repoRoot, "src/operability/DomContract.ts"),
			"utf8",
		).matchAll(/\|\s*"([a-z0-9-]+)"/g),
	].map((match) => match[1] as string);

	const sourceText = globSync("src/**/*.ts", { cwd: repoRoot })
		.filter((file) => !file.endsWith("DomContract.ts"))
		.map((file) => readFileSync(resolve(repoRoot, file), "utf8"))
		.join("\n");

	const agentsDoc = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");

	it("applies every declared role to at least one element", () => {
		const unapplied = declaredRoles.filter(
			(role) => !sourceText.includes(`qsDom("${role}"`),
		);
		expect(unapplied).toEqual([]);
	});

	it("documents every declared role in the AGENTS.md contract table", () => {
		const undocumented = declaredRoles.filter(
			(role) => !agentsDoc.includes(`[data-qs="${role}"]`),
		);
		expect(undocumented).toEqual([]);
	});

	it("declares every role documented in AGENTS.md", () => {
		const documented = [
			...agentsDoc.matchAll(/\[data-qs="([a-z0-9-]+)"\]/g),
		].map((match) => match[1] as string);
		const undeclared = [...new Set(documented)].filter(
			(role) => !declaredRoles.includes(role),
		);
		expect(undeclared).toEqual([]);
	});

	it("sets data-qs only through qsDom()", () => {
		expect(sourceText).not.toMatch(/setAttribute\(\s*["']data-qs["']/);
		expect(sourceText).not.toMatch(/["']data-qs["']\s*:/);
	});
});
