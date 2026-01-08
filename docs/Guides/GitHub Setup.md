---
title: GitHub Setup
description: Complete guide for setting up Quartz with GitHub and GitHub Pages.
created: 2025-05-15T00:00:00Z+0200
modified: 2026-01-08T17:24:14Z+0100
publish: true
tags: [guides]
---

This guide covers setting up a Quartz repository on GitHub, configuring GitHub Pages for automatic deployment, and connecting Quartz Syncer.

## Create a Quartz Repository

If you haven't set up a Quartz repository on GitHub yet, [click here](https://github.com/new?template_name=quartz&template_owner=jackyzha0) to create one using the official Quartz template.

## Configure GitHub Pages

### Enable GitHub Pages

1. Go to your repository on GitHub.
2. Navigate to **Settings** > **Pages**.
3. Under **Source**, select **GitHub Actions**.

### Add the Deploy Workflow

Create a new file `.github/workflows/deploy.yml` in your repository with the following content:

```yaml
name: Deploy Quartz site to GitHub Pages

on:
  push:
    branches:
      - v4

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install Dependencies
        run: npm ci
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

Your site will be deployed to `<username>.github.io/<repository-name>`.

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
   - **Branch**: `v4` (or your Quartz branch)
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
