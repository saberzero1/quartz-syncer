import { MetadataCache, TFile, Vault, FileManager } from "obsidian";

/**
 * IFonrtMatterEngine interface.
 * This interface defines the methods for managing front matter in Obsidian files.
 */
export interface IFrontMatterEngine {
	set(key: string, value: string | boolean | number): IFrontMatterEngine;
	remove(key: string): IFrontMatterEngine;
	get(key: string): string | boolean | number;
	apply(): Promise<void>;
}

/**
 * ObsidianFrontMatterEngine class.
 * This class implements the IFrontMatterEngine interface and provides methods to manage frontmatter in Obsidian files.
 */
export default class ObsidianFrontMatterEngine implements IFrontMatterEngine {
	metadataCache: MetadataCache;
	file: TFile;
	vault: Vault;
	fileManager: FileManager;

	generatedFrontMatter: Record<string, unknown> = {};

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		file: TFile,
		fileManager: FileManager,
	) {
		this.metadataCache = metadataCache;
		this.vault = vault;
		this.file = file;
		this.fileManager = fileManager;
	}

	/**
	 * Sets a key-value pair in the front matter.
	 *
	 * @param key - The key to set.
	 * @param value - The value to set for the key.
	 * @returns The current instance of ObsidianFrontMatterEngine for method chaining.
	 */
	set(
		key: string,
		value: string | boolean | number,
	): ObsidianFrontMatterEngine {
		this.generatedFrontMatter[key] = value;

		return this;
	}

	/**
	 * Removes a key from the front matter.
	 *
	 * @param key - The key to remove.
	 * @returns The current instance of ObsidianFrontMatterEngine for method chaining.
	 */
	remove(key: string): ObsidianFrontMatterEngine {
		this.generatedFrontMatter[key] = undefined;

		return this;
	}

	/**
	 * Gets the value of a key from the front matter.
	 *
	 * @param key - The key to get the value for.
	 * @returns The value of the key, or undefined if the key does not exist.
	 */
	get(key: string): string | boolean | number {
		return this.getFrontMatterSnapshot()[key];
	}

	/**
	 * Applies the changes made to the front matter to the file.
	 * It reads the current content of the file, updates the front matter, and writes it back.
	 *
	 * @returns A promise that resolves when the changes are applied.
	 */
	async apply(): Promise<void> {
		const newFrontMatter = this.getFrontMatterSnapshot();

		await this.fileManager.processFrontMatter(this.file, (frontMatter) => {
			for (const key of Object.keys(newFrontMatter)) {
				frontMatter[key] = newFrontMatter[key];
			}
		});
	}

	/**
	 * Converts the front matter object to a YAML string.
	 * It removes any keys with undefined values and formats the remaining keys as YAML.
	 *
	 * @param frontMatter - The front matter object to convert.
	 * @returns A YAML string representation of the front matter.
	 */
	private frontMatterToYaml(frontMatter: Record<string, unknown>) {
		for (const key of Object.keys(frontMatter)) {
			if (frontMatter[key] === undefined) {
				delete frontMatter[key];
			}
		}

		if (Object.keys(frontMatter).length === 0) {
			return "";
		}

		let yaml = "---\n";

		for (const key of Object.keys(frontMatter)) {
			yaml += `${key}: ${frontMatter[key]}\n`;
		}
		yaml += "---";

		return yaml;
	}

	/**
	 * Gets a snapshot of the current front matter, merging it with any generated front matter.
	 * It retrieves the existing front matter from the metadata cache and combines it with the generated front matter.
	 *
	 * @returns An object containing the merged front matter.
	 */
	private getFrontMatterSnapshot() {
		const cachedFrontMatter = {
			...this.metadataCache.getCache(this.file?.path)?.frontmatter,
		};
		delete cachedFrontMatter["position"];

		return { ...cachedFrontMatter, ...this.generatedFrontMatter };
	}
}
