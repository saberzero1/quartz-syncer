import {
	externalFileExists,
	externalIsDirectorySync,
	joinPath,
} from "src/utils/external-fs";

type ValidationResult = {
	valid: boolean;
	reason?: string;
};

const QUARTZ_CONFIG_FILES = ["quartz.config.ts", "quartz.config.yaml"];

export async function validateQuartzRepo(
	repoPath: string,
): Promise<ValidationResult> {
	if (!repoPath) {
		return { valid: false, reason: "No repository path configured." };
	}

	if (!externalIsDirectorySync(repoPath)) {
		return {
			valid: false,
			reason: `Directory does not exist: ${repoPath}`,
		};
	}

	const hasPackageJson = await externalFileExists(
		joinPath(repoPath, "package.json"),
	);

	if (!hasPackageJson) {
		return {
			valid: false,
			reason: "Directory does not contain a package.json file.",
		};
	}

	for (const configFile of QUARTZ_CONFIG_FILES) {
		const hasConfig = await externalFileExists(
			joinPath(repoPath, configFile),
		);

		if (hasConfig) {
			return { valid: true };
		}
	}

	return {
		valid: false,
		reason: "Directory does not contain a Quartz configuration file (quartz.config.ts or quartz.config.yaml).",
	};
}
