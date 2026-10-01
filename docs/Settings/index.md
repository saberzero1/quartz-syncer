---
title: Settings
description: Overview of all settings.
created: 2025-05-07T22:37:11Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings]
---

Quartz Syncer's settings live in Obsidian under `Settings` > `Community plugins` > `Quartz Syncer`. The first screen you land on is the **Overview**; every other group is a sub-page.

## Settings

```dataview
TABLE WITHOUT ID link(file.link, file.frontmatter.title) AS Category, file.frontmatter.description AS Description
WHERE startswith(file.folder, this.file.folder)
WHERE file != this.file
WHERE file.name = "index"
SORT file.frontmatter.title ASC
```

## Setting groups

The settings are grouped in this order:

| Group | Contains | Availability |
| --- | --- | --- |
| [[Settings/Overview/index\|Overview]] | Plugin version, [[Publish to\|publish destination]], and a readiness status or setup prompt | All platforms |
| [[Settings/Git/index\|Git]] | Remote URL, branch, provider, authentication, CORS proxy, vault root folder | All platforms |
| [[Settings/Quartz/index\|Quartz]] | Detected Quartz version, content folder, local repo path, system commands | Desktop only |
| [[Settings/Note properties/index\|Frontmatter]] | Publish key, timestamp keys, frontmatter format, permalinks | All platforms |
| [[Settings/Integrations/index\|Integration]] | Core and community plugin integrations, integration styles | All platforms |
| [[Settings/Performance/index\|Performance]] | Caching, publishing behaviour, background sync, auto-publish | All platforms |
| [[Settings/UI/index\|UI]] | Diff viewer, Publication Center | All platforms |

> [!NOTE] The Quartz group is desktop only
>
> The **Quartz** group manages a local Quartz checkout, which requires running system commands. It is not registered on mobile. See [[Guides/Quartz Hub|the Quartz Hub guide]] for what it unlocks.

## Commands

Quartz Syncer registers the following commands in the command palette:

| Command | Effect | Availability |
| --- | --- | --- |
| `Quartz Syncer: Open Publication Center` | Opens the [[Usage Guide#The Publication Center\|Publication Center]] to review and publish changes. | All platforms |
| `Quartz Syncer: Setup wizard` | Launches the guided GitHub [[Setup Guide#Quick setup with the onboarding wizard\|onboarding wizard]]. | Desktop only |
| `Quartz Syncer: Open Quartz Hub` | Opens the [[Guides/Quartz Hub\|Quartz Hub]] for local repository management. | Desktop only |
| `Quartz Syncer: Manual setup` | Opens the manual Git setup dialog. | All platforms |
| `Quartz Syncer: Show publish status` | Reports the current publish status as a notice. | All platforms |

> [!TIP] Marking notes is not a command
>
> Quartz Syncer does not register a command for toggling the publish property. Add it through Obsidian's own properties editor, through a community plugin, or from the terminal with [[Guides/CLI#quartz-syncermark|the `mark` CLI command]].

## Ribbon icon

Quartz Syncer adds a leaf icon to the ribbon labelled `Quartz Syncer Publication Center`. It opens the Publication Center, exactly like the command does.

On desktop the ribbon is the vertical bar on the left of the window. On mobile, open the sidebar (the three horizontal lines, bottom right) and pick `Quartz Syncer Publication Center`.

## Status bar

Quartz Syncer adds a status bar item that reports what the plugin is doing. It has four states:

| State | Tooltip | Meaning |
| --- | --- | --- |
| Ready | `Quartz Syncer: ready` | All publishable notes are compiled and cached. The Publication Center opens instantly. |
| Compiling | `Quartz Syncer: compiling N files` | Background compilation is working through N queued notes. |
| Error | The error message | The last operation failed. |
| Not configured | `Quartz Syncer: not configured` | No publish destination resolves yet. See [[Publish to]]. |

Once the plugin is ready and a publish status has been computed, the tooltip is replaced by a summary of that status.
