<script lang="ts">
	import * as Diff from "diff";
	export let diff: Diff.Change[];
</script>

<div>
	{#if diff}
		<div>
			{#each diff as part}
				{#if part.added}
					<span
						class="quartz-syncer-diff-line quartz-syncer-diff-line-added"
						>{part.value}</span
					>
				{:else if part.removed}
					<span
						class="quartz-syncer-diff-line quartz-syncer-diff-line-removed"
						>{part.value}</span
					>
				{/if}
			{/each}
		</div>
	{/if}
</div>
