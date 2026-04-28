---
title: Bitbucket Setup
description: Complete guide for setting up Quartz v5 with Bitbucket and Bitbucket Pipelines.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

This guide covers setting up a Quartz v5 repository on Bitbucket, configuring deployment, and connecting Quartz Syncer.

> [!NOTE] Bitbucket Hosting Options
> Bitbucket does not have a built-in static site hosting service like GitHub Pages. This guide covers deploying to external hosting services using Bitbucket Pipelines.

## Create a Quartz Repository

### Option 1: Import from GitHub

1. Log in to Bitbucket and go to your workspace.
2. Click **Create** > **Repository**.
3. Click **Import repository** in the top right.
4. Enter the Quartz URL: `https://github.com/jackyzha0/quartz.git`
5. Set your **Repository name** (e.g., `quartz`).
6. Click **Import repository**. All branches (including `v5`) are imported automatically.

### Option 2: Create and Push Manually

1. Create a new repository on Bitbucket.
2. Clone Quartz locally, switch to the v5 branch, change the remote, and push:

   ```bash
   git clone https://github.com/jackyzha0/quartz.git
   cd quartz
   git checkout v5
   git remote set-url origin https://bitbucket.org/<workspace>/<repository>.git
   git push -u origin v5
   ```

## Set v5 as the Default Branch

The upstream Quartz repository currently defaults to `v4`. Change your repository's default branch to `v5`:

1. Go to your repository on Bitbucket.
2. Navigate to **Repository settings** > **Repository details**.
3. Change the **Main branch** to `v5`.
4. Save the change.

> [!NOTE] Quartz v5 is in beta
> Quartz v5 is currently in beta and not yet the default upstream branch. Once v5 leaves beta it will become the default, and this step will no longer be necessary. See the [upstream migration guide](https://quartz.jzhao.xyz/migrating) if you are migrating existing content from v4.

## Clone and Install

Clone your Bitbucket repository and install dependencies:

```bash
git clone https://bitbucket.org/<workspace>/<repository>.git
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

Pick a template (`default`, `obsidian`, `ttrpg`, or `blog`), set your base URL (e.g. your Netlify/Cloudflare/Vercel domain), and choose a content strategy. The `obsidian` template is recommended when publishing from an Obsidian vault. Commit the generated config and lockfile:

```bash
git add quartz.config.yaml quartz.lock.json
git commit -m "Initial Quartz v5 setup"
git push
```

## Configure Deployment

Since Bitbucket doesn't have built-in static hosting, you'll need to deploy to an external service. Below are configurations for popular hosting options.

> [!TIP] Plugin install is mandatory in v5
> Quartz v5 downloads community plugins into `.quartz/plugins/` at build time. Every pipeline below runs `npx quartz plugin install` before `npx quartz build`. If you skip it, the build will fail.

### Option 1: Deploy to Netlify

Create a file `bitbucket-pipelines.yml` in your repository root:

```yaml title="bitbucket-pipelines.yml"
image: node:24

pipelines:
  branches:
    v5:
      - step:
          name: Build and Deploy to Netlify
          caches:
            - node
          script:
            - npm ci
            - npx quartz plugin install
            - npx quartz build
            - npm install -g netlify-cli
            - netlify deploy --prod --dir=public --site=$NETLIFY_SITE_ID --auth=$NETLIFY_AUTH_TOKEN
```

Add these repository variables in **Repository settings** > **Pipelines** > **Repository variables**:

- `NETLIFY_SITE_ID`: Your Netlify site ID
- `NETLIFY_AUTH_TOKEN`: Your Netlify personal access token

### Option 2: Deploy to Cloudflare Pages

```yaml title="bitbucket-pipelines.yml"
image: node:24

pipelines:
  branches:
    v5:
      - step:
          name: Build and Deploy to Cloudflare
          caches:
            - node
          script:
            - npm ci
            - npx quartz plugin install
            - npx quartz build
            - npx wrangler pages deploy public --project-name=$CF_PROJECT_NAME
```

Add these repository variables:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CF_PROJECT_NAME`: Your Cloudflare Pages project name

### Option 3: Deploy to Vercel

```yaml title="bitbucket-pipelines.yml"
image: node:24

pipelines:
  branches:
    v5:
      - step:
          name: Build and Deploy to Vercel
          caches:
            - node
          script:
            - npm ci
            - npx quartz plugin install
            - npx quartz build
            - npx vercel deploy --prod --yes --token=$VERCEL_TOKEN public
```

Add this repository variable:

- `VERCEL_TOKEN`: Your Vercel access token

### Enable Bitbucket Pipelines

1. Go to your repository on Bitbucket.
2. Navigate to **Repository settings** > **Pipelines** > **Settings**.
3. Enable Pipelines.

## Generate an App Password

Bitbucket uses App Passwords for API authentication instead of Personal Access Tokens.

1. Click your profile avatar in the bottom left and select **Personal settings**.
2. Under **Access management**, click **App passwords**.
3. Click **Create app password**.
4. Enter a **Label** (e.g., `Quartz Syncer`).
5. Under **Permissions**, select:
   - **Repositories**: **Write** (this includes Read)
6. Click **Create**.
7. Copy the generated password immediately.

> [!WARNING] Password Security
> The app password is only shown once. Store it securely.

## Configure Quartz Syncer

1. Open Obsidian and go to **Settings** > **Community Plugins** > **Quartz Syncer**.
2. In the **Git** settings tab:
   - **Remote URL**: `https://bitbucket.org/<workspace>/<repository>.git`
   - **Branch**: `v5`
   - **Provider**: Bitbucket
   - **Authentication Type**: Username & Token/Password
   - **Username**: `x-token-auth` (when using an App Password)
   - **Access Token**: The app password you generated

A green checkmark indicates a successful connection.

> [!TIP] Username Options
> You can use either `x-token-auth` or your Bitbucket username. Using `x-token-auth` is the standard method for App Passwords.

## Bitbucket Server (Self-Hosted)

If you're using Bitbucket Server (Data Center):

1. Replace `bitbucket.org` with your Bitbucket Server URL.
2. Generate an HTTP Access Token:
   - Go to **Profile** > **Manage account** > **HTTP access tokens**
   - Create a token with **Repository write** permission
3. Use your Bitbucket Server username in the Username field.

## Alternative: Direct Hosting Service Integration

Instead of using Bitbucket Pipelines, you can connect your hosting service directly to Bitbucket. In every case, the build command must install plugins before building.

### Netlify

1. Log in to Netlify.
2. Click **Add new site** > **Import an existing project**.
3. Select Bitbucket and authorize.
4. Select your Quartz repository.
5. Configure build settings:
   - **Branch to deploy**: `v5`
   - **Build command**: `npx quartz plugin install && npx quartz build`
   - **Publish directory**: `public`

### Cloudflare Pages

1. Log in to Cloudflare Dashboard.
2. Go to **Workers & Pages** > **Create application** > **Pages**.
3. Connect to Git and select Bitbucket.
4. Select your repository and configure:
   - **Production branch**: `v5`
   - **Build command**: `npx quartz plugin install && npx quartz build`
   - **Build output directory**: `public`

### Vercel

1. Log in to Vercel.
2. Click **Add New** > **Project**.
3. Import from Bitbucket.
4. Configure:
   - **Production Branch**: `v5`
   - **Build Command**: `npx quartz plugin install && npx quartz build`
   - **Output Directory**: `public`
