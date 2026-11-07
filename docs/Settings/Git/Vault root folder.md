---
title: Vault root folder
description: Folder in vault to use for Quartz notes.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
aliases: [Settings/Git/Vault root folder name]
default_value: "`/` (entire vault)"
---

Which folder in your Obsidian vault Quartz Syncer publishes from. The folder itself is not part of the published path — it becomes the root of your site.

Using `/` publishes the entire vault. Set a subfolder (for example `Notes/Quartz`) to publish only part of it. The field offers folder suggestions as you type.

> [!IMPORTANT] This is your scope boundary
>
> Nothing outside this folder is ever considered publishable, which makes it the safeguard for mixed public/private vaults — particularly if you have turned on [[All notes publishable by default]].

Internal links, embeds and query results are rewritten to strip the folder prefix, so links keep working as if the folder were your vault root. See [[Configuring a specific folder for Quartz content]] for the full behaviour and the `index.md` requirement.

> [!NOTE] Applies to both destinations
>
> Unlike the rest of the Git settings, this one applies whichever [[Publish to|destination]] you publish to.

Do not confuse this with [[Content folder]], which is the folder on the *Quartz* side that notes are written into.

