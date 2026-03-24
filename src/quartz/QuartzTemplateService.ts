import { Base64 } from "js-base64";
import Logger from "js-logger";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import type { QuartzV5Config } from "./QuartzConfigTypes";

const logger = Logger.get("quartz-template-service");

const TEMPLATES_DIR = "quartz/cli/templates";
const BUILT_IN_FRAMES = ["default", "full-width", "minimal"];

export interface QuartzTemplate {
	name: string;
	config: QuartzV5Config;
}

export class QuartzTemplateService {
	private repo: RepositoryConnection;

	constructor(repo: RepositoryConnection) {
		this.repo = repo;
	}

	async listTemplateNames(): Promise<string[]> {
		const entries = await this.repo.listDirectory(TEMPLATES_DIR);

		return entries.filter((e) => e.type === "tree").map((e) => e.name);
	}

	async readTemplate(templateName: string): Promise<QuartzTemplate | null> {
		const configPath = `${TEMPLATES_DIR}/${templateName}/quartz.config.yaml`;

		try {
			const file = await this.repo.getRawFile(configPath);

			if (!file) return null;

			const { parseDocument } = await import("yaml");
			const content = Base64.decode(file.content);
			const doc = parseDocument(content, { keepSourceTokens: true });
			const config = doc.toJSON() as QuartzV5Config;

			return { name: templateName, config };
		} catch (error) {
			logger.debug(`Could not read template ${templateName}`, error);

			return null;
		}
	}

	async getAvailableFrameNames(): Promise<string[]> {
		const templateNames = await this.listTemplateNames();
		const allFrames = new Set<string>(BUILT_IN_FRAMES);

		for (const name of templateNames) {
			allFrames.add(name);
		}

		return [...allFrames].sort();
	}

	applyTemplate(
		currentConfig: QuartzV5Config,
		template: QuartzTemplate,
	): void {
		currentConfig.configuration = {
			...template.config.configuration,
		};
		currentConfig.plugins = [...template.config.plugins];
		currentConfig.layout = template.config.layout
			? { ...template.config.layout }
			: undefined;
	}
}
