---
title: Provider
description: Git provider for optimized authentication hints.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
default_value: '`"github"`'
---

Which Git provider you are publishing to. This only tailors the guidance Quartz Syncer shows you — it does not change how Git requests are made.

| Option | Internal value |
| --- | --- |
| GitHub (default) | `github` |
| GitLab | `gitlab` |
| Bitbucket | `bitbucket` |
| Gitea / Codeberg | `gitea` |
| Custom / self-hosted | `custom` |

## What it changes

Selecting a provider rewrites the help text on two other settings so it matches what that provider actually expects:

- [[Username]] — tells you to use `oauth2` on GitLab, or `x-token-auth` for Bitbucket app passwords.
- [[Access token]] — names the exact scopes or permissions to grant, and relabels the field to **App password** on Bitbucket.

Because it is only guidance, picking the wrong provider cannot break publishing. It just means the hints are for the wrong service.

Pick **Custom / self-hosted** for anything not listed, including self-hosted Gitea, Forgejo, GitLab CE and plain Git over HTTPS.

## Related

Provider-specific walkthroughs: [[GitHub Setup]], [[GitLab Setup]], [[Bitbucket Setup]], [[Codeberg Setup]].

