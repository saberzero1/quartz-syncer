---
title: Syncer
description: Quartz Syncer settings related to Syncer.
created: 2025-06-12T22:41:01Z+0200
modified: 2025-06-12T23:16:14Z+0200
publish: true
tags: [settings, settings/syncer]
---

```datacorejsx
return function View() {
  const pages = dc.useQuery("@page").filter(page => page.$path.startsWith("Settings/Syncer") && page.$name !== "index")

  const COLUMNS = [
    {id: "Category", value: page => page.$link},
    {id: "Description", value: page => page.$frontmatter["description"].value},
    {id: "Default value", value: page => page.$frontmatter["default_value"].value}
  ];
  
  return <dc.Table rows={pages} columns={COLUMNS} />;
}
```
