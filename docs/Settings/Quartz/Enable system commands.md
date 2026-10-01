---
title: Enable system commands
description: Allow Quartz Syncer to run local git, npm, npx and node commands.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/quartz]
default_value: "true"
---

Controls whether Quartz Syncer is allowed to execute system binaries — `git`, `npm`, `npx` and `node` — on your machine.

> [!NOTE] Desktop only
>
> This setting lives on the desktop-only **Quartz** settings page. Mobile cannot run system commands at all.

## What needs it

Everything that drives the Quartz CLI against your [[Local Quartz repo path|local checkout]]:

- Quartz builds and local preview
- Quartz plugin management and the plugin browser
- Quartz upgrades
- Template application
- `npm install` and `git clone` from the [[Guides/Quartz Hub#Setup tab|Hub's Setup tab]]
- The `quartz-build`, `quartz-serve`, `quartz-sync`, `quartz-restore`, `plugin` and `upgrade` [[Guides/CLI|CLI commands]]

## What does not need it

**Publishing does not need it.** Both remote and local publishing are implemented without shelling out — Git transport runs through a bundled JavaScript Git implementation, and local publishing writes files directly. Turning this off does not stop you publishing.

Likewise, the Publication Center, diff viewer, status, caching and all compilation are unaffected.

## When it is off

If a local repo path is configured and this setting is off, the [[Settings/Overview/index|Overview]] shows:

> Desktop commands are off, so Quartz builds, preview and plugin management are unavailable. Publishing is unaffected.

The [[Guides/Quartz Hub|Quartz Hub]] still opens, but shows a warning and disables its local action buttons.

## Why you might turn it off

Leave it on unless you have a reason not to. Reasons to turn it off:

- You publish to a remote and let CI build the site, so you have no local checkout to manage.
- Your environment restricts subprocess execution.
- You want to be certain the plugin never invokes a shell binary.
