import { Document, parseDocument } from "yaml";
import type { QuartzFileSource } from "src/quartz/QuartzFileSource";
import type { QuartzV5Config, QuartzLockFile } from "./QuartzConfigTypes";

const CONFIG_YAML_PATH = "quartz.config.yaml";
const CONFIG_DEFAULT_YAML_PATH = "quartz.config.default.yaml";
const CONFIG_JSON_PATH = "quartz.plugins.json";
const LOCK_FILE_PATH = "quartz.lock.json";

const SCHEMA_COMMENT =
	"yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json";

type ConfigFormat = "yaml" | "json";

interface YamlDocument {
	set(key: string, value: unknown): void;
	delete(key: string): void;
	toString(): string;
	toJSON(): unknown;
	commentBefore: string | null;
}

export class QuartzConfigService {
	private repo: QuartzFileSource;
	private yamlDocument: YamlDocument | null = null;
	private configFormat: ConfigFormat | null = null;

	constructor(repo: QuartzFileSource) {
		this.repo = repo;
	}

	async readConfig(): Promise<QuartzV5Config> {
		const { content, format } = await this.readRawConfig();
		this.configFormat = format;

		if (format === "json") {
			return JSON.parse(content) as QuartzV5Config;
		}

		const parsed = parseDocument(content, {
			keepSourceTokens: true,
		});

		this.yamlDocument = parsed;

		return parsed.toJSON() as QuartzV5Config;
	}

	/**
	 * Serialize the current config back to a string, preserving YAML comments
	 * and formatting when possible.
	 *
	 * If the config was originally read via `readConfig()`, the internal
	 * `Document` is reused so that user comments survive the roundtrip.
	 *
	 * For JSON configs, returns formatted JSON.
	 */
	serializeConfig(config: QuartzV5Config): string {
		if (this.configFormat === "json") {
			return JSON.stringify(config, null, 2) + "\n";
		}

		if (this.yamlDocument) {
			this.yamlDocument.set("configuration", config.configuration);
			this.yamlDocument.set("plugins", config.plugins);

			if (config.layout) {
				this.yamlDocument.set("layout", config.layout);
			} else {
				this.yamlDocument.delete("layout");
			}

			this.ensureSchemaComment(this.yamlDocument);

			return this.yamlDocument.toString();
		}

		const doc = new Document(config);
		this.ensureSchemaComment(doc);

		return doc.toString();
	}

	async writeConfig(config: QuartzV5Config): Promise<void> {
		const serialized = this.serializeConfig(config);

		const filePath =
			this.configFormat === "json" ? CONFIG_JSON_PATH : CONFIG_YAML_PATH;

		await this.repo.writeFile(filePath, serialized);
	}

	async readLockFile(): Promise<QuartzLockFile | null> {
		try {
			const content = await this.repo.readFile(LOCK_FILE_PATH);

			if (!content) return null;

			return JSON.parse(content) as QuartzLockFile;
		} catch (error) {
			console.debug("Could not read lock file", error);

			return null;
		}
	}

	async writeLockFile(lockFile: QuartzLockFile): Promise<void> {
		const serialized = JSON.stringify(lockFile, null, 2) + "\n";

		await this.repo.writeFile(LOCK_FILE_PATH, serialized);
	}

	getConfigFormat(): ConfigFormat | null {
		return this.configFormat;
	}

	private async readRawConfig(): Promise<{
		content: string;
		format: ConfigFormat;
	}> {
		try {
			const yamlContent = await this.repo.readFile(CONFIG_YAML_PATH);

			if (yamlContent) {
				return { content: yamlContent, format: "yaml" };
			}
		} catch {
			console.debug("No YAML config found, trying JSON fallback");
		}

		try {
			const defaultYamlContent = await this.repo.readFile(
				CONFIG_DEFAULT_YAML_PATH,
			);

			if (defaultYamlContent) {
				return { content: defaultYamlContent, format: "yaml" };
			}
		} catch {
			console.debug("No default YAML config found, trying JSON fallback");
		}

		try {
			const jsonContent = await this.repo.readFile(CONFIG_JSON_PATH);

			if (jsonContent) {
				return { content: jsonContent, format: "json" };
			}
		} catch {
			console.debug("No JSON config found either");
		}

		throw new Error(
			"No Quartz v5 configuration file found. Expected quartz.config.yaml or quartz.plugins.json.",
		);
	}

	private ensureSchemaComment(doc: YamlDocument): void {
		// The `yaml` library attaches a leading `# yaml-language-server: ...`
		// line from a parsed document to the first key node's `commentBefore`,
		// not to `doc.commentBefore` (which stays null). Checking only
		// `doc.commentBefore` would therefore miss an existing schema comment
		// and prepend a new one on every serialize, growing unbounded on
		// repeated writes. Inspect the serialized output instead so the guard
		// catches the schema wherever the library chose to store it.
		if (doc.toString().includes("yaml-language-server")) {
			return;
		}
		doc.commentBefore = SCHEMA_COMMENT;
	}
}
