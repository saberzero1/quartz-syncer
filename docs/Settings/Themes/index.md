---
title: Themes
description: Quartz Syncer settings related to Quartz Themes.
created: 2025-05-15T11:00:30Z+0200
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [settings/themes, themes]
---

Quartz Themes is configured as a [Quartz v5 community plugin](https://github.com/saberzero1/quartz-themes) via `quartz.config.yaml`. See [[Using an Obsidian theme in Quartz]] for setup instructions and available options.

![[social-preview.png]]

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
