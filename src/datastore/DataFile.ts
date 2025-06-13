import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { generateBlobHash } from "src/utils/utils";

export class DataFile {
	updated: number;
	localHash: string | null = null;
	localData: TCompiledFile | null = null;
	remoteHash: string | null = null;
	remoteData: TCompiledFile | null = null;

	constructor(file: CompiledPublishFile) {
		//this.hash = generateBlobHash(file.compiledFile[0]);
		this.updated = file.file.stat.mtime;
		//this.data = file.compiledFile;
	}

	getLocalHash(): string | null {
		if (this.localHash) {
			return this.localHash;
		}

		if (this.localData) {
			const localHash = generateBlobHash(this.localData[0]);
			this.localHash = localHash;

			return localHash;
		}

		return null;
	}

	getRemoteHash(): string | null {
		if (this.remoteHash) {
			return this.remoteHash;
		}

		if (this.remoteData) {
			const remoteHash = generateBlobHash(this.remoteData[0]);
			this.remoteHash = remoteHash;

			return remoteHash;
		}

		return null;
	}

	getLocalData(): TCompiledFile | null {
		return this.localData;
	}

	getRemoteData(): TCompiledFile | null {
		return this.remoteData;
	}

	getLocalMarkdown(): string | null {
		if (this.localData) {
			return this.localData[0];
		}

		return null;
	}

	getRemoteMarkdown(): string | null {
		if (this.remoteData) {
			return this.remoteData[0];
		}

		return null;
	}

	setLocalData(data: TCompiledFile): void {
		this.localData = data;
		this.localHash = generateBlobHash(data[0]);
	}

	setRemoteData(data: TCompiledFile): void {
		this.remoteData = data;
		this.remoteHash = generateBlobHash(data[0]);
	}

	identical(): boolean {
		const localHash = this.getLocalHash();
		const remoteHash = this.getRemoteHash();

		if (localHash === null || remoteHash === null) {
			return false;
		}

		return localHash === remoteHash;
	}
}

// TODO: Add functions to convert to/from this type and the PublishFile type. FileMetadataManager seems to be a good candidate for this, as it already has methods to get created/updated/published timestamps and other metadata.
// TODO: https://github.com/blacksmithgu/datacore/blob/master/src/index/datastore.ts
// TODO: Think about how to deal with comparison to GitHub tree files without having to store the entire file content in the cache. Maybe just store the hash of the file content and compare that instead? Or store the file content only if it has changed since the last time it was cached?
