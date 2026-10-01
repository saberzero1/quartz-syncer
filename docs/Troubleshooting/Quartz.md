---
title: Quartz
description: Troubleshooting issues related to Quartz.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-06-08T15:23:03Z+0200
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

Yes, on desktop, with a [[Local Quartz repo path|local Quartz checkout]] and a Quartz v5 repository:

- **From the UI**: the [[Guides/Quartz Hub#Config tab|Quartz Hub's **Config** tab]] edits page title, title suffix, base URL, locale, SPA mode and popovers. The **Layout** and **Templates** tabs handle layout and starter templates.
- **From the CLI**: [[Guides/CLI#quartz-syncerquartz-config|`quartz-syncer:quartz-config`]] reads and writes any supported config key.
- **Plugin management**: the [[Guides/Quartz Hub#Plugins tab|Hub's **Plugins** tab]], or [[Guides/CLI#quartz-syncerplugin|`quartz-syncer:plugin`]].

> [!NOTE] Not in the Quartz settings tab
>
> Quartz Syncer's own **Quartz** settings screen does *not* edit your site config. It only configures how the plugin talks to the repository — [[Content folder]], [[Local Quartz repo path]] and [[Enable system commands]]. Site configuration lives in the Hub.

> [!WARNING] Requires Quartz v5
>
> Config, plugin, layout, template and upgrade management are refused on a Quartz v4 repository: *"Quartz v4 detected. Publishing notes and media is supported; Quartz site management (config, plugins, upgrades) requires Quartz v5."* Publishing to v4 still works — see [[Setup Guide#Quartz v4 and v5]].

## Quartz plugins fail to build on a fresh clone

On a brand-new clone, `npx quartz plugin install` may report a handful of plugins failing to build. This happens because `quartz.lock.json` pins each plugin to a specific commit, and those older commits may have been authored against earlier versions of `@quartz-community/types` / `@quartz-community/utils` whose built output is no longer available.

Fix it by refreshing all plugins to their latest versions:

```bash
npx quartz plugin install --latest
```

This rewrites `quartz.lock.json` with the newest commits and rebuilds every plugin from scratch. Subsequent `npx quartz plugin install` calls will restore cleanly from the refreshed lockfile.

> [!TIP] Most community plugins now ship pre-built
> Most community plugins now include a pre-built `dist/` directory, skipping the build step entirely. This issue mainly applies to plugins in development or older plugins that haven't adopted pre-built distribution.

## Plugin install hangs or fails on low-end hardware or CI

By default, `npx quartz plugin install` clones and builds plugins in parallel across all CPU cores. On memory-constrained environments (CI runners, low-end laptops, Raspberry Pi, small VPS instances) this can exhaust RAM or cause the process to hang.

Lower the parallelism with the `--concurrency` / `-c` flag:

```bash
# Install one plugin at a time (safest, slowest)
npx quartz plugin install --latest -c 1

# Two at a time — usually works on 4 GB machines
npx quartz plugin install --latest --concurrency 2
```

The same flag works for `plugin add`:

```bash
npx quartz plugin add github:quartz-community/some-plugin -c 1
```

## Upgrade fails with "Cannot auto-upgrade: you have modified framework files"

This means you've changed files that are part of the Quartz framework itself (e.g., `package.json`, files in `quartz/components/`, `quartz/plugins/`). Quartz Syncer cannot safely merge upstream changes into these files because your modifications would be overwritten.

**What to do:**

1. The error message lists exactly which files were modified. Review the list to confirm they are intentional changes.
2. Run `npx quartz upgrade` in your Quartz repository to resolve the conflicts manually using git's standard merge tools.

**What are "framework files"?**

Quartz Syncer distinguishes between files you are expected to customize and files that belong to the Quartz framework:

| Your files (preserved during upgrade) | Framework files (updated from upstream) |
|---|---|
| `quartz.config.yaml` | `package.json` |
| `quartz.lock.json` | `tsconfig.json` |
| `quartz.ts` | `quartz/components/` |
| `quartz/styles/custom.scss` | `quartz/plugins/` |
| `quartz/styles/syncer/` | `quartz/cli/` |
| `quartz/static/` (icon, OG image) | `quartz/styles/` (except `custom.scss` and `syncer/`) |
| `content/` | `quartz/processors/` |
| `.github/` | Everything else in `quartz/` |

If you need to modify framework files for your setup, use `npx quartz upgrade` instead of the in-app upgrade to handle merge conflicts manually.

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
