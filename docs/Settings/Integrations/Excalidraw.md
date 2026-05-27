---
title: Excalidraw
description: Enable syncing of Excalidraw drawings to Quartz.
created: 2025-05-15T20:32:34Z+0200
modified: 2026-05-25T12:00:00Z+0200
publish: true
tags: [excalidraw, integration, settings/integrations]
default_value: "true"
---

When enabled, Quartz Syncer will sync [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) drawings (`.excalidraw.md` files) to Quartz as-is. Rendering is handled by the [Quartz Excalidraw plugin](https://github.com/quartz-community/obsidian-plugin-excalidraw).

## How it works

1. **Detection**: Quartz Syncer identifies files with the `.excalidraw.md` extension.
2. **Syncing**: The drawing file is synced to Quartz without modification.
3. **Rendering**: The [Quartz Excalidraw plugin](https://github.com/quartz-community/obsidian-plugin-excalidraw) renders the drawing in Quartz, including dark/light theme support and interactive pan/zoom.

## Requirements

- The [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) plugin must be installed and enabled in Obsidian.
- The [Quartz Excalidraw plugin](https://github.com/quartz-community/obsidian-plugin-excalidraw) must be installed in your Quartz site:

```bash
npx quartz plugin add github:quartz-community/obsidian-plugin-excalidraw
```

- Drawings must have the `.excalidraw.md` file extension.
- The drawing file must have `excalidraw-plugin: parsed` in its frontmatter (this is added automatically by the Excalidraw plugin).

## Example

![[Drawing.excalidraw]]

## Notes

- Quartz Syncer syncs the raw `.excalidraw.md` file without any transformation.
- All rendering, theme support, and interactivity is handled by the Quartz Excalidraw plugin.
- For configuration options (dark mode, interactivity, padding), refer to the [Quartz Excalidraw plugin documentation](https://github.com/quartz-community/obsidian-plugin-excalidraw).
