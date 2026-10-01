---
title: Frontmatter format
description: Output format for frontmatter/note properties in published notes.
created: 2026-01-09T07:32:00Z+0100
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/frontmatter]
default_value: "`yaml`"
---

This setting controls the output format for frontmatter in your published notes.

## Options

- **YAML** (default): Human-readable format. Obsidian default, and standard for most static site generators including Quartz.
- **JSON**: Legacy format, outputs frontmatter as a single JSON object.

## Example output

### YAML format

```yaml
---
publish: true
title: My Note
created: 2026-01-09T06:32:00.000Z
modified: 2026-01-09T06:32:00.000Z
tags:
  - tag1
  - tag2
---
```

### JSON format

```json
---
{"publish":true,"title":"My Note","created":"2026-01-09T06:32:00.000Z","modified":"2026-01-09T06:32:00.000Z","tags":["tag1","tag2"]}
---
```

## Timestamps are always ISO 8601

Timestamps are emitted as ISO 8601 strings, regardless of this setting.

Quartz Syncer does not reformat them. A timestamp taken from the file's own creation or modification time is converted with `toISOString()`. A timestamp read from one of your [[Created timestamp keys|timestamp key]] properties is passed through **exactly as written**, so if your note says `created: 2026-01-09`, that is what gets published.

> [!NOTE] There is no timestamp format setting
>
> A `timestampFormat` setting exists in the persisted settings file with a default of `MMM dd, yyyy h:mm a`, but nothing reads it — in this version or in v1. If you need a different format on your site, format it in Quartz at render time, or write the value you want into the note's own property.

## Property order

Properties are written in a fixed order, not the order they appear in your note: `publish`, `permalink`, `aliases`, `title`, `description`, `draft`, `comments`, `lang`, `enableToc`, timestamps, `tags`, `cssclasses`, then social image fields.

With [[Include all properties]] enabled, your note's remaining properties are appended after these.
