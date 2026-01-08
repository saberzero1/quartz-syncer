---
title: Enable caching
description: Whether to cache note compilation results to greatly improve performance.
created: 2025-06-12T22:44:54Z+0200
modified: 2026-01-08T13:30:00Z+0100
publish: true
tags: [settings/performance]
default_value: "true"
---

When enabled, Quartz Syncer caches compiled files to avoid reprocessing unchanged notes.

## How it works

```mermaid
flowchart TD
    A[fa:fa-file-text Markdown] --> B{Has publish flag?}
    B --> |No| Z[Skip]
    B --> |Yes| C{Check local cache}
    C --> |New file| D(Generate PublishFile)
    C --> |Modified file| D
    D --> |Store in cache| E[PublishFile]
    C --> |Unchanged file| F(Use cached PublishFile)
    F --> |Read from cache| E
    E --> |Compare against remote cache| G{Check remote cache}
    G --> |Not in cache| H(Store in cache)
    G --> |In cache| J(Read from cache)
    J --> |Identical| I[Report no changes]
    H --> J
    J --> |Different| K[fa:fa-server Publish to Quartz]
```

## Dynamic content handling

Files containing [[Dataview]] or [[Datacore]] queries are automatically detected and flagged as containing dynamic content. These files are always recompiled when you open the Publication Center, ensuring query results reflect the current state of your vault.

After recompilation, the output is compared against the published version. If the compiled result is identical, the file won't appear as changed—only files with actual differences are shown.
