<script lang="ts">
	import { diffLines, type Change } from "diff";
	import { Platform } from "obsidian";
	import type { DiffViewStyle } from "src/models/settings";

	export let oldContent: string;
	export let newContent: string;
	export let fileName: string = "";
	export let defaultViewStyle: DiffViewStyle = "auto";

	type ViewMode = "split" | "unified";

	function getInitialViewMode(): ViewMode {
		if (defaultViewStyle === "split") return "split";
		if (defaultViewStyle === "unified") return "unified";
		return Platform.isMobile ? "unified" : "split";
	}

	let viewMode: ViewMode = getInitialViewMode();

	$: diff = diffLines(oldContent, newContent);

	interface SplitLine {
		left: { content: string; type: "removed" | "unchanged" } | null;
		right: { content: string; type: "added" | "unchanged" } | null;
		leftLineNum: number | null;
		rightLineNum: number | null;
	}

	function buildSplitLines(changes: Change[]): SplitLine[] {
		const result: SplitLine[] = [];
		let leftLineNum = 1;
		let rightLineNum = 1;

		for (const change of changes) {
			const lines = change.value.replace(/\n$/, "").split("\n");

			if (change.added) {
				for (const line of lines) {
					const lastRow = result[result.length - 1];
					if (lastRow && lastRow.right === null) {
						lastRow.right = { content: line, type: "added" };
						lastRow.rightLineNum = rightLineNum++;
					} else {
						result.push({
							left: null,
							right: { content: line, type: "added" },
							leftLineNum: null,
							rightLineNum: rightLineNum++,
						});
					}
				}
			} else if (change.removed) {
				for (const line of lines) {
					result.push({
						left: { content: line, type: "removed" },
						right: null,
						leftLineNum: leftLineNum++,
						rightLineNum: null,
					});
				}
			} else {
				for (const line of lines) {
					result.push({
						left: { content: line, type: "unchanged" },
						right: { content: line, type: "unchanged" },
						leftLineNum: leftLineNum++,
						rightLineNum: rightLineNum++,
					});
				}
			}
		}

		return result;
	}

	$: splitLines = buildSplitLines(diff);

	function getUnifiedLines(changes: Change[]): Array<{
		content: string;
		type: "added" | "removed" | "unchanged";
		oldLineNum: number | null;
		newLineNum: number | null;
	}> {
		const result: Array<{
			content: string;
			type: "added" | "removed" | "unchanged";
			oldLineNum: number | null;
			newLineNum: number | null;
		}> = [];
		let oldLineNum = 1;
		let newLineNum = 1;

		for (const change of changes) {
			const lines = change.value.replace(/\n$/, "").split("\n");
			for (const line of lines) {
				if (change.added) {
					result.push({
						content: line,
						type: "added",
						oldLineNum: null,
						newLineNum: newLineNum++,
					});
				} else if (change.removed) {
					result.push({
						content: line,
						type: "removed",
						oldLineNum: oldLineNum++,
						newLineNum: null,
					});
				} else {
					result.push({
						content: line,
						type: "unchanged",
						oldLineNum: oldLineNum++,
						newLineNum: newLineNum++,
					});
				}
			}
		}

		return result;
	}

	$: unifiedLines = getUnifiedLines(diff);

	$: additions = diff
		.filter((c) => c.added)
		.reduce((sum, c) => sum + c.count!, 0);
	$: deletions = diff
		.filter((c) => c.removed)
		.reduce((sum, c) => sum + c.count!, 0);

	let leftPane: HTMLDivElement | null = null;
	let rightPane: HTMLDivElement | null = null;
	let isSyncing = false;

	function syncScroll(source: HTMLDivElement, target: HTMLDivElement) {
		if (isSyncing) return;
		isSyncing = true;
		target.scrollTop = source.scrollTop;
		target.scrollLeft = source.scrollLeft;
		requestAnimationFrame(() => {
			isSyncing = false;
		});
	}

	function leftPaneAction(node: HTMLDivElement) {
		leftPane = node;

		const handleScroll = () => {
			if (rightPane) syncScroll(node, rightPane);
		};
		node.addEventListener("scroll", handleScroll);

		return {
			destroy() {
				node.removeEventListener("scroll", handleScroll);
				leftPane = null;
			},
		};
	}

	function rightPaneAction(node: HTMLDivElement) {
		rightPane = node;

		const handleScroll = () => {
			if (leftPane) syncScroll(node, leftPane);
		};
		node.addEventListener("scroll", handleScroll);

		return {
			destroy() {
				node.removeEventListener("scroll", handleScroll);
				rightPane = null;
			},
		};
	}
</script>

