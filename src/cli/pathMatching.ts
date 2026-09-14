export function normalizeFuzzy(input: string): string {
	return input
		.toLowerCase()
		.replace(/\.md$/i, "")
		.replace(/[-\s]+/g, "");
}

export function matchGlob(pattern: string, path: string): boolean {
	const normalizedPattern = pattern.replace(/\\/g, "/");
	const normalizedPath = path.replace(/\\/g, "/");
	const escaped = normalizedPattern.replace(/[.()+?^${}()|[\]\\]/g, "\\$&");
	const placeholder = "__DOUBLE_STAR__";
	const withDouble = escaped.replace(/\*\*/g, placeholder);
	const withSingle = withDouble.replace(/\*/g, "[^/]*");
	const regexSource =
		"^" + withSingle.replace(new RegExp(placeholder, "g"), ".*") + "$";
	return new RegExp(regexSource).test(normalizedPath);
}
