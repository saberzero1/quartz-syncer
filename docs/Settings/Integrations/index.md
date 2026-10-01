---
title: Integrations
description: Quartz Syncer settings related to integrations with other Obsidian plugins.
created: 2025-05-15T15:52:53Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/integrations]
---

Integrations let Quartz Syncer convert content that only Obsidian understands into something Quartz can render. The settings page splits them into three sections.

## Core plugins

Obsidian core plugin formats. No community plugin required.

| Setting | Default |
| --- | --- |
| [[Bases]] | `false` |
| [[Canvas]] | `false` |

## Community plugins

| Setting | Default |
| --- | --- |
| [[Settings/Integrations/Dataview\|Dataview]] | `true` |
| [[Settings/Integrations/Datacore\|Datacore]] | `false` |
| [[Settings/Integrations/Excalidraw\|Excalidraw]] | `false` |
| [[Settings/Integrations/Fantasy Statblocks\|Fantasy Statblocks]] | `false` |
| [[Settings/Integrations/Auto Card Link\|Auto Card Link]] | `false` |

> [!info] An enabled integration still needs its plugin
>
> Integrations default to `true` only do something if the corresponding Obsidian plugin is also installed and enabled. With the plugin missing, the integration is inert.

## Integration styles

| Setting | Default |
| --- | --- |
| [[Manage integration styles]] | `true` |

## All pages

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
WHERE file.frontmatter.description
SORT file.frontmatter.title ASC
```
