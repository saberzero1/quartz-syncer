---
title: Allow large full clones
description: Permit downloading an entire repository when the Git server cannot serve a file list on its own.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: "false"
---

Controls what Quartz Syncer does when your Git server cannot tell it what is in the repository without sending the whole repository.

## Background

To work out your publish status, Quartz Syncer only needs to know which files exist on the remote and what their hashes are — not their contents. It asks the server for exactly that, which keeps the transfer small no matter how large your site is.

Not every Git server supports that kind of request. When one does not, the only way to get the file list is to download the entire repository, including every historical blob. On a large repository — years of history, lots of media — that can exhaust memory and crash Obsidian.

## Behaviour

- **Disabled (default)**: if the server will only serve a full download, Quartz Syncer refuses and reports the problem rather than risking a crash.
- **Enabled**: Quartz Syncer performs the full download anyway.

## When to enable it

Enable it only if both are true:

1. Quartz Syncer has actually told you the remote requires a full download — don't enable it speculatively.
2. Your repository is small enough that downloading all of it is reasonable.

If the repository is large, better options are to use a provider that supports partial reads (GitHub, GitLab, Codeberg and Bitbucket all do), or to switch to [[Publish to|local publishing]] and let your own tooling handle the remote.

> [!TIP] Shallow history helps
>
> Most of the weight in a full download is history, not current content. A repository whose history has been truncated downloads far faster even on servers that cannot serve a file list.
