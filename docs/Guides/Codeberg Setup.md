---
title: Codeberg Setup
description: Complete guide for setting up Quartz v5 with Codeberg and Codeberg Pages.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

This guide covers setting up a Quartz v5 repository on Codeberg, configuring Codeberg Pages for automatic deployment, and connecting Quartz Syncer.

Codeberg is a free, community-driven Git hosting service powered by Gitea.

## Create a Quartz Repository

### Option 1: Migrate from GitHub (Recommended)

1. Log in to your Codeberg account.
2. Click the **+** button in the top right and select **New Migration**.
3. Select **GitHub** as the source.
4. Enter the Quartz repository URL: `https://github.com/jackyzha0/quartz`
5. Set your **Repository name** (e.g., `quartz`).
6. Click **Migrate Repository**. All branches (including `v5`) are included automatically.

### Option 2: Create Empty and Push

1. Create a new repository on Codeberg.
2. Clone Quartz locally, switch to the v5 branch, change the remote, and push:

   ```bash
   git clone https://github.com/jackyzha0/quartz.git
   cd quartz
   git checkout v5
   git remote set-url origin https://codeberg.org/<username>/quartz.git
   git push -u origin v5
   ```

## Set v5 as the Default Branch

The upstream Quartz repository currently defaults to `v4`. Change your repository's default branch to `v5`:

1. Go to your repository on Codeberg.
2. Navigate to **Settings** > **Branches**.
3. Change the default branch to `v5`.
4. Save the change.

> [!NOTE] Quartz v5 is in beta
> Quartz v5 is currently in beta and not yet the default upstream branch. Once v5 leaves beta it will become the default, and this step will no longer be necessary. See the [upstream migration guide](https://quartz.jzhao.xyz/migrating) if you are migrating existing content from v4.

## Clone and Install

Clone your Codeberg repository and install dependencies:

```bash
git clone https://codeberg.org/<username>/<repository>.git
cd <repository>
git checkout v5
npm ci
```

To pull future Quartz updates, add the upstream repository as a remote:

```bash
git remote add upstream https://github.com/jackyzha0/quartz.git
```

## Run the Setup Wizard

Quartz v5 uses an interactive setup command to create `quartz.config.yaml` and install all required plugins:

```bash
npx quartz create
```

Pick a template (`default`, `obsidian`, `ttrpg`, or `blog`), set your base URL (e.g. `<username>.codeberg.page`), and choose a content strategy. The `obsidian` template is recommended when publishing from an Obsidian vault. Commit the generated config and lockfile:

```bash
git add quartz.config.yaml quartz.lock.json
git commit -m "Initial Quartz v5 setup"
git push
```

## Configure Codeberg Pages

Codeberg Pages serves static content from a separate repository named `pages`. You need to create this repository before setting up deployment.

### Create the Pages Repository

1. Create a new repository on Codeberg named **`pages`**.
2. Your site will be available at `<username>.codeberg.page` once content is pushed to this repository.

> [!NOTE] How Codeberg Pages works
> Unlike GitHub Pages, Codeberg Pages does not build your site. It only serves static files from the `pages` repository. You need a CI pipeline or manual process to build Quartz and push the output to that repository.

### Option 1: Using Forgejo Actions

Codeberg supports [Forgejo Actions](https://docs.codeberg.org/ci/forgejo-actions/), a CI system with syntax similar to GitHub Actions. This is the simplest automated deployment option.

Create the directory `.forgejo/workflows/` and add a workflow file:

```yaml title=".forgejo/workflows/deploy.yml"
on:
  push:
    branches:
      - v5

jobs:
  deploy:
    runs-on: docker
    steps:
      - uses: https://code.forgejo.org/actions/checkout@v4
      - uses: https://code.forgejo.org/actions/setup-node@v4
        with:
          node-version: 24
      - name: Install dependencies
        run: npm ci
      - name: Install Quartz plugins
        run: npx quartz plugin install
      - name: Build Quartz
        run: npx quartz build
      - name: Deploy to Codeberg Pages
        uses: https://codeberg.org/git-pages/action@v2
        with:
          site: "https://${{ forge.repository_owner }}.codeberg.page/"
          token: ${{ forge.token }}
          source: public/
```

> [!TIP] Plugin install is mandatory in v5
> Quartz v5 downloads community plugins into `.quartz/plugins/` at build time. The `npx quartz plugin install` step **must** run before `npx quartz build`, otherwise the build will fail.

### Option 2: Using Woodpecker CI

Codeberg also offers [Woodpecker CI](https://docs.codeberg.org/ci/) as a hosted CI service.

> [!IMPORTANT] Woodpecker CI requires access approval
> Woodpecker CI access is not automatic. You must [request access](https://codeberg.org/Codeberg-e.V./requests/issues/new?template=ISSUE_TEMPLATE%2fWoodpecker-CI.yaml) and wait for approval before pipelines will run. CI resources are shared and limited — keep your builds efficient.

Create a new file `.woodpecker.yml` in the root of your repository:

```yaml title=".woodpecker.yml"
steps:
  build:
    image: node:24
    commands:
      - npm ci
      - npx quartz plugin install
      - npx quartz build
    when:
      branch: v5

  deploy:
    image: alpine
    commands:
      - apk add --no-cache git
      - git config --global user.email "woodpecker@noreply.codeberg.org"
      - git config --global user.name "Woodpecker CI"
      - cd public
      - git init
      - git add -A
      - git commit -m "Deploy to Codeberg Pages"
      - git push -f https://$CI_REPO_OWNER:$CI_FORGE_TOKEN@codeberg.org/$CI_REPO_OWNER/pages.git HEAD:main
    when:
      branch: v5
```

> [!TIP] Plugin install is mandatory in v5
> Quartz v5 downloads community plugins into `.quartz/plugins/` at build time. The `npx quartz plugin install` step **must** run before `npx quartz build`, otherwise the build will fail.

> [!WARNING] Force push
> The deploy step force-pushes to the `pages` repository, replacing its entire history on every deployment. This is expected — the `pages` repository only needs to contain the latest build output.

### Option 3: Manual Deployment

If you prefer not to use CI, you can manually build and deploy:

1. Install plugins and build Quartz locally:

   ```bash
   npx quartz plugin install
   npx quartz build
   ```

2. Push the contents of the `public` folder to the `pages` repository.

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
   - **Branch**: `v5`
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

Don't forget to update `baseUrl` in `quartz.config.yaml` to match your custom domain.

> [!NOTE] HTTPS
> Codeberg Pages automatically provisions SSL certificates for custom domains.
