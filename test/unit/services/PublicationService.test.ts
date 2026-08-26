import type { PublishFile } from "src/publishFile/PublishFile";
import type { Publisher } from "src/publisher/Publisher";
import type { PublishResult, PublishStatus } from "src/publisher/types";
import { PublicationService } from "src/services/PublicationService";

const createPublisherStub = (overrides: Partial<Publisher> = {}): Publisher => {
	return {
		getPublishStatus: vi.fn(),
		publishBatch: vi.fn(),
		deleteBatch: vi.fn(),
		deleteByRepoPaths: vi.fn(),
		publishArbitraryFiles: vi.fn(),
		cleanOrphanedMedia: vi.fn(),
		isLocal: true,
		...overrides,
	} as unknown as Publisher;
};

describe("PublicationService", () => {
	it("delegates getStatus to publisher", async () => {
		const status: PublishStatus = {
			unpublished: [],
			changed: [],
			published: [],
			deleted: [],
			media: [],
			arbitrary: [],
		};
		const publisher = createPublisherStub({
			getPublishStatus: vi.fn().mockResolvedValue(status),
		});
		const service = new PublicationService(publisher);

		const result = await service.getStatus();

		expect(result).toBe(status);
		expect(publisher.getPublishStatus).toHaveBeenCalledTimes(1);
	});

	it("delegates publish with default message and progress", async () => {
		const files = [{} as PublishFile];
		const publishResult: PublishResult = {
			success: true,
			filesPublished: 1,
			filesDeleted: 0,
		};
		const onProgress = vi.fn();
		const publisher = createPublisherStub({
			publishBatch: vi.fn().mockResolvedValue(publishResult),
		});
		const service = new PublicationService(publisher);

		const result = await service.publish(files, undefined, onProgress);

		expect(result).toBe(publishResult);
		expect(publisher.publishBatch).toHaveBeenCalledWith(
			files,
			"Published via Quartz Syncer",
			onProgress,
		);
	});

	it("delegates delete with default message and progress", async () => {
		const paths = ["notes/a.md"];
		const deleteResult: PublishResult = {
			success: true,
			filesPublished: 0,
			filesDeleted: 1,
		};
		const onProgress = vi.fn();
		const publisher = createPublisherStub({
			deleteBatch: vi.fn().mockResolvedValue(deleteResult),
		});
		const service = new PublicationService(publisher);

		const result = await service.delete(paths, undefined, onProgress);

		expect(result).toBe(deleteResult);
		expect(publisher.deleteBatch).toHaveBeenCalledWith(
			paths,
			"Deleted via Quartz Syncer",
			onProgress,
		);
	});

	it("delegates deleteByRepoPaths with default message and progress", async () => {
		const repoPaths = ["content/notes/a.md"];
		const deleteResult: PublishResult = {
			success: true,
			filesPublished: 0,
			filesDeleted: 1,
		};
		const onProgress = vi.fn();
		const publisher = createPublisherStub({
			deleteByRepoPaths: vi.fn().mockResolvedValue(deleteResult),
		});
		const service = new PublicationService(publisher);

		const result = await service.deleteByRepoPaths(
			repoPaths,
			undefined,
			onProgress,
		);

		expect(result).toBe(deleteResult);
		expect(publisher.deleteByRepoPaths).toHaveBeenCalledWith(
			repoPaths,
			"Deleted via Quartz Syncer",
			onProgress,
		);
	});

	it("delegates publishArbitraryFiles with default message", async () => {
		const files: Array<{
			repoPath: string;
			content: string;
			encoding: "utf-8" | "base64";
		}> = [
			{
				repoPath: "content/file.txt",
				content: "hello",
				encoding: "utf-8",
			},
		];
		const publishResult: PublishResult = {
			success: true,
			filesPublished: 1,
			filesDeleted: 0,
		};
		const publisher = createPublisherStub({
			publishArbitraryFiles: vi.fn().mockResolvedValue(publishResult),
		});
		const service = new PublicationService(publisher);

		const result = await service.publishArbitraryFiles(files);

		expect(result).toBe(publishResult);
		expect(publisher.publishArbitraryFiles).toHaveBeenCalledWith(
			files,
			"Published via Quartz Syncer",
		);
	});

	it("delegates cleanOrphanedMedia", async () => {
		const publisher = createPublisherStub({
			cleanOrphanedMedia: vi.fn().mockResolvedValue(undefined),
		});
		const service = new PublicationService(publisher);

		await service.cleanOrphanedMedia();

		expect(publisher.cleanOrphanedMedia).toHaveBeenCalledTimes(1);
	});

	it("exposes isLocal from publisher", () => {
		const publisher = createPublisherStub({ isLocal: false });
		const service = new PublicationService(publisher);

		expect(service.isLocal).toBe(false);
	});
});
