import { BinaryDetector } from "src/process/BinaryDetector";
import type { ProcessRunner } from "src/process/ProcessRunner";
import type { ProcessResult } from "src/process/types";

const successResult: ProcessResult = {
	stdout: "git version 2.42.0\n",
	stderr: "",
	exitCode: 0,
	killed: false,
};

const failureResult: ProcessResult = {
	stdout: "",
	stderr: "not found",
	exitCode: 1,
	killed: false,
	error: "not found",
};

describe("BinaryDetector", () => {
	it("detects and caches binaries", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const detector = new BinaryDetector({
			run,
		} as unknown as ProcessRunner);

		const first = await detector.detect("git");
		const second = await detector.detect("git");

		expect(first).toBe("git");
		expect(second).toBe("git");
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("returns null when detection fails", async () => {
		const run = vi.fn().mockResolvedValue(failureResult);
		const detector = new BinaryDetector({
			run,
		} as unknown as ProcessRunner);

		const found = await detector.detect("git");
		const cached = await detector.detect("git");

		expect(found).toBeNull();
		expect(cached).toBeNull();
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("detectAll returns every binary", async () => {
		const run = vi.fn().mockResolvedValue(successResult);
		const detector = new BinaryDetector({
			run,
		} as unknown as ProcessRunner);

		const results = await detector.detectAll();

		expect(results).toHaveLength(4);
		for (const result of results) {
			expect(result.available).toBe(true);
			expect(result.path).toBe(result.name);
			expect(result.version).toBe("git version 2.42.0");
		}
	});
});
