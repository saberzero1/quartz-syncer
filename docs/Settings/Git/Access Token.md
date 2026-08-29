---
title: Access Token
description: Personal access token or password for authentication.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [settings/git]
---

> [!WARNING] Requirements
> Secure token storage requires **Obsidian 1.11.4 or later**.

The personal access token or password used for authentication with your Git provider.

## Secure Storage

As of version 1.9.1, tokens are stored securely using Obsidian's SecretStorage API. This uses your operating system's native secret storage:

- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: libsecret (GNOME Keyring, KWallet, etc.)

This means your token is never written to `data.json` or any other plain text file, preventing accidental exposure when syncing your vault between devices.

## Token Input

The token input field includes:

- **Status indicator**: Shows whether a token is currently stored ("Token stored securely") or not ("No token set").
- **Password field**: Enter your token in a masked input field for privacy.
- **Visibility toggle**: Click the eye icon to show/hide the token while typing.
- **Save/Update button**: Store the token in secure storage.
- **Clear button**: Remove the stored token (only shown when a token exists).

## Migration

If you're upgrading from a version prior to 1.9.1, your existing token will be automatically migrated to secure storage and removed from `data.json` on first load.

## Required Permissions

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

For GitLab, Bitbucket, Codeberg, and other providers, refer to the [[Guides/GitHub Setup|setup guide for your Git provider]].

## Generating Tokens

Refer to the [[Guides/GitHub Setup|GitHub setup guide]] or the setup guide for your Git provider for step-by-step token generation instructions.
