---
title: Synchronize cache between devices
description: Prevents caching inconsistencies by storing a serialized copy of the cache to the `data.json`. This allows for consistency between devices.
created: 2025-06-15T00:26:55Z+0200
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [settings/performance]
default_value: "true"
---

> [!WARNING] Removed in v2
>
> This setting has been removed in Quartz Syncer v2. The cache is stored in IndexedDB per vault and remote, so a serialized copy in `data.json` is no longer used. Use [[Enable caching]] to turn caching on or off, and "Clean up caches from other vaults" to remove stale databases.
