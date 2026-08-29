export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"bmp",
	"tiff",
	"svg",
	"ico",
	"mp4",
	"mkv",
	"mov",
	"avi",
	"webm",
	"mp3",
	"wav",
	"ogg",
	"pdf",
	"woff",
	"woff2",
	"ttf",
	"otf",
]);

const TEXT_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
	"svg",
	"css",
	"txt",
	"json",
	"xml",
	"html",
	"htm",
]);

export function isMediaFile(path: string): boolean {
	const ext = path.includes(".")
		? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
		: "";

	return ASSET_EXTENSIONS.has(ext);
}

export function isTextMediaFile(path: string): boolean {
	const ext = path.includes(".")
		? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
		: "";

	return TEXT_MEDIA_EXTENSIONS.has(ext);
}

export function getMediaIcon(path: string): string {
	const ext = path.includes(".")
		? path.slice(path.lastIndexOf(".") + 1).toLowerCase()
		: "";

	if (
		[
			"png",
			"jpg",
			"jpeg",
			"gif",
			"webp",
			"bmp",
			"tiff",
			"svg",
			"ico",
		].includes(ext)
	) {
		return "image";
	}

	if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext)) {
		return "video";
	}

	if (["mp3", "wav", "ogg"].includes(ext)) {
		return "music";
	}

	if (["woff", "woff2", "ttf", "otf"].includes(ext)) {
		return "type";
	}

	return "file";
}
