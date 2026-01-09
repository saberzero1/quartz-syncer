---
title: Excalidraw
description: Troubleshooting issues related to using the Excalidraw Obsidian plugin.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-01-09T14:00:00Z+0100
publish: true
tags: [excalidraw]
---

> [!INFO] Excalidraw usage
> For questions regarding Excalidraw usage, please refer to the [Excalidraw documentation](https://excalidraw-obsidian.online).

## Drawing appears empty or broken

If your Excalidraw drawing appears empty or broken after publishing:

1. **Ensure the Excalidraw plugin is enabled** - The plugin must be active for Quartz Syncer to access the export API.
2. **Check the file extension** - Drawing files should have the `.excalidraw.md` extension.
3. **Verify the frontmatter** - Excalidraw files should have `excalidraw-plugin: parsed` in their frontmatter.

## Theme switching not working

If the drawing doesn't switch between light and dark themes:

- Quartz Syncer generates both light and dark variants of each drawing.
- The correct variant is shown based on Quartz's `saved-theme` attribute on the `<html>` element.
- If your Quartz theme uses a different attribute for theme detection, the automatic switching may not work.

## Drawing looks different from Obsidian

Some differences may occur because:

- Fonts are not embedded in the exported SVG to reduce file size.
- The drawing is rendered as a static image, so interactive features are not available.
- Some Excalidraw-specific styling may not be preserved.

## I have a different issue not listed here

Please raise an [issue on GitHub](https://github.com/saberzero1/quartz-syncer/issues).
