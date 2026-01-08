---
title: Settings
description: Overview of all settings.
created: 2025-05-07T22:37:11Z+0200
modified: 2026-01-08T13:30:00Z+0100
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
| `Quartz Syncer: Open publication center` | Opens the modal to manage the Quartz content on your Git repository. |
| `Quartz Syncer: Add publish flag` | Adds the configured publish flag to the frontmatter and sets it to `true`. |
| `Quartz Syncer: Remove publish flag` | Adds the configured publish flag to the frontmatter and sets it to `false`. |
| `Quartz Syncer: Toggle publication status` | Adds the configured publish flag to the frontmatter and toggles it between `true` and `false`. |
| `Quartz Syncer: Clear cache for current file` | Clears the cached compilation data for the current file. |
| `Quartz Syncer: Clear cache for all files` | Clears all cached compilation data (prompts for confirmation). |
