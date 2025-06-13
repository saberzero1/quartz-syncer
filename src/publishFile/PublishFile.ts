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
import { DataStore } from "src/datastore/DataStore";

interface IPublishFileProps {
	file: TFile;
	vault: Vault;
	compiler: SyncerPageCompiler;
	metadataCache: MetadataCache;
	settings: QuartzSyncerSettings;
	datastore: DataStore;
}

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

	async compile(): Promise<CompiledPublishFile> {
		// Check if the file is already compiled
		// If so, grab it from the DataStore
		// Check if the file is already compiled and the hash matches
		const cachedFile = await this.datastore.loadFile(this.file.path);

		/*
		const outdated =
			cachedFile && cachedFile.data
				? await this.datastore.isDataStoreOutdated(
						this.file.path,
						this.file.stat.mtime,
					)
				: false;*/
		const outdated =
			cachedFile && cachedFile.localData
				? await this.datastore.isLocalFileOutdated(
						this.file.path,
						this.file.stat.mtime,
					)
				: true;

		console.log("Checking if file is outdated", this.file.path, outdated);

		let storedFile = null;

		//console.log("cachedFile", cachedFile, "outdated", outdated);

		if (cachedFile && !outdated && cachedFile.localData) {
			console.log("Using cached file", this.file.path);

			storedFile = cachedFile.localData;
		} else {
			// If the file is not cached or outdated, compile it
			storedFile = await this.compiler.generateMarkdown(this);
		}

		const compiledFile = storedFile;

		const compiledPublishFile = new CompiledPublishFile(
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

		if (!cachedFile?.localData || outdated) {
			// Store the compiled file in the DataStore
			console.log("Stored file in DataStore", this.file.path);

			this.datastore.storeLocalFile(
				this.file.path,
				this.file.stat.mtime,
				compiledFile,
			);
		}

		return compiledPublishFile;
	}

	// TODO: This doesn't work yet, but file should be able to tell it's type
	getType(): "excalidraw" | "markdown" {
		if (this.file.name.endsWith(".excalidraw")) {
			return "excalidraw";
		}

		return "markdown";
	}

	shouldPublish(): boolean {
		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			this.frontmatter,
		);
	}

	async getBlobLinks() {
		return this.compiler.extractBlobLinks(this);
	}

	async cachedRead() {
		return this.vault.cachedRead(this.file);
	}

	getMetadata() {
		return this.metadataCache.getCache(this.file.path) ?? {};
	}

	getBlock(blockId: string) {
		return this.getMetadata().blocks?.[blockId];
	}

	getFrontmatter() {
		return this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};
	}

	/** Add other possible sorting logic here, eg if we add sortWeight
	 * We might also want to sort by meta.getPath for rewritten garden path
	 */
	compare(other: PublishFile) {
		return this.file.path.localeCompare(other.file.path);
	}

	getPath = () => this.file.path;
	getVaultPath = () => {
		if (
			this.settings.vaultPath !== "/" &&
			this.file.path.startsWith(this.settings.vaultPath)
		) {
			return this.file.path.replace(this.settings.vaultPath, "");
		}

		return this.file.path;
	};
	getCompiledFrontmatter() {
		const frontmatterCompiler = new FrontmatterCompiler(this.settings);

		const metadata =
			this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};

		return frontmatterCompiler.compile(this, metadata);
	}
}

export class CompiledPublishFile extends PublishFile {
	compiledFile: TCompiledFile;
	remoteHash?: string;

	constructor(props: IPublishFileProps, compiledFile: TCompiledFile) {
		super(props);

		this.compiledFile = compiledFile;
	}

	getCompiledFile() {
		return this.compiledFile;
	}

	setRemoteHash(hash: string) {
		this.remoteHash = hash;
	}
}
