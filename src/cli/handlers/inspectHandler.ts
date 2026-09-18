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
			return inspectCache(plugin, filePath);
		}

		if (target === "hashes") {
			return inspectHashes(plugin, filePath);
		}

		if (target === "compilation") {
			return inspectCompilation(plugin, filePath);
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
			const cache = await inspectCache(plugin, filePath);
			const hashes = await inspectHashes(plugin, filePath);
			const compilation = await inspectCompilation(plugin, filePath);
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

async function inspectCache(plugin: QuartzSyncer, filePath?: string) {
	const dataStore = plugin.dataStore;
	const allFiles = await dataStore.allFiles();

	if (filePath) {
		const entry = allFiles.find((f) => f === filePath);

		if (!entry) {
			return {
				success: true,
				data: { path: filePath, cached: false },
			};
		}

		const mtime = plugin.app.vault.getFileByPath(filePath)?.stat.mtime;
		const localHash =
			mtime === undefined
				? null
				: await dataStore.loadLocalHash(filePath, mtime);
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

async function inspectHashes(plugin: QuartzSyncer, filePath?: string) {
	const dataStore = plugin.dataStore;
	if (filePath) {
		const mtime = plugin.app.vault.getFileByPath(filePath)?.stat.mtime;
		const localHash =
			mtime === undefined
				? null
				: await dataStore.loadLocalHash(filePath, mtime);
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
		const mtime = plugin.app.vault.getFileByPath(file)?.stat.mtime;
		const localHash =
			mtime === undefined
				? null
				: await dataStore.loadLocalHash(file, mtime);
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

async function inspectCompilation(plugin: QuartzSyncer, filePath?: string) {
	const dataStore = plugin.dataStore;
	if (filePath) {
		const mtime = plugin.app.vault.getFileByPath(filePath)?.stat.mtime;
		const localFile =
			mtime === undefined
				? null
				: await dataStore.loadLocalFile(filePath, mtime);

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
