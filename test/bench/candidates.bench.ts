import { expect, test } from "vitest";
import { collectCandidatePaths } from "src/publishFile/PublishCandidates";
import {
	attachments,
	candidateFixture,
	cpuOptions,
	markdownFiles,
	report,
} from "./fixtures";

test("collectCandidatePaths at vault scale", async ({ bench }) => {
	const { app, plugin, settings, allFiles } = candidateFixture();
	const collect = () => collectCandidatePaths(app, plugin, settings);
	const initial = collect();
	// No revision-dependent execution path: accept only either exact, known
	// contract and report which one actually ran. Nothing imports the new helper.
	const includesAttachments = initial.has(attachments[0]!.path);
	const expectedFiles = includesAttachments ? allFiles : markdownFiles;
	expect(initial).toEqual(new Set(expectedFiles.map((file) => file.path)));
	let result = initial;
	const measurement = await bench(
		"collectCandidatePaths / 10000 notes + 5000 attachments",
		{
			async: false,
			afterEach: () => {
				expect(result.size).toBe(expectedFiles.length);
			},
		},
		() => {
			result = collect();
		},
	).run(cpuOptions);
	report(measurement, { kind: "candidates", candidateCount: result.size });
});
