---
title: Integrations
description: Quartz Syncer settings related to integrations with other Obsidian plugins.
created: 2025-05-15T15:52:53Z+0200
modified: 2026-01-10T12:58:00Z+0100
publish: true
tags: [settings/integrations]
---

> [!info] Plugin integrations that are marked as default `true` are still only enabled if their respective plugin is also installed and enabled.

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
WHERE file.frontmatter.description
SORT file.frontmatter.title ASC
```
