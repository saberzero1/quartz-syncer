import { Platform, resetPlatform } from "obsidian";
import { NodeDetector } from "src/quartz/NodeDetector";

const { getModule, execFile } = vi.hoisted(() => {
	const execFile = vi.fn();
	return {
		execFile,
		getModule: vi.fn(() => ({ execFile })),
	};
});

vi.mock("src/utils/external-fs", () => ({ getModule }));

describe("NodeDetector", () => {
	afterEach(() => {
		resetPlatform();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("detects Node without a shell on Linux", async () => {
		Platform.isDesktopApp = true;
		Platform.isWin = false;
		execFile.mockImplementation(
			(
				_file: string,
				_args: string[],
				_options: object,
				callback: (error: null, stdout: string, stderr: string) => void,
			) => {
				callback(null, "v22.14.0\n", "");
			},
		);

		const result = await new NodeDetector().detect();

		expect(execFile).toHaveBeenCalledWith(
			"node",
			["--version"],
			{ timeout: 10000, shell: false, windowsHide: true },
			expect.any(Function),
		);
		expect(result).toEqual({ available: true, version: "22.14.0" });
	});
});
