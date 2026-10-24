import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkObsidian from "@quartz-community/remark-obsidian";
import { visit } from "unist-util-visit";

interface CommentSpan {
	start: number;
	end: number;
	raw: string;
	token: string;
}

/** Keep parser-recognized comments opaque until every publication transform finishes.
 * Internal HTML comments preserve punctuation boundaries for adjacent Markdown.
 * Their explicit closing delimiter also prevents a standalone placeholder from
 * swallowing following Markdown as an open HTML block. Authors and final output
 * retain the original Obsidian syntax.
 */
export function protectObsidianComments(source: string) {
	const tree = unified()
		.use(remarkParse)
		.use(remarkFrontmatter, ["yaml"])
		.use(remarkObsidian)
		.parse(source);
	let prefix: string;
	do {
		prefix = `QSCOMMENT${crypto.randomUUID().replaceAll("-", "")}Z`;
	} while (source.includes(prefix));
	const spans: CommentSpan[] = [];
	visit(tree, "comment", (node) => {
		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start === undefined || end === undefined) {
			throw new Error("Obsidian comment has no source position");
		}
		spans.push({
			start,
			end,
			raw: source.slice(start, end),
			token: `<!--${prefix}${spans.length}Z-->`,
		});
	});
	let text = source;
	for (const span of [...spans].reverse()) {
		text = text.slice(0, span.start) + span.token + text.slice(span.end);
	}
	return {
		text,
		containsOffset: (offset: number) =>
			spans.some((span) => offset >= span.start && offset < span.end),
		restore(output: string): string {
			for (const span of spans) {
				if (output.split(span.token).length !== 2) {
					throw new Error(
						"Publication transform lost or duplicated an Obsidian comment",
					);
				}
			}
			// Validate every token before restoring: comment contents are never scanned as tokens.
			const restored = output.replace(
				new RegExp(`<!--${prefix}\\d+Z-->`, "g"),
				(token) => {
					const span = spans.find(
						(candidate) => candidate.token === token,
					);
					if (!span)
						throw new Error("Unknown protected Obsidian comment");
					return span.raw;
				},
			);
			if (restored.includes(prefix)) {
				throw new Error(
					"Publication transform leaked a protected Obsidian comment",
				);
			}
			return restored;
		},
	};
}
