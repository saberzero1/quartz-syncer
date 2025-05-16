---
title: Guides
description: Guides and tutorials for using Quartz Syncer.
created: 2005-05-25T00:00:00Z+0200
date: 2025-05-15T08:57:29Z+0200
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
