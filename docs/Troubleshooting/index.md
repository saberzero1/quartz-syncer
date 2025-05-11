---
title: Troubleshooting
description: Troubleshooting common issues.
created: 2004-05-25T00:00:00+02:00
date: 2025-05-11T17:08:18+02:00
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
