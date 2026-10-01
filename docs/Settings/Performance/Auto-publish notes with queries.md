---
title: Auto-publish notes with queries
description: Whether automatic publishing also includes notes containing Dataview or Datacore queries.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/performance, dataview, datacore]
default_value: "false"
---

Controls whether [[Auto-publish interval|automatic publishing]] includes *dynamic* notes — notes whose published output depends on the rest of your vault, because they contain [[Settings/Integrations/Dataview|Dataview]] or [[Settings/Integrations/Datacore|Datacore]] queries.

## Why dynamic notes are treated differently

A normal note's compiled output depends only on that note. A note containing a query depends on everything the query can match, so editing an unrelated note can change what a dynamic note *would* publish, without the dynamic note itself changing at all.

That makes dynamic notes expensive: to know whether one needs republishing, it has to be recompiled, every time. Including them in a recurring timer means paying that cost on every run.

## Behaviour

- **Disabled (default)**: automatic publishing skips dynamic notes. They still appear in the [[Usage Guide#The Publication Center|Publication Center]] and you can publish them manually whenever you like.
- **Enabled**: automatic publishing recompiles every dynamic note on each run and publishes those whose output changed.

This setting only affects *automatic* publishing. Manual publishing from the Publication Center and the [[Guides/CLI|CLI]] always handles dynamic notes.

## Which notes count as dynamic

A note is dynamic if it contains a Dataview or Datacore query — `dataview`, `dataviewjs`, `datacorejs` and `datacorejsx` blocks, and inline Dataview expressions. Classification is done during compilation and remembered across restarts.

In the Publication Center, a row still being classified is marked as checking until its category is resolved.

> [!TIP] Dynamic notes are recompiled on data change, not on every change
>
> Independently of this setting, background compilation tracks Dataview's and Datacore's revision counters and recompiles dynamic notes only when the underlying data actually changed — not on every unrelated vault edit. See [[Enable caching#Dynamic content handling]].

## Recommendation

Leave this off unless automatic publishing is your main workflow *and* your dynamic notes need to stay current without you thinking about it. With a short [[Auto-publish interval|auto-publish interval]] and many dynamic notes, turning it on means near-continuous recompilation.
