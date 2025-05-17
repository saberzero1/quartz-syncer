---
title: Troubleshooting
description: Troubleshooting common issues.
created: 2025-05-05T00:00:00Z+0200
date: 2025-05-17T14:05:35Z+0200
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
