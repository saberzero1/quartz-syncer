---
title: Performance
description: Quartz Syncer settings related to performance.
created: 2025-06-12T22:41:01Z+0200
modified: 2025-06-16T23:49:13Z+0200
publish: true
tags: [settings, settings/performance]
---

```datacorejsx
return function View() {
  const pages = dc.useQuery("@page").filter(page => page.$path.startsWith("Settings/Performance") && page.$name !== "index")
  
  const sortedPages = dc.useArray(pages, array => array.sort(page => page.$name));

  const COLUMNS = [
    {id: "Category", value: page => page.$link},
    {id: "Description", value: page => page.$frontmatter["description"].value},
    {id: "Default value", value: page => page.$frontmatter["default_value"].value}
  ];
  
  return <dc.Table rows={sortedPages} columns={COLUMNS} />;
}
```
