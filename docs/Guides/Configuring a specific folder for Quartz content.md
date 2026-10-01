---
title: Configuring a specific folder for Quartz content
description: Guide on how to configure a specific folder in your vault for Quartz instead of your entire vault.
created: 2025-05-16T11:22:39Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

> [!IMPORTANT] Mixed content vaults
>
> By default, Quartz Syncer assumes your entire vault is used for Quartz content. You can change this behaviour by configuring a specific vault folder using the [[Vault root folder]] setting.

## Configuring a specific vault folder

Open Quartz Syncer settings (`Settings > Community plugins > Quartz Syncer`), go to the **Git** screen and find the [[Vault root folder]] setting. Start typing the folder name in the search box — it matches any folder in your Obsidian vault.

To use your entire vault, set the folder to `/` or leave the search box empty. This is the default behaviour.

### Setting effects

> [!HINT] Don't forget to add an `index.md` to your configured vault folder
>
> This `index.md` note will serve as your Quartz website landing page.

When a folder other than the vault root (`/`) is configured, the following changes are made when compiling notes for Quartz:

- All internal links are rewritten to remove the path to the folder.
- If [[Settings/Integrations/Dataview|Dataview integration]] is enabled, all Dataview query results are rewritten to remove the path to the folder.
- All internal embeds links are rewritten to remove the path to the folder.

The final result that is deployed to your Quartz content folder is as if your configured folder is the root of your website.

### It also limits what is publishable

Nothing outside the configured folder is ever a publish candidate, whichever [[Publish to|destination]] you publish to. That makes this setting the scope boundary for a mixed public/private vault — especially if you have turned on [[All notes publishable by default]], where it becomes the only thing separating the two.

## Two different folders

It is easy to confuse the two folder settings. They sit on opposite sides of the sync:

| Setting | Side | Meaning |
| --- | --- | --- |
| [[Vault root folder]] | Obsidian | Which part of your vault is published, and what gets stripped from paths |
| [[Content folder]] | Quartz | Which folder in the Quartz repository notes are written into. Usually `content`. |

A note at `Notes/Quartz/posts/hello.md`, with vault root folder `Notes/Quartz` and content folder `content`, is published to `content/posts/hello.md` and served at `/posts/hello`.
