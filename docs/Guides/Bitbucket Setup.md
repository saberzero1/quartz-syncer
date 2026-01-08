---
title: Bitbucket Setup
description: Complete guide for setting up Quartz with Bitbucket and Bitbucket Pipelines.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-01-08T18:10:06Z+0100
publish: true
tags: [guides]
---

This guide covers setting up a Quartz repository on Bitbucket, configuring deployment, and connecting Quartz Syncer.

> [!NOTE] Bitbucket Hosting Options
> Bitbucket does not have a built-in static site hosting service like GitHub Pages. This guide covers deploying to external hosting services using Bitbucket Pipelines.

## Create a Quartz Repository

### Option 1: Import from GitHub

1. Log in to Bitbucket and go to your workspace.
2. Click **Create** > **Repository**.
3. Click **Import repository** in the top right.
4. Enter the Quartz URL: `https://github.com/jackyzha0/quartz.git`
5. Set your **Repository name** (e.g., `quartz`).
6. Click **Import repository**.

### Option 2: Create and Push Manually

1. Create a new repository on Bitbucket.
2. Clone Quartz locally:

   ```bash
   git clone https://github.com/jackyzha0/quartz.git
   cd quartz
   ```

3. Change the remote and push:

   ```bash
   git remote set-url origin https://bitbucket.org/<workspace>/<repository>.git
   git push -u origin v4
   ```

## Configure Deployment

Since Bitbucket doesn't have built-in static hosting, you'll need to deploy to an external service. Below are configurations for popular hosting options.

### Option 1: Deploy to Netlify

Create a file `bitbucket-pipelines.yml` in your repository root:

```yaml
image: node:22

pipelines:
  branches:
    v4:
      - step:
          name: Build and Deploy to Netlify
          caches:
            - node
          script:
            - npm ci
            - npx quartz build
            - npm install -g netlify-cli
            - netlify deploy --prod --dir=public --site=$NETLIFY_SITE_ID --auth=$NETLIFY_AUTH_TOKEN
```

Add these repository variables in **Repository settings** > **Pipelines** > **Repository variables**:

- `NETLIFY_SITE_ID`: Your Netlify site ID
- `NETLIFY_AUTH_TOKEN`: Your Netlify personal access token

### Option 2: Deploy to Cloudflare Pages

```yaml
image: node:22

pipelines:
  branches:
    v4:
      - step:
          name: Build and Deploy to Cloudflare
          caches:
            - node
          script:
            - npm ci
            - npx quartz build
            - npm install -g wrangler
            - wrangler pages deploy public --project-name=$CF_PROJECT_NAME
```

Add these repository variables:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CF_PROJECT_NAME`: Your Cloudflare Pages project name

### Option 3: Deploy to Vercel

```yaml
image: node:22

pipelines:
  branches:
    v4:
      - step:
          name: Build and Deploy to Vercel
          caches:
            - node
          script:
            - npm ci
            - npx quartz build
            - npm install -g vercel
            - vercel deploy --prod --token=$VERCEL_TOKEN public
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
   - **Branch**: `v4` (or your Quartz branch)
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

Instead of using Bitbucket Pipelines, you can connect your hosting service directly to Bitbucket:

### Netlify

1. Log in to Netlify.
2. Click **Add new site** > **Import an existing project**.
3. Select Bitbucket and authorize.
4. Select your Quartz repository.
5. Configure build settings:
   - **Build command**: `npx quartz build`
   - **Publish directory**: `public`

### Cloudflare Pages

1. Log in to Cloudflare Dashboard.
2. Go to **Workers & Pages** > **Create application** > **Pages**.
3. Connect to Git and select Bitbucket.
4. Select your repository and configure:
   - **Build command**: `npx quartz build`
   - **Build output directory**: `public`

### Vercel

1. Log in to Vercel.
2. Click **Add New** > **Project**.
3. Import from Bitbucket.
4. Configure:
   - **Build Command**: `npx quartz build`
   - **Output Directory**: `public`
