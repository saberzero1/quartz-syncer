---
title: Manage integration styles
description: Whether to automatically manage integration SCSS files and custom.scss imports in your Quartz project.
created: 2026-01-09T13:00:00Z+0100
modified: 2026-01-09T13:00:00Z+0100
publish: true
tags: [integration, settings/integrations]
default_value: "true"
---

When enabled, Quartz Syncer automatically manages the SCSS styles required by enabled integrations.

## What this setting does

1. **Writes SCSS files** for each enabled integration to `quartz/styles/syncer/`
2. **Generates an index file** at `quartz/styles/syncer/_index.scss` that imports all integration styles
3. **Updates `custom.scss`** to include `@use "./syncer";` if not already present

## Directory structure

When integrations with styles are enabled (Datacore, Fantasy Statblocks, Auto Card Link, Excalidraw), the following structure is created:

```
quartz/
└── styles/
    ├── custom.scss          ← Updated to include @use "./syncer";
    └── syncer/
        ├── _index.scss      ← Auto-generated, imports enabled integrations
        ├── _datacore.scss
        ├── _fantasy-statblocks.scss
        ├── _auto-card-link.scss
        └── _excalidraw.scss
```

## When to disable

You may want to disable this setting if:

- You prefer to manage Quartz styles manually
- You have custom modifications to integration styles
- You want to use a different styling approach

When disabled, integration content will still be compiled, but without the accompanying styles. You would need to add the necessary CSS/SCSS manually to your Quartz project.
