import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { generateBlobHash } from "src/utils/utils";

export class DataFile {
	hash: string;
	remoteHash: string | null;
	data: TCompiledFile;

	constructor(file: CompiledPublishFile) {
		this.hash = generateBlobHash(file.compiledFile[0]);
		this.remoteHash = file.remoteHash || null;
		this.data = file.compiledFile;
	}
}

export function dataFileHashMismatch(file: DataFile) {
	// Check if the local hash matches the remote hash or remoteHash is null
	if (!file.remoteHash || file.hash !== file.remoteHash) {
		return true; // Hashes do not match
	}

	return false; // Hashes match
}

// TODO: Add functions to convert to/from this type and the PublishFile type. FileMetadataManager seems to be a good candidate for this, as it already has methods to get created/updated/published timestamps and other metadata.
// TODO: https://github.com/blacksmithgu/datacore/blob/master/src/index/datastore.ts
// TODO: Think about how to deal with comparison to GitHub tree files without having to store the entire file content in the cache. Maybe just store the hash of the file content and compare that instead? Or store the file content only if it has changed since the last time it was cached?
