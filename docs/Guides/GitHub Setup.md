---
title: GitHub Setup
description: Complete guide for setting up Quartz v5 with GitHub and GitHub Pages.
created: 2025-05-15T00:00:00Z+0200
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

This guide covers setting up a Quartz v5 repository on GitHub, configuring GitHub Pages for automatic deployment, and connecting Quartz Syncer.

## Create a Quartz Repository

If you haven't set up a Quartz repository on GitHub yet, [click here](https://github.com/new?template_name=quartz&template_owner=jackyzha0) to create one using the official Quartz template.

## Check out the v5 Branch

Clone your new repository locally, switch to the `v5` branch, and push it to your fork:

```bash
git clone https://github.com/<username>/<repository>.git
cd <repository>
git remote add upstream https://github.com/jackyzha0/quartz.git
git fetch upstream v5
git checkout -b v5 upstream/v5
npm ci
git push -u origin v5
```

> [!NOTE] Upstream default branch
> The upstream Quartz repository still defaults to `v4`. You need to explicitly create the `v5` branch on your fork as shown above. See the [upstream migration guide](https://quartz.jzhao.xyz/migrating) if you are migrating existing content from v4.

## Run the Setup Wizard

Quartz v5 uses an interactive setup command to create `quartz.config.yaml` and install all required plugins:

```bash
npx quartz create
```

Pick a template (`default`, `obsidian`, `ttrpg`, or `blog`), set your base URL (e.g. `<username>.github.io/<repository>`), and choose a content strategy. The `obsidian` template is recommended when publishing from an Obsidian vault.

Commit the generated `quartz.config.yaml` and `quartz.lock.json`:

```bash
git add quartz.config.yaml quartz.lock.json
git commit -m "Initial Quartz v5 setup"
git push
```

## Configure GitHub Pages

### Enable GitHub Pages

1. Go to your repository on GitHub.
2. Navigate to **Settings** > **Pages**.
3. Under **Source**, select **GitHub Actions**.

### Add the Deploy Workflow

Create a new file `.github/workflows/deploy.yml` in your repository with the following content:

```yaml title=".github/workflows/deploy.yml"
name: Deploy Quartz site to GitHub Pages

on:
  push:
    branches:
      - v5

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0 # Fetch all history for git info
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - name: Cache dependencies
        uses: actions/cache@v5
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-
      - name: Cache Quartz plugins
        uses: actions/cache@v5
        with:
          path: .quartz/plugins
          key: ${{ runner.os }}-plugins-${{ hashFiles('quartz.lock.json') }}
          restore-keys: |
            ${{ runner.os }}-plugins-
      - name: Install Dependencies
        run: npm ci
      - name: Install Quartz plugins
        run: npx quartz plugin install
      - name: Build Quartz
        run: npx quartz build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: public

  deploy:
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> [!TIP] Plugin install is mandatory in v5
> Quartz v5 downloads community plugins into `.quartz/plugins/` at build time. The `npx quartz plugin install` step **must** run before `npx quartz build`, otherwise the build will fail. The `.quartz/plugins` cache above keys on `quartz.lock.json` so plugins are only re-downloaded when you change your configuration.

Your site will be deployed to `<username>.github.io/<repository-name>`.

### Set v5 as the Default Branch

After verifying your workflow runs successfully on `v5`:

1. Go to your repository on GitHub.
2. Navigate to **Settings** > **General**.
3. Under **Default branch**, click the switch icon next to the current default branch.
4. Select `v5` from the dropdown and click **Update**.
5. Confirm the change.

This ensures new clones, pull requests, and GitHub Pages deployments all target v5.

## Generate an Access Token

> [!IMPORTANT] Token Expiration
> Fine-grained tokens expire after the specified date, with a maximum of one year. GitHub will email you when your token is about to expire.

### Fine-grained Access Token (Recommended)

1. Go to [GitHub's Personal Access Token page](https://github.com/settings/personal-access-tokens/new).
2. Set a **Token name** (e.g., `Quartz Syncer`).
3. Set an **Expiration** date.
4. Under **Repository access**, select **Only select repositories** and choose your Quartz repository.
5. Under **Permissions** > **Repository permissions**, set **Contents** to **Read and write**.
6. Click **Generate token**.
7. Copy the token immediately.

### Classic Access Token

> [!WARNING] Classic tokens have access to all your repositories. Use fine-grained tokens when possible.

1. Go to [GitHub's Classic Token page](https://github.com/settings/tokens/new?scopes=repo).
2. Add a **Note** and click **Generate token**.
3. Copy the token immediately.

## Configure Quartz Syncer

1. Open Obsidian and go to **Settings** > **Community Plugins** > **Quartz Syncer**.
2. In the **Git** settings tab:
   - **Remote URL**: `https://github.com/<username>/<repository>.git`
   - **Branch**: `v5`
   - **Provider**: GitHub
   - **Authentication Type**: Username & Token/Password
   - **Username**: Your GitHub username
   - **Access Token**: The token you generated

A green checkmark indicates a successful connection.

## Custom Domain (Optional)

1. In your repository, go to **Settings** > **Pages**.
2. Under **Custom domain**, enter your domain and click **Save**.
3. Configure your DNS:
   - **Apex domain** (`example.com`): Create `A` records pointing to:
	 - `185.199.108.153`
	 - `185.199.109.153`
	 - `185.199.110.153`
	 - `185.199.111.153`
   - **Subdomain** (`docs.example.com`): Create a `CNAME` record pointing to `<username>.github.io`.

Don't forget to update `baseUrl` in `quartz.config.yaml` to match your custom domain.
