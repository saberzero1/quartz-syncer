import { diffLines } from "diff";
import { ScrollSync } from "src/views/DiffView/ScrollSync";

export type DiffViewMode = "split" | "unified";

type DiffRow = {
	leftNumber: number | null;
	rightNumber: number | null;
	leftText: string;
	rightText: string;
	leftClass?: string;
	rightClass?: string;
};

type UnifiedRow = {
	lineNumber: number | null;
	text: string;
	className?: string;
	prefix: string;
};

type CollapseRegion = {
	id: string;
	start: number;
	end: number;
	count: number;
};

type DiffRenderState = {
	mode: DiffViewMode;
	contextLines: number;
	collapseRegions: CollapseRegion[];
	container: HTMLElement;
	unifiedContainer?: HTMLElement;
	leftPane?: HTMLElement;
	rightPane?: HTMLElement;
	unifiedRows?: UnifiedRow[];
	splitRows?: DiffRow[];
};

const diffState = new WeakMap<HTMLElement, DiffRenderState>();

export function computeDiffStats(
	localContent: string,
	remoteContent: string,
): { added: number; removed: number } {
	const changes = diffLines(remoteContent, localContent);
	let added = 0;
	let removed = 0;

	for (const change of changes) {
		const lineCount = splitLines(change.value).length;

		if (change.added) {
			added += lineCount;
		} else if (change.removed) {
			removed += lineCount;
		}
	}

	return { added, removed };
}

export function renderDiffView(
	targetEl: HTMLElement,
	localContent: string,
	remoteContent: string,
	mode: DiffViewMode,
	contextLines = 3,
): ScrollSync | null {
	if (mode === "split") {
		return renderSplitView(
			targetEl,
			localContent,
			remoteContent,
			contextLines,
		);
	}

	renderUnifiedView(targetEl, localContent, remoteContent, contextLines);
	return null;
}

export function expandAllCollapsed(container: HTMLElement): void {
	const state = diffState.get(container);
	if (!state) return;
	const collapsed = Array.from(
		container.querySelectorAll<HTMLElement>(".diff-collapsed"),
	);
	const ids = new Set(
		collapsed
			.map((el) => el.dataset.collapseId)
			.filter((id): id is string => Boolean(id)),
	);
	for (const id of ids) {
		expandRegion(container, id);
	}
}

export function collapseAll(container: HTMLElement): void {
	const state = diffState.get(container);
	if (!state) return;
	for (const region of state.collapseRegions) {
		if (state.mode === "unified") {
			const unifiedContainer = state.unifiedContainer;
			if (!unifiedContainer || !state.unifiedRows) continue;
			const existing = unifiedContainer.querySelector(
				`.diff-collapsed[data-collapse-id="${region.id}"]`,
			);
			if (existing) continue;
			const rows = Array.from(
				unifiedContainer.querySelectorAll<HTMLElement>(
					`.diff-line[data-collapse-id="${region.id}"]`,
				),
			);
			if (rows.length === 0) continue;
			const firstRow = rows[0];
			if (!firstRow) continue;
			const placeholder = createCollapsedPlaceholderElement(region, () =>
				expandRegion(container, region.id),
			);
			firstRow.replaceWith(placeholder);
			for (const row of rows.slice(1)) {
				row.remove();
			}
			notifyCollapseChange(container);
			continue;
		}

		const leftPane = state.leftPane;
		const rightPane = state.rightPane;
		if (!leftPane || !rightPane || !state.splitRows) continue;
		const leftPlaceholder = leftPane.querySelector(
			`.diff-collapsed[data-collapse-id="${region.id}"]`,
		);
		if (leftPlaceholder) continue;
		const leftRows = Array.from(
			leftPane.querySelectorAll<HTMLElement>(
				`.diff-line[data-collapse-id="${region.id}"]`,
			),
		);
		const rightRows = Array.from(
			rightPane.querySelectorAll<HTMLElement>(
				`.diff-line[data-collapse-id="${region.id}"]`,
			),
		);
		if (leftRows.length === 0 || rightRows.length === 0) continue;
		const firstLeft = leftRows[0];
		const firstRight = rightRows[0];
		if (!firstLeft || !firstRight) continue;
		const leftPlaceholderEl = createCollapsedPlaceholderElement(
			region,
			() => expandRegion(container, region.id),
		);
		const rightPlaceholderEl = createCollapsedPlaceholderElement(
			region,
			() => expandRegion(container, region.id),
		);
		firstLeft.replaceWith(leftPlaceholderEl);
		firstRight.replaceWith(rightPlaceholderEl);
		for (const row of leftRows.slice(1)) {
			row.remove();
		}
		for (const row of rightRows.slice(1)) {
			row.remove();
		}
		notifyCollapseChange(container);
	}
}

