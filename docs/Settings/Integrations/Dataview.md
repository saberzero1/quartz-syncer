---
title: Dataview
description: Whether to enable support for the Dataview plugin. Requires Dataview to be installed and enabled.
created: 2025-05-15T15:53:42Z+0200
modified: 2026-01-08T13:30:00Z+0100
publish: true
tags: [dataview, integration, settings/integrations]
default_value: "true"
---

When enabled, Quartz Syncer compiles Dataview queries into static markdown before publishing. This allows your Quartz site to display query results without requiring Dataview at runtime.

## Supported query types

- `dataview` code blocks
- `dataviewjs` code blocks (customizable keyword via Dataview settings)
- Inline queries (e.g., `` `= this.file.name` ``)
- Inline JS queries

## Cache behavior

Files containing Dataview queries are automatically detected and flagged as containing dynamic content. These files are always recompiled when you open the Publication Center, ensuring query results reflect the current state of your vault.

The output is then compared against the published version—if the compiled result is identical, the file won't appear as changed.