<div class="quartz-syncer-diff-view diff-view-wrapper">
	<div class="diff-header">
		<div class="diff-info">
			<span class="diff-stats">
				<span class="additions">+{additions}</span>
				<span class="deletions">-{deletions}</span>
			</span>
			{#if fileName}
				<span class="diff-filename">{fileName}</span>
			{/if}
		</div>
		<div class="diff-controls">
			<button
				class="view-toggle"
				class:active={viewMode === "split"}
				on:click={() => (viewMode = "split")}
			>
				Split
			</button>
			<button
				class="view-toggle"
				class:active={viewMode === "unified"}
				on:click={() => (viewMode = "unified")}
			>
				Unified
			</button>
		</div>
	</div>

	{#if viewMode === "split"}
		<div class="diff-split">
			<div class="diff-pane">
				<div class="diff-pane-header">Remote (Published)</div>
				<div class="diff-scroll-area" use:leftPaneAction>
					<div class="diff-lines-inner">
						{#each splitLines as row}
							<div
								class="diff-line"
								class:removed={row.left?.type === "removed"}
								class:empty={row.left === null}
							>
								<span class="line-num"
									>{row.leftLineNum ?? ""}</span
								>
								<span class="line-indicator"
									>{row.left?.type === "removed"
										? "-"
										: " "}</span
								>
								<span class="line-content"
									>{row.left?.content ?? ""}</span
								>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div class="diff-pane">
				<div class="diff-pane-header">Local (Current)</div>
				<div class="diff-scroll-area" use:rightPaneAction>
					<div class="diff-lines-inner">
						{#each splitLines as row}
							<div
								class="diff-line"
								class:added={row.right?.type === "added"}
								class:empty={row.right === null}
							>
								<span class="line-num"
									>{row.rightLineNum ?? ""}</span
								>
								<span class="line-indicator"
									>{row.right?.type === "added"
										? "+"
										: " "}</span
								>
								<span class="line-content"
									>{row.right?.content ?? ""}</span
								>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="diff-unified-scroll">
			<div class="diff-lines-inner">
				{#each unifiedLines as line}
					<div
						class="diff-line"
						class:added={line.type === "added"}
						class:removed={line.type === "removed"}
					>
						<span class="line-num">{line.oldLineNum ?? ""}</span>
						<span class="line-num">{line.newLineNum ?? ""}</span>
						<span class="line-indicator">
							{#if line.type === "added"}+{:else if line.type === "removed"}-{:else}{" "}{/if}
						</span>
						<span class="line-content">{line.content}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="diff-footer">
		Differences between your local file and the published file. Content may
		differ slightly due to plugin processing.
	</div>
</div>

<style>
	.diff-view-wrapper {
		font-family: var(--font-monospace);
		font-size: 12px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		overflow: hidden;
	}

	.diff-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: var(--background-secondary);
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.diff-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.diff-stats {
		display: flex;
		gap: 8px;
		font-weight: 500;
	}

	.additions {
		color: var(--color-green);
	}

	.deletions {
		color: var(--color-red);
	}

	.diff-filename {
		color: var(--text-muted);
	}

	.diff-controls {
		display: flex;
		gap: 4px;
	}

	.view-toggle {
		padding: 4px 12px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		border-radius: 4px;
		cursor: pointer;
		font-size: 11px;
		color: var(--text-muted);
	}

	.view-toggle:hover {
		background: var(--background-modifier-hover);
	}

	.view-toggle.active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}

	.diff-split {
		display: flex;
		height: 50vh;
	}

	.diff-pane {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.diff-pane:first-child {
		border-right: 1px solid var(--background-modifier-border);
	}

	.diff-pane-header {
		padding: 6px 12px;
		background: var(--background-secondary);
		border-bottom: 1px solid var(--background-modifier-border);
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.diff-scroll-area {
		flex: 1;
		overflow: auto;
	}

	.diff-unified-scroll {
		height: 50vh;
		overflow: auto;
	}

	.diff-lines-inner {
		display: inline-block;
		min-width: 100%;
	}

	.diff-line {
		display: flex;
		line-height: 20px;
		white-space: pre;
	}

	.diff-line.added {
		--fallback-color-added: 46, 160, 67;
		background: rgba(
			var(
				--background-modifier-success-rgb,
				var(--color-green-rgb, var(--fallback-color-added))
			),
			0.15
		);
	}

	.diff-line.removed {
		--fallback-color-removed: 248, 81, 73, 0.15;
		background: rgba(
			var(
				--background-modifier-error-rgb,
				var(--color-red-rgb, var(--fallback-color-removed))
			),
			0.15
		);
	}

	.diff-line.empty {
		background: var(--background-secondary);
	}

	.line-num {
		min-width: 40px;
		padding: 0 8px;
		text-align: right;
		color: var(--text-faint);
		background: var(--background-secondary);
		user-select: none;
		border-right: 1px solid var(--background-modifier-border);
		flex-shrink: 0;
	}

	.diff-line.added > .line-num,
	.diff-line.removed > .line-num {
		background: transparent;
	}

	.line-indicator {
		width: 20px;
		min-width: 20px;
		text-align: center;
		color: var(--text-muted);
		user-select: none;
		flex-shrink: 0;
	}

	.diff-line.added .line-indicator {
		color: var(--color-green);
		font-weight: bold;
	}

	.diff-line.removed .line-indicator {
		color: var(--color-red);
		font-weight: bold;
	}

	.line-content {
		flex: 1;
		padding: 0 8px;
	}

	.diff-footer {
		padding: 8px 12px;
		background: var(--background-secondary);
		border-top: 1px solid var(--background-modifier-border);
		font-size: 11px;
		color: var(--text-muted);
		font-family: var(--font-interface);
	}
</style>
