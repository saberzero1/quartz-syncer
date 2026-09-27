import { integrationRegistry } from "src/compiler/integrations";
import {
	getDataviewApi,
	getDataviewSyntaxFingerprint,
	waitForDataviewSyntaxResolution,
} from "src/compiler/integrations/apis/dataview";
import type { DatacoreApi } from "src/compiler/integrations/apis/datacore";
import type QuartzSyncerSettings from "src/models/settings";

/** Bump whenever dynamic detection or vault-dependency declarations change. */
export const DYNAMIC_CONTENT_DETECTOR_VERSION = "vault-dependencies-v2";

export interface CompiledEntryValidityCriteria {
	mtime: number;
	dataviewRevision: number | undefined;
	datacoreRevision: number | undefined;
	version: string;
	settingsFingerprint: string;
	detectorVersion: string;
}

export type CompilationRevisions = Pick<
	CompiledEntryValidityCriteria,
	"dataviewRevision" | "datacoreRevision"
>;

export interface CompiledEntryValidityFields {
	version?: unknown;
	sourceMtime?: unknown;
	settingsFingerprint?: unknown;
	detectorVersion?: unknown;
	dynamicSources?: unknown;
	localData?: unknown;
	localHash?: unknown;
	mediaLinks?: unknown;
	dataviewRevision?: unknown;
	datacoreRevision?: unknown;
}

export function settingsFingerprint(settings: QuartzSyncerSettings): string {
	const enabledIntegrations = integrationRegistry
		.getAll()
		.filter((integration) => settings[integration.settingKey] === true)
		.map((integration) => integration.id)
		.sort();

	return JSON.stringify({
		vaultPath: settings.vaultPath,
		excludedFolders: settings.excludedFolders ?? "",
		showCreatedTimestamp: settings.showCreatedTimestamp,
		showUpdatedTimestamp: settings.showUpdatedTimestamp,
		showPublishedTimestamp: settings.showPublishedTimestamp,
		usePermalink: settings.usePermalink,
		includeAllFrontmatter: settings.includeAllFrontmatter,
		frontmatterFormat: settings.frontmatterFormat,
		createdTimestampKey: settings.createdTimestampKey,
		updatedTimestampKey: settings.updatedTimestampKey,
		publishedTimestampKey: settings.publishedTimestampKey,
		enabledIntegrations,
		dataviewSyntax: settings.useDataview
			? getDataviewSyntaxFingerprint()
			: undefined,
	});
}

/** Resolve whether every enabled integration can provide stable fingerprint inputs. */
export function waitForSettingsFingerprintResolution(
	settings: QuartzSyncerSettings,
): boolean | Promise<boolean> {
	if (!settings.useDataview) return true;
	const resolution = waitForDataviewSyntaxResolution();
	return typeof resolution === "string"
		? resolution === "resolved"
		: resolution.then((result) => result === "resolved");
}

export function currentCompilationRevisions(): CompilationRevisions {
	const datacore = (window as typeof window & { datacore?: DatacoreApi })
		.datacore;

	return {
		dataviewRevision: getDataviewApi()?.index?.revision,
		datacoreRevision: datacore?.core?.revision,
	};
}

/**
 * The revision counter backing each vault-dependent source.
 *
 * Single source of truth. A vault-dependent integration absent from this map
 * has no revision counter and is therefore never trustworthy — adding one here
 * is the only change needed to teach both validity predicates about it.
 */
const REVISION_FIELD_BY_SOURCE = {
	dataview: "dataviewRevision",
	datacore: "datacoreRevision",
} as const satisfies Record<string, keyof CompilationRevisions>;

type RevisionBackedSource = keyof typeof REVISION_FIELD_BY_SOURCE;

function revisionFieldFor(
	source: string,
): (typeof REVISION_FIELD_BY_SOURCE)[RevisionBackedSource] | null {
	return source in REVISION_FIELD_BY_SOURCE
		? REVISION_FIELD_BY_SOURCE[source as RevisionBackedSource]
		: null;
}

/** The single authority for trusting locally compiled cache metadata or payloads. */
export function isCompiledEntryValid(
	entry: CompiledEntryValidityFields | null | undefined,
	criteria: CompiledEntryValidityCriteria,
): boolean {
	if (!entry) return false;
	if (entry.version !== criteria.version) return false;
	if (entry.sourceMtime !== criteria.mtime) return false;
	if (entry.settingsFingerprint !== criteria.settingsFingerprint)
		return false;
	if (entry.detectorVersion !== criteria.detectorVersion) return false;
	if (!isRemoteEntryShapeValid(entry)) return false;

	for (const source of entry.dynamicSources) {
		const field = revisionFieldFor(source);
		if (!field) return false;

		const expected = criteria[field];
		if (expected === undefined || entry[field] !== expected) return false;
	}

	return true;
}

/**
 * Shape-only check for remote metadata, taking no freshness criteria.
 *
 * Deliberately cannot authorise a local read: it answers "is this entry
 * internally consistent?", never "is this entry current?". The predicate that
 * answers the latter is {@link isCompiledEntryValid}, which requires
 * ground-truth criteria from the caller.
 */
export function isRemoteEntryShapeValid(
	entry: CompiledEntryValidityFields | null | undefined,
): entry is CompiledEntryValidityFields & { dynamicSources: string[] } {
	if (!entry) return false;
	if (!Array.isArray(entry.dynamicSources)) return false;
	if (!entry.dynamicSources.every((source) => typeof source === "string"))
		return false;

	if (entry.dynamicSources.length === 0) {
		return (
			entry.dataviewRevision === undefined &&
			entry.datacoreRevision === undefined
		);
	}

	if (entry.localData !== undefined && entry.localData !== null) return false;
	if (entry.localHash !== undefined) return false;
	if (entry.mediaLinks !== undefined) return false;

	for (const source of entry.dynamicSources) {
		const field = revisionFieldFor(source);
		if (!field) return false;
		if (entry[field] === undefined) return false;
	}

	return true;
}

/** The total predicate for trusting a durable dynamic/static classification. */
export function isDynamicClassificationValid(
	entry: CompiledEntryValidityFields | null | undefined,
	criteria: Pick<
		CompiledEntryValidityCriteria,
		"mtime" | "version" | "settingsFingerprint" | "detectorVersion"
	>,
): entry is CompiledEntryValidityFields & { dynamicSources: string[] } {
	if (!entry) return false;
	if (entry.version !== criteria.version) return false;
	if (entry.sourceMtime !== criteria.mtime) return false;
	if (entry.settingsFingerprint !== criteria.settingsFingerprint)
		return false;
	if (entry.detectorVersion !== criteria.detectorVersion) return false;
	return (
		Array.isArray(entry.dynamicSources) &&
		entry.dynamicSources.every((source) => typeof source === "string")
	);
}
