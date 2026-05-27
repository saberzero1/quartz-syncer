---
title: Excalidraw
description: Troubleshooting issues related to using the Excalidraw Obsidian plugin.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-05-25T12:00:00Z+0200
publish: true
tags: [excalidraw]
---

> [!INFO] Excalidraw usage
> For questions regarding Excalidraw usage, please refer to the [Excalidraw documentation](https://excalidraw-obsidian.online).
>
> For rendering issues in Quartz, please refer to the [Quartz Excalidraw plugin](https://github.com/quartz-community/obsidian-plugin-excalidraw).

## Drawing does not appear in Quartz

If your Excalidraw drawing is not showing up on your Quartz site:

1. **Ensure the Quartz Excalidraw plugin is installed** - The plugin must be installed in your Quartz site for drawings to render. Install it with:

```bash
npx quartz plugin add github:quartz-community/obsidian-plugin-excalidraw
```

2. **Ensure the Excalidraw integration is enabled** - The Excalidraw integration must be enabled in [[Settings/Integrations/Excalidraw|Quartz Syncer's settings]] for `.excalidraw.md` files to be synced.
3. **Check the file extension** - Drawing files should have the `.excalidraw.md` extension.
4. **Verify the frontmatter** - Excalidraw files should have `excalidraw-plugin: parsed` in their frontmatter.

## Drawing appears but renders incorrectly

Rendering is handled by the [Quartz Excalidraw plugin](https://github.com/quartz-community/obsidian-plugin-excalidraw). If a drawing syncs successfully but doesn't render correctly, please raise an issue on the [Quartz Excalidraw plugin repository](https://github.com/quartz-community/obsidian-plugin-excalidraw/issues).

## I have a different issue not listed here

For syncing issues, please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).

For rendering issues, please raise an issue on the [Quartz Excalidraw plugin repository](https://github.com/quartz-community/obsidian-plugin-excalidraw/issues).
