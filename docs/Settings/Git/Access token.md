---
title: Access token
description: Personal access token or password for authentication.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/git]
---

The personal access token or password used to authenticate with your Git provider.

> [!NOTE] Only needed for remote publishing
>
> This setting only matters when [[Publish to]] is set to **Remote repository**, and only when [[Authentication type]] is not **None**. [[Publish to|Local publishing]] writes straight to disk and needs no credentials.
>
> On Bitbucket the field is labelled **App password** instead.

If no token is stored while a remote destination is selected, the [[Settings/Overview/index|Overview]] warns: *"No token is stored, so publishing to the remote will fail authentication."*

## Secure storage

Tokens are never written to `data.json`. They are stored through Obsidian's secret storage, which on desktop is encrypted with `electron.safeStorage` and backed by your operating system's keychain:

- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: libsecret (GNOME Keyring, KWallet, etc.)

This keeps the token out of any file that gets synced between devices, so it cannot leak through vault sync.

> [!WARNING] The token cannot be set from the CLI
>
> `quartz-syncer:config` always redacts `git.auth.secret` and refuses to write it. Use this settings field, or the [[Setup Guide#Manual setup|manual setup dialog]].

## Token input

The token field includes:

- **Status indicator**: whether a token is currently stored.
- **Password field**: masked input.
- **Visibility toggle**: show or hide the token while typing.
- **Save/Update button**: store the token.
- **Clear button**: remove the stored token. Only shown when a token exists.

## Migration

If you upgraded from Quartz Syncer v1, your existing token was migrated into secure storage and removed from `data.json` on first load. If authentication started failing right after upgrading, re-enter the token here — see [[Troubleshooting/Authentication#Token migration from v1|the authentication troubleshooting page]].

## Required permissions

### GitHub

**Fine-grained tokens** require the following repository permissions:

| Permission | Access | Purpose |
|---|---|---|
| **Contents** | Read and write | Publishing notes and reading remote state |
| **Workflows** | Read and write | Creating the deploy workflow that builds your Quartz site |

**Classic tokens** require the `repo` and `workflow` scopes.

> [!NOTE] Why is the Workflows permission needed?
> Quartz uses a GitHub Actions workflow to build your site and deploy it to GitHub Pages. The setup wizard creates this workflow file (`.github/workflows/deploy.yml`) automatically. Without the Workflows permission, the wizard will create your repository but you'll need to add the deploy workflow manually.

### Other providers

| Provider | Needs | Guide |
| --- | --- | --- |
| GitLab | A Personal Access Token with the `read_repository` and `write_repository` scopes. Use `oauth2` as the [[Username\|username]]. | [[GitLab Setup]] |
| Bitbucket | An App Password with repository write access. Use `x-token-auth` as the [[Username\|username]]. | [[Bitbucket Setup]] |
| Codeberg / Gitea | An access token with write access to the repository. | [[Codeberg Setup]] |

Quartz Syncer adapts this setting's description and the [[Username|username]] hint to whichever [[Provider|provider]] you select.

## Generating tokens

See the guide for your provider — [[GitHub Setup]], [[GitLab Setup]], [[Bitbucket Setup]] or [[Codeberg Setup]] — for step-by-step instructions.

## Verifying it works

After saving a token, press **Test connection** at the bottom of the Git settings page, or run `obsidian quartz-syncer:test verbose`. See [[Settings/Git/index#Connection test]].
