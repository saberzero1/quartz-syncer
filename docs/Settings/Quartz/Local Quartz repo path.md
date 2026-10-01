---
title: Local Quartz repo path
description: Path to a Quartz checkout on this machine, used for local publishing and all Quartz site management.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/quartz]
default_value: '`""`'
---

The absolute path to a Quartz repository checked out on this machine.

> [!NOTE] Desktop only
>
> This setting lives on the desktop-only **Quartz** settings page. Mobile has no local checkout and no way to run Quartz commands.

## What this path is used for

The path does two unrelated jobs, and it is worth keeping them apart:

1. **Quartz site management** — builds, local preview, plugin management, config editing, layout, templates and upgrades. This is the [[Guides/Quartz Hub|Quartz Hub]], and it reads this path **regardless** of your [[Publish to]] setting.
2. **Local publishing** — only when [[Publish to]] is set to **Local folder**. Compiled notes and media are then written directly into this checkout's [[Content folder|content folder]].

Because of job 1, you never need to clear this path to change where publishing goes. Set [[Publish to]] instead.

## Setting it

You can fill this in three ways:

- Type or paste the path into this setting directly.
- Use the [[Guides/Quartz Hub#Setup tab|Quartz Hub's Setup tab]] to link an existing checkout or clone a fresh one. The Hub validates the path before saving it.
- From the terminal: `obsidian quartz-syncer:repo action=set-local path=/path/to/quartz`.

`~` is expanded, so `~/code/quartz` works.

## Validation

Quartz Syncer checks the path and warns you on the [[Settings/Overview/index|Overview]] when something is wrong:

| Problem | Warning |
| --- | --- |
| The path does not exist | *The local Quartz repo path does not exist, so publishing will fail.* |
| The path is a file, not a folder | *The local Quartz repo path is not a directory, so publishing will fail.* |
| No Quartz config found in the folder | *No Quartz config was found at the local repo path, so publishing may go to the wrong folder.* |

A folder counts as a Quartz checkout if it contains any of `quartz.config.ts`, `quartz.config.js`, `quartz.config.mjs`, `quartz.config.json`, `quartz.config.yaml` or `quartz.config.yml`.

To check a path without saving it: `obsidian quartz-syncer:repo action=verify path=/path/to/quartz`.

## Related

- [[Publish to]] — selects whether publishing writes here or to the remote.
- [[Enable system commands]] — must be on for any Quartz management to run against this path.
- [[Guides/Quartz Hub|Quartz Hub]] — the UI built on top of this path.
