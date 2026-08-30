---
title: Auto-clean orphaned media
description: Automatically remove media files from the Quartz repository that are no longer linked by any published note.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: "false"
---

When enabled, Quartz Syncer will automatically delete media files (images, PDFs, audio, video) from your Quartz repository if no published note links to them.

## When media becomes orphaned

Media files become orphaned when:

- The note that linked to them is unpublished or deleted
- A note is edited to remove a media link
- A media file was published alongside a note that has since been removed

## Behavior

- **Disabled (default)**: orphaned media remains in your Quartz repository until manually removed.
- **Enabled**: after each publish or delete operation, Quartz Syncer checks for orphaned media and removes it automatically.

You can also manage orphaned media manually via the CLI: `obsidian quartz-syncer:media action=orphaned` to list orphaned files, and `obsidian quartz-syncer:media action=clean force` to remove them.
