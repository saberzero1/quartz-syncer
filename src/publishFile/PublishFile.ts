import { MetadataCache, TFile, Vault } from "obsidian";
import {
	SyncerPageCompiler,
	TCompiledFile,
} from "src/compiler/SyncerPageCompiler";
import {
	FrontmatterCompiler,
	TFrontmatter,
} from "src/compiler/FrontmatterCompiler";
import QuartzSyncerSettings from "src/models/settings";
import { hasPublishFlag } from "src/publishFile/Validator";
import { FileMetadataManager } from "src/publishFile/FileMetaDataManager";
import { DataStore } from "src/cache/DataStore";
import { generateBlobHash } from "src/utils/utils";
import {
	DATAVIEW_FIELD_REGEX,
	DATAVIEW_INLINE_FIELD_REGEX,
} from "src/utils/regexes";
import { hasDynamicContent } from "src/utils/dynamicContent";

/**
 * Determines the special file type from a TFile, if any.
 * Returns the type string or null for regular markdown files.
 */
export function getSpecialFileType(file: {
	extension: string;
	path: string;
	name: string;
}): "base" | "canvas" | "excalidraw" | null {
	if (file.extension === "base") return "base";

	if (file.extension === "canvas") return "canvas";

	if (
		file.name.endsWith(".excalidraw") ||
		file.name.endsWith(".excalidraw.md")
	) {
		return "excalidraw";
	}

	return null;
}

/**
 * IPublishFileProps interface.
 * This interface defines the properties required to create a PublishFile instance.
 */
interface IPublishFileProps {
	file: TFile;
	vault: Vault;
	compiler: SyncerPageCompiler;
	metadataCache: MetadataCache;
	settings: QuartzSyncerSettings;
	datastore: DataStore;
}

/**
 * PublishFile class.
 * This class represents a file that can be published.
 * It contains methods to compile the file, get its metadata, and check if it should be published.
 * It also provides methods to get the file's path and vault path.
 */
export class PublishFile {
	file: TFile;
	compiler: SyncerPageCompiler;
	vault: Vault;
	compiledFile?: TCompiledFile;
	metadataCache: MetadataCache;
	frontmatter: TFrontmatter;
	settings: QuartzSyncerSettings;
	// Access props and other file metadata
	meta: FileMetadataManager;
	datastore: DataStore;

	constructor({
		file,
		compiler,
		metadataCache,
		vault,
		settings,
		datastore,
	}: IPublishFileProps) {
		this.compiler = compiler;
		this.metadataCache = metadataCache;
		this.file = file;
		this.settings = settings;
		this.vault = vault;
		this.frontmatter = this.getFrontmatter();
		this.datastore = datastore;

		this.meta = new FileMetadataManager(file, this.frontmatter, settings);
	}

	/**
	 * Compiles the file for publishing.
	 * Uses caching when enabled, detecting dynamic content for proper cache invalidation.
	 *
	 * @returns A promise that resolves to a CompiledPublishFile instance.
	 */
	async compile(trustDynamicCache = false): Promise<CompiledPublishFile> {
		let compiledFile: TCompiledFile;
		const sourceMtime = this.file.stat.mtime;

		if (this.settings.useCache) {
			const cachedFile = await this.datastore.loadLocalFile(
				this.file.path,
				sourceMtime,
				trustDynamicCache,
			);

			const outdated = cachedFile
				? await this.datastore.isLocalFileOutdated(
						this.file.path,
						sourceMtime,
						trustDynamicCache,
					)
				: true;

			let storedFile = null;

			if (cachedFile && !outdated) {
				storedFile = cachedFile;
			} else {
				const rawContent = await this.vault.cachedRead(this.file);
				const isDynamic = hasDynamicContent(rawContent);

				storedFile = await this.compiler.generateMarkdown(this);

				if (!storedFile) {
					throw new Error(
						`Failed to compile file: ${this.file.path}. Compiler returned null.`,
					);
				}

				const localHash = await generateBlobHash(storedFile[0]);
				const currentMtime = this.file.stat.mtime;

				await this.datastore.storeLocalFile(
					this.file.path,
					sourceMtime,
					storedFile,
					isDynamic,
					currentMtime,
				);

				await this.datastore.storeLocalHash(
					this.file.path,
					sourceMtime,
					localHash,
					currentMtime,
				);
			}

			compiledFile = storedFile;
		} else {
			compiledFile = await this.compiler.generateMarkdown(this);
		}

		return new CompiledPublishFile(
			{
				file: this.file,
				compiler: this.compiler,
				metadataCache: this.metadataCache,
				vault: this.vault,
				settings: this.settings,
				datastore: this.datastore,
			},
			compiledFile,
		);
	}