export function getCollapseState(container: HTMLElement): {
	hasRegions: boolean;
	hasCollapsed: boolean;
} {
	const state = diffState.get(container);
	if (!state) {
		return { hasRegions: false, hasCollapsed: false };
	}
	const hasCollapsed = Boolean(container.querySelector(".diff-collapsed"));
	return {
		hasRegions: state.collapseRegions.length > 0,
		hasCollapsed,
	};
}

function renderSplitView(
	targetEl: HTMLElement,
	localContent: string,
	remoteContent: string,
	contextLines: number,
): ScrollSync {
	const container = targetEl.createDiv({ cls: "diff-split-container" });
	const leftPane = container.createDiv({
		cls: "diff-pane diff-pane-left",
	});
	const rightPane = container.createDiv({
		cls: "diff-pane diff-pane-right",
	});

	const rows = buildSplitRows(localContent, remoteContent);
	const collapseRegions = computeCollapseRegions(
		rows,
		contextLines,
		isSplitChangeRow,
	);
	const state: DiffRenderState = {
		mode: "split",
		contextLines,
		collapseRegions,
		container: targetEl,
		leftPane,
		rightPane,
		splitRows: rows,
	};
	diffState.set(targetEl, state);
	if (collapseRegions.length === 0) {
		for (const row of rows) {
			leftPane.appendChild(
				buildSplitRowElement(
					row.leftNumber,
					row.leftText,
					row.leftClass,
				),
			);
			rightPane.appendChild(
				buildSplitRowElement(
					row.rightNumber,
					row.rightText,
					row.rightClass,
				),
			);
		}
	} else {
		renderSplitRowsWithCollapse(
			targetEl,
			leftPane,
			rightPane,
			rows,
			collapseRegions,
		);
	}

	return new ScrollSync(leftPane, rightPane);
}

function renderUnifiedView(
	targetEl: HTMLElement,
	localContent: string,
	remoteContent: string,
	contextLines: number,
): void {
	const container = targetEl.createDiv({ cls: "diff-unified" });
	const rows = buildUnifiedRows(localContent, remoteContent);
	const collapseRegions = computeCollapseRegions(
		rows,
		contextLines,
		isUnifiedChangeRow,
	);
	const state: DiffRenderState = {
		mode: "unified",
		contextLines,
		collapseRegions,
		container: targetEl,
		unifiedContainer: container,
		unifiedRows: rows,
	};
	diffState.set(targetEl, state);
	if (collapseRegions.length === 0) {
		for (const row of rows) {
			container.appendChild(buildUnifiedRowElement(row));
		}
		return;
	}

	renderUnifiedRowsWithCollapse(targetEl, container, rows, collapseRegions);
}

function renderSplitRowsWithCollapse(
	container: HTMLElement,
	leftPane: HTMLElement,
	rightPane: HTMLElement,
	rows: DiffRow[],
	regions: CollapseRegion[],
): void {
	let regionIndex = 0;
	for (let index = 0; index < rows.length; index += 1) {
		const region = regions[regionIndex];
		if (region && region.start === index) {
			const leftPlaceholder = createCollapsedPlaceholderElement(
				region,
				() => expandRegion(container, region.id),
			);
			const rightPlaceholder = createCollapsedPlaceholderElement(
				region,
				() => expandRegion(container, region.id),
			);
			leftPane.appendChild(leftPlaceholder);
			rightPane.appendChild(rightPlaceholder);
			index = region.end;
			regionIndex += 1;
			continue;
		}
		const row = rows[index];
		if (!row) continue;
		leftPane.appendChild(
			buildSplitRowElement(row.leftNumber, row.leftText, row.leftClass),
		);
		rightPane.appendChild(
			buildSplitRowElement(
				row.rightNumber,
				row.rightText,
				row.rightClass,
			),
		);
	}
}

