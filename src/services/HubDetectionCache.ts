import { createStore, type IndexedDBStore } from "src/cache/IndexedDBStore";
import type { BinaryInfo } from "src/process/types";

const VERSION_CACHE_TTL_MS = 60_000;
const BINARY_CACHE_TTL_MS = 120_000;

interface PersistedDetection {
	binaryInfo: { data: BinaryInfo[]; time: number } | null;
	quartzVersion: { data: string | null; time: number } | null;
}

export class HubDetectionCache {
	binaryInfo: { data: BinaryInfo[]; time: number } | null = null;
	quartzVersion: { data: string | null; time: number } | null = null;

	private store: IndexedDBStore | null = null;

	enablePersistence(vaultName: string, pluginId: string): void {
		this.store = createStore(`${vaultName}-${pluginId}-hub`);
	}

	async loadPersisted(): Promise<void> {
		if (!this.store) return;

		const data = await this.store
			.getItem<PersistedDetection>("detection")
			.catch(() => null);

		if (!data) return;

		if (
			data.binaryInfo &&
			Date.now() - data.binaryInfo.time < BINARY_CACHE_TTL_MS
		) {
			this.binaryInfo = data.binaryInfo;
		}

		if (
			data.quartzVersion &&
			Date.now() - data.quartzVersion.time < VERSION_CACHE_TTL_MS
		) {
			this.quartzVersion = data.quartzVersion;
		}
	}

	persist(): void {
		if (!this.store) return;

		this.store
			.setItem<PersistedDetection>("detection", {
				binaryInfo: this.binaryInfo,
				quartzVersion: this.quartzVersion,
			})
			.catch(() => {});
	}

	clear(): void {
		this.binaryInfo = null;
		this.quartzVersion = null;
		this.store?.removeItem("detection").catch(() => {});
	}
}
