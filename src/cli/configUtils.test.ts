import {
	flattenObject,
	getValueByPath,
	isRecord,
	setValueByPath,
} from "./configUtils";

describe("configUtils", () => {
	it("gets a nested value by dot path", () => {
		const obj = { a: { b: { c: 1 } } };
		expect(getValueByPath(obj, "a.b.c")).toBe(1);
		expect(getValueByPath(obj, "a.b.d")).toBeUndefined();
	});

	it("sets a value by dot path and blocks forbidden keys", () => {
		const obj = { a: { b: "old" } };
		expect(setValueByPath(obj, "a.b", "new")).toBe(true);
		expect(obj.a.b).toBe("new");

		expect(setValueByPath(obj, "__proto__.polluted", "nope")).toBe(false);
		expect(({} as { polluted?: string }).polluted).toBeUndefined();
	});

	it("flattens nested objects into dotted paths", () => {
		const obj = { a: { b: 2 }, c: "text" };

		expect(flattenObject(obj)).toEqual({
			"a.b": "2",
			c: '"text"',
		});
	});

	it("identifies records", () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord(null)).toBe(false);
		expect(isRecord("nope")).toBe(false);
	});
});
