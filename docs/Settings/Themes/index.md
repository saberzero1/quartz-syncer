---
title: Themes
description: Quartz Syncer settings related to Quartz Themes.
created: 2025-05-15T11:00:30Z+0200
modified: 2025-06-16T00:13:08Z+0200
publish: true
tags: [settings/themes, themes]
---

> [!WARNING] Upcoming feature
> Configuring Quartz Themes using Quartz Syncer is an upcoming feature. It is not released yet.
>
> If you want to use an Obsidian theme in Quartz right now, see the [Quartz Themes GitHub repository](https://github.com/saberzero1/quartz-themes#installation) for installation instructions.

![[social-preview.png]]

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