	/**
	 * Returns the type of the file based on its extension.
	 *
	 * @returns The file type: "excalidraw", "base", "canvas", or "markdown".
	 */
	getType(): "excalidraw" | "base" | "canvas" | "markdown" {
		if (
			this.file.name.endsWith(".excalidraw") ||
			this.file.name.endsWith(".excalidraw.md")
		) {
			return "excalidraw";
		}

		if (this.file.extension === "base") {
			return "base";
		}

		if (this.file.extension === "canvas") {
			return "canvas";
		}

		return "markdown";
	}

	/**
	 * Checks if the file should be published based on the publish flag in the frontmatter.
	 *
	 * @returns true if the file should be published, false otherwise.
	 */
	shouldPublish(): boolean {
		const specialType = getSpecialFileType(this.file);

		if (specialType === "base") return this.settings.useBases;

		if (specialType === "canvas") return this.settings.useCanvas;

		if (specialType === "excalidraw") return this.settings.useExcalidraw;

		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			this.frontmatter,
			this.settings.allNotesPublishableByDefault,
		);
	}

	/**
	 * Retrieves the blob links from the compiled file.
	 *
	 * @returns An array of blob links.
	 */
	async getBlobLinks(): Promise<string[]> {
		return this.compiler.extractBlobLinks(this);
	}

	/**
	 * Reads the file content from the vault.
	 *
	 * @returns The content of the file as a string.
	 */
	async cachedRead(): Promise<string> {
		return this.vault.cachedRead(this.file);
	}

	/**
	 * Retrieves the metadata cache for the file.
	 *
	 * @returns The metadata cache for the file.
	 */
	getMetadata() {
		return this.metadataCache.getCache(this.file.path) ?? {};
	}

	/**
	 * Retrieves the block metadata for a specific block ID.
	 *
	 * @param blockId - The ID of the block to retrieve metadata for.
	 * @returns The metadata for the specified block, or undefined if not found.
	 */
	getBlock(blockId: string) {
		return this.getMetadata().blocks?.[blockId];
	}

	/**
	 * Retrieves the frontmatter metadata for the file.
	 *
	 * @returns The frontmatter metadata as an object.
	 */
	getFrontmatter() {
		return this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};
	}

	/**
	 * Compares this PublishFile with another PublishFile based on the file path.
	 *
	 * @param other - The other PublishFile to compare with.
	 * @returns A negative number if this file's path comes before the other file's path, a positive number if it comes after, and zero if they are equal.
	 */
	compare(other: PublishFile) {
		return this.file.path.localeCompare(other.file.path);
	}

	/**
	 * Returns the path of the file.
	 *
	 * @returns The path of the file as a string.
	 */
	getPath = () => this.file.path;

	/**
	 * Returns the vault path of the file.
	 * If the vault path is not set or the file path does not start with the vault path, it returns the file path.
	 *
	 * @returns The vault path of the file as a string.
	 */
	getVaultPath = () => {
		if (
			this.settings.vaultPath !== "/" &&
			this.file.path.startsWith(this.settings.vaultPath)
		) {
			return this.file.path.replace(this.settings.vaultPath, "");
		}

		return this.file.path;
	};

	/**
	 * Retrieves the compiled frontmatter for the file.
	 * It uses the FrontmatterCompiler to compile the frontmatter metadata.
	 *
	 * @param text - The text content of the file, used for compilation.
	 * @returns The compiled frontmatter as an object.
	 */
	getCompiledFrontmatter(text: string) {
		const convertDataviewFields = !!this.settings.useDataview;

		const frontmatterCompiler = new FrontmatterCompiler(this.settings);

		const metadata =
			this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};

		if (convertDataviewFields) {
			const fieldMatches = text.matchAll(DATAVIEW_FIELD_REGEX);

			const inlineFieldMatches = text.matchAll(
				DATAVIEW_INLINE_FIELD_REGEX,
			);

			for (const match of fieldMatches) {
				if (match[1] && match[2]) {
					metadata[match[1]] = match[2];
				}
			}

			for (const match of inlineFieldMatches) {
				if (match[1] && match[2]) {
					metadata[match[1]] = match[2];
				} else if (match[3] && match[4]) {
					metadata[match[3]] = match[4];
				}
			}
		}

		return frontmatterCompiler.compile(this, metadata);
	}
}

/**
 * CompiledPublishFile class.
 */
export class CompiledPublishFile extends PublishFile {
	compiledFile: TCompiledFile;
	remoteHash?: string;

	constructor(props: IPublishFileProps, compiledFile: TCompiledFile) {
		super(props);

		this.compiledFile = compiledFile;
	}

	/**
	 * Returns the compiled file content.
	 *
	 * @returns The compiled file as a TCompiledFile object.
	 */
	getCompiledFile() {
		return this.compiledFile;
	}

	/**
	 * Sets the remote hash for the compiled file.
	 *
	 * @param hash - The SHA hash of the remote file.
	 */
	setRemoteHash(hash: string) {
		this.remoteHash = hash;
	}
}
