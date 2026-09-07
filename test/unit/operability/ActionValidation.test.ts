import { validateAction } from "src/operability/ActionValidation";
import type { Action } from "src/operability/types";

const validActions = [
	{ name: "pub.open" },
	{ name: "pub.close" },
	{ name: "pub.select", params: { paths: ["notes/a.md"] } },
	{ name: "pub.deselect", params: { paths: [] } },
	{ name: "pub.selectAll" },
	{ name: "pub.deselectAll" },
	{ name: "pub.publish", params: { confirm: true } },
	{ name: "pub.delete", params: { confirm: true } },
	{ name: "cache.pruneForeign", params: { confirm: true } },
	{ name: "status.refresh" },
	{ name: "onboarding.start" },
	{ name: "onboarding.setToken", params: { token: "token" } },
	{ name: "onboarding.createRepo", params: { name: "site", confirm: true } },
	{ name: "onboarding.connectRepo", params: { repo: "owner/site" } },
	{ name: "onboarding.configure" },
	{ name: "settings.set", params: { key: "x", value: undefined } },
	{ name: "settings.get", params: { key: "x" } },
	{ name: "plugin.reload", params: { confirm: true } },
	{ name: "connection.test" },
	{ name: "env.emulateMobile", params: { enabled: false, confirm: true } },
	{ name: "hub.open" },
	{ name: "hub.close" },
	{ name: "hub.setup.link", params: { path: "/tmp/site" } },
	{
		name: "hub.setup.clone",
		params: {
			url: "https://example.com/site.git",
			dest: "/tmp/site",
			confirm: true,
		},
	},
] satisfies Action[];

describe("validateAction", () => {
	it.each(validActions)("accepts $name without mutating it", (action) => {
		const before = structuredClone(action);
		expect(validateAction(action)).toBeNull();
		expect(action).toEqual(before);
	});

	it.each([
		undefined,
		null,
		false,
		42,
		"pub.delete",
		[],
		{},
		{ name: 42 },
		{ name: "unknown" },
		{ name: "toString" },
		{ name: "__proto__" },
	])("rejects malformed action envelopes: %j", (action) => {
		expect(validateAction(action)).toEqual({
			success: false,
			error: "Unknown action",
		});
	});

	it.each([
		{ name: "pub.publish", params: { confirm: true, message: "Update" } },
		{ name: "pub.publish", params: { confirm: true, message: undefined } },
		{
			name: "onboarding.createRepo",
			params: { name: "site", confirm: true, private: true },
		},
		{
			name: "onboarding.createRepo",
			params: { name: "site", confirm: true, private: false },
		},
		{
			name: "onboarding.createRepo",
			params: { name: "site", confirm: true, private: undefined },
		},
		{ name: "settings.set", params: { key: "x" } },
		{ name: "hub.setup.link", params: { path: "" } },
		{
			name: "hub.setup.clone",
			params: { url: "", dest: "", confirm: true },
		},
	])(
		"leaves optional and handler-validated values unchanged: %j",
		(action) => {
			expect(validateAction(action)).toBeNull();
		},
	);

	it.each([undefined, null, false, true, 42, "value", [], {}])(
		"accepts arbitrary settings values: %j",
		(value) => {
			expect(
				validateAction({
					name: "settings.set",
					params: { key: "x", value },
				}),
			).toBeNull();
		},
	);
});
