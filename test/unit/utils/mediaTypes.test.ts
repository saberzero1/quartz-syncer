import { describe, expect, it } from "vitest";
import {
	getMediaIcon,
	isMediaFile,
	isTextMediaFile,
} from "src/utils/mediaTypes";

describe("isMediaFile", () => {
	it("returns true for supported media extensions", () => {
		expect(isMediaFile("photo.png")).toBe(true);
		expect(isMediaFile("photo.jpg")).toBe(true);
		expect(isMediaFile("photo.jpeg")).toBe(true);
		expect(isMediaFile("animation.gif")).toBe(true);
		expect(isMediaFile("image.webp")).toBe(true);
		expect(isMediaFile("image.bmp")).toBe(true);
		expect(isMediaFile("image.tiff")).toBe(true);
		expect(isMediaFile("icon.svg")).toBe(true);
		expect(isMediaFile("favicon.ico")).toBe(true);
		expect(isMediaFile("video.mp4")).toBe(true);
		expect(isMediaFile("video.mkv")).toBe(true);
		expect(isMediaFile("video.mov")).toBe(true);
		expect(isMediaFile("video.avi")).toBe(true);
		expect(isMediaFile("video.webm")).toBe(true);
		expect(isMediaFile("audio.mp3")).toBe(true);
		expect(isMediaFile("audio.wav")).toBe(true);
		expect(isMediaFile("audio.ogg")).toBe(true);
		expect(isMediaFile("document.pdf")).toBe(true);
		expect(isMediaFile("font.woff")).toBe(true);
		expect(isMediaFile("font.woff2")).toBe(true);
		expect(isMediaFile("font.ttf")).toBe(true);
		expect(isMediaFile("font.otf")).toBe(true);
	});

	it("returns false for non-media extensions", () => {
		expect(isMediaFile("note.md")).toBe(false);
		expect(isMediaFile("script.ts")).toBe(false);
		expect(isMediaFile("script.js")).toBe(false);
		expect(isMediaFile("readme.txt")).toBe(false);
	});

	it("returns false for paths with no extension", () => {
		expect(isMediaFile("README")).toBe(false);
		expect(isMediaFile("Makefile")).toBe(false);
		expect(isMediaFile("noextension")).toBe(false);
	});

	it("is case-insensitive for extensions", () => {
		expect(isMediaFile("photo.PNG")).toBe(true);
		expect(isMediaFile("photo.JPG")).toBe(true);
		expect(isMediaFile("video.MP4")).toBe(true);
		expect(isMediaFile("font.WOFF")).toBe(true);
	});
});

describe("isTextMediaFile", () => {
	it("returns true for text media extensions", () => {
		expect(isTextMediaFile("icon.svg")).toBe(true);
		expect(isTextMediaFile("style.css")).toBe(true);
		expect(isTextMediaFile("data.json")).toBe(true);
		expect(isTextMediaFile("page.html")).toBe(true);
		expect(isTextMediaFile("page.htm")).toBe(true);
		expect(isTextMediaFile("data.xml")).toBe(true);
		expect(isTextMediaFile("notes.txt")).toBe(true);
	});

	it("returns false for binary media extensions", () => {
		expect(isTextMediaFile("photo.png")).toBe(false);
		expect(isTextMediaFile("video.mp4")).toBe(false);
		expect(isTextMediaFile("audio.mp3")).toBe(false);
		expect(isTextMediaFile("font.woff")).toBe(false);
		expect(isTextMediaFile("document.pdf")).toBe(false);
	});
});

describe("getMediaIcon", () => {
	it("returns correct icon per category", () => {
		expect(getMediaIcon("photo.png")).toBe("image");
		expect(getMediaIcon("photo.jpg")).toBe("image");
		expect(getMediaIcon("photo.jpeg")).toBe("image");
		expect(getMediaIcon("animation.gif")).toBe("image");
		expect(getMediaIcon("image.webp")).toBe("image");
		expect(getMediaIcon("image.bmp")).toBe("image");
		expect(getMediaIcon("image.tiff")).toBe("image");
		expect(getMediaIcon("icon.svg")).toBe("image");
		expect(getMediaIcon("favicon.ico")).toBe("image");

		expect(getMediaIcon("video.mp4")).toBe("video");
		expect(getMediaIcon("video.mkv")).toBe("video");
		expect(getMediaIcon("video.mov")).toBe("video");
		expect(getMediaIcon("video.avi")).toBe("video");
		expect(getMediaIcon("video.webm")).toBe("video");

		expect(getMediaIcon("audio.mp3")).toBe("music");
		expect(getMediaIcon("audio.wav")).toBe("music");
		expect(getMediaIcon("audio.ogg")).toBe("music");

		expect(getMediaIcon("font.woff")).toBe("type");
		expect(getMediaIcon("font.woff2")).toBe("type");
		expect(getMediaIcon("font.ttf")).toBe("type");
		expect(getMediaIcon("font.otf")).toBe("type");
	});

	it("returns 'file' for pdf and unknown extensions", () => {
		expect(getMediaIcon("document.pdf")).toBe("file");
		expect(getMediaIcon("archive.zip")).toBe("file");
		expect(getMediaIcon("data.bin")).toBe("file");
		expect(getMediaIcon("noextension")).toBe("file");
	});
});
