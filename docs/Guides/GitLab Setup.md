---
title: GitLab Setup
description: Complete guide for setting up Quartz with GitLab and GitLab Pages.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-01-08T17:24:14Z+0100
publish: true
tags: [guides]
---

This guide covers setting up a Quartz repository on GitLab, configuring GitLab Pages for automatic deployment, and connecting Quartz Syncer.

## Create a Quartz Repository

### Option 1: Import from GitHub (Recommended)

1. Go to [GitLab's New Project page](https://gitlab.com/projects/new).
2. Select **Import project** > **Repository by URL**.
3. Enter the Quartz repository URL: `https://github.com/jackyzha0/quartz.git`
4. Set your **Project name** (e.g., `quartz`).
5. Set **Visibility Level** to your preference.
6. Click **Create project**.

### Option 2: Mirror from GitHub

If you want to keep your GitLab repository in sync with the upstream Quartz repository:

1. Create a new project as described above.
2. Go to **Settings** > **Repository** > **Mirroring repositories**.
3. Add `https://github.com/jackyzha0/quartz.git` as a mirror.

## Configure GitLab Pages

### Add the CI/CD Configuration

Create a new file `.gitlab-ci.yml` in the root of your repository with the following content:

```yaml
stages:
  - build
  - deploy
 
image: node:22
cache: # Cache modules in between jobs
  key: $CI_COMMIT_REF_SLUG
  paths:
    - .npm/
 
build:
  stage: build
  rules:
    - if: '$CI_COMMIT_REF_NAME == "v4"'
  before_script:
    - hash -r
    - npm ci --cache .npm --prefer-offline
  script:
    - npx quartz build
  artifacts:
    paths:
      - public
  tags:
    - gitlab-org-docker
 
pages:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_REF_NAME == "v4"'
  script:
    - echo "Deploying to GitLab Pages..."
  artifacts:
    paths:
      - public
```

> [!NOTE] Default Branch
> This configuration deploys when pushing to the default branch. If your Quartz content is on a different branch (e.g., `v4`), replace `$CI_DEFAULT_BRANCH` with your branch name.

### Verify GitLab Pages is Enabled

1. Go to your repository on GitLab.
2. Navigate to **Deploy** > **Pages**.
3. GitLab Pages should be enabled by default for public projects.

Your site will be deployed to `<username>.gitlab.io/<project-name>`.

## Generate an Access Token

1. Go to your [GitLab Personal Access Tokens page](https://gitlab.com/-/user_settings/personal_access_tokens).
2. Click **Add new token**.
3. Enter a **Token name** (e.g., `Quartz Syncer`).
4. Set an **Expiration date** (maximum 1 year).
5. Under **Select scopes**, check **write_repository**.
6. Click **Create personal access token**.
7. Copy the generated token immediately.

> [!IMPORTANT] Token Expiration
> GitLab tokens expire after the specified date. GitLab will email you when your token is about to expire.

## Configure Quartz Syncer

1. Open Obsidian and go to **Settings** > **Community Plugins** > **Quartz Syncer**.
2. In the **Git** settings tab:
   - **Remote URL**: `https://gitlab.com/<username>/<project>.git`
   - **Branch**: Your default branch (e.g., `main` or `v4`)
   - **Provider**: GitLab
   - **Authentication Type**: Username & Token/Password
   - **Username**: `oauth2` (when using a Personal Access Token)
   - **Access Token**: The token you generated

A green checkmark indicates a successful connection.

> [!TIP] Username Options
> You can use either `oauth2` or your GitLab username in the Username field. Using `oauth2` is recommended for Personal Access Tokens.

## Custom Domain (Optional)

1. In your repository, go to **Deploy** > **Pages**.
2. Click **New Domain**.
3. Enter your domain and click **Create New Domain**.
4. Configure your DNS:
   - **Apex domain** (`example.com`): Create an `A` record pointing to `35.185.44.232`
   - **Subdomain** (`docs.example.com`): Create a `CNAME` record pointing to `<username>.gitlab.io`
5. Optionally enable **Force HTTPS** after DNS verification.

## Self-Managed GitLab

If you're using a self-managed GitLab instance:

1. Replace `gitlab.com` with your GitLab instance URL in the Remote URL.
2. Generate a token from your instance's Personal Access Tokens page.
3. Ensure GitLab Pages is enabled by your administrator.
