import { VaultFsAdapter } from "src/git/backends/VaultFsAdapter";
import type { App } from "obsidian";

const basePath = ".quartz-syncer/repos/test";

function createApp(adapterOverrides: Partial<App["vault"]["adapter"]> = {}) {
	const adapter = {
		read: vi.fn(),
		readBinary: vi.fn(),
		write: vi.fn(),
		writeBinary: vi.fn(),
		list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
		stat: vi.fn(),
		mkdir: vi.fn(),
		remove: vi.fn(),
		...adapterOverrides,
	};
	const app = { vault: { adapter } } as App;
	return { app, adapter };
}

describe("VaultFsAdapter", () => {
	it("readFile returns string with utf8 encoding", async () => {
		const { app, adapter } = createApp();
		adapter.stat.mockResolvedValue({ type: "file", mtime: 0, size: 0 });
		adapter.read.mockResolvedValue("hello");

		const fs = new VaultFsAdapter(app, basePath);
		const result = await fs.promises.readFile("notes/test.md", {
			encoding: "utf8",
		});

		expect(result).toBe("hello");
		expect(adapter.read).toHaveBeenCalledWith(`${basePath}/notes/test.md`);
	});

	it("readFile returns Uint8Array for binary", async () => {
		const { app, adapter } = createApp();
		adapter.stat.mockResolvedValue({ type: "file", mtime: 0, size: 0 });
		adapter.readBinary.mockResolvedValue(new ArrayBuffer(2));

		const fs = new VaultFsAdapter(app, basePath);
		const result = await fs.promises.readFile("assets/logo.png");

		expect(result).toBeInstanceOf(Uint8Array);
		expect(adapter.readBinary).toHaveBeenCalledWith(
			`${basePath}/assets/logo.png`,
		);
	});

	it("writeFile delegates to adapter.write", async () => {
		const { app, adapter } = createApp();
		const fs = new VaultFsAdapter(app, basePath);
		await fs.promises.writeFile("notes/test.md", "content");

		expect(adapter.write).toHaveBeenCalledWith(
			`${basePath}/notes/test.md`,
			"content",
		);
	});

	it("writeFile delegates to adapter.writeBinary", async () => {
		const { app, adapter } = createApp();
		const fs = new VaultFsAdapter(app, basePath);
		const data = new Uint8Array([1, 2, 3]);
		await fs.promises.writeFile("assets/file.bin", data);

		expect(adapter.writeBinary).toHaveBeenCalled();
	});

	it("mkdir creates directory recursively", async () => {
		const { app, adapter } = createApp();
		const fs = new VaultFsAdapter(app, basePath);
		await fs.promises.mkdir("content/sub", { recursive: true });

		expect(adapter.mkdir).toHaveBeenCalledWith(`${basePath}/content/sub`);
	});

	it("stat returns file metadata", async () => {
		const { app, adapter } = createApp();
		adapter.stat.mockResolvedValue({ type: "file", mtime: 123, size: 456 });
		const fs = new VaultFsAdapter(app, basePath);
		const stat = await fs.promises.stat("notes/test.md");

		expect(stat.isFile()).toBe(true);
		expect(stat.isDirectory()).toBe(false);
		expect(stat.isSymbolicLink()).toBe(false);
		expect(stat.mtimeMs).toBe(123);
		expect(stat.size).toBe(456);
	});

	it("missing file throws ENOENT", async () => {
		const { app, adapter } = createApp();
		adapter.stat.mockResolvedValue(null);
		const fs = new VaultFsAdapter(app, basePath);
		await expect(fs.promises.readFile("missing.md")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
