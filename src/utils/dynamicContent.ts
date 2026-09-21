import { integrationRegistry } from "src/compiler/integrations";
import type { PatternDescriptor } from "src/compiler/integrations/types";
import QuartzSyncerSettings from "src/models/settings";

interface DetectionPattern {
	integrationId: string;
	descriptor: PatternDescriptor;
}

interface CachedDetectionPatterns {
	signature: string;
	patterns: DetectionPattern[];
}

let cachedPatterns: CachedDetectionPatterns | undefined;

const ALL_VAULT_DEPENDENT_ENABLED = {
	useDataview: true,
	useDatacore: true,
	useFantasyStatblocks: true,
	useAutoCardLink: true,
} as QuartzSyncerSettings;

const FENCED_CODE_BLOCK =
	/(^|\n)(`{3,}|~{3,})[^\r\n]*(?:\r?\n)[\s\S]*?\2(?=\r?$)/gm;

function getDetectionPatterns(
	settings: QuartzSyncerSettings,
): DetectionPattern[] {
	const candidates = integrationRegistry
		.getVaultDependentEnabled(settings)
		.flatMap((integration) =>
			integration.getPatterns().map((descriptor) => ({
				integrationId: integration.id,
				descriptor,
			})),
		);
	const signature = candidates
		.map(
			({ integrationId, descriptor }) =>
				`${integrationId}\u0000${descriptor.id}\u0000${descriptor.type}\u0000${descriptor.pattern.source}\u0000${descriptor.pattern.flags}`,
		)
		.join("\u0001");

	if (cachedPatterns?.signature === signature) {
		return cachedPatterns.patterns;
	}

	cachedPatterns = { signature, patterns: candidates };
	return candidates;
}

/**
 * Checks whether enabled vault-dependent integrations can handle content in the note.
 * Availability is deliberately ignored because this classification is persisted.
 */
export function hasDynamicContent(
	text: string,
	settings: QuartzSyncerSettings = ALL_VAULT_DEPENDENT_ENABLED,
): boolean {
	return getDynamicSources(text, settings).length > 0;
}

export function getDynamicSources(
	text: string,
	settings: QuartzSyncerSettings = ALL_VAULT_DEPENDENT_ENABLED,
): string[] {
	const patterns = getDetectionPatterns(settings);
	let textWithoutFencedCode: string | undefined;
	const sources = new Set<string>();

	for (const { integrationId, descriptor } of patterns) {
		const input =
			descriptor.type === "inline"
				? (textWithoutFencedCode ??= text.replace(
						FENCED_CODE_BLOCK,
						"",
					))
				: text;

		if (input.search(descriptor.pattern) !== -1) sources.add(integrationId);
	}

	return [...sources].sort();
}
