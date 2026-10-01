---
title: Canvas
description: Whether to publish Obsidian Canvas (.canvas) files to Quartz.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [integration, settings/integrations]
default_value: "false"
---

When enabled, Quartz Syncer publishes [JSON Canvas](https://jsoncanvas.org/) files — Obsidian's `.canvas` core plugin format — alongside your notes.

Canvas is an Obsidian **core** plugin, so this integration has no community plugin dependency. It is grouped under **Core plugins** in the Integration settings, together with [[Bases]].

## Behaviour

- **Disabled (default)**: `.canvas` files are ignored. They never appear in the Publication Center, even when marked with the [[Publish key|publish property]].
- **Enabled**: `.canvas` files become publishable and are published as-is, without transformation.

## Rendering on your site

Quartz Syncer publishes the Canvas file; it does not render it. Rendering is Quartz's job, so you need Quartz-side support for the JSON Canvas format for anything to appear.

Check the [Quartz plugin list](https://quartz.jzhao.xyz/tags/plugin) for a canvas renderer, and install it with the [[Guides/Quartz Hub#Plugins tab|Quartz Hub]] or:

```bash
npx quartz plugin add <source>
```

Without a renderer, the `.canvas` file is still uploaded, but visitors see nothing useful.

## Related

- [[Bases]] — the other core plugin integration.
- [[Settings/Integrations/index|Integration settings overview]].
