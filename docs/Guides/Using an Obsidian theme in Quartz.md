---
title: Using an Obsidian theme in Quartz
description: Guide on how to use Quartz Themes to use an Obsidian theme in Quartz.
created: 2025-05-16T11:05:44Z+0200
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

> [!IMPORTANT] Quartz Themes
> [Quartz Themes](https://github.com/saberzero1/quartz-themes) is a separate project from the author of Quartz Syncer. It aims to regularly port the current set of available Obsidian Community Themes to a Quartz-compatible format.

## Overview

Starting with Quartz v5, `quartz-themes` is installed as a **standard Quartz community plugin** — there is no dedicated "Themes" tab in Quartz Syncer anymore. You configure themes directly in your `quartz.config.yaml`, either by editing the file or by using the **Quartz** tab in Quartz Syncer's settings (which reads and writes `quartz.config.yaml` for you).

## Install the plugin

Add `quartz-themes` to the `plugins` section of `quartz.config.yaml`:

```yaml title="quartz.config.yaml"
plugins:
  - source:
      name: quartz-themes
      repo: "https://github.com/saberzero1/quartz-themes.git"
      subdir: plugin
    enabled: true
    options:
      theme: tokyo-night
      mode: both
```

> [!NOTE] Why the object form?
> `quartz-themes` lives in the `plugin/` subdirectory of its repository, so it requires the object form of `source` (with `repo` and `subdir`) rather than the shorter `github:org/repo` string form.

Then run plugin installation:

```bash
npx quartz plugin install
```

Or let your CI pipeline handle it — every modern Quartz v5 build should run `npx quartz plugin install && npx quartz build` (see the [[Setup Guide]]).

## Options

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `theme` | string | yes | `tokyo-night` | Theme identifier from the Quartz Themes registry. |
| `mode` | `dark` \| `light` \| `both` | yes | `both` | Which color mode(s) to include. |
| `variation` | string | no | — | Sub-variation for themes that ship multiple palettes (e.g. `frappe` for `catppuccin`). |
| `calloutStyle` | string | no | — | Callout style variant (e.g. `glass`, `glow`). |
| `fonts` | object | no | — | Override `header`, `body`, and `code` fonts. |
| `aspects` | object | no | — | Mix-and-match specific aspects from different themes. |
| `include` | array | no | all | Explicit list of aspects to apply (e.g. `[typography, callouts]`). |

**Available aspects** (for `aspects` and `include`): `base`, `typography`, `callouts`, `tables`, `code`, `links`, `blockquotes`, `checkboxes`, `images`, `embeds`, `cards`, `search`, `scrollbars`, `explorer`, `toc`, `graph`, `popover`, `footer`, `recentNotes`, `listPage`, `darkmode`, `breadcrumbs`, `lists`, `misc`.

## Available themes

The canonical list of theme identifiers lives in [`themes.json`](https://github.com/saberzero1/quartz-themes/blob/main/themes.json) in the Quartz Themes repository. Popular choices include:

- `catppuccin` (with `variation: frappe`, `macchiato`, `latte`, `mocha`)
- `dracula-official`
- `nord`
- `rose-pine`
- `tokyo-night`
- `aura`

Each entry in `themes.json` also records which modes (`dark`, `light`, `both`) the theme supports.

## Example: Tokyo Night with a custom callout style

```yaml title="quartz.config.yaml"
plugins:
  - source:
      name: quartz-themes
      repo: "https://github.com/saberzero1/quartz-themes.git"
      subdir: plugin
    enabled: true
    options:
      theme: tokyo-night
      mode: both
      calloutStyle: glass
```

## Example: Catppuccin Frappé, dark mode only

```yaml title="quartz.config.yaml"
plugins:
  - source:
      name: quartz-themes
      repo: "https://github.com/saberzero1/quartz-themes.git"
      subdir: plugin
    enabled: true
    options:
      theme: catppuccin
      variation: frappe
      mode: dark
```

> [!TIP] Dark-only or light-only themes
> When using `mode: dark` or `mode: light`, consider also disabling Quartz's dark-mode toggle plugin so visitors can't switch into a mode the theme doesn't support.

## Updating from Quartz Syncer v4

Earlier versions of Quartz Syncer shipped a dedicated **Themes** settings tab. That tab has been removed because Quartz v5 handles theme management natively through `quartz.config.yaml`. To migrate:

1. Remove any references to the old Themes tab from your settings — the plugin will ignore the obsolete `useThemes` setting automatically.
2. Add the `quartz-themes` plugin entry shown above to your `quartz.config.yaml` (either manually or via the **Quartz** tab in Quartz Syncer settings).
3. Run `npx quartz plugin install` (or commit and let CI handle it).

## Troubleshooting

- **Theme not applying**: make sure `npx quartz plugin install` ran after you edited `quartz.config.yaml`. Quartz v5 downloads community plugins into `.quartz/plugins/` and nothing is applied until they're present on disk.
- **Node version errors**: `quartz-themes` requires Node 22 or later, matching Quartz v5's minimum requirement. The setup guides use Node 24 (the current LTS), but any version from 22 onward will work.
- **Missing variation**: only themes that ship multiple palettes accept `variation`. Check `themes.json` for the theme's declared variations.
