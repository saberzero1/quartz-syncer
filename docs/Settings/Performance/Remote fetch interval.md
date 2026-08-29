---
title: Remote fetch interval
description: How often to fetch the remote repository state in the background, in seconds.
created: 2026-08-02T12:00:00Z+0200
modified: 2026-08-02T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: "60"
---

Controls how frequently Quartz Syncer fetches the latest state of your remote repository in the background.

When the Publication Center opens, it needs to know what's currently published on your Quartz site. With background fetching enabled, this information is already cached, making the Publication Center open instantly instead of waiting for a network round-trip (~400ms).

## Behavior

- **Default (60 seconds)**: the remote state is fetched every 60 seconds. The first fetch happens automatically when background compilation finishes after startup.
- **Set to 0**: disables background fetching. The remote state is fetched on demand when you open the Publication Center.
- **After publishing or deleting**: the cache is automatically invalidated and refreshed, so you always see the latest state.

## Recommended values

| Use case | Interval |
|---|---|
| Fastest Publication Center | 10-30 seconds |
| Balanced (default) | 60 seconds |
| Minimal network usage | 120-300 seconds |
| On-demand only | 0 (disabled) |

This setting is only visible when caching is enabled.
