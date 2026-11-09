/**
 * Does a Quartz version satisfy a plugin's `quartzVersion` range?
 *
 * A small semver check (Quartz Syncer adds no runtime dependencies) for the ranges plugins
 * declare: `>=5.1.0`, `>5.0`, `<=`, `<`, `=`, `^5.1.0`, `~5.1.0`, exact versions, `x`/`*`
 * wildcards, space-separated conditions that must all hold, and `||` alternatives. Prerelease
 * tags are ignored, as Quartz's own check counts prereleases of a version as that version.
 *
 * Returns `null` when either side can't be read (e.g. `"unspecified"`, `"latest"`, an unknown
 * site version), so callers never block on something they couldn't check.
 */

type Version = [number, number, number];

function parseVersion(text: string): Version | null {
	const match =
		/^v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:[-+].*)?$/.exec(
			text.trim(),
		);
	if (!match) return null;
	const part = (value: string | undefined) =>
		value === undefined || /^[xX*]$/.test(value) ? 0 : Number(value);

	return [part(match[1]), part(match[2]), part(match[3])];
}

function compare(a: Version, b: Version): number {
	for (let i = 0; i < 3; i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}

	return 0;
}

/** How many leading parts a bound spells out (`5` → 1, `5.1` → 2, `5.1.0` → 3). */
function precision(text: string): number {
	return text
		.replace(/^v/, "")
		.split(/[-+]/)[0]!
		.split(".")
		.filter((part) => part !== "" && !/^[xX*]$/.test(part)).length;
}

/** The first version after a partial bound's line: 5.0 → 5.1.0, 5 → 6.0.0. */
function nextLine(bound: Version, parts: number): Version {
	return parts <= 1 ? [bound[0] + 1, 0, 0] : [bound[0], bound[1] + 1, 0];
}

function satisfiesComparator(
	version: Version,
	comparator: string,
): boolean | null {
	if (comparator === "" || comparator === "*" || /^[xX]$/.test(comparator))
		return true;
	const match = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(comparator);
	if (!match) return null;
	const operator = match[1] ?? "";
	const boundText = match[2]!;
	const bound = parseVersion(boundText);
	if (!bound) return null;
	const cmp = compare(version, bound);
	const parts = precision(boundText);

	switch (operator) {
		case ">=":
			return cmp >= 0;
		case ">":
			// a partial bound covers its whole line: >5.0 means >=5.1.0, >5 means >=6.0.0
			return parts >= 3
				? cmp > 0
				: compare(version, nextLine(bound, parts)) >= 0;
		case "<=":
			// <=5.0 means <5.1.0
			return parts >= 3
				? cmp <= 0
				: compare(version, nextLine(bound, parts)) < 0;
		case "<":
			return cmp < 0;
		case "^": {
			if (cmp < 0) return false;
			// ^5.1.0 → <6.0.0; ^0.2.3 → <0.3.0; ^0.0.3 → <0.0.4
			const [major, minor, patch] = bound;
			if (major > 0 || parts === 1) return version[0] === major;
			if (minor > 0 || parts === 2)
				return version[0] === 0 && version[1] === minor;
			return version[0] === 0 && version[1] === 0 && version[2] === patch;
		}
		case "~":
			if (cmp < 0) return false;
			// ~5.1.0 → <5.2.0; ~5 → <6.0.0
			return parts === 1
				? version[0] === bound[0]
				: version[0] === bound[0] && version[1] === bound[1];
		default:
			// "5.1.0" exactly; "5.1" / "5" / "5.x" match everything in that line
			return parts >= 3
				? cmp === 0
				: version[0] === bound[0] &&
						(parts < 2 || version[1] === bound[1]);
	}
}

export function satisfiesQuartzVersion(
	range: string | null | undefined,
	siteVersion: string | null | undefined,
): boolean | null {
	if (!range || !siteVersion) return null;
	const version = parseVersion(siteVersion);
	if (!version) return null;

	let unknown = false;
	for (const alternative of range.split("||")) {
		// ">= 5.1.0" → ">=5.1.0"; conditions are separated by spaces
		const comparators = alternative
			.trim()
			.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1")
			.split(/\s+/)
			.filter(Boolean);
		let all = true;
		for (const comparator of comparators.length > 0 ? comparators : ["*"]) {
			const result = satisfiesComparator(version, comparator);
			if (result === null) {
				unknown = true;
				all = false;
				break;
			}
			if (!result) {
				all = false;
				break;
			}
		}
		if (all) return true;
	}

	return unknown ? null : false;
}
