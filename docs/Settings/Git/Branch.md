---
title: Branch
description: The branch to sync with.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
default_value: '`"v5"`'
---

Which branch to publish to. The default is `v5`, which is the default branch of the Quartz v5 template.

> [!IMPORTANT] Required for both destinations
>
> Publishing refuses to run with no branch set, even when [[Publish to]] is **Local folder**. If you clear it, the [[Settings/Overview/index|Overview]] warns: *"No branch is set, so publishing cannot run."*

If you created your repository from the Quartz template, `v5` is correct. If you imported Quartz into an existing repository, set this to whichever branch your deployment builds from — often `main`.

Changing the branch changes which tree your publish status is compared against, so the status is recomputed when you change it. See [[Publish to#Publish status is per destination]].

