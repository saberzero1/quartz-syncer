---
title: Dataview
description: Troubleshooting issues related to using the Dataview Obsidian plugin.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-01-08T13:30:00Z+0100
publish: true
tags: [dataview]
---

> [!INFO] Dataview usage
> For questions regarding Dataview syntax, please refer to the [Dataview documentation](https://blacksmithgu.github.io/obsidian-dataview/)

## Dataview Query is empty in Quartz but not in Obsidian

Please ensure the notes in your Dataview query result are published to Quartz. Dataview queries are compiled at publish time, so only published notes will appear in query results.

## Dataview doesn't work in Quartz Syncer

Quartz Syncer uses the Dataview plugin for Dataview support. Please ensure the Dataview plugin is installed and enabled.

## Dataviewjs syntax doesn't work

Please ensure Dataviewjs syntax is enabled in the Dataview plugin settings.

## Dataview query results are outdated

Files with Dataview queries are automatically detected and recompiled each time you open the Publication Center. If you're seeing stale results:

1. Close and reopen the Publication Center
2. Try clearing the cache for the affected file (`Quartz Syncer: Clear cache for current file`)
3. Ensure the source data has been saved in Obsidian before opening the Publication Center

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
