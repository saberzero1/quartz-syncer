import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

const QUARTZ_CACHE_DIR = "test/e2e/quartz-build/.quartz-cache";
const QUARTZ_CACHE_TAG = ".quartz-tag";

export class QuartzBuildFixture {
	private tempDir: string | null = null;

	async create(): Promise<string> {
		const tagPath = join(QUARTZ_CACHE_DIR, QUARTZ_CACHE_TAG);
		if (
			!existsSync(QUARTZ_CACHE_DIR) ||
			!statSync(QUARTZ_CACHE_DIR).isDirectory() ||
			!existsSync(tagPath)
		) {
			throw new Error(
				"Quartz cache missing. Run `npm run test:e2e:build` to populate test/e2e/quartz-build/.quartz-cache.",
			);
		}

		this.tempDir = mkdtempSync(join(tmpdir(), "syncer-quartz-build-"));
		cpSync(QUARTZ_CACHE_DIR, this.tempDir, { recursive: true });

		execSync(
			"git init && git add -A && git -c user.name=Test -c user.email=test@test.com commit -m 'baseline'",
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

	get path(): string {
		if (!this.tempDir) {
			throw new Error("Fixture not created");
		}
		return this.tempDir;
	}

	async destroy(): Promise<void> {
		if (this.tempDir) {
			rmSync(this.tempDir, { recursive: true, force: true });
			this.tempDir = null;
		}
	}
}
