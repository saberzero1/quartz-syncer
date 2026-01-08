---
title: Diff view style
description: Choose the default layout for viewing differences between local and published files.
created: 2026-01-08T13:00:00Z+0100
modified: 2026-01-08T19:40:58Z+0100
publish: true
tags: [settings/ui]
default_value: "Auto"
---

This setting controls how the diff viewer displays differences when comparing your local file with the published version.

## Options

| Value | Description |
| --- | --- |
| **Auto** | Uses split view on desktop and unified view on mobile. This is the recommended setting for most users. |
| **Always Split** | Always shows a side-by-side view with the remote (published) file on the left and the local (current) file on the right. |
| **Always Unified** | Always shows a single-column view with deletions and additions interleaved. |

## Split view

The split view displays both versions side-by-side:

- **Left pane**: Remote (Published) - the version currently on your Quartz site
- **Right pane**: Local (Current) - your local version after processing

Both panes scroll together, making it easy to compare changes at the same position in both files.

## Unified view

The unified view displays all changes in a single column:

- Removed lines are highlighted in red with a `-` indicator
- Added lines are highlighted in green with a `+` indicator
- Unchanged lines show both line numbers

## Accessing the diff viewer

1. Open the Publication Center (`Quartz Syncer: Open publication center`)
2. Find a file marked as "Changed"
3. Click on the file to open the diff viewer
4. Use the **Split** / **Unified** toggle buttons to switch views on the fly
