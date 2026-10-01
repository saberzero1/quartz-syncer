---
title: Bases
description: Whether to publish Obsidian Bases (.base) files to Quartz.
created: 2025-06-26T23:34:09Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [integration, settings/integrations]
default_value: "false"
---

When enabled, Quartz Syncer publishes Obsidian [Bases](https://help.obsidian.md/bases) files — `.base` files produced by the Bases core plugin — alongside your notes.

Bases is an Obsidian **core** plugin, so this integration has no community plugin dependency. It is grouped under **Core plugins** in the Integration settings, together with [[Canvas]].

## Behaviour

- **Disabled (default)**: `.base` files are ignored and never appear in the Publication Center.
- **Enabled**: `.base` files become publishable and are published as-is, without transformation.

## Rendering on your site

Quartz Syncer publishes the Base definition; rendering it is Quartz's job. You need Quartz-side support for the format before anything appears on your site — check the [Quartz plugin list](https://quartz.jzhao.xyz/tags/plugin) and install a renderer through the [[Guides/Quartz Hub#Plugins tab|Quartz Hub]] or `npx quartz plugin add <source>`.

Without a renderer, the file is uploaded but visitors see nothing useful.

## Example

![[base.base]]

## Related

- [[Canvas]] — the other core plugin integration.
- [[Settings/Integrations/index|Integration settings overview]].
