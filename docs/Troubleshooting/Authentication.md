---
title: Authentication
description: Troubleshooting issues related to Git authentication.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
---

> [!INFO] Expired authentication token?
> The most frequent issue with authentication is an expired access token. You can check this in the Quartz Syncer settings inside Obsidian (`Settings > Community plugins > Quartz Syncer`).
>
> If you see an authentication error, regenerate your access token following the guide for your Git provider:
> - [[GitHub Setup#Generate an Access Token|GitHub]]
> - [[GitLab Setup#Generate an Access Token|GitLab]]
> - [[Bitbucket Setup#Generate an App Password|Bitbucket]]
> - [[Codeberg Setup#Generate an Access Token|Codeberg]]

> [!TIP] Authentication only applies to remote publishing
>
> If [[Publish to]] is set to **Local folder**, nothing authenticates — Quartz Syncer writes straight to disk. An authentication error means you are publishing to a remote. Check which destination is active with `obsidian quartz-syncer:repo action=info`.

## Token migration from v1

If you upgraded from Quartz Syncer v1, your access token was migrated to secure storage (`electron.safeStorage` on desktop, `SecretStorage` on mobile). If you experience authentication issues after upgrading:

1. Open Quartz Syncer settings and go to **Git**.
2. Re-enter your token in the [[Access token]] field and save it.
3. Test it with the **Test connection** button, or `obsidian quartz-syncer:test verbose`.

## "No token is stored"

The [[Settings/Overview/index|Overview]] warns *"No token is stored, so publishing to the remote will fail authentication."* when a remote destination is selected, [[Authentication type]] is not **None**, and no token has been saved.

Save one in the [[Access token]] field. Note that the token cannot be set from the CLI — `quartz-syncer:config` always redacts and refuses to write `git.auth.secret`.

## My Authentication Token is correct, but I get an error when publishing

Please ensure you have the proper rights to your Quartz repository. Your token needs write access to the repository.

## Connection issues

If you're on a university network, corporate network, or similar shared network, your connection to the Git provider might be blocked or rate-limited. Try:

1. Using a different network (e.g., mobile hotspot)
2. Configuring a [[CORS proxy]] if required by your network

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
