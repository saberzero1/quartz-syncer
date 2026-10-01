---
title: Remote URL
description: The full URL of your Git repository.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
default_value: '`""`'
---

The full HTTPS URL of your Quartz repository.

Example: `https://github.com/username/quartz.git`

> [!IMPORTANT] HTTPS only
>
> Quartz Syncer speaks Git over HTTPS. SSH URLs (`git@github.com:user/repo.git`) are not supported, because there is no SSH agent available inside Obsidian.

Setting this is what makes the **Remote repository** destination available. Until it is set, selecting it under [[Publish to]] leaves publishing blocked with *"Publish target is the remote, but no git remote URL is set."*

Changing it changes which tree your publish status is compared against, so the status is recomputed. See [[Publish to#Publish status is per destination]].
