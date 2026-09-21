import { MetadataCache, TFile, Vault } from "obsidian";
import {
	SyncerPageCompiler,
	TCompiledFile,
	type CompilerInvocationResult,
} from "src/compiler/SyncerPageCompiler";
import {
	FrontmatterCompiler,
	TFrontmatter,
} from "src/compiler/FrontmatterCompiler";
import QuartzSyncerSettings from "src/models/settings";
import { hasPublishFlag } from "src/publishFile/Validator";
import { FileMetadataManager } from "src/publishFile/FileMetaDataManager";
import {
	DataStore,
	type CompilationMetadata,
	type QuartzSyncerCache,
} from "src/cache/DataStore";
import {
	type CompilationRevisions,
	DYNAMIC_CONTENT_DETECTOR_VERSION,
	isCompiledEntryValid,
	settingsFingerprint,
	waitForSettingsFingerprintResolution,
} from "src/cache/CompiledEntryValidity";
import { generateBlobHash, stripVaultPath } from "src/utils/utils";
import {
	DATAVIEW_FIELD_REGEX,
	DATAVIEW_INLINE_FIELD_REGEX,
} from "src/utils/regexes";
import { getDynamicSources } from "src/utils/dynamicContent";
import {
	getPerfMetrics,
	perfMetricsEnabled,
} from "src/operability/PerfMetrics";

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

interface CompilationCacheOptions {
	cachedEntry?: QuartzSyncerCache | null;
	getMetadata?: () => Promise<CompilationMetadata>;
	onDynamicClassification?: (hasDynamicContent: boolean) => void;
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
	dynamicSources: string[] = [];

	get hasDynamicContent(): boolean {
		return this.dynamicSources.length > 0;
	}

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
	async compile(
		cacheOptions: CompilationCacheOptions = {},
	): Promise<CompiledPublishFile> {
		let compiledFile: TCompiledFile;
		const sourceMtime = this.file.stat.mtime;

		if (this.settings.useCache) {
			const readiness = waitForSettingsFingerprintResolution(
				this.settings,
			);
			const fingerprintResolved =
				readiness === true
					? true
					: readiness === false
						? false
						: await readiness;
			if (!fingerprintResolved) {
				const rawContent = await this.vault.cachedRead(this.file);
				this.dynamicSources = getDynamicSources(
					rawContent,
					this.settings,
				);
				cacheOptions.onDynamicClassification?.(this.hasDynamicContent);
				const unresolvedFile =
					await this.compiler.generateMarkdown(this);
				if (!unresolvedFile) {
					throw new Error(
						`Failed to compile file: ${this.file.path}. Compiler returned null.`,
					);
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
					unresolvedFile,
				);
			}
			const cached =
				cacheOptions.cachedEntry === undefined
					? ((await this.datastore.loadFile(
							this.file.path,
							sourceMtime,
							this.settings,
						)) ?? null)
					: cacheOptions.cachedEntry;
			const cachedFile = cached?.localData;
			const criteria = this.datastore.getValidityCriteria(
				sourceMtime,
				this.settings,
			);
			const outdated = !isCompiledEntryValid(cached, criteria);
			this.dynamicSources = cached?.dynamicSources ?? [];

			let storedFile = null;

			if (cachedFile && !outdated) {
				storedFile = cachedFile;
			} else {
				const rawContent = await this.vault.cachedRead(this.file);
				this.dynamicSources = getDynamicSources(
					rawContent,
					this.settings,
				);
				cacheOptions.onDynamicClassification?.(this.hasDynamicContent);

				const revisionsAtStart =
					this.datastore.captureCompilationRevisions();
				const compilation = await this.generateMarkdownWithEvidence();
				storedFile = compilation.compiledFile;
				const dynamicSources = [...this.dynamicSources];

				if (!storedFile) {
					throw new Error(
						`Failed to compile file: ${this.file.path}. Compiler returned null.`,
					);
				}

				const hashStartedAt = perfMetricsEnabled
					? performance.now()
					: 0;
				const localHash = await generateBlobHash(storedFile[0]);
				if (perfMetricsEnabled) {
					getPerfMetrics()?.addDuration("hashMs", hashStartedAt);
				}
				const metadata = await cacheOptions.getMetadata?.();
				const currentMtime = this.file.stat.mtime;
				const revisionsAtEnd =
					this.datastore.captureCompilationRevisions();
				const verifiedRevisions = this.verifyCompilationRevisions(
					revisionsAtStart,
					revisionsAtEnd,
					dynamicSources,
					compilation.successfulVaultDependentExecutions,
				);

				const persistStartedAt = perfMetricsEnabled
					? performance.now()
					: 0;
				await this.datastore.storeCompilation(this.file.path, {
					localData: storedFile,
					localHash,
					dynamicSources,
					sourceMtime,
					currentMtime,
					settingsFingerprint: settingsFingerprint(this.settings),
					detectorVersion: DYNAMIC_CONTENT_DETECTOR_VERSION,
					verifiedRevisions,
					metadata,
				});
				if (perfMetricsEnabled) {
					getPerfMetrics()?.addDuration(
						"persistMs",
						persistStartedAt,
					);
				}
				if (currentMtime === sourceMtime)
					this.dynamicSources = dynamicSources;
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

	private async generateMarkdownWithEvidence(): Promise<CompilerInvocationResult> {
		if (typeof this.compiler.generateMarkdownWithEvidence === "function") {
			return this.compiler.generateMarkdownWithEvidence(this);
		}
		return {
			compiledFile: await this.compiler.generateMarkdown(this),
			successfulVaultDependentExecutions: new Set(),
		};
	}

	private verifyCompilationRevisions(
		before: CompilationRevisions,
		after: CompilationRevisions,
		dynamicSources: string[],
		successfulVaultDependentExecutions: ReadonlySet<string>,
	): CompilationRevisions {
		const verified: CompilationRevisions = {
			dataviewRevision: undefined,
			datacoreRevision: undefined,
		};
		if (
			dynamicSources.includes("dataview") &&
			successfulVaultDependentExecutions.has("dataview") &&
			before.dataviewRevision !== undefined &&
			before.dataviewRevision === after.dataviewRevision
		) {
			verified.dataviewRevision = before.dataviewRevision;
		}
		if (
			dynamicSources.includes("datacore") &&
			successfulVaultDependentExecutions.has("datacore") &&
			before.datacoreRevision !== undefined &&
			before.datacoreRevision === after.datacoreRevision
		) {
			verified.datacoreRevision = before.datacoreRevision;
		}
		return verified;
	}

	correctDynamicContentAfterCompile(
		observedVaultDependent: ReadonlySet<string>,
		allVaultDependentAvailable: boolean,
	): void {
		if (observedVaultDependent.size > 0) {
			this.dynamicSources = [
				...new Set([...this.dynamicSources, ...observedVaultDependent]),
			].sort();
		} else if (allVaultDependentAvailable) {
			this.dynamicSources = [];
		}
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
	 * Returns the file's path relative to the configured vault root folder.
	 *
	 * @returns The vault path of the file as a string.
	 */
	getVaultPath = () =>
		stripVaultPath(this.file.path, this.settings.vaultPath);

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
