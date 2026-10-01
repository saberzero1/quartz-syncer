---
title: Enable permalinks
description: Use a note's permalink as its Quartz URL when the note has no explicit permalink property.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/frontmatter]
default_value: "false"
---

When enabled, Quartz Syncer derives a `permalink` property for published notes that do not already declare one, so the note's URL on your site is stable regardless of where the file lives in your vault.

## Behaviour

- **Disabled (default)**: a note's URL is derived from its path inside the [[Content folder|content folder]]. Moving or renaming the note changes its URL.
- **Enabled**: notes without an explicit `permalink` property get one; notes that already declare `permalink` keep it, unchanged.

An explicit `permalink` in your frontmatter always wins, regardless of this setting.

## Why you might want it

URLs derived from file paths are fragile: reorganising your vault silently breaks every inbound link and bookmark to the notes you moved. A permalink pins the URL to the note rather than to its location.

## Caveats

- Quartz v4 and v5 generate URLs differently — v4 preserves the original casing of file and folder names, while v5 lowercases and hyphenates. Enabling permalinks gives you one URL shape that does not depend on which version you are on. See [[Setup Guide#Quartz v4 and v5]].
- Turning this on for an existing site changes the URLs of notes that had no permalink. Existing links to those notes will break unless you add redirects.

> [!TIP] Pin a permalink per note
>
> You do not need this setting to control a single note's URL. Adding `permalink: my-stable-url` to that note's properties works whether or not it is enabled.
