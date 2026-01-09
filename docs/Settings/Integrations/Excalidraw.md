---
title: Excalidraw
description: Enable support for the Excalidraw plugin to convert drawings to embedded SVG images.
created: 2025-05-15T20:32:34Z+0200
modified: 2026-01-09T12:58:00Z+0100
publish: true
tags: [excalidraw, integration, settings/integrations]
default_value: "true"
---

When enabled, Quartz Syncer will automatically convert [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) drawings (`.excalidraw.md` files) into embedded SVG images that display correctly in Quartz.

## How it works

1. **Detection**: Quartz Syncer identifies files with the `.excalidraw.md` extension.
2. **Conversion**: The Excalidraw drawing data is extracted and converted to SVG format using the Excalidraw plugin's export functionality.
3. **Theme support**: Both light and dark theme variants are generated, allowing the drawing to adapt to your Quartz site's theme.
4. **Embedding**: The SVG is embedded directly in the published content, preserving the visual appearance of your drawings.

## Requirements

- The [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) plugin must be installed and enabled in Obsidian.
- Drawings must have the `.excalidraw.md` file extension.

## Example

![[Drawing.excalidraw]]

## Notes

- Excalidraw files are transformed at a file level, meaning the entire file content is replaced with the SVG representation.
- Interactive features of Excalidraw (like editing) are not available in the published version - it becomes a static image.
- The generated SVG respects the drawing's original dimensions and styling.
