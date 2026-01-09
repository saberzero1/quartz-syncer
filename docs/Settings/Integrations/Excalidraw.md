---
title: Excalidraw
description: Enable support for the Excalidraw plugin to convert drawings to embedded SVG images.
created: 2025-05-15T20:32:34Z+0200
modified: 2026-01-09T23:42:47Z+0100
publish: true
tags: [excalidraw, integration, settings/integrations]
default_value: "true"
---

When enabled, Quartz Syncer will automatically convert [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) drawings (`.excalidraw.md` files) into embedded SVG images that display correctly in Quartz.

## How it works

1. **Detection**: Quartz Syncer identifies files with the `.excalidraw.md` extension or embedded Excalidraw links (`![[Example.excalidraw]]`).
2. **Conversion**: The drawing is converted to SVG format using the [ExcalidrawAutomate API](https://excalidraw-obsidian.online).
3. **Theme support**: Both light and dark theme variants are generated, allowing the drawing to automatically adapt to your Quartz site's theme.
4. **Embedding**: The SVGs are embedded as base64-encoded background images, ensuring compatibility with Quartz's markdown processing.

## Requirements

- The [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) plugin must be installed and enabled in Obsidian.
- Drawings must have the `.excalidraw.md` file extension.
- The drawing file must have `excalidraw-plugin: parsed` in its frontmatter (this is added automatically by the Excalidraw plugin).

## Supported syntax

### Excalidraw files

Files with the `.excalidraw.md` extension are automatically converted when published. The entire file content is replaced with the SVG representation.

### Embedded drawings

You can embed Excalidraw drawings in other notes using the standard Obsidian embed syntax:

```markdown
![[Example.excalidraw]]
```

### Linked drawings

Regular links to Excalidraw files are converted to standard links:

```markdown
[[Example.excalidraw]]
[[Example.excalidraw|Custom text]]
```

## Example

![[Drawing.excalidraw]]

## Notes

- Excalidraw files are transformed at a file level, meaning the entire file content is replaced with the SVG representation.
- Interactive features of Excalidraw (like editing) are not available in the published version - it becomes a static image.
- The generated SVG respects the drawing's original dimensions and styling.
- Theme switching relies on Quartz's `saved-theme` attribute on the `<html>` element.
