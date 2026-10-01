---
title: Use full image resolution
description: Removed in v2. Media is always published at full resolution.
created: 2025-05-17T10:02:24Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/quartz]
default_value: n/a
---

> [!WARNING] Removed in v2
>
> This setting no longer exists. Quartz Syncer publishes media byte-for-byte at full resolution and never recompresses it, so there is nothing to toggle.

If you want compressed assets on your site, handle it in Quartz or in your build pipeline rather than at publish time. Compressing at publish time would mean the published bytes no longer match the vault bytes, which would make every media file look permanently changed.
