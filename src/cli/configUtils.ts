const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function getValueByPath(obj: unknown, path: string): unknown {
	const segments = path.split(".");

	if (segments.some((s) => FORBIDDEN_KEYS.has(s))) return undefined;

	let current: unknown = obj;

	for (const segment of segments) {
		if (!isRecord(current) || !Object.hasOwn(current, segment))
			return undefined;
		current = current[segment];
	}

	return current;
}

export function setValueByPath(
	obj: unknown,
	path: string,
	value: string | boolean,
): boolean {
	const segments = path.split(".");

	if (segments.some((s) => FORBIDDEN_KEYS.has(s))) return false;
	let current: unknown = obj;

	for (let i = 0; i < segments.length - 1; i++) {
		const segment = segments[i];

		if (!isRecord(current) || !Object.hasOwn(current, segment))
			return false;
		current = current[segment];
	}

	if (!isRecord(current)) return false;
	const lastSegment = segments[segments.length - 1];

	current[lastSegment] = value;

	return true;
}

export function flattenObject(
	obj: unknown,
	prefix = "",
	result: Record<string, string> = {},
): Record<string, string> {
	if (!isRecord(obj)) {
		if (prefix) result[prefix] = JSON.stringify(obj);

		return result;
	}

	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined) continue;

		const nextPrefix = prefix ? `${prefix}.${key}` : key;

		if (isRecord(value)) {
			flattenObject(value, nextPrefix, result);
		} else {
			result[nextPrefix] = JSON.stringify(value);
		}
	}

	return result;
}
