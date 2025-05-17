---
title: Settings
description: Overview of all settings.
created: 2025-05-07T22:37:11Z+0200
date: 2025-05-17T11:58:03Z+0200
publish: true
---

## Settings

```dataview
TABLE WITHOUT ID link(file.link, file.frontmatter.title) AS Category, file.frontmatter.description AS Description
WHERE startswith(file.folder, this.file.folder)
WHERE file != this.file
WHERE file.name = "index"
SORT file.frontmatter.title ASC
```

## Commands

| Command | Effect |
| --- | --- |
| `Quartz Syncer: Open publication center` | Opens the modal to manage the Quartz content on GitHub. |
| `Quartz Syncer: Add publish flag` | Adds the configured publish flag to the frontmatter and sets it to `true`. |
| `Quartz Syncer: Remove publish flag` | Adds the configured publish flag to the frontmatter and sets it to `false`. |
| `Quartz Syncer: Toggle publication status` | Adds the configured publish flag to the frontmatter and toggles it between `true` and `false`. |

## GitHub (check connection)

- Username
- Repository name
- Authentication token
- Content folder name (with checkbox 'default', which locks to `content` if set.)

## Obsidian

- Quartz root folder (checkbox. For setting a subfolder in the vault as the Quartz root)
 	- If true, show folder selector
 	- (check) does subfolder have `index.md` file?
- Enable dataview
 	- (check) installed?
 	- (check) dataviewjs enabled?
- Enable Excalidraw
 	- (check) export both light/dark enabled?

## Quartz (check quartz.config.ts exists)

### General

- Manage Quartz settings using Quartz Syncer (checkbox, disabled by default(?))
 	- If true, show below site configuration settings.
- Manage Quartz Themes using Quartz Syncer (checkbox, disabled by default(?))
 	- If true, show below quartz themes settings.

### Site Configuration

- Site URL
 	- (check) is URL changed from default (not quartz.jzha0.xyz)
 	- Option to use custom domain (if true, allow to set domain, else use \<username\>.github.io/\<repository\>.)
- Site title
 	- (check) is title not Quartz V4 (warning only)
- Option/button to match setting with Obsidian setting.
 	- (check) match link resolution Quartz == link resolution Obsidian?
- Dropdown to set display metadata date (created/updated/published/none)
- Modes (both/light-only/dark-only)
 	- Option or controlled by selected Quartz Theme

### Quartz Themes

- (check) configured correctly (themes import rule)
 	- Add button to set if not
- Update button if outdated(?)
- Select theme (checkbox to use Obsidian theme if true, set specific theme if false. default true)
 	- (display support level? full/partial/unsupported)
 	- (warning if light-only or dark-only)
