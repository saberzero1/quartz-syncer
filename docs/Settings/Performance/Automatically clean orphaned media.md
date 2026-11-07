---
title: Automatically clean orphaned media
description: Automatically remove media files from the Quartz repository that are no longer linked by any published note.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/performance]
aliases: [Settings/Performance/Auto-clean orphaned media]
default_value: "false"
---

When enabled, Quartz Syncer deletes media files (images, PDFs, audio, video) from your Quartz repository once no published note links to them any more.

## When media becomes orphaned

Media is published alongside the notes that reference it, so it becomes orphaned when:

- the note that linked it is unpublished or deleted
- a note is edited to remove a media link
- a media file was published alongside a note that has since been removed

## Behaviour

- **Disabled (default)**: orphaned media stays in your Quartz repository until you remove it yourself.
- **Enabled**: after each publish or delete, Quartz Syncer looks for orphaned media and removes it.

The sweep runs in the background with bounded concurrency, and is cancelled if the plugin unloads or the Publication Center closes mid-run.

> [!NOTE] Dry runs are never affected
>
> Orphan cleanup applies to real operations only. A `dry-run` publish or delete never deletes media as a side effect.

## Doing it manually instead

The [[Usage Guide#Advanced tab|Advanced tab]] of the Publication Center has an **Unlinked media** category listing exactly the files this setting would remove. Select them and press Delete to remove them on your own schedule.

From the terminal:

```bash
# List orphaned media
obsidian quartz-syncer:media action=orphaned

# Preview removal
obsidian quartz-syncer:media action=clean force dry-run

# Remove it
obsidian quartz-syncer:media action=clean force
```

## Recommendation

Leave this off if you publish media you intend to link later, or if anything else in your Quartz repository references files in the content folder — Quartz Syncer only tracks links from *published notes*, so a reference from a Quartz template or custom component does not keep a file alive.

Turn it on if your media is only ever reached through notes and you want the repository to stay tidy without manual work.
