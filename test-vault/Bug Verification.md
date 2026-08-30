---
publish: true
title: Bug Verification
---

## Task Lists

- [ ] unchecked task
- [x] checked task
- [/] in progress
- [-] cancelled
- regular item

## Nested Tasks

- [ ] parent task
    - [x] child task
    - [ ] another child

## Table with Image Embed

| Image | Description |
| --- | --- |
| ![[test-image.png|400]] | A test image |

## Dataview Query

```dataview
LIST
FROM ""
WHERE publish = true
LIMIT 5
```

