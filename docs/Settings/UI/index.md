---
title: UI
description: Quartz Syncer settings related to the user interface.
created: 2026-01-08T13:00:00Z+0100
modified: 2026-01-08T13:00:00Z+0100
publish: true
tags: [settings, settings/ui]
---

```datacorejsx
return function View() {
  const pages = dc.useQuery("@page").filter(page => page.$path.startsWith("Settings/UI") && page.$name !== "index")
  
  const sortedPages = dc.useArray(pages, array => array.sort(page => page.$name));

  const COLUMNS = [
    {id: "Category", value: page => page.$link},
    {id: "Description", value: page => page.$frontmatter["description"].value},
    {id: "Default value", value: page => page.field("default_value").value}
  ];
  
  return <dc.Table rows={sortedPages} columns={COLUMNS} />;
}
```
