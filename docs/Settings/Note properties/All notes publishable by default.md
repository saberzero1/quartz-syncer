---
title: All notes publishable by default
description: Treat every note in the vault as publishable, instead of only notes with the publish key set to true.
created: 2025-06-29T17:23:42Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/frontmatter]
aliases: [Settings/Note properties/Include all notes by default]
default_value: "false"
---

By default, a note only appears in the [[Usage Guide#The Publication Center|Publication Center]] if it carries the [[Publish key|publish property]] set to `true`. Enabling this setting makes every note in scope publishable instead.

> [!WARNING] This overrides the publish key
>
> When enabled, [[Publish key]] is hidden and ignored — a note's publish property no longer decides anything. Setting `publish: false` on a note does **not** exclude it.

## Behaviour

- **Disabled (default)**: only notes with the configured publish property set to `true` are publishable.
- **Enabled**: every note within the configured [[Vault root folder|vault root folder]] is publishable.

Either way, "publishable" means *visible in the Publication Center and selectable*. It does not mean published — you still choose what to publish, unless you have turned on [[Auto-publish interval|auto-publish]].

## Scoping without the publish key

With this enabled, the only thing limiting what Quartz Syncer sees is [[Vault root folder]]. If your vault mixes public and private notes, that single folder boundary becomes the entire safeguard.

> [!IMPORTANT] Combine with care
>
> Enabling this **and** a non-zero [[Auto-publish interval|auto-publish interval]] means every note under your vault root folder is published automatically. In a mixed vault, confirm your [[Vault root folder]] is correct before doing that.

For a mixed vault, the safer combination is to leave this setting off and mark notes explicitly, or to set a dedicated [[Vault root folder|vault root folder]] containing only publishable content.
