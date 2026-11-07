---
title: Authentication type
description: How to authenticate with the Git server.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
default_value: '`"basic"`'
---

How Quartz Syncer authenticates with your Git server.

| Option | Internal value | What it sends | Use when |
| --- | --- | --- | --- |
| **Username & token/password** (default) | `basic` | HTTP basic auth using [[Username]] and [[Access token]] | Almost always. This is what GitHub, GitLab, Bitbucket and Codeberg expect. |
| **Bearer token** | `bearer` | An `Authorization: Bearer` header carrying [[Access token]] | Your server documents bearer-token authentication specifically |
| **None (public repos)** | `none` | Nothing | Reading a public repository without publishing to it |

## Effect on other settings

- **Username & token/password** shows both [[Username]] and [[Access token]].
- **Bearer token** hides [[Username]] and keeps [[Access token]].
- **None** hides both.

With **None** selected, Quartz Syncer stops warning about a missing token — but pushing to the remote will still fail, because no provider allows anonymous writes.

> [!NOTE] Not relevant to local publishing
>
> This setting only affects the remote destination. When [[Publish to]] is set to **Local folder**, nothing authenticates.
