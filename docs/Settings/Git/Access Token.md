---
title: Access Token
description: Personal access token or password for authentication.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-01-09T10:00:54Z+0100
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

## Generating Tokens

Refer to the [[Setup Guide#Choose Your Git Provider|setup guide for your Git provider]] for instructions on generating tokens for different Git providers.
