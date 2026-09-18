import { describe, expect, it } from "vitest";
import { DynamicCompilationSession } from "src/services/DynamicCompilationSession";
import { CompiledEntryValidityCriteria } from "src/cache/CompiledEntryValidity";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";

function makeCriteria(
	overrides: Partial<CompiledEntryValidityCriteria> = {},
): CompiledEntryValidityCriteria {
	return {
		mtime: 1000,
		dataviewRevision: 11,
		datacoreRevision: 22,
		version: "1.0.0",
		settingsFingerprint: "fingerprint",
		detectorVersion: "vault-dependencies-v2",
		...overrides,
	};
}

function makeCompiled(text: string): TCompiledFile {
	return [text, { blobs: [] }];
}

describe("DynamicCompilationSession", () => {
	it("reuses output while every criterion still matches", () => {
		const session = new DynamicCompilationSession(10);
		session.set("a.md", makeCompiled("compiled"), makeCriteria());

		expect(session.get("a.md", makeCriteria())).toEqual(
			makeCompiled("compiled"),
		);
	});

	it.each([
		{ field: "mtime", value: 2000 },
		{ field: "dataviewRevision", value: 12 },
		{ field: "datacoreRevision", value: 23 },
		{ field: "version", value: "2.0.0" },
		{ field: "settingsFingerprint", value: "other" },
		{ field: "detectorVersion", value: "next" },
	])("discards output when $field changes", ({ field, value }) => {
		const session = new DynamicCompilationSession(10);
		session.set("a.md", makeCompiled("compiled"), makeCriteria());

		const changed = makeCriteria({
			[field]: value,
		} as Partial<CompiledEntryValidityCriteria>);

		expect(session.get("a.md", changed)).toBeNull();
		expect(session.size).toBe(0);
	});

	it("treats an undefined revision as distinct from a numeric one", () => {
		const session = new DynamicCompilationSession(10);
		session.set("a.md", makeCompiled("compiled"), makeCriteria());

		expect(
			session.get("a.md", makeCriteria({ dataviewRevision: undefined })),
		).toBeNull();
	});

	it("evicts least recently used entries beyond the bound", () => {
		const session = new DynamicCompilationSession(2);
		session.set("a.md", makeCompiled("a"), makeCriteria());
		session.set("b.md", makeCompiled("b"), makeCriteria());

		expect(session.get("a.md", makeCriteria())).toEqual(makeCompiled("a"));

		session.set("c.md", makeCompiled("c"), makeCriteria());

		expect(session.size).toBe(2);
		expect(session.get("b.md", makeCriteria())).toBeNull();
		expect(session.get("a.md", makeCriteria())).toEqual(makeCompiled("a"));
		expect(session.get("c.md", makeCriteria())).toEqual(makeCompiled("c"));
	});

	it("never grows past the bound under sustained writes", () => {
		const session = new DynamicCompilationSession(3);

		for (let index = 0; index < 50; index += 1) {
			session.set(
				`note-${index}.md`,
				makeCompiled(`text-${index}`),
				makeCriteria(),
			);
		}

		expect(session.size).toBe(3);
	});

	it("stores nothing when the bound is zero", () => {
		const session = new DynamicCompilationSession(0);
		session.set("a.md", makeCompiled("a"), makeCriteria());

		expect(session.size).toBe(0);
		expect(session.get("a.md", makeCriteria())).toBeNull();
	});

	it("invalidates a single path without disturbing others", () => {
		const session = new DynamicCompilationSession(10);
		session.set("a.md", makeCompiled("a"), makeCriteria());
		session.set("b.md", makeCompiled("b"), makeCriteria());

		session.invalidate("a.md");

		expect(session.get("a.md", makeCriteria())).toBeNull();
		expect(session.get("b.md", makeCriteria())).toEqual(makeCompiled("b"));
	});

	it("is empty after the session ends", () => {
		const session = new DynamicCompilationSession(10);
		session.set("a.md", makeCompiled("a"), makeCriteria());
		session.set("b.md", makeCompiled("b"), makeCriteria());

		session.clear();

		expect(session.size).toBe(0);
		expect(session.get("a.md", makeCriteria())).toBeNull();
	});
});