function renderUnifiedRowsWithCollapse(
	container: HTMLElement,
	unifiedContainer: HTMLElement,
	rows: UnifiedRow[],
	regions: CollapseRegion[],
): void {
	let regionIndex = 0;
	for (let index = 0; index < rows.length; index += 1) {
		const region = regions[regionIndex];
		if (region && region.start === index) {
			const placeholder = createCollapsedPlaceholderElement(region, () =>
				expandRegion(container, region.id),
			);
			unifiedContainer.appendChild(placeholder);
			index = region.end;
			regionIndex += 1;
			continue;
		}
		const row = rows[index];
		if (!row) continue;
		unifiedContainer.appendChild(buildUnifiedRowElement(row));
	}
}

function buildSplitRowElement(
	lineNumber: number | null,
	text: string,
	className?: string,
	collapseId?: string,
): HTMLDivElement {
	const line = createDiv({ cls: `diff-line ${className ?? ""}`.trim() });
	if (collapseId) {
		line.dataset.collapseId = collapseId;
	}
	line.createSpan({
		cls: "diff-line-number",
		text: lineNumber ? String(lineNumber) : "",
	});
	line.createSpan({ cls: "diff-line-text", text });
	return line;
}

function buildUnifiedRowElement(
	row: UnifiedRow,
	collapseId?: string,
): HTMLDivElement {
	const line = createDiv({ cls: `diff-line ${row.className ?? ""}`.trim() });
	if (collapseId) {
		line.dataset.collapseId = collapseId;
	}
	line.createSpan({
		cls: "diff-line-number",
		text: row.lineNumber ? String(row.lineNumber) : "",
	});
	line.createSpan({ cls: "diff-line-prefix", text: row.prefix });
	line.createSpan({ cls: "diff-line-text", text: row.text });
	return line;
}

function createCollapsedPlaceholderElement(
	region: CollapseRegion,
	onClick: () => void,
): HTMLDivElement {
	const el = createDiv({ cls: "diff-collapsed" });
	el.dataset.collapseId = region.id;
	el.dataset.hiddenCount = String(region.count);
	const suffix = region.count === 1 ? "" : "s";
	el.createSpan({ text: `Show ${region.count} hidden line${suffix}` });
	el.addEventListener("click", onClick);
	return el;
}

function expandRegion(container: HTMLElement, regionId: string): void {
	const state = diffState.get(container);
	if (!state) return;
	const region = state.collapseRegions.find((entry) => entry.id === regionId);
	if (!region) return;
	if (state.mode === "unified") {
		const unifiedContainer = state.unifiedContainer;
		const rows = state.unifiedRows;
		if (!unifiedContainer || !rows) return;
		const placeholder = unifiedContainer.querySelector<HTMLElement>(
			`.diff-collapsed[data-collapse-id="${regionId}"]`,
		);
		if (!placeholder) return;
		const fragment = createFragment();
		for (let index = region.start; index <= region.end; index += 1) {
			const row = rows[index];
			if (!row) continue;
			fragment.appendChild(buildUnifiedRowElement(row, regionId));
		}
		placeholder.replaceWith(fragment);
		notifyCollapseChange(container);
		return;
	}

	const leftPane = state.leftPane;
	const rightPane = state.rightPane;
	const rows = state.splitRows;
	if (!leftPane || !rightPane || !rows) return;
	const leftPlaceholder = leftPane.querySelector<HTMLElement>(
		`.diff-collapsed[data-collapse-id="${regionId}"]`,
	);
	const rightPlaceholder = rightPane.querySelector<HTMLElement>(
		`.diff-collapsed[data-collapse-id="${regionId}"]`,
	);
	if (!leftPlaceholder || !rightPlaceholder) return;
	const leftFragment = createFragment();
	const rightFragment = createFragment();
	for (let index = region.start; index <= region.end; index += 1) {
		const row = rows[index];
		if (!row) continue;
		leftFragment.appendChild(
			buildSplitRowElement(
				row.leftNumber,
				row.leftText,
				row.leftClass,
				regionId,
			),
		);
		rightFragment.appendChild(
			buildSplitRowElement(
				row.rightNumber,
				row.rightText,
				row.rightClass,
				regionId,
			),
		);
	}
	leftPlaceholder.replaceWith(leftFragment);
	rightPlaceholder.replaceWith(rightFragment);
	notifyCollapseChange(container);
}

