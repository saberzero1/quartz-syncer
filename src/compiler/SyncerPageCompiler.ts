import {
	App,
	MetadataCache,
	Vault,
	arrayBufferToBase64,
	getLinkpath,
} from "obsidian";
import QuartzSyncerSettings from "src/models/settings";
import { PathRewriteRule } from "src/repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "src/publisher/Publisher";
import {
	fixSvgForXmlSerializer,
	generateUrlPath,
	getSyncerPathForNote,
	getRewriteRules,
	sanitizePermalink,
} from "src/utils/utils";
import slugify from "@sindresorhus/slugify";
import {
	CODEBLOCK_REGEX,
	CODE_FENCE_REGEX,
	EXCALIDRAW_REGEX,
	FRONTMATTER_REGEX,
	BLOCKREF_REGEX,
	TRANSCLUDED_SVG_REGEX,
	DATAVIEW_LINK_TARGET_BLANK_REGEX,
	TRANSCLUDED_FILE_REGEX,
	FILE_REGEX,
} from "src/utils/regexes";
import Logger from "js-logger";
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
	private readonly getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"];
	private rewriteRule: PathRewriteRule;
	private datastore: DataStore;

	constructor(
		app: App,
		vault: Vault,
		settings: QuartzSyncerSettings,
		metadataCache: MetadataCache,
		datastore: DataStore,
		getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"],
	) {
		this.app = app;
		this.vault = vault;
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.datastore = datastore;
		this.getFilesMarkedForPublishing = getFilesMarkedForPublishing;
		this.rewriteRule = getRewriteRules(this.settings.vaultPath);
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

		if (this.settings.useExcalidraw) {
			if (file.file.name.endsWith(".excalidraw.md")) {
				console.warn("Excalidraw files are not supported yet.");
			}
		}

		// ORDER MATTERS!
		const COMPILE_STEPS: TCompilerStep[] = [
			this.convertFrontMatter,
			this.createTranscludedText(0),
			this.convertIntegrations,
			this.convertLinksToFullPath,
			this.removeObsidianComments,
			this.createSvgEmbeds,
			this.linkTargeting,
			this.applyVaultPath,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const [text, blobs] = await this.convertFileLinks(file)(compiledText);

		return [text, { blobs }];
	}

	/**
	 * Applies the vault path to links in the text.
	 * It replaces links that start with the vault path with Obsidian-style links (e.g. [[link]]) and Markdown-style links (e.g. [link](path)).
	 * If the vault path is not set, or is the vault root, it does nothing.
	 *
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	applyVaultPath: TCompilerStep = () => (text) => {
		const wikilinkRegex = new RegExp(
			"\\[\\[" + this.settings.vaultPath + "(.*?)\\]\\]",
			"g",
		);

		const markdownLinkRegex = new RegExp(
			"\\[(.*?)\\]\\(" + this.settings.vaultPath + "(.*?)\\)",
			"g",
		);

		if (this.settings.vaultPath !== "/" && this.settings.vaultPath !== "") {
			try {
				text = text.replace(wikilinkRegex, "[[$1]]");
				text = text.replace(markdownLinkRegex, "[$1]($2)");
			} catch (e) {
				Logger.error(
					`Error while applying vault path to text: ${text}. Error: ${e}`,
				);
			}
		}

		return text;
	};

	/**
	 * Removes Obsidian comments from the text.
	 * It looks for comments in the form of %% comment %% and removes them, unless they are inside a code block, code fence, or excalidraw drawing.
	 *
	 * @param text - The text to compile.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	removeObsidianComments: TCompilerStep = () => (text) => {
		const obsidianCommentsRegex = /%%.+?%%/gms;
		const obsidianCommentsMatches = text.match(obsidianCommentsRegex);

		const codeBlocks = text.match(CODEBLOCK_REGEX) || [];
		const codeFences = text.match(CODE_FENCE_REGEX) || [];
		const excalidraw = text.match(EXCALIDRAW_REGEX) || [];
		const matchesToSkip = [...codeBlocks, ...codeFences, ...excalidraw];

		if (!obsidianCommentsMatches) return text;

		for (const commentMatch of obsidianCommentsMatches) {
			//If comment is in a code block, code fence, or excalidrawing, leave it in
			if (matchesToSkip.findIndex((x) => x.contains(commentMatch)) > -1) {
				continue;
			}

			text = text.replace(commentMatch, "");
		}

		return text;
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

	/**
	 * Strips away code fences, front matter, and Excalidraw drawings from the text.
	 * It uses regular expressions to find and remove these elements.
	 *
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	private stripAwayCodeFencesAndFrontmatter: TCompilerStep = () => (text) => {
		let textToBeProcessed = text;
		textToBeProcessed = textToBeProcessed.replace(EXCALIDRAW_REGEX, "");
		textToBeProcessed = textToBeProcessed.replace(CODEBLOCK_REGEX, "");
		textToBeProcessed = textToBeProcessed.replace(CODE_FENCE_REGEX, "");

		textToBeProcessed = textToBeProcessed.replace(FRONTMATTER_REGEX, "");

		return textToBeProcessed;
	};

	/**
	 * Converts links in the text to full paths.
	 * It looks for links in the form of [[link]] and converts them to full paths.
	 * It also handles links to headers and blocks, and removes the file extension if it is a Markdown file.
	 *
	 * @param file - The file to compile the links for.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	convertLinksToFullPath: TCompilerStep = (file) => async (text) => {
		let convertedText = text;

		const textToBeProcessed =
			await this.stripAwayCodeFencesAndFrontmatter(file)(text);

		const linkedFileRegex = /\[\[(.+?)\]\]/g;
		const linkedFileMatches = textToBeProcessed.match(linkedFileRegex);

		if (linkedFileMatches) {
			for (const linkMatch of linkedFileMatches) {
				try {
					const textInsideBrackets = linkMatch.substring(
						linkMatch.indexOf("[") + 2,
						linkMatch.lastIndexOf("]") - 1,
					);

					let [linkedFileName, linkDisplayName] =
						textInsideBrackets.split("|");

					if (linkedFileName.endsWith("\\")) {
						linkedFileName = linkedFileName.substring(
							0,
							linkedFileName.length - 1,
						);
					}

					linkDisplayName = linkDisplayName
						? `\\|${linkDisplayName}`
						: "";
					let headerPath = "";

					// detect links to headers or blocks
					if (linkedFileName.includes("#")) {
						const headerSplit = linkedFileName.split("#");
						linkedFileName = headerSplit[0];

						//currently no support for linking to nested heading with multiple #s
						headerPath =
							headerSplit.length > 1 ? `#${headerSplit[1]}` : "";
					}
					const fullLinkedFilePath = getLinkpath(linkedFileName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						fullLinkedFilePath,
						file.getPath(),
					);

					if (!linkedFile) {
						convertedText = convertedText.replace(
							linkMatch,
							`[[${linkedFileName}${headerPath}${linkDisplayName}]]`,
						);
						continue;
					}

					if (linkedFile.extension === "md") {
						const extensionlessPath = linkedFile.path.substring(
							0,
							linkedFile.path.lastIndexOf("."),
						);

						convertedText = convertedText.replace(
							linkMatch,
							`[[${extensionlessPath}${headerPath}${linkDisplayName}]]`,
						);
					}
				} catch (e) {
					console.log(e);
					continue;
				}
			}
		}

		return convertedText;
	};

	/**
	 * Creates transcluded text by replacing transclusion links with the content of the linked files.
	 * It recursively processes transclusions up to a depth of 4 to avoid infinite loops.
	 * It also applies the vault path to the transcluded text.
	 *
	 * @param currentDepth - The current depth of recursion.
	 * @returns A function that takes the file and returns a function that takes the text to compile.
	 */
	createTranscludedText =
		(currentDepth: number): TCompilerStep =>
		(file) =>
		async (text) => {
			if (currentDepth >= 4) {
				return text;
			}

			if (!this.settings.applyEmbeds) {
				return text;
			}

			const { notes: publishedFiles } =
				await this.getFilesMarkedForPublishing();

			let transcludedText = text;

			const transcludedRegex = /!\[\[(.+?)\]\]/g;
			const transclusionMatches = text.match(transcludedRegex);

			for (const transclusionMatch of transclusionMatches ?? []) {
				try {
					const [transclusionFileNameInitial, _] = transclusionMatch
						.substring(
							transclusionMatch.indexOf("[") + 2,
							transclusionMatch.indexOf("]"),
						)
						.split("|");

					const transclusionFileName =
						transclusionFileNameInitial.endsWith("\\")
							? transclusionFileNameInitial.substring(
									0,
									transclusionFileNameInitial.length - 1,
								)
							: transclusionFileNameInitial;

					const transclusionFilePath =
						getLinkpath(transclusionFileName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						transclusionFilePath,
						file.getPath(),
					);

					if (!linkedFile) {
						console.error(
							`can't find transcluded file ${transclusionFilePath}`,
						);
						continue;
					}

					const publishLinkedFile = new PublishFile({
						file: linkedFile,
						compiler: this,
						metadataCache: this.metadataCache,
						vault: this.vault,
						settings: this.settings,
						datastore: this.datastore,
					});

					if (linkedFile.name.endsWith(".excalidraw.md")) {
						continue;
					} else if (linkedFile.extension === "md") {
						let fileText = await publishLinkedFile.cachedRead();

						const metadata = publishLinkedFile.getMetadata();

						if (transclusionFileName.includes("#^")) {
							// Transclude Block
							const refBlock =
								transclusionFileName.split("#^")[1];

							const blockInFile =
								publishLinkedFile.getBlock(refBlock);

							if (blockInFile) {
								fileText = fileText
									.split("\n")
									.slice(
										blockInFile.position.start.line,
										blockInFile.position.end.line + 1,
									)
									.join("\n")
									.replace(`^${refBlock}`, "");
							}
						} else if (transclusionFileName.includes("#")) {
							// transcluding header only
							const refHeader =
								transclusionFileName.split("#")[1];

							// This is to mitigate the issue where the header matching doesn't work properly with headers with special characters (e.g. :)
							// Obsidian's autocomplete for transclusion omits such charcters which leads to full page transclusion instead of just the heading
							const headerSlug = slugify(refHeader, {
								separator: "-",
								lowercase: false,
							});

							const headerInFile = metadata?.headings?.find(
								(header) =>
									slugify(header.heading, {
										separator: "-",
										lowercase: false,
									}) === headerSlug,
							);

							if (headerInFile && metadata?.headings) {
								const headerPosition =
									metadata.headings.indexOf(headerInFile);

								// Embed should copy the content proparly under the given block
								const cutTo = metadata.headings
									.slice(headerPosition + 1)
									.find(
										(header) =>
											header.level <= headerInFile.level,
									);

								if (cutTo) {
									const cutToLine =
										cutTo?.position?.start?.line;

									fileText = fileText
										.split("\n")
										.slice(
											headerInFile.position.start.line,
											cutToLine,
										)
										.join("\n");
								} else {
									fileText = fileText
										.split("\n")
										.slice(headerInFile.position.start.line)
										.join("\n");
								}
							}
						}
						//Remove frontmatter from transclusion
						fileText = fileText.replace(FRONTMATTER_REGEX, "");

						// Apply custom filters to transclusion
						fileText =
							await this.applyVaultPath(publishLinkedFile)(
								fileText,
							);

						// Remove block reference
						fileText = fileText.replace(BLOCKREF_REGEX, "");

						const publishedFilesContainsLinkedFile =
							publishedFiles.find(
								(f) => f.getPath() == linkedFile.path,
							);

						if (publishedFilesContainsLinkedFile) {
							const permalink =
								metadata?.frontmatter &&
								metadata.frontmatter["permalink"];

							const quartzPathFull = permalink
								? sanitizePermalink(permalink)
								: sanitizePermalink(
										generateUrlPath(
											getSyncerPathForNote(
												linkedFile.path,
												this.rewriteRule,
											),
										),
									);

							let quartzPath = quartzPathFull.endsWith("/")
								? quartzPathFull.slice(0, -1)
								: quartzPathFull;

							if (
								this.settings.vaultPath !== "/" &&
								this.settings.vaultPath !== ""
							) {
								quartzPath = quartzPath.replace(
									this.settings.vaultPath,
									"",
								);
							}
						}

						if (fileText.match(transcludedRegex)) {
							fileText = await this.createTranscludedText(
								currentDepth + 1,
							)(publishLinkedFile)(fileText);
						}

						// Fixing malformed block math transclusions:
						fileText = fileText.replace(
							/(^|[^$])\$\$($)/gm, // only match double dollar signs (block math)
							"$1$$$$$$$$$2", // adding two extra dollar signs
						);

						//This should be recursive up to a certain depth
						transcludedText = transcludedText.replace(
							transclusionMatch,
							fileText,
						);
					}
				} catch (error) {
					console.error(error);
					continue;
				}
			}

			return transcludedText;
		};

	/**
	 * Creates SVG
	 * It looks for SVG transclusions in the text and replaces them with the content of the linked SVG files.
	 * It supports both transcluded SVGs in the form of ![blob.svg] and ![blob.svg|size] and transcluded SVGs in the form of [blob.svg|size].
	 *
	 * @param file - The file to compile the SVGs for.
	 * @returns A function that takes the text to compile and returns the compiled text.
	 */
	createSvgEmbeds: TCompilerStep = (file) => async (text) => {
		function setWidth(svgText: string, size: string): string {
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
			const svgElement = svgDoc.getElementsByTagName("svg")[0];
			svgElement.setAttribute("width", size);
			fixSvgForXmlSerializer(svgElement);
			const svgSerializer = new XMLSerializer();

			return svgSerializer.serializeToString(svgDoc);
		}

		const transcludedSvgs = text.match(TRANSCLUDED_SVG_REGEX);

		if (transcludedSvgs) {
			for (const svg of transcludedSvgs) {
				try {
					const [blobName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const blobPath = getLinkpath(blobName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					let svgText = await this.vault.read(linkedFile);

					if (svgText && size) {
						svgText = setWidth(svgText, size);
					}

					if (svgText) {
						//Remove whitespace, as markdown-it will insert a <p> tag otherwise
						svgText = svgText.replace(/[\t\n\r]/g, "");
					}
					text = text.replace(svg, svgText);
				} catch {
					continue;
				}
			}
		}

		//!()[blob.svg]
		const linkedSvgRegex = /!\[(.*?)\]\((.*?)(\.(svg))\)/g;
		const linkedSvgMatches = text.match(linkedSvgRegex);

		if (linkedSvgMatches) {
			for (const svg of linkedSvgMatches) {
				try {
					const [_blobName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const pathStart = svg.lastIndexOf("(") + 1;
					const pathEnd = svg.lastIndexOf(")");
					const blobPath = svg.substring(pathStart, pathEnd);

					if (blobPath.startsWith("http")) {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					let svgText = await this.vault.read(linkedFile);

					if (svgText && size) {
						svgText = setWidth(svgText, size);
					}
					text = text.replace(svg, svgText);
				} catch {
					continue;
				}
			}
		}

		return text;
	};

	/**
	 * Extracts blob links from the file.
	 * It looks for transcluded blobs in the form of ![[blob.png]] and ![](blob.png) and returns the paths of the linked files.
	 *
	 * @param file - The file to extract the blob links from.
	 * @returns A promise that resolves to an array of asset paths.
	 */
	extractBlobLinks = async (file: PublishFile) => {
		const text = await file.cachedRead();
		const assets = [];

		//![[blob.png]]
		const transcludedBlobMatches = text.match(TRANSCLUDED_FILE_REGEX);

		if (transcludedBlobMatches) {
			for (let i = 0; i < transcludedBlobMatches.length; i++) {
				try {
					const blobMatch = transcludedBlobMatches[i];

					const [blobName, _] = blobMatch
						.substring(
							blobMatch.indexOf("[") + 2,
							blobMatch.indexOf("]"),
						)
						.split("|");

					let previous;
					let actualBlobName = blobName;

					do {
						previous = actualBlobName;

						actualBlobName = actualBlobName.replace(/\.\.\//g, "");
					} while (actualBlobName !== previous);

					const actualBlobPath = actualBlobName;

					const blobPath = getLinkpath(actualBlobPath);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					assets.push(linkedFile.path);
				} catch (_error) {
					continue;
				}
			}
		}

		//![](blob.png)
		const blobMatches = text.match(FILE_REGEX);

		if (blobMatches) {
			for (let i = 0; i < blobMatches.length; i++) {
				try {
					const blobMatch = blobMatches[i];

					const pathStart = blobMatch.lastIndexOf("(") + 1;
					const pathEnd = blobMatch.lastIndexOf(")");
					let blobPath = blobMatch.substring(pathStart, pathEnd);

					if (blobPath.startsWith("http")) {
						continue;
					}

					let previous;

					do {
						previous = blobPath;
						blobPath = blobPath.replace(/\.\.\//g, "");
					} while (blobPath !== previous);

					const actualBlobPath = blobPath;

					const decodedBlobPath = decodeURI(actualBlobPath);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						decodedBlobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					assets.push(linkedFile.path);
				} catch {
					continue;
				}
			}
		}

		return assets;
	};

	/**
	 * Converts file links in the text to their content.
	 * It looks for transcluded blobs in the form of ![[blob.png]] and ![](blob.png) and replaces them with the content of the linked files.
	 *
	 * @param file - The file to compile the links for.
	 * @returns A function that takes the text to compile and returns a tuple containing the compiled text and the assets.
	 * @throws If the file is not found, it continues to the next match.
	 */
	convertFileLinks =
		(file: PublishFile) =>
		async (text: string): Promise<[string, Array<Asset>]> => {
			const filePath = file.getPath();
			const assets = [];

			let blobText = text;

			//![[blob.png]]
			const transcludedBlobMatches = text.match(TRANSCLUDED_FILE_REGEX);

			if (transcludedBlobMatches) {
				for (let i = 0; i < transcludedBlobMatches.length; i++) {
					try {
						const blobMatch = transcludedBlobMatches[i];

						//Alt 1: [blob.png|100]
						//Alt 2: [blob.png|meta1 meta2|100]
						//Alt 3: [blob.png|meta1 meta2]
						const [blobName, ...metaDataAndSize] = blobMatch
							.substring(
								blobMatch.indexOf("[") + 2,
								blobMatch.indexOf("]"),
							)
							.split("|");

						const lastValue =
							metaDataAndSize[metaDataAndSize.length - 1];

						const hasSeveralValues = metaDataAndSize.length > 0;

						const lastValueIsSize =
							hasSeveralValues && !isNaN(parseInt(lastValue));

						const lastValueIsMetaData =
							!lastValueIsSize && hasSeveralValues;

						const size = lastValueIsSize ? lastValue : null;

						let metaData = "";

						const metaDataIsMiddleValues =
							metaDataAndSize.length > 1;

						//Alt 2: [blob.png|meta1 meta2|100]
						if (metaDataIsMiddleValues) {
							metaData = metaDataAndSize
								.slice(0, metaDataAndSize.length - 1)
								.join(" ");
						}

						//Alt 2: [blob.png|meta1 meta2]
						if (lastValueIsMetaData) {
							metaData = `${lastValue}`;
						}

						let blobPath = getLinkpath(blobName);

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								blobPath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}

						const blob = await this.vault.readBinary(linkedFile);
						const blobBase64 = arrayBufferToBase64(blob);

						blobPath = this.metadataCache.fileToLinktext(
							linkedFile,
							this.settings.vaultPath,
						);

						const blobFullPath =
							this.metadataCache.getFirstLinkpathDest(
								linkedFile.path,
								this.settings.vaultPath,
							)?.path ?? blobPath;

						let name = "";

						if (metaData && size) {
							name = `|${metaData}|${size}`;
						} else if (size) {
							name = `|${size}`;
						} else if (metaData && metaData !== "") {
							name = `|${metaData}`;
						} else {
							name = "";
						}

						// Convert the path to Quartz format with /img/user/ prefix
						const quartzImagePath = `/img/user/${blobFullPath.replace(/ /g, '%20')}`;
						const blobMarkdown = `![${blobName}${name}](${quartzImagePath})`;

						assets.push({
							path: quartzImagePath,
							content: blobBase64,
						});

						blobText = blobText.replace(blobMatch, blobMarkdown);
					} catch (_error) {
						continue;
					}
				}
			}

			//![](blob.png)
			const blobMatches = text.match(FILE_REGEX);

			if (blobMatches) {
				for (let i = 0; i < blobMatches.length; i++) {
					try {
						const blobMatch = blobMatches[i];

						const nameStart = blobMatch.indexOf("[") + 1;
						const nameEnd = blobMatch.indexOf("]");

						const blobName = blobMatch.substring(
							nameStart,
							nameEnd,
						);

						const pathStart = blobMatch.lastIndexOf("(") + 1;
						const pathEnd = blobMatch.lastIndexOf(")");

						let blobPath = blobMatch.substring(pathStart, pathEnd);

						if (blobPath.startsWith("http")) {
							continue;
						}

						const decodedBlobPath = decodeURI(blobPath);

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								decodedBlobPath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}

						const blob = await this.vault.readBinary(linkedFile);
						const blobBase64 = arrayBufferToBase64(blob);

						blobPath = this.metadataCache.fileToLinktext(
							linkedFile,
							this.settings.vaultPath,
						);

						const blobFullPath =
							this.metadataCache.getFirstLinkpathDest(
								linkedFile.path,
								this.settings.vaultPath,
							)?.path ?? blobPath;

						// Convert the path to Quartz format with /img/user/ prefix
						const quartzImagePath = `/img/user/${blobFullPath.replace(/ /g, '%20')}`;
						const blobMarkdown = `![${blobName}](${quartzImagePath})`;

						assets.push({
							path: quartzImagePath,
							content: blobBase64,
						});

						blobText = blobText.replace(blobMatch, blobMarkdown);
					} catch {
						continue;
					}
				}
			}

			return [blobText, assets];
		};
}
