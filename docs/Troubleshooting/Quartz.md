---
title: Quartz
description: Troubleshooting issues related to Quartz.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [quartz]
---

> [!INFO] Quartz usage
> For question regarding Quartz usage, please refer to the [Quartz documentation](https://quartz.jzhao.xyz/).
>
> For support regarding Quartz usage, please connect to us in the [Quartz Community Discord Server](https://discord.gg/cRFFHYye7t).

## Can I use an Obsidian Theme in Quartz?

See [[Using an Obsidian theme in Quartz]].

## What theme is this site using?

[Catppuccin Macchiato](https://github.com/saberzero1/quartz-themes), installed as a Quartz v5 community plugin. See [[Using an Obsidian theme in Quartz]] for setup instructions.

## Can I configure Quartz settings from Obsidian using Quartz Syncer?

Yes. Quartz Syncer can read and update `quartz.config.yaml` directly:

- **From the UI**: Use the **Quartz** tab in Quartz Syncer's settings to edit site-wide options like page title, base URL, theme, and locale.
- **From the CLI**: Use the `quartz-syncer:quartz-config` command to read or update configuration values. See the [[Guides/CLI|CLI guide]] for details.
- **Plugin management**: Use the `quartz-syncer:plugin` command to list, add, remove, and update Quartz v5 plugins. See the [[Guides/CLI|CLI guide]] for details.

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