function notifyCollapseChange(container: HTMLElement): void {
	container.dispatchEvent(new CustomEvent("qs-diff-collapse-change"));
}

function isUnifiedChangeRow(row: UnifiedRow): boolean {
	return row.className === "diff-added" || row.className === "diff-removed";
}

function isSplitChangeRow(row: DiffRow): boolean {
	return (
		row.leftClass === "diff-added" ||
		row.leftClass === "diff-removed" ||
		row.rightClass === "diff-added" ||
		row.rightClass === "diff-removed"
	);
}

function computeCollapseRegions<T>(
	rows: T[],
	contextLines: number,
	isChange: (row: T) => boolean,
): CollapseRegion[] {
	const changeIndices: number[] = [];
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (row && isChange(row)) {
			changeIndices.push(index);
		}
	}
	if (changeIndices.length === 0) return [];
	const maxIndex = rows.length - 1;
	const intervals = changeIndices
		.map((index) => ({
			start: Math.max(0, index - contextLines),
			end: Math.min(maxIndex, index + contextLines),
		}))
		.sort((a, b) => a.start - b.start);
	const merged: Array<{ start: number; end: number }> = [];
	for (const interval of intervals) {
		const last = merged[merged.length - 1];
		if (!last || interval.start > last.end + 1) {
			merged.push({ start: interval.start, end: interval.end });
			continue;
		}
		last.end = Math.max(last.end, interval.end);
	}
	const regions: CollapseRegion[] = [];
	let prevEnd = -1;
	let regionIndex = 0;
	for (const interval of merged) {
		if (interval.start > prevEnd + 1) {
			const start = prevEnd + 1;
			const end = interval.start - 1;
			regions.push({
				id: `collapse-${regionIndex}`,
				start,
				end,
				count: end - start + 1,
			});
			regionIndex += 1;
		}
		prevEnd = Math.max(prevEnd, interval.end);
	}
	if (prevEnd < maxIndex) {
		const start = prevEnd + 1;
		const end = maxIndex;
		regions.push({
			id: `collapse-${regionIndex}`,
			start,
			end,
			count: end - start + 1,
		});
	}
	return regions;
}

function buildSplitRows(
	localContent: string,
	remoteContent: string,
): DiffRow[] {
	const rows: DiffRow[] = [];
	const changes = diffLines(remoteContent, localContent);
	let leftNumber = 1;
	let rightNumber = 1;

	for (const change of changes) {
		const lines = splitLines(change.value);
		for (const line of lines) {
			if (change.added) {
				rows.push({
					leftNumber: null,
					rightNumber,
					leftText: "",
					rightText: line,
					leftClass: "diff-filler",
					rightClass: "diff-added",
				});
				rightNumber += 1;
				continue;
			}

			if (change.removed) {
				rows.push({
					leftNumber,
					rightNumber: null,
					leftText: line,
					rightText: "",
					leftClass: "diff-removed",
					rightClass: "diff-filler",
				});
				leftNumber += 1;
				continue;
			}

			rows.push({
				leftNumber,
				rightNumber,
				leftText: line,
				rightText: line,
			});
			leftNumber += 1;
			rightNumber += 1;
		}
	}

	return rows;
}

function buildUnifiedRows(
	localContent: string,
	remoteContent: string,
): UnifiedRow[] {
	const rows: UnifiedRow[] = [];
	const changes = diffLines(remoteContent, localContent);
	let lineNumber = 1;

	for (const change of changes) {
		const lines = splitLines(change.value);
		for (const line of lines) {
			if (change.added) {
				rows.push({
					lineNumber,
					text: line,
					className: "diff-added",
					prefix: "+",
				});
				lineNumber += 1;
				continue;
			}

			if (change.removed) {
				rows.push({
					lineNumber,
					text: line,
					className: "diff-removed",
					prefix: "-",
				});
				lineNumber += 1;
				continue;
			}

			rows.push({
				lineNumber,
				text: line,
				prefix: " ",
			});
			lineNumber += 1;
		}
	}

	return rows;
}

function splitLines(value: string): string[] {
	const lines = value.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}
