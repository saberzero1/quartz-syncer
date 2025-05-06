---
title: Guides
description: Guides and tutorials for using Quartz Syncer.
created: 2025-05-05T00:00:00+02:00
date: 2025-05-06T00:28:34+02:00
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
