---
title: Themes
description: Quartz Syncer settings related to Quartz Themes.
created: 2025-05-15T11:00:30Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/themes, themes]
---

> [!WARNING] There is no Themes settings tab
>
> Quartz Syncer v1 had a **Themes** tab with its own settings. It was removed in v2, along with the `useThemes` setting, because theming moved entirely to the Quartz side. Nothing needs configuring in Quartz Syncer to use an Obsidian theme.

Quartz Themes is a [Quartz v5 community plugin](https://github.com/saberzero1/quartz-themes), configured through `quartz.config.yaml` in your Quartz repository rather than through plugin settings. See [[Using an Obsidian theme in Quartz]] for setup instructions and available options.

You can install and configure it without leaving Obsidian using the [[Guides/Quartz Hub#Plugins tab|Quartz Hub]].

![[social-preview.png]]

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
