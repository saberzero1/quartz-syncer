import { Document, parseDocument } from "yaml";
import { Base64 } from "js-base64";
import Logger from "js-logger";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type { QuartzV5Config, QuartzLockFile } from "./QuartzConfigTypes";

const logger = Logger.get("quartz-config-service");

const CONFIG_YAML_PATH = "quartz.config.yaml";
const CONFIG_JSON_PATH = "quartz.plugins.json";
const LOCK_FILE_PATH = "quartz.lock.json";

const SCHEMA_COMMENT =
	"yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json";

type ConfigFormat = "yaml" | "json";

export class QuartzConfigService {
	private repo: RepositoryConnection;
	private yamlDocument: Document | null = null;
	private configFormat: ConfigFormat | null = null;

	constructor(repo: RepositoryConnection) {
		this.repo = repo;
	}

	async readConfig(): Promise<QuartzV5Config> {
		const { content, format } = await this.readRawConfig();
		this.configFormat = format;

		if (format === "json") {
			return JSON.parse(content) as QuartzV5Config;
		}

		this.yamlDocument = parseDocument(content, {
			keepSourceTokens: true,
		});

		return this.yamlDocument.toJSON() as QuartzV5Config;
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

	async writeConfig(
		config: QuartzV5Config,
		commitMessage = "Update Quartz configuration via Syncer",
	): Promise<void> {
		const serialized = this.serializeConfig(config);

		const filePath =
			this.configFormat === "json" ? CONFIG_JSON_PATH : CONFIG_YAML_PATH;

		const files = new Map<string, string>();
		files.set(filePath, serialized);

		await this.repo.writeRawFiles(files, commitMessage);
	}

	async readLockFile(): Promise<QuartzLockFile | null> {
		try {
			const file = await this.repo.getRawFile(LOCK_FILE_PATH);

			if (!file) return null;

			const content = Base64.decode(file.content);

			return JSON.parse(content) as QuartzLockFile;
		} catch (error) {
			logger.debug("Could not read lock file", error);

			return null;
		}
	}

	async writeLockFile(
		lockFile: QuartzLockFile,
		commitMessage = "Update plugin lock file via Syncer",
	): Promise<void> {
		const serialized = JSON.stringify(lockFile, null, 2) + "\n";

		const files = new Map<string, string>();
		files.set(LOCK_FILE_PATH, serialized);

		await this.repo.writeRawFiles(files, commitMessage);
	}

	getConfigFormat(): ConfigFormat | null {
		return this.configFormat;
	}

	getRawYamlDocument(): Document | null {
		return this.yamlDocument;
	}

	private async readRawConfig(): Promise<{
		content: string;
		format: ConfigFormat;
	}> {
		try {
			const yamlFile = await this.repo.getRawFile(CONFIG_YAML_PATH);

			if (yamlFile) {
				return {
					content: Base64.decode(yamlFile.content),
					format: "yaml",
				};
			}
		} catch {
			logger.debug("No YAML config found, trying JSON fallback");
		}

		try {
			const jsonFile = await this.repo.getRawFile(CONFIG_JSON_PATH);

			if (jsonFile) {
				return {
					content: Base64.decode(jsonFile.content),
					format: "json",
				};
			}
		} catch {
			logger.debug("No JSON config found either");
		}

		throw new Error(
			"No Quartz v5 configuration file found. Expected quartz.config.yaml or quartz.plugins.json.",
		);
	}

	private ensureSchemaComment(doc: Document): void {
		if (!doc.commentBefore?.includes("yaml-language-server")) {
			doc.commentBefore = SCHEMA_COMMENT;
		}
	}
}
