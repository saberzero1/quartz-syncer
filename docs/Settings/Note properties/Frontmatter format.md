---
title: Frontmatter format
description: Output format for frontmatter/note properties in published notes.
created: 2026-01-09T07:32:00Z+0100
modified: 2026-01-09T07:32:00Z+0100
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
tags:
  - tag1
  - tag2
created: Jan 09, 2026 7:32 AM
---
```

### JSON format

```json
---
{"publish":true,"title":"My Note","tags":["tag1","tag2"],"created":"Jan 09, 2026 7:32 AM"}
---
```
