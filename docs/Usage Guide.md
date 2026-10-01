---
title: Usage Guide
description: Details on using Quartz Syncer.
created: 2025-05-05T00:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

> [!WARNING] One-way sync only
>
> Quartz Syncer transforms your notes on the way out — parsing [[Settings/Integrations/Dataview|Dataview]] queries, filtering [[Settings/Note properties/index|note properties]], rewriting links — so that what lands in Quartz is fully Quartz-compatible. The result is a one-way sync: Obsidian to Quartz, never back.
>
> For syncing notes between devices, use [Obsidian Sync](https://obsidian.md/sync) or one of the many [community plugins](https://obsidian.md/plugins?search=sync).

## Before you publish

Two things must be true before anything can be published:

1. **A publish destination resolves.** [[Publish to]] must be set to a destination that is actually configured. The [[Settings/Overview/index|Overview]] settings screen tells you if it is not, and the [[Settings/index#Status bar|status bar]] reads `Quartz Syncer: not configured`.
2. **At least one note is marked publishable.** See below.

If you have not set up a repository yet, start with the [[Setup Guide|setup guide]].

## Marking notes as publishable

By default the Publication Center is empty. A note becomes visible to Quartz Syncer when it carries the publish [property](https://help.obsidian.md/properties) set to `true`.

```markdown
---
publish: true
---
```

The property name is configurable — see [[Publish key]].

> [!IMPORTANT] Publishable is not published
>
> `publish: true` only makes a note *appear* in the Publication Center and makes it selectable. It does not publish anything. You choose what to publish, and when — unless you have deliberately turned on [[Auto-publish interval|auto-publish]].

### Ways to add the property

1. Obsidian's own properties editor — `+ Add property`, name it `publish`, tick the checkbox.
2. From the terminal with the [[Guides/CLI#quartz-syncermark|`mark` CLI command]], which supports exact paths, globs and fuzzy matching:
   ```bash
   obsidian quartz-syncer:mark path="blog/**/*.md" state=publish
   ```
3. A community plugin that applies frontmatter templates automatically.

> [!NOTE] There is no command for this
>
> Quartz Syncer does not register a command-palette command for toggling the publish property. The v1 commands `Add publish flag`, `Remove publish flag` and `Toggle publication status` no longer exist; the `mark` CLI command replaced them.

### Publishing everything instead

If you would rather not mark notes one by one, turn on [[All notes publishable by default]]. Every note inside your [[Vault root folder|vault root folder]] then becomes publishable, and the publish property is ignored entirely.

## The Publication Center

Open it in either of two ways:

1. From the command palette: `Quartz Syncer: Open Publication Center`.
2. The leaf icon in the ribbon — the left-hand bar on desktop, or the sidebar (three horizontal lines, bottom right) on mobile.

It opens near-instantly, because your notes were already compiled in the background as you edited them. See [[Enable caching]].

### Layout

| Element | What it does |
| --- | --- |
| **Publish** / **Advanced** tabs | Switch between notes and everything else |
| Search box | Filters the tree by path, case-insensitively |
| File tree | Notes grouped into categories, then into folders |
| Checkboxes | On individual files, on folders, and on whole categories |
| Status rails | A coloured bar on each row showing its state |
| Destination line | `Publishing to remote`, `Publishing to local folder`, or the reason publishing is blocked |
| **Publish** button | Labelled to match the destination, e.g. `Publish to remote` |
| **Delete** button | Destructive. Enabled only when something deletable is selected |
| Progress bar | Appears during an operation, hidden while idle |

On desktop there is also a selection summary and an inline diff pane on the right.

### Publish tab

| Category | Meaning |
| --- | --- |
| **Unpublished** | In your vault, not at the destination. Publishing adds them. |
| **Changed** | At both, but the compiled output differs. Publishing updates them. |
| **Published** | In sync with the destination. Nothing to do — but selectable, so you can delete them. |
| **Deleted** | At the destination, but gone from your vault. |

Click any **Changed** note to open the [[Diff view style|diff viewer]] and see exactly what would change.

> [!TIP] Media comes along automatically
>
> Selecting a note also selects the media it links to. If several selected notes share an image, it stays selected until none of them need it. You never have to hunt down attachments by hand.

### Advanced tab

| Category | Meaning |
| --- | --- |
| **Linked media** | Media referenced by at least one published note |
| **Unlinked media** | Media at the destination that no published note references — orphans |
| **Custom files** | Files published outside the content folder. Requires [[Allow custom file publishing]] |

With [[Allow custom file publishing]] enabled, an **Add file** button appears on this tab for picking vault files to publish to custom repository paths. Protected paths such as `package.json`, `tsconfig.json` and anything under `.github/`, `.git/` or `node_modules/` are refused.

### The Publish button

Publishing acts on your selection, but only on the categories it makes sense for:

| Selected | Published? |
| --- | --- |
| Unpublished notes | Yes |
| Changed notes | Yes |
| Custom files | Yes |
| Media linked by a selected note | Yes, automatically |
| Published notes | No — already in sync |
| Deleted notes | No — use Delete |

So selecting a **Published** note and pressing Publish does nothing to it. That is deliberate.

### The Delete button

> [!DANGER] Delete acts immediately
>
> The Delete button has no confirmation step. It removes the selected items from your publish destination as soon as you press it. (The programmatic equivalents are safer by design: the [[Guides/CLI#quartz-syncerdelete|CLI]] requires `force` and the operability facade requires `confirm: true`.)

Delete is enabled only when your selection contains something deletable:

| Selected | Deletable? | Effect |
| --- | --- | --- |
| **Deleted** notes | Yes | Removes the leftover file from the destination |
| **Published** notes | Yes | Unpublishes the note, leaving your vault note untouched |
| **Linked media** | Yes | Removes the media from the destination |
| **Unlinked media** | Yes | Removes the orphan from the destination |
| **Custom files** | Yes | Removes the file from the destination |
| **Changed** notes | No | — |
| **Unpublished** notes | No | — |

If you select only **Changed** or **Unpublished** notes, Delete stays disabled — there is nothing at the destination to remove.

### Unpublishing a note

Select it under **Published** and press Delete. The note is removed from your site; the vault note, including its `publish: true` property, is untouched. It reappears under **Unpublished** afterwards and can be published again at any time.

The same thing from the terminal:

```bash
obsidian quartz-syncer:delete action=unpublish path="notes/post.md" force dry-run
obsidian quartz-syncer:delete action=unpublish path="notes/post.md" force
```

See [[Guides/CLI#Unpublishing notes]].

## Automatic publishing

Set a non-zero [[Auto-publish interval|auto-publish interval]] to publish pending changes on a timer. Desktop only, off by default.

Auto-publish is additive — it never deletes. It also pauses while the Publication Center is open, to avoid competing with you for the cache.

By default it skips notes containing Dataview or Datacore queries, since those must be recompiled on every run to know whether they changed. See [[Auto-publish notes with queries]].

## CLI

Everything above can be driven from the terminal through the [Obsidian CLI](https://obsidian.md/cli) (Obsidian 1.13+). Obsidian must be running.

```bash
# What needs publishing?
obsidian quartz-syncer:status

# Publish pending notes (additive, no force needed)
obsidian quartz-syncer:publish

# Publish and remove notes deleted from the vault
obsidian quartz-syncer:sync force
```

See the [[Guides/CLI|CLI guide]] for all 22 commands.

## Why are there sometimes two commits?

When publishing to a remote, additions and removals are committed separately: the first commit adds and updates, the second removes. Keeping them apart avoids Git states where a partially applied change leaves the repository inconsistent.

If you are unsure whether something went through, reopen the Publication Center — the categories reflect the new state.

> [!NOTE] Local publishing does not commit
>
> With [[Publish to]] set to **Local folder**, Quartz Syncer writes files to disk and stops there. Committing and deploying is up to you, your own tooling, or the [[Guides/Quartz Hub|Quartz Hub]].

## What's new since v2.0

- **Explicit publish destinations** — publish to a Git remote or to a local Quartz folder, chosen deliberately rather than inferred. See [[Publish to]].
- **Quartz v4 publishing** — publishing to a Quartz v4 repository is supported; only v5-only site management is gated. See [[Setup Guide#Quartz v4 and v5]].
- **Separate Publish and Delete buttons** — selecting a published note no longer silently queues it for removal.
- **Status rails** instead of per-row badges, and a progress bar that stays hidden while idle.
- **Unpublish from the CLI** — `delete action=unpublish`.
- **Cache reclamation** — review and delete caches left behind by other vaults. See [[Clean up caches from other vaults]].
- **Six-tab Quartz Hub**, now including Layout and Templates. See the [[Guides/Quartz Hub|Quartz Hub guide]].

For the full history, see the [[Changelog|changelog]].
