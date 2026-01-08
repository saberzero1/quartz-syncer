---
title: Codeberg Setup
description: Complete guide for setting up Quartz with Codeberg and Codeberg Pages.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-01-08T17:24:14Z+0100
publish: true
tags: [guides]
---

This guide covers setting up a Quartz repository on Codeberg, configuring Codeberg Pages for automatic deployment, and connecting Quartz Syncer.

Codeberg is a free, community-driven Git hosting service powered by Gitea.

## Create a Quartz Repository

### Option 1: Migrate from GitHub (Recommended)

1. Log in to your Codeberg account.
2. Click the **+** button in the top right and select **New Migration**.
3. Select **GitHub** as the source.
4. Enter the Quartz repository URL: `https://github.com/jackyzha0/quartz`
5. Set your **Repository name** (e.g., `quartz`).
6. Click **Migrate Repository**.

### Option 2: Create Empty and Push

1. Create a new repository on Codeberg.
2. Clone Quartz locally:

   ```bash
   git clone https://github.com/jackyzha0/quartz.git
   cd quartz
   ```

3. Change the remote and push:

   ```bash
   git remote set-url origin https://codeberg.org/<username>/quartz.git
   git push -u origin v4
   ```

## Configure Codeberg Pages

Codeberg Pages uses a special branch called `pages` or a separate repository named `pages` to serve static content. For Quartz, we recommend using Codeberg CI (Woodpecker) to build and deploy.

### Option 1: Using Codeberg CI (Woodpecker)

Create a new file `.woodpecker.yml` in the root of your repository:

```yaml
steps:
  build:
    image: node:22
    commands:
      - npm ci
      - npx quartz build
    when:
      branch: v4

  deploy:
    image: alpine
    secrets: [mail]
    commands:
      - apk add --no-cache git openssh-client
      - git config --global user.email "$MAIL"
      - git config --global user.name "Woodpecker CI"
      - cd public
      - git init
      - git add -A
      - git commit -m "Deploy to Codeberg Pages"
      - git push -f https://$CI_REPO_OWNER:$CI_FORGE_TOKEN@codeberg.org/$CI_REPO_OWNER/pages.git HEAD:main
    when:
      branch: v4
```

> [!NOTE] Pages Repository
> This workflow pushes the built site to a separate `pages` repository. Create a repository named `pages` on Codeberg first.

### Option 2: Manual Deployment

If you prefer not to use CI, you can manually build and deploy:

1. Build Quartz locally: `npx quartz build`
2. Create a repository named `pages` on Codeberg
3. Push the contents of the `public` folder to the `pages` repository

### Enable Codeberg Pages

1. Create a repository named `pages` (or `<username>.codeberg.page` for a custom domain).
2. Your site will be available at `<username>.codeberg.page`.

> [!TIP] Project Pages
> For project-specific pages, create a `.domains` file in your pages repository containing your desired subdomain.

## Generate an Access Token

1. Log in to your Codeberg account.
2. Go to [Settings > Applications](https://codeberg.org/user/settings/applications).
3. Under **Manage Access Tokens**, click **Generate New Token**.
4. Enter a **Token Name** (e.g., `Quartz Syncer`).
5. Select the **repository** scope (or leave default for all permissions).
6. Click **Generate Token**.
7. Copy the generated token immediately.

> [!WARNING] Token Security
> The token is only shown once. Store it securely.

## Configure Quartz Syncer

1. Open Obsidian and go to **Settings** > **Community Plugins** > **Quartz Syncer**.
2. In the **Git** settings tab:
   - **Remote URL**: `https://codeberg.org/<username>/<repository>.git`
   - **Branch**: `v4` (or your Quartz branch)
   - **Provider**: Gitea / Codeberg
   - **Authentication Type**: Username & Token/Password
   - **Username**: Your Codeberg username
   - **Access Token**: The token you generated

A green checkmark indicates a successful connection.

## Custom Domain (Optional)

1. Create a file named `.domains` in your pages repository.
2. Add your domain(s), one per line:

   ```
   docs.example.com
   ```

3. Configure your DNS:
   - **Subdomain**: Create a `CNAME` record pointing to `<username>.codeberg.page`
   - **Apex domain**: Create a `CNAME` record pointing to `<username>.codeberg.page` (if your DNS provider supports CNAME flattening) or use a redirect service.

> [!NOTE] HTTPS
> Codeberg Pages automatically provisions SSL certificates for custom domains.
