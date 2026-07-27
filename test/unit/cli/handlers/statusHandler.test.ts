import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusHandler } from "src/cli/handlers/statusHandler";
import type { Publisher } from "src/publisher/Publisher";
import { buildParams, buildPlugin } from "./helpers";

describe("statusHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns publish status counts", async () => {
		const publisher = {
			getPublishStatus: vi.fn(async () => ({
				unpublished: ["a.md"],
				changed: ["b.md", "c.md"],
				published: ["d.md"],
				deleted: [],
			})),
		} as unknown as Publisher;
		const plugin = buildPlugin({
			getPublisher: vi.fn(() => publisher) as unknown as
				() => Publisher | null,
		});
		const handler = createStatusHandler(plugin);

		const result = await handler(buildParams({ format: "json" }));
		expect(result).toEqual({
			success: true,
			data: {
				unpublished: 1,
				changed: 2,
				published: 1,
				deleted: 0,
			},
		});
	});

	it("returns an error when repository is unavailable", async () => {
		const plugin = buildPlugin({ getPublisher: vi.fn(() => null) });
		const handler = createStatusHandler(plugin);

		const result = await handler(buildParams());
		expect(result).toEqual({
			success: false,
			error: "Repository not configured",
		});
	});
});
