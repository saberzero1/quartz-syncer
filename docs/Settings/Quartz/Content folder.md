---
title: Content folder
description: Folder in your Quartz repository that notes are published into.
created: 2025-05-16T12:21:25Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/quartz]
default_value: "`content`"
---

The folder inside your Quartz repository that Quartz Syncer publishes notes and media into.

> [!WARNING] Quartz expects `content` by default
>
> Unless you have customised your Quartz repository to read notes from a different folder, keep this setting unchanged.

This is the folder on the **Quartz** side. The folder on the **Obsidian** side is [[Vault root folder]] — see [[Configuring a specific folder for Quartz content]] for how the two interact.

The setting applies to both publish destinations: for a remote it is the path within the repository, and for [[Publish to|local publishing]] it is the subfolder of your [[Local Quartz repo path|local checkout]].

> [!NOTE] Publishing outside this folder
>
> Everything Quartz Syncer publishes normally lands under this folder. Writing elsewhere in the repository requires [[Allow custom file publishing]], and is blocked entirely on Quartz v4 repositories.
