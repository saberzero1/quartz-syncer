import {
	App,
	MetadataCache,
	Vault,
	arrayBufferToBase64,
	getLinkpath,
} from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { escapeRegExp } from "src/utils/utils";
import {
	FRONTMATTER_REGEX,
	DATAVIEW_LINK_TARGET_BLANK_REGEX,
} from "src/utils/regexes";
import Logger from "js-logger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkObsidian from "@quartz-community/remark-obsidian";
import type { Root, Link, Image } from "mdast";
import { visit } from "unist-util-visit";
import { PublishFile } from "src/publishFile/PublishFile";
import { PluginCompiler } from "src/compiler/PluginCompiler";
import { DataStore } from "src/publishFile/DataStore";

/**
 * Interface for an asset that will be published.
 * It contains the path to the asset and its content.
 */
export interface Asset {
	path: string;
	content: string;
	// not set yet
	remoteHash?: string;
}

/**
 * Interface for the assets that will be published.
 * It contains an array of assets.
 */
export interface Assets {
	blobs: Array<Asset>;
}

/**
 * Type for the compiled file.
 * It is a tuple containing the compiled text and the assets for the file.
 * The compiled text is the text that has been processed by the compiler steps.
 * The assets are the files that are linked in the text, such as images or other files.
 */
export type TCompiledFile = [string, Assets];

/**
 * Type for a compiler step.
 * It is a function that takes a PublishFile and returns a function that takes the partially compiled content.
 * The returned function can either return a string or a Promise that resolves to a string.
 *
 * @param publishFile - The file that is being published.
 * @returns A function that takes the partially compiled content and returns the compiled content.
 */
export type TCompilerStep = (
	publishFile: PublishFile,
) =>
	| ((partiallyCompiledContent: string) => Promise<string>)
	| ((partiallyCompiledContent: string) => string);

/**
 * SyncerPageCompiler class.
 * This class is responsible for compiling the content of a file for publishing.
 * It applies various compiler steps to the content, such as converting front matter, creating transcluded text, converting links to full paths, and more.
 * It also extracts file links and converts them to the appropriate format for publishing.
 * It is used by the Publisher to prepare files for publishing.
 */
export class SyncerPageCompiler {
	private app: App;
	private readonly vault: Vault;
	private readonly settings: QuartzSyncerSettings;
	private metadataCache: MetadataCache;
	private datastore: DataStore;

	constructor(
		app: App,
		vault: Vault,
		settings: QuartzSyncerSettings,
		metadataCache: MetadataCache,
		datastore: DataStore,
	) {
		this.app = app;
		this.vault = vault;
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.datastore = datastore;
	}

	/**
	 * Runs the compiler steps on the given text.
	 * It applies each compiler step in order, passing the result of the previous step to the next one.
	 *
	 * @param file - The file that is being published.
	 * @param compilerSteps - The array of compiler steps to apply.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	runCompilerSteps =
		(file: PublishFile, compilerSteps: TCompilerStep[]) =>
		async (text: string): Promise<string> => {
			return await compilerSteps.reduce(
				async (previousStep, compilerStep) => {
					const previousStepText = await previousStep;

					return compilerStep(file)(previousStepText);
				},
				Promise.resolve(text),
			);
		};

	/**
	 * Generates the markdown content for the given file.
	 * It reads the file content, applies various compiler steps to it, and returns the compiled text along with the assets.
	 *
	 * @param file - The file to generate the markdown content for.
	 * @returns A promise that resolves to a tuple containing the compiled text and the assets.
	 * @throws If the file is an Excalidraw file, a warning is logged as Excalidraw files are not supported yet.
	 */
	async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
		const vaultFileText = await file.cachedRead();

		if (file.getType() === "base") {
			return [vaultFileText, { blobs: [] }];
		}

		if (file.getType() === "canvas") {
			return [vaultFileText, { blobs: [] }];
		}

		if (
			file.file.name.endsWith(".excalidraw") ||
			file.file.name.endsWith(".excalidraw.md")
		) {
			return [vaultFileText, { blobs: [] }];
		}

		// ORDER MATTERS!
		const COMPILE_STEPS: TCompilerStep[] = [
			this.convertFrontMatter,
			this.convertIntegrations,
			this.linkTargeting,
			this.astTransform,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const [text, blobs] = await this.convertFileLinks(file)(compiledText);

		return [text, { blobs }];
	}

