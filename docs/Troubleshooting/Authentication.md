---
title: Authentication
description: Troubleshooting issues related to Git authentication.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-01-08T13:30:00Z+0100
publish: true
---

> [!INFO] Expired authentication token?
> The most frequent issue with authentication is an expired access token. You can check this in the Quartz Syncer settings inside Obsidian (`Settings > Community Plugins > Quartz Syncer`).
>
> If you see an authentication error, regenerate your access token following the guide for your Git provider:
> - [[GitHub Setup#Generate an Access Token|GitHub]]
> - [[GitLab Setup#Generate an Access Token|GitLab]]
> - [[Bitbucket Setup#Generate an App Password|Bitbucket]]
> - [[Codeberg Setup#Generate an Access Token|Codeberg]]

## My Authentication Token is correct, but I get an error when publishing

Please ensure you have the proper rights to your Quartz repository. Your token needs write access to the repository.

## Connection issues

If you're on a university network, corporate network, or similar shared network, your connection to the Git provider might be blocked or rate-limited. Try:

1. Using a different network (e.g., mobile hotspot)
2. Configuring a [[CORS Proxy]] if required by your network

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
