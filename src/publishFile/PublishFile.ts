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
import { DataStore } from "src/publishFile/DataStore";
import { generateBlobHash } from "src/utils/utils";

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
	 * Returns the created date of the file.
	 * If a custom created date is specified in the frontmatter, it returns that.
	 * Otherwise, it returns the file's creation time.
	 *
	 * @returns The created date as an ISO string.
	 */
	async compile(): Promise<CompiledPublishFile> {
		let compiledFile: TCompiledFile;

		if (this.settings.useCache) {
			const cachedFile = await this.datastore.loadLocalFile(
				this.file.path,
			);

			const outdated = cachedFile
				? await this.datastore.isLocalFileOutdated(
						this.file.path,
						this.file.stat.mtime,
					)
				: true;

			let storedFile = null;

			if (cachedFile && !outdated) {
				storedFile = cachedFile;
			} else {
				// If the file is not cached or outdated, compile it
				storedFile = await this.compiler.generateMarkdown(this);

				if (!storedFile) {
					throw new Error(
						`Failed to compile file: ${this.file.path}. Compiler returned null.`,
					);
				}

				const localHash = generateBlobHash(storedFile[0]);

				await this.datastore.storeLocalFile(
					this.file.path,
					this.file.stat.mtime,
					storedFile,
				);

				await this.datastore.storeLocalHash(
					this.file.path,
					this.file.stat.mtime,
					localHash,
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
	 * @returns The created date as an ISO string.
	 */
	getType(): "excalidraw" | "markdown" {
		if (this.file.name.endsWith(".excalidraw")) {
			return "excalidraw";
		}

		return "markdown";
	}

	/**
	 * Checks if the file should be published based on the publish flag in the frontmatter.
	 *
	 * @returns true if the file should be published, false otherwise.
	 */
	shouldPublish(): boolean {
		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			this.frontmatter,
		);
	}

	/**
	 * Retrieves the blob links from the compiled file.
	 *
	 * @returns An array of blob links.
	 */
	async getBlobLinks() {
		return this.compiler.extractBlobLinks(this);
	}

	/**
	 * Reads the file content from the vault.
	 *
	 * @returns The content of the file as a string.
	 */
	async cachedRead() {
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
	 * @returns The compiled frontmatter as an object.
	 */
	getCompiledFrontmatter() {
		const frontmatterCompiler = new FrontmatterCompiler(this.settings);

		const metadata =
			this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};

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
	 * Returns the compiled file content as a string.
	 *
	 * @returns The compiled file content as a string.
	 */
	setRemoteHash(hash: string) {
		this.remoteHash = hash;
	}
}
