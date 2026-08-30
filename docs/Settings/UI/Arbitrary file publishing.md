---
title: Arbitrary file publishing
description: Allow publishing vault files to custom paths in the Quartz repository, outside the content folder.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-08-30T12:00:00Z+0200
publish: true
tags: [settings/ui]
default_value: "false"
---

When enabled, Quartz Syncer can publish specified vault files to custom locations in your Quartz repository, outside the standard content folder.

> [!WARNING] Advanced feature
>
> This is an advanced feature for users who need to publish configuration files, custom layouts, or other non-content files to their Quartz repository. Most users do not need this.

## Configuration

1. Enable **Allow arbitrary file publishing** in the UI settings.
2. Configure **Arbitrary publish paths** to specify which vault files to publish and where.

Arbitrary files can also be published via the CLI: `obsidian quartz-syncer:publish action=arbitrary force`.
