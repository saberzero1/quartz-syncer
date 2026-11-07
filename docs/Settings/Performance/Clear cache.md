---
title: Clear cache
description: Discard this vault's cached compilation results so every note is recompiled from scratch.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: n/a
---

This is a button, not a toggle. It empties the cache for the current vault, so the next publish or status check recompiles every note from scratch.

With [[Enable caching]] turned off there is normally nothing cached, but the button still clears anything left over from when it was on.

## When you need it

The cache is keyed by note content, so it normally invalidates itself. Reach for this when it has not:

- The Publication Center reports a note as **Published** when you can see it has changed, or as **Changed** when it has not.
- Compiled output looks stale after changing an [[Settings/Integrations/index|integration]] setting, which changes how notes compile without changing the notes themselves.
- A compilation error keeps recurring for a note you have already fixed.

## Using it

1. Open `Settings` > `Quartz Syncer` > `Performance`.
2. Click **Clear cache**.

It reports `Quartz Syncer: cache cleared.` when done. The first status check afterwards is slower than usual, because nothing is cached yet.

> [!NOTE] Your notes and your site are not touched
>
> The cache holds derived data only — compiled output and content hashes. Clearing it cannot lose a note, and it publishes nothing. Your Quartz repository is left exactly as it was.

## From the CLI

```bash
# Clear everything for this vault
obsidian quartz-syncer:cache action=clear

# Clear a single note
obsidian quartz-syncer:cache action=clear-file path="notes/post.md"
```

See [[Guides/CLI#quartz-syncercache|the CLI guide]]. The CLI is the only route to clearing a *single* note's cache; the button always clears everything.

## Related

- [[Clean up caches from other vaults]] — reclaims databases belonging to *other* vaults and remotes. It deliberately excludes this vault, so it is not a substitute for this button.
- [[Enable caching]] — turns caching on or off entirely. Turning it off disables caching rather than clearing it.
