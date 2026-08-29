import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteFileSource } from "src/quartz/RemoteFileSource";
import type { GitBackend, TreeEntry } from "src/git/types";

const makeEntry = (path: string): TreeEntry => ({
	path,
	sha: `sha-${path}`,
	type: "blob",
});

const makeBackend = (
	entries: TreeEntry[] = [makeEntry("quartz.config.yaml")],
): GitBackend =>
	({
		readTree: vi.fn().mockResolvedValue(entries),
		readBlob: vi
			.fn()
			.mockResolvedValue(new TextEncoder().encode("content")),
		writeFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
		deleteFiles: vi.fn().mockResolvedValue({ sha: "abc" }),
	}) as unknown as GitBackend;

describe("RemoteFileSource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("caches tree across multiple read operations", async () => {
		const backend = makeBackend([
			makeEntry("quartz.config.yaml"),
			makeEntry("content/a.md"),
		]);
		const source = new RemoteFileSource(backend, "v5");

		await source.readFile("quartz.config.yaml");
		await source.exists("content/a.md");
		await source.listAllFiles();

		expect(backend.readTree).toHaveBeenCalledTimes(1);
	});

	it("clears tree cache after writeFile", async () => {
		const backend = makeBackend();
		const source = new RemoteFileSource(backend, "v5");

		await source.readFile("quartz.config.yaml");
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		await source.writeFile("quartz.config.yaml", "new content");
		await source.readFile("quartz.config.yaml");

		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("clears tree cache after writeBinaryFile", async () => {
		const backend = makeBackend();
		const source = new RemoteFileSource(backend, "v5");

		await source.exists("quartz.config.yaml");
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		await source.writeBinaryFile("image.png", new Uint8Array([1, 2, 3]));
		await source.exists("quartz.config.yaml");

		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("clears tree cache after deleteFile", async () => {
		const backend = makeBackend();
		const source = new RemoteFileSource(backend, "v5");

		await source.readFile("quartz.config.yaml");
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		await source.deleteFile("quartz.config.yaml");
		await source.readFile("quartz.config.yaml");

		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("clearTreeCache forces re-fetch on next read", async () => {
		const backend = makeBackend();
		const source = new RemoteFileSource(backend, "v5");

		await source.readFile("quartz.config.yaml");
		expect(backend.readTree).toHaveBeenCalledTimes(1);

		source.clearTreeCache();
		await source.readFile("quartz.config.yaml");

		expect(backend.readTree).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent tree fetches", async () => {
		const backend = makeBackend([makeEntry("a.md"), makeEntry("b.md")]);
		const source = new RemoteFileSource(backend, "v5");

		const [r1, r2] = await Promise.all([
			source.readFile("a.md"),
			source.exists("b.md"),
		]);

		expect(backend.readTree).toHaveBeenCalledTimes(1);
		expect(r1).toBe("content");
		expect(r2).toBe(true);
	});
});
