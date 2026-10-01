---
title: Git
description: Quartz Syncer settings related to Git repository configuration.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
---

Where your Quartz repository is, how to reach it, and which part of your vault to publish from.

> [!NOTE] Only needed for remote publishing
>
> These settings describe the **remote** destination. If [[Publish to]] is set to **Local folder**, the only setting here that still applies is [[Vault root folder]] — the rest is unused until you switch back to the remote.
>
> [[Branch]] is the one exception on the remote side: it is required whichever destination you pick, and publishing refuses to run without it.

## Settings

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```

## Connection test

At the bottom of the Git settings page is a **Test connection** button. It tests **the destination publishing actually uses**, not necessarily the remote — so with [[Publish to]] set to **Local folder**, it validates the local checkout instead of making a network request.

| Destination | What is checked |
| --- | --- |
| Remote | That the remote is reachable, that your credentials work, and whether you have write access. Reports the repository name and branch. |
| Local | That the [[Local Quartz repo path\|path]] exists, is a directory, and contains a Quartz installation. Reports the detected Quartz version. |

The same test is available from the terminal:

```bash
obsidian quartz-syncer:test
obsidian quartz-syncer:test verbose
```

See [[Guides/CLI#quartz-syncertest|the CLI guide]].

## Mobile setup

Mobile has no setup wizard. Run `Quartz Syncer: Manual setup` from the command palette to get a single dialog covering remote URL, branch, authentication type, username, token, CORS proxy and content folder, with a connection test and a save button.

The individual pages below document each of those fields.
