---
title: Allow custom file publishing
description: Allow selecting arbitrary vault files in the Publication Center and publishing them outside the content folder.
created: 2026-08-30T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings/ui]
aliases: [Settings/UI/Arbitrary file publishing]
default_value: "false"
---

When enabled, the [[Usage Guide#Advanced tab|Advanced tab]] of the Publication Center gains an **Add file** button and a **Custom files** category, letting you publish vault files to paths in your Quartz repository that sit outside the [[Content folder|content folder]].

> [!WARNING] Advanced feature
>
> This exists for publishing things like a custom stylesheet, a Quartz layout file, or a static asset from your vault. Most people never need it. Normal notes and their media are published without it.

## Using it

1. Turn on **Allow custom file publishing** in `Settings` > `Quartz Syncer` > `UI`.
2. Open the Publication Center and switch to the **Advanced** tab.
3. Click **Add file** and pick a vault file. It is added to the **Custom files** category and remembered.
4. Select it and press Publish, the same as any other entry.

Selected custom files are also deletable: select them in **Custom files** and press Delete to remove them from the repository.

## Protected paths

Some paths are refused outright, because publishing over them would break your Quartz site or your repository:

- `package.json` and `package-lock.json`
- `tsconfig.json`
- `.gitignore`
- anything under `.github/`, `.git/` or `node_modules/`
- Quartz configuration files

Edit those in the repository itself, or through the [[Guides/Quartz Hub#Config tab|Quartz Hub's Config tab]].

## Quartz v4 repositories

Custom file publishing is **disabled** when a Quartz v4 repository is detected:

> Quartz v4 detected. Publishing files outside the content folder is disabled to avoid modifying the Quartz v4 site.

Publishing notes and media to v4 works normally — see [[Setup Guide#Quartz v4 and v5]].

## From the CLI

```bash
# Preview
obsidian quartz-syncer:publish action=arbitrary force dry-run

# Publish the configured custom files
obsidian quartz-syncer:publish action=arbitrary force
```

`force` is required. This publishes the files you added in the Publication Center — it does **not** publish your whole vault. See [[Guides/CLI#quartz-syncerpublish|the CLI guide]].
