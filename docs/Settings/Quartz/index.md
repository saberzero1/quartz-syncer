---
title: Quartz
description: Quartz Syncer settings related to Quartz.
created: 2025-05-15T16:03:13Z+0200
date: 2025-05-16T12:09:03Z+0200
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
