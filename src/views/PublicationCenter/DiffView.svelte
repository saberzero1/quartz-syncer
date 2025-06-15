<script lang="ts">
	import * as Diff from "diff";
	export let diff: Diff.Change[];
</script>

<div class="quartz-syncer-modal-content-diff-view">
	<div class="info callout">
		Differences between your local file and the published file.
		<br />
		The content may look a bit different from your note. This is because it shows
		the note after being processed by the plugin.
	</div>
	<hr />
	{#if diff}
		<div>
			{#each diff as part}
				{#if part.added}
					<pre
						class="quartz-syncer-diff-view quartz-syncer-diff-added">{part.value}</pre>
				{:else if part.removed}
					<pre
						class="quartz-syncer-diff-view quartz-syncer-diff-removed">{part.value}</pre>
				{:else}
					<pre>{part.value}</pre>
				{/if}
			{/each}
		</div>
	{/if}
</div>
