---
title: Modified timestamp keys
description: Comma-separated list of keys to look for to determine the modified timestamp.
created: 2025-07-02T22:53:38Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/frontmatter]
aliases: [Updated timestamp keys]
default_value: modified, lastmod, updated, last-modified
---

The note properties Quartz Syncer checks, in order, to find a note's modified timestamp. The first key that is present and parses as a date wins.

Only used when [[Include modified timestamp]] is on and [[Include all properties]] is off.

> [!NOTE] Renamed in v2
>
> This setting is labelled **Modified timestamp keys** in the plugin. It was previously called *Updated timestamp keys*. The default key list is unchanged, and `updated` is still one of the keys it looks for.
