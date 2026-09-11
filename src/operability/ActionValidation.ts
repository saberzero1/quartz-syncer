import type { Action } from "./types";

type ParameterRule = {
	valid: (value: unknown) => boolean;
	error?: string;
};

// Require a rule for every action and parameter, including optional parameters.
type ActionRules = {
	[A in Action as A["name"]]: A extends { params: infer P }
		? { [K in keyof P]-?: ParameterRule }
		: Record<string, never>;
};

const string: ParameterRule = { valid: (value) => typeof value === "string" };
const boolean: ParameterRule = { valid: (value) => typeof value === "boolean" };
const confirmation: ParameterRule = {
	valid: (value) => value === true,
	error: "Confirmation required",
};
const paths: ParameterRule = {
	valid: (value) =>
		Array.isArray(value) &&
		Array.from(value).every((path: unknown) => typeof path === "string"),
};

const actionRules: ActionRules = {
	"pub.open": {},
	"pub.close": {},
	"pub.select": { paths },
	"pub.deselect": { paths },
	"pub.selectAll": {},
	"pub.deselectAll": {},
	"pub.publish": {
		message: {
			valid: (value) => value === undefined || string.valid(value),
		},
		confirm: confirmation,
	},
	"pub.delete": { confirm: confirmation },
	"cache.pruneForeign": { confirm: confirmation },
	"status.refresh": {},
	"onboarding.start": {},
	"onboarding.setToken": { token: string },
	"onboarding.createRepo": {
		name: string,
		private: {
			valid: (value) => value === undefined || boolean.valid(value),
		},
		confirm: confirmation,
	},
	"onboarding.connectRepo": { repo: string },
	"onboarding.configure": {},
	"settings.set": { key: string, value: { valid: () => true } },
	"settings.get": { key: string },
	"plugin.reload": { confirm: confirmation },
	"connection.test": {},
	"env.emulateMobile": {
		enabled: boolean,
		confirm: {
			valid: confirmation.valid,
			error: "Destructive action requires confirm: true",
		},
	},
	"hub.open": {},
	"hub.close": {},
	"hub.setup.link": { path: string },
	"hub.setup.clone": { url: string, dest: string, confirm: confirmation },
};

/**
 * Reject malformed runtime actions before events or handlers read their params.
 * The public act/dispatch signatures retain Action's union for typed callers,
 * but hand-written JSON passed through Obsidian eval bypasses TypeScript entirely.
 * Accept unknown here so validation cannot accidentally trust those annotations.
 * Both entry points share this guard; direct dispatch (including reloadSelf) is
 * protected as well as the facade's pre-dispatch event emission.
 * Confirmation is checked first and requires literal true, never a truthy default.
 * settings.set's unknown value accepts undefined (or absence) in a present params
 * object; a missing params object is rejected by its required key instead.
 * Returns a structured failure, or null to leave existing action behavior intact.
 */
export function validateAction(
	input: unknown,
): { success: false; error: string } | null {
	if (
		!isRecord(input) ||
		typeof input.name !== "string" ||
		!Object.prototype.hasOwnProperty.call(actionRules, input.name)
	) {
		return { success: false, error: "Unknown action" };
	}

	// The own-property check above establishes that this is an Action name.
	const rules: Record<string, ParameterRule> =
		actionRules[input.name as Action["name"]];
	const params = isRecord(input.params) ? input.params : undefined;
	const confirm = rules.confirm;
	if (confirm && !confirm.valid(params?.confirm)) {
		return {
			success: false,
			error: confirm.error ?? "Confirmation required",
		};
	}

	for (const [field, rule] of Object.entries(rules)) {
		if (!rule.valid(params?.[field])) {
			return {
				success: false,
				error: `Missing required parameter: ${field}`,
			};
		}
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
