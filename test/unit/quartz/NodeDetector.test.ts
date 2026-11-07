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

	const stubNodeVersion = (raw: string): void => {
		Platform.isDesktopApp = true;
		Platform.isWin = false;
		execFile.mockImplementation(
			(
				_file: string,
				_args: string[],
				_options: object,
				callback: (error: null, stdout: string, stderr: string) => void,
			) => {
				callback(null, raw, "");
			},
		);
	};

	it("detects Node without a shell on Linux", async () => {
		stubNodeVersion("v22.14.0\n");

		const result = await new NodeDetector().detect();

		expect(execFile).toHaveBeenCalledWith(
			"node",
			["--version"],
			{ timeout: 10000, shell: false, windowsHide: true },
			expect.any(Function),
		);
		expect(result).toEqual({ available: true, version: "22.14.0" });
	});

	it.each(["v18.20.4", "v20.11.1", "v21.7.3"])(
		"reports %s unavailable because Quartz v5 requires Node 22",
		async (raw) => {
			stubNodeVersion(`${raw}\n`);

			const result = await new NodeDetector().detect();

			expect(result).toEqual({
				available: false,
				version: raw.slice(1),
			});
		},
	);

	it.each(["v22.12.0", "v24.14.0"])("reports %s available", async (raw) => {
		stubNodeVersion(`${raw}\n`);

		const result = await new NodeDetector().detect();

		expect(result).toEqual({
			available: true,
			version: raw.slice(1),
		});
	});
});
