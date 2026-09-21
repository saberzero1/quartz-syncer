import { Platform } from "obsidian";
import { TCompiledFile } from "src/compiler/SyncerPageCompiler";
import { CompiledEntryValidityCriteria } from "src/cache/CompiledEntryValidity";

const DESKTOP_SESSION_LIMIT = 100;
const MOBILE_SESSION_LIMIT = 20;

type SessionEntry = {
	compiled: TCompiledFile;
	criteria: CompiledEntryValidityCriteria;
};

function criteriaMatch(
	stored: CompiledEntryValidityCriteria,
	current: CompiledEntryValidityCriteria,
): boolean {
	return (
		stored.mtime === current.mtime &&
		stored.dataviewRevision === current.dataviewRevision &&
		stored.datacoreRevision === current.datacoreRevision &&
		stored.version === current.version &&
		stored.settingsFingerprint === current.settingsFingerprint &&
		stored.detectorVersion === current.detectorVersion
	);
}

/**
 * Operation-scoped reuse of dynamic compiled output.
 *
 * A dynamic note's output depends on the whole vault, so it has no sound
 * durable cache key and must never reach IndexedDB. Within one operation —
 * an open Publication Center, a CLI invocation, an auto-publish cycle — the
 * same note is otherwise compiled once per consumer (status, diff, publish).
 * Entries are kept only while every validity criterion still matches, so a
 * vault change during the session invalidates rather than serves stale output.
 */
export class DynamicCompilationSession {
	private readonly entries = new Map<string, SessionEntry>();

	constructor(
		private readonly limit: number = Platform.isMobileApp
			? MOBILE_SESSION_LIMIT
			: DESKTOP_SESSION_LIMIT,
	) {}

	get(
		path: string,
		criteria: CompiledEntryValidityCriteria,
	): TCompiledFile | null {
		const entry = this.entries.get(path);

		if (!entry) return null;

		if (!criteriaMatch(entry.criteria, criteria)) {
			this.entries.delete(path);

			return null;
		}

		this.entries.delete(path);
		this.entries.set(path, entry);

		return entry.compiled;
	}

	set(
		path: string,
		compiled: TCompiledFile,
		criteria: CompiledEntryValidityCriteria,
	): void {
		if (this.limit <= 0) return;

		this.entries.delete(path);
		this.entries.set(path, { compiled, criteria });

		while (this.entries.size > this.limit) {
			const oldest = this.entries.keys().next();

			if (oldest.done) break;
			this.entries.delete(oldest.value);
		}
	}

	invalidate(path: string): void {
		this.entries.delete(path);
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
