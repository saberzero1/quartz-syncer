---
title: Authentication
description: Troubleshooting issues related to GitHub authentication.
created: 2025-05-05T00:00:00Z+0200
modified: 2025-05-17T18:47:50Z+0200
publish: true
---

> [!INFO] Expired authentication token?
> The most frequent issue with authentication is an expired GitHub authentication token. You can check this in the Quartz Syncer settings inside Obsidian (`Settings > Community Plugins > Quartz Syncer`).
>
> If you see an authentication error, please follow the [[Generating an access token#Generating a fine-grained access token|guide on generating an access token]].

## My Authentication Token is correct, but I get an error when publishing

Please ensure you have the proper rights to your Quartz repository.

If you're on a university network connection or similar network that is shared with many other users, your connection to GitHub might be rate-limited.

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
