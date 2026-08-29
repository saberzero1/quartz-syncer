import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "obsidian";
import {
	isAbsolutePath,
	expandTilde,
	readExternalFile,
	externalFileExists,
	externalFileExistsSync,
	externalIsDirectorySync,
} from "src/utils/external-fs";

describe("isAbsolutePath", () => {
	it("detects Unix absolute paths", () => {
		expect(isAbsolutePath("/usr/bin")).toBe(true);
		expect(isAbsolutePath("/")).toBe(true);
	});

	it("detects tilde paths", () => {
		expect(isAbsolutePath("~")).toBe(true);
		expect(isAbsolutePath("~/Documents")).toBe(true);
	});

	it("detects Windows drive letter paths", () => {
		expect(isAbsolutePath("C:\\Users")).toBe(true);
		expect(isAbsolutePath("D:/Projects")).toBe(true);
	});

	it("detects UNC paths", () => {
		expect(isAbsolutePath("\\\\server\\share")).toBe(true);
	});

	it("rejects relative paths", () => {
		expect(isAbsolutePath("src/main.ts")).toBe(false);
		expect(isAbsolutePath("./relative")).toBe(false);
		expect(isAbsolutePath("file.txt")).toBe(false);
	});
});

describe("expandTilde", () => {
	beforeEach(() => {
		Platform.isDesktopApp = true;
		(window as Window & { require?: (module: string) => unknown }).require =
			vi.fn((module: string) => {
				if (module === "os") {
					return { homedir: () => "/home/testuser" };
				}
				throw new Error("Unknown module");
			});
	});

	afterEach(() => {
		Platform.isDesktopApp = true;
		vi.clearAllMocks();
	});

	it("expands ~ to home directory", () => {
		expect(expandTilde("~")).toBe("/home/testuser");
	});

	it("expands ~/path to home + path", () => {
		expect(expandTilde("~/Documents")).toBe("/home/testuser/Documents");
	});

	it("does not expand non-tilde paths", () => {
		expect(expandTilde("/usr/bin")).toBe("/usr/bin");
		expect(expandTilde("relative")).toBe("relative");
	});

	it("returns unchanged on mobile", () => {
		Platform.isDesktopApp = false;
		expect(expandTilde("~/Documents")).toBe("~/Documents");
	});
});

describe("desktop-gated functions", () => {
	it("readExternalFile returns null on mobile", async () => {
		Platform.isDesktopApp = false;
		expect(await readExternalFile("/some/path")).toBeNull();
	});

	it("externalFileExists returns false on mobile", async () => {
		Platform.isDesktopApp = false;
		expect(await externalFileExists("/some/path")).toBe(false);
	});

	it("externalFileExistsSync returns false on mobile", () => {
		Platform.isDesktopApp = false;
		expect(externalFileExistsSync("/some/path")).toBe(false);
	});

	it("externalIsDirectorySync returns false on mobile", () => {
		Platform.isDesktopApp = false;
		expect(externalIsDirectorySync("/some/path")).toBe(false);
	});
});
