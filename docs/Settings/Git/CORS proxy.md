---
title: CORS proxy
description: Optional CORS proxy URL, for Git servers that do not send CORS headers.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
aliases: [CORS Proxy]
default_value: '`""`'
---

An optional proxy that relays Git requests, needed only when your Git server does not send the CORS headers a browser-based Git client requires.

Example: `https://cors.isomorphic-git.org`

## Do you need one?

Usually not. Leave this empty and only fill it in if publishing fails with a CORS or network error that the [[Settings/Git/index#Connection test|connection test]] reproduces.

The major hosted providers — GitHub, GitLab, Bitbucket, Codeberg — do not need a proxy. Self-hosted Gitea, Forgejo and similar installations sometimes do, depending on how they are configured.

Mobile is the most common place to hit this, because mobile Obsidian has fewer ways to relax request restrictions than desktop does.

> [!WARNING] A proxy sees your traffic
>
> Every Git request, including your [[Access token]], passes through whatever proxy you configure. Only use a proxy you control or trust. If you need one permanently, self-host [`cors-proxy`](https://github.com/isomorphic-git/cors-proxy) rather than relying on a public instance.

## Related

- [[Troubleshooting/Authentication#Connection issues]] — other causes of blocked connections.
