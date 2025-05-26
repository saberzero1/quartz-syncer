---
title: Useful resources
description: Useful resources for Obsidian, Quartz, etc.
created: 2025-05-24T12:39:52Z+0200
modified: 2025-05-24T12:43:55Z+0200
publish: true
tags: [resources]
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
