---
title: Quartz Hub
description: Managing your local Quartz repository from within Obsidian.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

The Quartz Hub is a desktop-only modal for managing a local Quartz repository from inside Obsidian — status, builds, local preview, plugins, site configuration, layout and templates.

> [!NOTE] Desktop only
>
> The Hub runs the Quartz CLI against a checkout on disk. It needs:
>
> - A desktop Obsidian install. On mobile the command is not registered.
> - A [[Local Quartz repo path|local Quartz repo path]].
> - [[Enable system commands]] turned on.
> - Node.js 22 or later on your system path, which is what Quartz v5's own CLI requires. An older Node is reported as unavailable rather than failing later inside a build.

> [!TIP] The Hub is independent of your publish destination
>
> The Hub always uses [[Local Quartz repo path]], regardless of whether [[Publish to]] is set to **Remote repository** or **Local folder**. You can publish to a remote and still manage a local checkout here.

## Opening the Quartz Hub

1. From the command palette: `Quartz Syncer: Open Quartz Hub`.
2. From Quartz Syncer settings: the **Open Quartz Hub** button on the desktop-only **Quartz** screen.
3. From the [[Settings/Overview/index|Overview]] screen, when it offers **Link a local Quartz repo**.

## Tabs

The Hub has six tabs:

| Tab | Purpose | Requires Quartz v5 |
| --- | --- | --- |
| [[#Overview tab\|Overview]] | Status and actions | No |
| [[#Plugins tab\|Plugins]] | Install, enable, disable and remove Quartz plugins | Yes |
| [[#Config tab\|Config]] | Edit `quartz.config.yaml` | Yes |
| [[#Layout tab\|Layout]] | Inspect and reorder layout plugin placement | Yes |
| [[#Templates tab\|Templates]] | Apply a Quartz starter template | Yes |
| [[#Setup tab\|Setup]] | Link or clone a local repository | No |

On a Quartz v4 repository the four v5-only tabs report that site management requires v5. Publishing to that repository still works — see [[Setup Guide#Quartz v4 and v5]].

## Overview tab

### Status

| Row | Shows |
| --- | --- |
| **Repository** | The local path, and whether it validates as a Quartz checkout |
| **Quartz version** | The detected config format (`v5 (YAML)`, `v5 (JSON)`, `v4`) and the installed Quartz package version |
| **Binaries** | Which of `node`, `npm`, `npx` and `git` were found |
| **Preview server** | Whether the local preview server is running, and on which port |

### Actions

| Action | Effect |
| --- | --- |
| **Preview** | Starts the Quartz dev server. Takes 15–20 seconds to come up. A **Stop** button appears while it runs. |
| **Build** | Runs `npx quartz build`. Typically 5–15 seconds. |
| **Update** | Pulls upstream Quartz changes. Quartz v5 only, and requires `git` on your system path. |
| **Install deps** | Runs `npm install`. Expect 30 seconds or more. |
| **Plugins** | Switches to the Plugins tab. |
| **Open folder** | Opens the repository in your system file manager. |

Each long-running action opens a terminal output modal streaming the command's output, with buttons to cancel, copy or close.

### When actions are unavailable

- **[[Enable system commands]] is off** → *"Enable system commands in settings to run local Quartz actions."* No action buttons are shown at all.
- **Repeated command failures** → *"System commands are temporarily disabled after repeated errors."* A circuit breaker has tripped; the buttons stay disabled until it resets.
- **No valid repository** → actions report that a local Quartz repo path must be set first. Use the [[#Setup tab|Setup tab]].

> [!NOTE] Upgrade conflicts
>
> **Update** preserves your own files and accepts upstream changes for framework files. If you have modified framework files it fails and lists them rather than overwriting your work. See [[Troubleshooting/Quartz]].

## Setup tab

Two ways to get a local repository.

### Link existing repository

Enter the path to a Quartz checkout you already have. The path is validated — it must exist, be a directory, and contain a `quartz.config.*` file — and the result is shown before you save.

### Clone from remote

Give a Git URL and a destination folder. Quartz Syncer runs `git clone`, then `npm install`, then saves the resulting path. Both steps take 30 seconds or more; progress streams into a terminal modal.

Either way, the saved path becomes [[Local Quartz repo path]].

## Plugins tab

Manage Quartz v5 community plugins:

- List installed plugins with their enabled/disabled status.
- Enable or disable a plugin.
- Remove a plugin.
- Browse the community registry and install from it. The browser supports search, category, source, sort and view controls.

Plugin changes are written to `quartz.config.yaml` and `quartz.lock.json`. Run **Install deps**, or `npx quartz plugin install`, afterwards so newly referenced plugins are actually downloaded into `.quartz/plugins/`.

The equivalent CLI command is [[Guides/CLI#quartz-syncerplugin|`quartz-syncer:plugin`]].

## Config tab

Edit the site-wide options in `quartz.config.yaml`:

| Field | Config key |
| --- | --- |
| Page title | `pageTitle` |
| Page title suffix | `pageTitleSuffix` |
| Base URL | `baseUrl` |
| Locale | `locale` |
| Enable SPA | `enableSPA` |
| Enable popovers | `enablePopovers` |

**Save** writes the changes to your local checkout.

For keys not exposed here — themes, analytics, ignore patterns — use [[Guides/CLI#quartz-syncerquartz-config|`quartz-syncer:quartz-config`]] or edit `quartz.config.yaml` directly.

> [!NOTE] Config editing is not in plugin settings
>
> Quartz site configuration lives here, in the Hub. Quartz Syncer's own **Quartz** settings screen only configures how the plugin talks to the repository — [[Content folder]], [[Local Quartz repo path]] and [[Enable system commands]].

## Layout tab

Inspect how your Quartz plugins are laid out, and adjust their ordering:

- **Positions** — which plugins occupy each layout position, with their display mode and group.
- **Groups** — each group's priority, direction, gap and wrap.
- **Page type overrides** — per-page-type template and position overrides.

Plugin **priority** values are editable; everything else is read-only. Edit `quartz.config.yaml` for structural changes.

## Templates tab

Lists the Quartz starter templates available to your installation, with an **Apply** button for each.

> [!WARNING] Applying a template replaces configuration
>
> A template overwrites your current configuration, plugin list and layout. The Hub asks for confirmation first. If you have hand-tuned any of those, back up `quartz.config.yaml` and `quartz.lock.json` before applying one.

## Related

- [[Guides/CLI|CLI guide]] — `repo`, `plugin`, `quartz-config`, `quartz-build`, `quartz-serve`, `quartz-sync` and `upgrade` provide the same functionality from the terminal.
- [[Local Quartz repo path]] — the setting everything here depends on.
- [[Enable system commands]] — the switch that enables it all.
- [[Setup Guide]] — initial repository setup.
