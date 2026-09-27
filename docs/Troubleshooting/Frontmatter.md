---
title: Frontmatter
description: Troubleshooting issues related to Frontmatter.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [frontmatter]
---

> [!WARNING] Quartz Syncer passes **all** frontmatter tags by default. Please be mindful when publishing.

> [!INFO] Frontmatter usage
> Frontmatter is a way to add metadata to markdown files in YAML format popularized by Jekyll. You can find the Jekyll docs on frontmatter by [clicking here](https://jekyllrb.com/docs/front-matter/).
>
> Quartz Syncer requires the `publish` tag to be set in order for a note to appear in the publishing dialog.
> > [!EXAMPLE]- Minimum frontmatter required for Quartz Syncer
> >
> > ```markdown
> > ---
> > publish: true
> > ---
> > rest of the note here...
> > ```

## Exported frontmatter and dates

With **All notes publishable by default** enabled, source notes do not need a
`publish` property. Excluded paths and explicit opt-outs still apply, and you
choose which eligible notes to publish in the Publication Center.

Syncer adds frontmatter to the exported Markdown copy even when the source has
no frontmatter or an empty YAML block. It includes `publish: true` and, when
**Created timestamp** and **Updated timestamp** are enabled, `created` and
`modified`. Existing dates from the configured timestamp keys take precedence;
otherwise Syncer uses the source file's creation and modification timestamps.
It does not replace those dates with the time you press Publish.

Your vault note and its file timestamps are not changed. Timestamp fallbacks are
stored as ISO dates in UTC, preserving the same instant for Quartz to display
in the site's configured timezone. Non-Markdown assets such as images, Bases,
and Canvas files keep their original format.
