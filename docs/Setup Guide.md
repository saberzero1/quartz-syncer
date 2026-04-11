---
title: Setup Guide
description: Instructions for setting up Quartz Syncer plugin.
created: 2025-05-05T12:00:00Z+0200
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

> [!WARNING] Set up Quartz first
> Quartz Syncer manages Quartz content from Obsidian. Please set up a Quartz v5 site on your Git provider before continuing.

> [!IMPORTANT] Quartz v5 required
> Quartz Syncer targets [Quartz v5](https://quartz.jzhao.xyz/). Quartz v4 configurations (`quartz.config.ts`, `quartz.layout.ts`) are no longer supported. If you are upgrading from v4, follow the [upstream migration guide](https://quartz.jzhao.xyz/migrating) first.

## Choose Your Git Provider

Quartz Syncer supports any Git provider. Choose your provider for complete setup instructions:

| Provider | Guide | Hosting |
|----------|-------|---------|
| **GitHub** | [[GitHub Setup]] | GitHub Pages (built-in) |
| **GitLab** | [[GitLab Setup]] | GitLab Pages (built-in) |
| **Codeberg** | [[Codeberg Setup]] | Codeberg Pages (built-in) |
| **Bitbucket** | [[Bitbucket Setup]] | Netlify, Cloudflare, Vercel |
| **Other** | See [Generic Setup](#generic-setup) below | Varies |

Each guide covers:

1. Creating a Quartz v5 repository
2. Running the `npx quartz create` setup wizard
3. Configuring automatic deployment
4. Generating an access token
5. Configuring Quartz Syncer

## Generic Setup

For Git providers not listed above, follow these general steps.

### 1. Create a Quartz Repository

Create a new repository on your Git provider (start from the [official Quartz template](https://github.com/new?template_name=quartz&template_owner=jackyzha0) on GitHub, then import or mirror it to your provider of choice). Make sure the `v5` branch is available on your remote.

Clone the repository locally:

```bash
git clone https://<provider>/<user>/<repo>.git
cd <repo>
git checkout v5
npm ci
```

### 2. Run the Quartz Setup Wizard

Quartz v5 ships an interactive setup command that writes `quartz.config.yaml` and installs all required plugins for you:

```bash
npx quartz create
```

Pick a template (`default`, `obsidian`, `ttrpg`, or `blog`), set your base URL, and choose how Quartz should treat your content folder. The `obsidian` template is recommended when publishing from an Obsidian vault.

> [!TIP] Non-interactive setup
> You can pass flags to skip the prompts: `npx quartz create --template obsidian --strategy new --baseUrl <your-site.example.com>`. See the [`quartz create` reference](https://quartz.jzhao.xyz/cli/create) for the full flag list.

### 3. Configure Hosting

Set up a CI/CD pipeline to build and deploy Quartz. The v5 build process **must** install plugins before building:

```bash
npm ci
npx quartz plugin install
npx quartz build
# Deploy the 'public' folder to your hosting service
```

For single-line build commands (Netlify, Cloudflare Pages, Vercel), use:

```bash
npx quartz plugin install && npx quartz build
```

Popular hosting options:

- [Netlify](https://netlify.com)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [Vercel](https://vercel.com)

See the [Quartz hosting documentation](https://quartz.jzhao.xyz/hosting) for provider-specific CI examples, caching strategies, and custom domain setup.

### 4. Set Your Default Branch to v5

After verifying your site builds and deploys, update your repository's default branch to `v5` so new clones, pull requests, and deployments all target v5. The exact steps vary by provider, but every modern Git host supports changing the default branch from the repository settings page.

### 5. Generate an Access Token

Create a personal access token (or app password) with **write** access to your Quartz repository. The exact steps vary by provider — see the provider-specific guide linked above, or consult your provider's documentation.

### 6. Configure Quartz Syncer

In Obsidian, go to **Settings** > **Community Plugins** > **Quartz Syncer** and configure:

| Setting | Value |
|---------|-------|
| **Remote URL** | `https://<provider>/<user>/<repo>.git` |
| **Branch** | `v5` |
| **Provider** | Select your provider or "Custom" |
| **Authentication Type** | Username & Token/Password |
| **Username** | Your username (or `oauth2` for some providers) |
| **Access Token** | Your generated token |

A green checkmark indicates a successful connection.

## Configure Quartz

Quartz v5 uses YAML for its configuration. The `npx quartz create` wizard writes a working `quartz.config.yaml` for you, but you can edit it at any time. A minimal example:

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

> [!TIP] Editing the config from Obsidian
> Quartz Syncer can read and update `quartz.config.yaml` directly via the **Quartz** settings tab, so you don't need to leave Obsidian to change site-wide options.

After editing `quartz.config.yaml` (either directly or through Quartz Syncer), run `npx quartz plugin install` locally (or let your CI pipeline handle it) so any newly referenced plugins are downloaded into `.quartz/plugins/`.

See the upstream [configuration reference](https://quartz.jzhao.xyz/configuration) for the complete list of supported options and the [plugin list](https://quartz.jzhao.xyz/tags/plugin) for every available community plugin.

## That's It

You're ready to publish notes to Quartz using Quartz Syncer.

For usage instructions, see the [[Usage Guide]].
