---
title: Quartz Hub
description: Managing your local Quartz repository from within Obsidian.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [guides]
---

The Quartz Hub is a desktop-only modal for managing a local Quartz repository directly from Obsidian. It provides repository status, configuration editing, plugin management, and local preview capabilities.

> [!NOTE] Desktop only
>
> The Quartz Hub requires a local Quartz repository and Node.js v22 or later. It is only available on desktop.

## Opening the Quartz Hub

There are three ways to open the Quartz Hub:

1. From the command palette: `Quartz Syncer: Open Quartz Hub`
2. From Quartz Syncer settings: click the **Open Quartz Hub** button
3. From the CLI: `obsidian quartz-syncer:repo action=info`

## Overview tab

The Overview tab shows the current status of your local Quartz repository:

- **Repository path**: the local path to your Quartz repository
- **Quartz version**: the installed Quartz version
- **Node.js**: detected Node.js version and path
- **Serve state**: whether the local preview server is running

Action buttons:

| Action | Description |
|---|---|
| **Preview** | Start the Quartz dev server for local preview |
| **Build** | Run `npx quartz build` to build the site |
| **Update** | Pull upstream Quartz changes |
| **Install deps** | Run `npm install` to install/update dependencies |
| **Plugins** | Switch to the Plugins tab |
| **Open folder** | Open the repository folder in your file manager |

## Setup tab

The Setup tab helps you connect a local Quartz repository:

- **Link existing repository**: enter the path to an existing local Quartz repository. The path is validated to ensure it contains a valid Quartz installation.
- **Clone from remote**: provide a remote URL to clone a new Quartz repository locally. This runs `git clone` followed by `npm install`.

## Plugins tab

Manage Quartz v5 community plugins:

- View installed plugins with their status (enabled/disabled)
- Add new plugins from the community registry
- Remove installed plugins
- Check for and apply plugin updates

## Config tab

Edit Quartz site configuration (`quartz.config.yaml`) directly:

- Page title, base URL, locale
- Theme settings (typography, colors, font origin)
- SPA mode, popovers, CDN caching
- Ignore patterns

Changes are written directly to `quartz.config.yaml` in your local repository.

## Related

- [[Guides/CLI|CLI guide]] — the `repo`, `plugin`, and `quartz-config` CLI commands provide equivalent functionality from the terminal.
- [[Setup Guide]] — initial repository setup instructions.
