---
title: Configuring a specific folder for Quartz content
description: Guide on how to configure a specific folder in your vault for Quartz instead of your entire vault.
created: 2025-05-16T11:22:39Z+0200
modified: 2026-04-01T17:15:09Z+0200
publish: true
tags: [guides]
---

> [!IMPORTANT] Mixed content vaults
>
> By default, Quartz Syncer assumes your entire vault is used for Quartz content. You can change this behavior by configuring a specific vault folder using the [[Vault root folder name]] setting.

## Configuring a specific vault folder

Open Quartz Syncer settings (`Settings > Community Plugin > Quartz Syncer`) and navigate to the `Vault root folder name` setting. Start typing the folder name in the search box. The search box in this setting automatically matches any folder in your Obsidian vault.

To use your entire vault, set the folder to `/` or leave the search box empty. This is the default behavior.

### Setting effects

> [!HINT] Don't forget to add an `index.md` to your configured vault folder
>
> This `index.md` note will serve as your Quartz website landing page.

When a folder other than the vault root (`/`) is configured, the following changes are made when compiling notes for Quartz:

- All internal links are rewritten to remove the path to the folder.
- If [[Settings/Integrations/Dataview|Dataview integration]] is enabled, all Dataview query results are rewritten to remove the path to the folder.
- All internal embeds links are rewritten to remove the path to the folder.

The final result that is deployed to your Quartz content folder is as if your configured folder is the root of your website.

## Excluding private folders without moving your notes

You can keep public folders at the top level of your vault alongside a private folder:

```text
Books/
Projects/
Private/
index.md
```

Set **Vault root folder** to `/`. Under **Frontmatter → Excluded folders**, enter `Private`. For multiple exclusions, enter one folder per line, such as:

```text
Private
Work/Confidential
```

Exclusions are literal paths relative to the **whole vault**, even when the publishing root is a subfolder. Each exclusion includes all descendants. Matching ignores letter case and normalizes Unicode and slash separators. `Private` excludes `Private/journal.md`, but not `Private-notes/article.md` or `Projects/Private/article.md`. Wildcards and parent traversal (`..`) are not accepted. An empty setting preserves existing behavior.

An excluded file cannot be published through the publication center, direct publishing, background publishing, or arbitrary-file publishing, even if it has `publish: true` or its special-file integration is enabled. Exclusions also take precedence over **All notes publishable by default**. With that option enabled, notes outside the excluded folders are eligible for manual selection without adding publication flags; it does not itself turn on automatic publishing.

A note embedding an excluded note or referencing an excluded attachment cannot be published. The entire publish batch stops with an error instead of uploading part of it. Attachment checks use the original vault path even when the exported link has been rewritten. Changing exclusions invalidates compiled caches, and changing them during preparation stops the publish.

### Generated content and existing publications

Vault-dependent integrations, such as Dataview and Datacore, can turn private notes into plain text without retaining their source paths. Their query compilation is blocked while exclusions are configured. Use reviewed static content in those notes instead; simply filtering generated links would not protect private query results. Ordinary static notes remain publishable.

Exclusions do not redact text you have already copied into a public note. Ordinary links do not copy their target notes and are not removed, so review link labels and paths if those are sensitive. A file already present in your repository remains there until you explicitly unpublish it; adding an exclusion does not remove Git history or previously deployed copies. Folder exclusions must be applied before the first upload, not only during the Quartz build.
