---
title: Overview
description: The first settings screen, showing your publish destination and whether publishing is ready.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings, settings/overview]
---

The Overview is the screen you land on when you open Quartz Syncer's settings. It is not a list of toggles — it is a dashboard with exactly one setting on it.

## What the Overview shows

### Quartz Syncer v*x.y.z*

The installed plugin version, with links to this documentation, the [[Setup Guide|setup guide]], and the [[Troubleshooting/index|troubleshooting section]].

### Publish to

The one actual setting on this page. See [[Publish to]].

### Status, or a setup prompt

What appears underneath **Publish to** depends on whether a publish destination resolves:

- **A destination resolves** → a **Status** row summarising the current publish state and the destination being used.
- **No destination resolves** → a prompt that names the specific problem and offers a button that fixes it. On desktop that button opens either the [[Setup Guide#Quick setup with the onboarding wizard|onboarding wizard]] or the [[Guides/Quartz Hub|Quartz Hub]], depending on what is missing. On mobile it opens the manual setup dialog.

The possible problems and what they mean are listed under [[Publish to#When no destination resolves]].

> [!TIP] Readiness warnings are not the same as blockers
>
> A destination can resolve and still not be ready — for example, a remote is configured but no access token has been saved. In that case **Publish to** shows an inline warning rather than replacing the Status row. See [[Publish to#Readiness warnings]].

## Settings in this group

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