	private stripVaultPath(text: string): string {
		if (this.settings.vaultPath === "/" || this.settings.vaultPath === "") {
			return text;
		}

		const wikilinkRegex = new RegExp(
			"\\[\\[" + escapeRegExp(this.settings.vaultPath) + "(.*?)\\]\\]",
			"g",
		);

		const markdownLinkRegex = new RegExp(
			"\\[(.*?)\\]\\(" +
				escapeRegExp(this.settings.vaultPath) +
				"(.*?)\\)",
			"g",
		);

		try {
			text = text.replace(wikilinkRegex, "[[$1]]");
			text = text.replace(markdownLinkRegex, "[$1]($2)");
		} catch (e) {
			Logger.error(`Error while stripping vault path from text: ${e}`);
		}

		return text;
	}

	/**
	 * AST-based transform step.
	 * Parses text with remark-obsidian, strips comments (built-in tree transform),
	 * and strips vault path prefix from link/image URLs.
	 */
	astTransform: TCompilerStep = () => async (text) => {
		const vaultPath = this.settings.vaultPath;
		const hasVaultPath = vaultPath !== "/" && vaultPath !== "";

		const processor = unified()
			.use(remarkParse)
			.use(remarkFrontmatter, ["yaml"])
			.use(remarkObsidian)
			.use(remarkStringify, {
				bullet: "-",
				emphasis: "_",
				rule: "-",
			});

		const tree = processor.parse(text) as Root;
		const transformed = await processor.run(tree);

		if (hasVaultPath) {
			visit(transformed, "link", (node: Link) => {
				if (node.url.startsWith(vaultPath)) {
					node.url = node.url.substring(vaultPath.length);
				}
			});

			visit(transformed, "image", (node: Image) => {
				if (node.url.startsWith(vaultPath)) {
					node.url = node.url.substring(vaultPath.length);
				}
			});
		}

		let result = processor.stringify(transformed as Root);

		result = result.replace(/^((?:> ?)+)\\\[(![\w-]+)\]/gm, "$1[$2]");

		result = result.replace(/^(\|.*)/gm, (line) =>
			line.replace(/(!?\[\[[^\]]*?)(?<!\\)\|([^\]]*?\]\])/g, "$1\\|$2"),
		);

		return result;
	};

	/**
	 * Converts the front matter of the file to a string.
	 * It replaces the front matter in the text with the compiled front matter from the file.
	 *
	 * @param file - The file to compile the front matter for.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	convertFrontMatter: TCompilerStep = (file) => (text) => {
		const compiledFrontmatter = file.getCompiledFrontmatter(text);

		return text.replace(FRONTMATTER_REGEX, () => compiledFrontmatter);
	};

	/**
	 * Converts plugin integrations in the text to their results.
	 *
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	convertIntegrations: TCompilerStep = (file) => async (text) => {
		const pluginCompiler = new PluginCompiler(this.app, this.settings);

		text = await pluginCompiler.compile(file)(text);

		return text;
	};

	/**
	 * Removes the target="_blank" attribute from Dataview links in the text.
	 * It uses a regular expression to find and remove the target attribute.
	 *
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	linkTargeting: TCompilerStep = () => (text) => {
		return text.replace(DATAVIEW_LINK_TARGET_BLANK_REGEX, "");
	};

	private static readonly ASSET_EXTENSIONS = new Set([
		"png",
		"jpg",
		"jpeg",
		"gif",
		"webp",
		"mp4",
		"mkv",
		"mov",
		"avi",
		"mp3",
		"wav",
		"ogg",
		"pdf",
	]);

	/**
	 * Extracts blob links from the file using CachedMetadata.embeds.
	 * For canvas files, parses JSON nodes directly. For all other files,
	 * iterates over the metadata cache's embed entries and resolves each
	 * to a vault file, filtering by asset extension.
	 *
	 * @param file - The file to extract the blob links from.
	 * @returns A promise that resolves to an array of asset paths.
	 */
	extractBlobLinks = async (file: PublishFile) => {
		const assets: string[] = [];

		// Canvas files are JSON, not markdown — keep JSON parsing
		if (file.getType() === "canvas") {
			const text = await file.cachedRead();

			try {
				const canvasData = JSON.parse(text);

				if (Array.isArray(canvasData?.nodes)) {
					for (const node of canvasData.nodes) {
						if (
							node.type === "file" &&
							typeof node.file === "string"
						) {
							const linkedFile =
								this.metadataCache.getFirstLinkpathDest(
									node.file,
									file.getPath(),
								);

							if (linkedFile) {
								assets.push(linkedFile.path);
							}
						}
					}
				}
			} catch {
				Logger.warn(`Failed to parse canvas file: ${file.getPath()}`);
			}

			return assets;
		}

		const cache = this.metadataCache.getCache(file.getPath());

		if (!cache?.embeds) return assets;

		for (const embed of cache.embeds) {
			try {
				// embed.link already has anchors stripped by Obsidian's parser
				// (e.g. ![[img.webp#right]] → embed.link = "img.webp")
				const linkedFile = this.metadataCache.getFirstLinkpathDest(
					getLinkpath(embed.link),
					file.getPath(),
				);

				if (!linkedFile) continue;

				if (
					!SyncerPageCompiler.ASSET_EXTENSIONS.has(
						linkedFile.extension,
					)
				) {
					continue;
				}

				assets.push(linkedFile.path);
			} catch {
				continue;
			}
		}

		return assets;
	};

	/**
	 * Converts file embed links to their full paths and collects binary assets.
	 * Uses CachedMetadata.embeds with position-based replacement (reverse offset
	 * order) to avoid first-occurrence bugs.
	 *
	 * @param file - The file to compile the links for.
	 * @returns A function that takes the text and returns [compiled text, assets].
	 */
	convertFileLinks =
		(file: PublishFile) =>
		async (text: string): Promise<[string, Array<Asset>]> => {
			const filePath = file.getPath();
			const assets: Array<Asset> = [];

			const cache = this.metadataCache.getCache(filePath);

			if (!cache?.embeds) {
				return [this.stripVaultPath(text), assets];
			}

			let blobText = text;

			for (const embed of cache.embeds) {
				try {
					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						getLinkpath(embed.link),
						filePath,
					);

					if (!linkedFile) continue;

					if (
						!SyncerPageCompiler.ASSET_EXTENSIONS.has(
							linkedFile.extension,
						)
					) {
						continue;
					}

					const blob = await this.vault.readBinary(linkedFile);
					const blobBase64 = arrayBufferToBase64(blob);

					const blobLinkText = this.metadataCache.fileToLinktext(
						linkedFile,
						this.settings.vaultPath,
					);

					const blobFullPath =
						this.metadataCache.getFirstLinkpathDest(
							linkedFile.path,
							this.settings.vaultPath,
						)?.path ?? blobLinkText;

					assets.push({
						path: blobFullPath,
						content: blobBase64,
					});

					const isWikilink = embed.original.startsWith("![[");
					let replacement: string;

					if (isWikilink) {
						const inner = embed.original.slice(3, -2);
						const pipeIndex = inner.indexOf("|");

						const linkAndAnchor =
							pipeIndex >= 0
								? inner.substring(0, pipeIndex)
								: inner;

						const displayPart =
							pipeIndex >= 0 ? inner.substring(pipeIndex) : "";

						const anchorIndex = linkAndAnchor.indexOf("#");

						const anchor =
							anchorIndex >= 0
								? linkAndAnchor.substring(anchorIndex)
								: "";

						replacement = `![[${blobFullPath}${anchor}${displayPart}]]`;
					} else {
						const altStart = embed.original.indexOf("[") + 1;
						const altEnd = embed.original.indexOf("]");
						const alt = embed.original.substring(altStart, altEnd);

						const pathStart = embed.original.lastIndexOf("(") + 1;
						const pathEnd = embed.original.lastIndexOf(")");

						const pathWithAnchor = embed.original.substring(
							pathStart,
							pathEnd,
						);

						const anchorIndex = pathWithAnchor.indexOf("#");

						const anchor =
							anchorIndex >= 0
								? pathWithAnchor.substring(anchorIndex)
								: "";

						replacement = `![${alt}](${blobFullPath}${anchor})`;
					}

					// Use text-based replacement instead of position-based.
					// CachedMetadata offsets refer to the original vault text,
					// but prior compiler steps (astTransform) re-serialize the text
					// with different byte positions.
					// Also try the escaped-pipe variant, since astTransform escapes
					// `|` → `\|` inside wikilinks on table rows.
					const escapedOriginal = embed.original.replace(
						/(\[\[[^\]]*?)\|([^\]]*?\]\])/g,
						"$1\\|$2",
					);

					if (blobText.includes(embed.original)) {
						blobText = blobText.replace(
							embed.original,
							replacement,
						);
					} else if (blobText.includes(escapedOriginal)) {
						blobText = blobText.replace(
							escapedOriginal,
							replacement,
						);
					}
				} catch {
					continue;
				}
			}

			blobText = this.stripVaultPath(blobText);

			return [blobText, assets];
		};
}
