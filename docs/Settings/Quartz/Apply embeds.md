---
title: Apply embeds
description: Whether to let Quartz Syncer should handle link embeddings.
created: 2025-05-21T11:39:18Z+0200
modified: 2025-06-07T13:08:14Z+0200
publish: true
tags: [settings/quartz]
default_value: "true"
---

When enabled, embed links are handled by Quartz Syncer.

## Recommended configuration

This setting should be **Enabled** if:

- You want to embed (parts of) non-published notes inside published notes.
- You don't want embedded content to be a separate page.
- You don't want links to the original content next to your embeddings.
- Your notes are composed mostly of embed, and you want clean pages instead of many links.

This setting should be **Disabled** if:

- You want to include embedded content as separate pages as well.
- You want to prevent accidentally embedding private content. (Embedding a non-published note will result in a broken in link in Quartz, instead of embedded content.)
- You have implemented custom logic for embedding in Quartz that requires embed links to be passed to Quartz.

> [!EXAMPLE] Example
>
> Assuming the following notes are to be published:
>
> ```markdown
> // index.md
> # Hello
> 
> ![[embed]]
> ```
>
> ```markdown
> // embed.md
> ## Goodbye
> 
> Look mom, I'm embedded!
> ```
>
> > [!SUCCESS] `Apply embeds` enabled
> >
> > ```markdown
> > // index.md
> > # Hello
> > 
> > ## Goodbye
> > 
> > Look mom, I'm embedded!
> > ```
> >
> > ```markdown
> > // embed.md
> > // This file is not published, unless explicitly marked with the configured publish flag.
> > ```
>
> > [!FAILURE] `Apply embeds` disabled
> >
> > ```markdown
> > // index.md
> > # Hello
> > 
> > ![[embed]]
> > ```
> >
> > ```markdown
> > // embed.md
> > ## Goodbye
> > 
> > Look mom, I'm Embedded!
> > ```
