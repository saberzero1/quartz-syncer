---
title: Setup Guide
description: Instructions for setting up Quartz Syncer plugin.
created: 2025-05-05T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [guides]
---

> [!WARNING] Set up Quartz first
>
> Quartz Syncer manages Quartz content from Obsidian — it does not create your site for you, except through the [[#Quick setup with the onboarding wizard|onboarding wizard]]. Have a Quartz repository ready before continuing.

## Requirements

| Requirement | Needed for |
| --- | --- |
| Obsidian 1.13.0 or later | The plugin itself |
| A Quartz repository | Somewhere to publish to |
| [Node.js](https://nodejs.org/) 18 or later | Only for [[Guides/Quartz Hub\|Quartz site management]] — builds, preview, plugins, upgrades. Desktop only. |
| Node.js 22 or later, npm 10.9.2 or later | Only if you run the Quartz v5 CLI yourself. This is Quartz's requirement, not Quartz Syncer's. |

Publishing itself needs none of the Node requirements. Quartz Syncer talks to Git over HTTPS using a bundled JavaScript Git implementation, so there is no `git` binary to install and nothing to configure — on desktop or mobile.

## Quartz v4 and v5

Quartz Syncer supports both, asymmetrically:

| | Quartz v4 | Quartz v5 |
| --- | --- | --- |
| Publishing notes and media | Supported | Supported |
| Deleting and unpublishing | Supported | Supported |
| Publish status and diffs | Supported | Supported |
| [[Allow custom file publishing\|Publishing outside the content folder]] | Blocked | Supported |
| Config editing, plugin management, upgrades, layout, templates | Not available | Supported |

On a v4 repository Quartz Syncer reports:

> Quartz v4 detected. Publishing notes and media is supported; Quartz site management (config, plugins, upgrades) requires Quartz v5.

Two rendering differences matter if you stay on v4:

- **Custom task characters** such as `- [/]`, `- [?]` and `- [!]` are a v5 feature. Quartz Syncer publishes them unchanged, so v4 renders them literally.
- **URL casing** differs: v4 preserves the original casing of file and folder names, while v5 lowercases and hyphenates generated URLs. This affects how existing links resolve if you migrate. [[Enable permalinks]] sidesteps the difference.

To move from v4 to v5, follow the [upstream migration guide](https://quartz.jzhao.xyz/migrating).

## Choose where to publish

Quartz Syncer can publish to two different places, and it never guesses which. Decide before you configure anything:

| Destination | What happens | Requires |
| --- | --- | --- |
| **Remote repository** (default) | Compiled notes are committed and pushed to your Git remote | A [[Remote URL\|remote URL]], a [[Branch\|branch]], and an [[Access token\|access token]] |
| **Local folder** | Compiled notes are written straight into a Quartz checkout on disk. No commit, no push. | A [[Local Quartz repo path\|local repo path]]. Desktop only. |

Most people want **Remote repository**: a push triggers CI, which builds and deploys the site. Choose **Local folder** if you prefer to run Git and the build yourself.

The setting is [[Publish to]], on the Overview settings screen. See that page for what happens on mobile and when a destination is misconfigured.

## Quick setup with the onboarding wizard

If you use GitHub, the wizard is the fastest route. Run `Quartz Syncer: Setup wizard` from the command palette.

> [!NOTE] Desktop only
>
> The wizard needs desktop capabilities. On mobile, use [[#Manual setup]].

It walks five steps:

1. **Choose method** — pick one of two flows:
   - **Create new Quartz site** — makes a new GitHub repository from the Quartz template.
   - **Connect existing repository** — lists your GitHub repositories so you can pick one.
2. **Enter token** — a GitHub personal access token. See [[Access token]] for the exact permissions.
3. **Name your site** (create flow) or **Select repository** (connect flow).
4. **Configure** — base URL and plugin settings.
5. **Done** — shows your site URL, with a button to open the Publication Center.

The create flow also adds the deploy workflow, writes an initial `content/index.md`, and tries to enable GitHub Pages. If any of those steps fails, the wizard tells you rather than claiming success — you may need to finish that part by hand.

> [!TIP] Already have a Quartz repository?
>
> Use the **Connect existing repository** flow, or skip the wizard entirely and jump to [[#5. Configure Quartz Syncer|step 5 of the generic setup]].

For other Git providers, follow the provider-specific guides below.

## Manual setup

Mobile has no wizard. Run `Quartz Syncer: Manual setup` from the command palette for a single dialog covering every Git field — remote URL, branch, authentication type, username, token, CORS proxy and content folder — plus a connection test and a save button.

The command is registered on desktop too, so it also works as a quicker alternative to the wizard when you already know your values.

## Choose your Git provider

| Provider | Guide | Hosting |
|----------|-------|---------|
| **GitHub** | [[GitHub Setup]] | GitHub Pages (built-in) |
| **GitLab** | [[GitLab Setup]] | GitLab Pages (built-in) |
| **Codeberg** | [[Codeberg Setup]] | Codeberg Pages (built-in) |
| **Bitbucket** | [[Bitbucket Setup]] | Netlify, Cloudflare, Vercel |
| **Other** | [[#Generic setup]] below | Varies |

Each guide covers creating the repository, running `npx quartz create`, configuring deployment, generating an access token, and configuring Quartz Syncer.

## Generic setup

For providers not listed above.

### 1. Create a Quartz repository

Create a new repository on your Git provider — start from the [official Quartz template](https://github.com/new?template_name=quartz&template_owner=jackyzha0) on GitHub, then import or mirror it to your provider of choice.

Clone it locally:

```bash
git clone https://<provider>/<user>/<repo>.git
cd <repo>
npm ci
```

### 2. Run the Quartz setup wizard

Quartz v5 ships an interactive setup command that writes `quartz.config.yaml` and installs the required plugins:

```bash
npx quartz create
```

Pick a template (`default`, `obsidian`, `ttrpg` or `blog`), set your base URL, and choose how Quartz should treat your content folder. The `obsidian` template is recommended when publishing from an Obsidian vault.

> [!TIP] Non-interactive setup
>
> Skip the prompts with flags: `npx quartz create --template obsidian --strategy new --baseUrl <your-site.example.com>`. See the [`quartz create` reference](https://quartz.jzhao.xyz/cli/create).

### 3. Configure hosting

Set up CI/CD to build and deploy Quartz. The v5 build **must** install plugins before building:

```bash
npm ci
npx quartz plugin install
npx quartz build
# Deploy the 'public' folder to your hosting service
```

For single-line build commands (Netlify, Cloudflare Pages, Vercel):

```bash
npx quartz plugin install && npx quartz build
```

Popular options: [Netlify](https://netlify.com), [Cloudflare Pages](https://pages.cloudflare.com), [Vercel](https://vercel.com). See the [Quartz hosting documentation](https://quartz.jzhao.xyz/hosting) for provider-specific CI examples and custom domains.

### 4. Generate an access token

Create a personal access token, or app password, with **write** access to your Quartz repository. The steps vary by provider — see the provider guide above, or [[Access token]] for the required permissions.

Skip this step if you are publishing to a [[Publish to|local folder]].

### 5. Configure Quartz Syncer

In Obsidian, open `Settings` > `Community plugins` > `Quartz Syncer`.

On the **Overview** screen:

| Setting | Value |
|---------|-------|
| [[Publish to]] | `Remote repository` |

Then on the **Git** screen:

| Setting | Value |
|---------|-------|
| [[Remote URL]] | `https://<provider>/<user>/<repo>.git` |
| [[Branch]] | Your repository's default branch — `v5` for the Quartz template |
| [[Provider]] | Your provider, or `Custom / self-hosted` |
| [[Authentication type]] | `Username & token/password` |
| [[Username]] | Your username, or `oauth2` / `x-token-auth` for some providers |
| [[Access token]] | Your generated token |
| [[Vault root folder]] | `/` for the whole vault, or a subfolder |

Press **Test connection** to confirm it works. Return to **Overview** — it should now show a **Status** row rather than a setup prompt.

> [!TIP] Publishing locally instead
>
> Set [[Publish to]] to `Local folder`, then set [[Local Quartz repo path]] on the desktop-only **Quartz** screen — or let the [[Guides/Quartz Hub#Setup tab|Quartz Hub]] link or clone a checkout for you. Nothing on the Git screen is needed except [[Branch]].

## Configure Quartz

Quartz v5 uses YAML for configuration. `npx quartz create` writes a working `quartz.config.yaml`, which you can edit at any time. A minimal example:

```yaml title="quartz.config.yaml"
configuration:
  pageTitle: Your Site Title
  baseUrl: your-site.example.com
  enableSPA: true
  locale: en-US
plugins:
  - source: github:quartz-community/obsidian-flavored-markdown
    enabled: true
  - source: github:quartz-community/syntax-highlighting
    enabled: true
```

> [!NOTE] `quartz.config.yaml` is optional
>
> Quartz v5 falls back to `quartz.config.default.yaml`. Your own `quartz.config.yaml` holds overrides only, so a fresh Quartz repository may not have one.

> [!TIP] Editing the config from Obsidian
>
> On desktop, the [[Guides/Quartz Hub#Config tab|Quartz Hub's Config tab]] reads and writes `quartz.config.yaml` in your local checkout, so you do not need to leave Obsidian. The [[Guides/CLI#quartz-syncerquartz-config|`quartz-config` CLI command]] does the same from the terminal. Both require a [[Local Quartz repo path|local checkout]] and Quartz v5.

After changing `quartz.config.yaml`, run `npx quartz plugin install` locally — or let CI do it — so newly referenced plugins are downloaded into `.quartz/plugins/`.

See the upstream [configuration reference](https://quartz.jzhao.xyz/configuration) and [plugin list](https://quartz.jzhao.xyz/tags/plugin).

## That's it

You're ready to publish. For usage instructions, see the [[Usage Guide]].
