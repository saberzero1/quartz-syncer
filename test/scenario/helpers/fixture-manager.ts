import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
} from "fs";
import { execSync } from "child_process";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __fixturesDir = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../fixtures",
);

export class FixtureManager {
	private tempDir: string | null = null;

	async create(fixtureName: string): Promise<string> {
		const src = resolve(__fixturesDir, fixtureName);
		this.tempDir = mkdtempSync(
			join(tmpdir(), `syncer-fixture-${fixtureName}-`),
		);
		cpSync(src, this.tempDir, { recursive: true });
		execSync(
			"git init && git add -A && git -c user.name=Fixture -c user.email=fixture@example.com commit -m 'baseline'",
			{ cwd: this.tempDir, stdio: "ignore" },
		);
		return this.tempDir;
	}

	async reset(): Promise<void> {
		if (!this.tempDir) return;
		execSync("git checkout -- . && git clean -fd", {
			cwd: this.tempDir,
			stdio: "ignore",
		});
	}

	filePath(relativePath: string): string {
		if (!this.tempDir) {
			throw new Error("Fixture not initialized.");
		}
		return join(this.tempDir, relativePath);
	}

	readFile(relativePath: string): string {
		return readFileSync(this.filePath(relativePath), "utf-8");
	}

	fileExists(relativePath: string): boolean {
		return existsSync(this.filePath(relativePath));
	}

	getFileTree(): string[] {
		const baseDir = this.tempDir;
		if (!baseDir) {
			throw new Error("Fixture not initialized.");
		}
		const files: string[] = [];
		const walk = (current: string): void => {
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				if (entry.name === ".git") continue;
				const entryPath = join(current, entry.name);
				if (entry.isDirectory()) {
					walk(entryPath);
					continue;
				}
				const rel = relative(baseDir, entryPath).split(sep).join("/");
				files.push(rel);
			}
		};
		walk(baseDir);
		return files.sort();
	}

	async destroy(): Promise<void> {
		if (this.tempDir) {
			rmSync(this.tempDir, { recursive: true, force: true });
			this.tempDir = null;
		}
	}
}
