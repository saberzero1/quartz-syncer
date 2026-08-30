import type QuartzSyncer from "src/main";
import type { CliHandler } from "src/cli/types";

const DEFAULT_TARGET = "all";

export function createInspectHandler(plugin: QuartzSyncer): CliHandler {
	return async (params) => {
		const target = params.args.target?.toLowerCase() ?? DEFAULT_TARGET;
		const filePath = params.args.path;
		const dataStore = plugin.dataStore;

		if (!dataStore) {
			return { success: false, error: "Data store is not available" };
		}

		if (target === "cache") {
			return inspectCache(dataStore, filePath);
		}

		if (target === "hashes") {
			return inspectHashes(dataStore, filePath);
		}

		if (target === "compilation") {
			return inspectCompilation(dataStore, filePath);
		}

		if (target === "queue") {
			const engineStatus = plugin.getEngineStatus();

			return {
				success: true,
				data: {
					running: engineStatus.running,
					pending: engineStatus.pending,
					autoPublish: engineStatus.autoPublish,
				},
			};
		}

		if (target === "all") {
			const cache = await inspectCache(dataStore, filePath);
			const hashes = await inspectHashes(dataStore, filePath);
			const compilation = await inspectCompilation(dataStore, filePath);
			const engineStatus = plugin.getEngineStatus();

			return {
				success: true,
				data: {
					cache: cache.data,
					hashes: hashes.data,
					compilation: compilation.data,
					queue: {
						running: engineStatus.running,
						pending: engineStatus.pending,
						autoPublish: engineStatus.autoPublish,
					},
				},
			};
		}

		return {
			success: false,
			error: `Unknown target: ${target}. Use cache, hashes, compilation, queue, or all.`,
		};
	};
}

async function inspectCache(
	dataStore: QuartzSyncer["dataStore"],
	filePath?: string,
) {
	const allFiles = await dataStore.allFiles();

	if (filePath) {
		const entry = allFiles.find((f) => f === filePath);

		if (!entry) {
			return {
				success: true,
				data: { path: filePath, cached: false },
			};
		}

		const localHash = await dataStore.loadLocalHash(filePath);
		const remoteHash = await dataStore.loadRemoteHash(filePath);

		return {
			success: true,
			data: {
				path: filePath,
				cached: true,
				localHash: localHash ?? null,
				remoteHash: remoteHash ?? null,
			},
		};
	}

	return {
		success: true,
		data: {
			entries: allFiles.length,
			files: allFiles,
		},
	};
}

async function inspectHashes(
	dataStore: QuartzSyncer["dataStore"],
	filePath?: string,
) {
	if (filePath) {
		const localHash = await dataStore.loadLocalHash(filePath);
		const remoteHash = await dataStore.loadRemoteHash(filePath);

		return {
			success: true,
			data: {
				path: filePath,
				localHash: localHash ?? null,
				remoteHash: remoteHash ?? null,
				match:
					localHash && remoteHash ? localHash === remoteHash : null,
			},
		};
	}

	const allFiles = await dataStore.allFiles();
	const hashes: Array<{
		path: string;
		localHash: string | null;
		remoteHash: string | null;
		match: boolean | null;
	}> = [];

	for (const file of allFiles) {
		const localHash = await dataStore.loadLocalHash(file);
		const remoteHash = await dataStore.loadRemoteHash(file);
		hashes.push({
			path: file,
			localHash: (localHash as string) ?? null,
			remoteHash: (remoteHash as string) ?? null,
			match: localHash && remoteHash ? localHash === remoteHash : null,
		});
	}

	return {
		success: true,
		data: { count: hashes.length, hashes },
	};
}

async function inspectCompilation(
	dataStore: QuartzSyncer["dataStore"],
	filePath?: string,
) {
	if (filePath) {
		const localFile = await dataStore.loadLocalFile(
			filePath,
			undefined,
			true,
		);

		return {
			success: true,
			data: {
				path: filePath,
				compiled: localFile !== null,
				contentLength: localFile ? localFile[0].length : 0,
				blobCount: localFile ? localFile[1].blobs.length : 0,
			},
		};
	}

	const allFiles = await dataStore.allFiles();

	return {
		success: true,
		data: {
			totalFiles: allFiles.length,
		},
	};
}
