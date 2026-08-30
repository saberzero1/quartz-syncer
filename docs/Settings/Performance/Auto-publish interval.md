---
title: Auto-publish interval
description: Automatically publish pending changes on a timer (desktop only).
created: 2026-08-30T12:00:00Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [settings/performance]
default_value: "0"
---

Controls whether Quartz Syncer automatically publishes pending changes on a recurring timer.

> [!NOTE] Desktop only
>
> Auto-publish is only available on desktop.

## Behavior

- **Set to 0 (default)**: auto-publish is disabled. You must publish manually via the Publication Center or CLI.
- **Set to N minutes**: Quartz Syncer will automatically publish all pending changes every N minutes, as long as there are changes to publish.

Auto-publish only runs when the Publication Center is closed. While the Publication Center is open, auto-publish is paused to prevent cache contention.

## Recommended values

| Use case | Interval |
|---|---|
| Disabled (default) | 0 |
| Frequent updates | 5-15 minutes |
| Periodic sync | 30-60 minutes |
| Daily publish | 1440 minutes (24 hours) |
