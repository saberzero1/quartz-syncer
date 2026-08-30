---
title: Usage Guide
description: Details on using Quartz Syncer.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [guides]
---

> [!WARNING] One-way sync only
>
> Quartz Syncer applies changes to your notes when they are pushed to your Quartz repository, like parsing [[Settings/Integrations/Dataview|Dataview]] queries and filtering [[Settings/Note properties/index|note properties]] to ensure your notes are fully Quartz-compatible. This means the notes in your Quartz repository should be considered a one-way sync (Obsidian to Quartz.)
>
> For syncing notes between devices, consider using [Obsidian Sync](https://obsidian.md/sync) or one of the many [community plugins](https://obsidian.md/plugins?search=sync).

## What's new in v2

Quartz Syncer v2 is a ground-up rewrite focused on performance and reliability. Key changes:

- **Background compilation**: notes are compiled in the background as you edit. Opening the Publication Center is near-instant.
- **Status bar**: shows real-time plugin state — "ready", "N compiling", or error status.
- **Onboarding wizard**: first-time GitHub users can create a Quartz repository and configure everything directly from Obsidian (desktop only).
- **Quartz Hub**: manage your local Quartz repository, preview your site, and manage plugins from within Obsidian (desktop only). See [[Guides/Quartz Hub|Quartz Hub guide]].
- **Auto-publish**: automatically publish pending changes on a configurable timer (desktop only). See [[Settings/Performance/Auto-publish interval|auto-publish settings]].
- **Diff viewer**: preview exact changes before publishing with split or unified view.
- **22 CLI commands**: expanded from 12 to 22 commands for comprehensive automation. See the [[Guides/CLI|CLI guide]].
- **Encrypted tokens**: access tokens are encrypted via `electron.safeStorage` on desktop.

For the full list of changes, see the [[Changelog#Version 2.0.0|changelog]].

## Opening the publication center

There are two ways to open the publication center:

1. From the command palette: `Quartz Syncer: Open publication center`.
2. Clicking the leaf icon in the ribbon.
	1. (On desktop): By default, in the vertical bar on the left side of your screen.
	2. (On mobile): By default, press the hamburger button on the bottom right (three horizontal lines) and press `Quartz Syncer publication center`.

## Marking files as publishable

By default, Quartz Syncer will not show any notes when you open the publication center. In order to flag a note as visible to Quartz Syncer, you will need to add a [property](https://help.obsidian.md/properties) to the notes you want to publish.

> [!TIP] The `publish` property
>
> By default, a checkbox property `publish` has to be added to notes to make them visible to Quartz Syncer. This property [[Publish key|can be configured in the plugin settings]]. The checkbox has to be checked/property set to true to show up in Quartz Syncer.

> [!TIP] Adding the `publish` property
>
> There are several ways to add the `publish` property to your notes:
> 1. Using the Quartz Syncer command `Quartz Syncer: add publication flag`
> 2. Using a community plugin to automatically add the configured flag
> 3. Manually, via the `+ Add property` button

## Publishing notes to Quartz

Open the publication center (see above for instructions). Your eligible notes will be under one of the following headings:

- **Unpublished notes**: notes that are in your Obsidian vault, but not in your Quartz repository. Any notes checked here will be published to Quartz.
- **Changed notes**: notes that are in your Obsidian vault and in your Quartz repository, but they don't match. This is usually because the note has been changed in your vault. Any notes checked here will be updated in Quartz.
	- Click on a file to open the diff viewer and see exactly what changes will be made.
	- The diff viewer supports two modes: **Split view** (side-by-side comparison) and **Unified view** (interleaved changes). Toggle between them using the buttons at the top of the viewer.
	- Configure the default view style in **Settings > UI > Diff view style**.
- **Published notes (select to unpublished)**: notes that are in your in your Quartz repository. Any notes checked here will be unpublished and removed from your Quartz repository. Notes deleted from your vault need to be unpublished here to remove them from Quartz.
- **Deleted notes**: notes that were published but have been deleted from your vault. Check these to remove them from your Quartz repository.
- **Unchanged notes**: a list of all unchanged notes that are currently published in your Quartz repository. It includes only unchanged notes that are also in your vault.

After you are satisfied with your selection, click the big button on the bottom left that says `PUBLISH SELECTED CHANGES` and watch the magic happen.

## CLI

Quartz Syncer also supports the [Obsidian CLI](https://obsidian.md/cli) (v1.13+) for automating publishing from the terminal. See the [[Guides/CLI|CLI guide]] for the full command reference and example workflows.

> [!INFO] Why does Quartz Syncer sometimes make two commits?
>
>To prevent any potential inconsistencies with git, Quartz Syncer sometimes makes two commits in a row: the first commit adds and/or updates any notes selected. The second commit removes any notes selected for unpublishing.
>
>If you're unsure if your notes have been correctly published, you can check by opening the publication center again after Quartz Syncer finished publishing. The new state of your notes should be reflected in the publication center.
