---
title: Settings
description: Overview of all settings.
created: 2025-05-07T22:37:11Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [settings]
---

## Settings

```dataview
TABLE WITHOUT ID link(file.link, file.frontmatter.title) AS Category, file.frontmatter.description AS Description
WHERE startswith(file.folder, this.file.folder)
WHERE file != this.file
WHERE file.name = "index"
SORT file.frontmatter.title ASC
```

## Commands

| Command | Effect |
| --- | --- |
| `Quartz Syncer: Open Publication Center` | Opens the Publication Center to manage published content. |
| `Quartz Syncer: Setup wizard` | Launches the onboarding wizard to set up Quartz publishing (desktop only). |
| `Quartz Syncer: Open Quartz Hub` | Opens the Quartz Hub for local repository management (desktop only). |
| `Quartz Syncer: Manual setup` | Opens manual setup for configuring the Git connection. |
| `Quartz Syncer: Show publish status` | Shows the current publish status of all marked notes. |
| `Quartz Syncer: Add publish flag` | Adds the configured publish flag to the frontmatter and sets it to `true`. |
| `Quartz Syncer: Remove publish flag` | Adds the configured publish flag to the frontmatter and sets it to `false`. |
| `Quartz Syncer: Toggle publication status` | Toggles the configured publish flag between `true` and `false`. |
| `Quartz Syncer: Clear cache for current file` | Clears the cached compilation data for the current file. |
| `Quartz Syncer: Clear cache for all files` | Clears all cached compilation data (prompts for confirmation). |
