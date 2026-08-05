import { Platform } from "obsidian";
import { getModule } from "src/utils/external-fs";

type ExecFileResult = {
	stdout: string;
	stderr: string;
};

type ChildProcessModule = {
	execFile(
		file: string,
		args: string[],
		options: { timeout?: number },
		callback: (
			error: { code?: number; message?: string } | null,
			stdout: string,
			stderr: string,
		) => void,
	): void;
};

const MIN_NODE_MAJOR = 18;

export class NodeDetector {
	private cachedVersion: string | null = null;
	private cachedAvailable: boolean | null = null;

	async detect(): Promise<{ available: boolean; version: string | null }> {
		if (this.cachedAvailable !== null) {
			return {
				available: this.cachedAvailable,
				version: this.cachedVersion,
			};
		}

		if (!Platform.isDesktopApp) {
			this.cachedAvailable = false;
			this.cachedVersion = null;

			return { available: false, version: null };
		}

		try {
			const result = await this.exec("node", ["--version"]);
			const raw = result.stdout.trim();
			const version = raw.startsWith("v") ? raw.slice(1) : raw;
			const major = parseInt(version.split(".")[0] ?? "0", 10);

			this.cachedVersion = version;
			this.cachedAvailable = major >= MIN_NODE_MAJOR;

			return {
				available: this.cachedAvailable,
				version: this.cachedVersion,
			};
		} catch {
			this.cachedAvailable = false;
			this.cachedVersion = null;

			return { available: false, version: null };
		}
	}

	async isAvailable(): Promise<boolean> {
		const result = await this.detect();

		return result.available;
	}

	async version(): Promise<string | null> {
		const result = await this.detect();

		return result.version;
	}

	resetCache(): void {
		this.cachedAvailable = null;
		this.cachedVersion = null;
	}

	private exec(command: string, args: string[]): Promise<ExecFileResult> {
		const cp = getModule<ChildProcessModule>("child_process");

		return new Promise((resolve, reject) => {
			cp.execFile(
				command,
				args,
				{ timeout: 10000 },
				(error, stdout, stderr) => {
					if (error) {
						reject(error);
						return;
					}

					resolve({ stdout, stderr });
				},
			);
		});
	}
}
