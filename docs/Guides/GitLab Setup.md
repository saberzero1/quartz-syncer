---
title: GitLab Setup
description: Complete guide for setting up Quartz v5 with GitLab and GitLab Pages.
created: 2026-01-08T14:00:00Z+0100
modified: 2026-04-11T18:00:00Z+0200
publish: true
tags: [guides]
---

This guide covers setting up a Quartz v5 repository on GitLab, configuring GitLab Pages for automatic deployment, and connecting Quartz Syncer.

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

## Check out the v5 Branch

Clone your new GitLab repository locally and switch to `v5`:

```bash
git clone https://gitlab.com/<username>/<project>.git
cd <project>
git remote add upstream https://github.com/jackyzha0/quartz.git
git fetch upstream v5
git checkout -b v5 upstream/v5
npm ci
git push -u origin v5
```

> [!NOTE] Upstream default branch
> The upstream Quartz repository still defaults to `v4`. The steps above explicitly create a local `v5` branch from upstream and push it to your GitLab project. See the [upstream migration guide](https://quartz.jzhao.xyz/migrating) if you are migrating existing content from v4.

## Run the Setup Wizard

Quartz v5 uses an interactive setup command to create `quartz.config.yaml` and install all required plugins:

```bash
npx quartz create
```

Pick a template (`default`, `obsidian`, `ttrpg`, or `blog`), set your base URL (e.g. `<username>.gitlab.io/<project>`), and choose a content strategy. Commit the generated config and lockfile:

```bash
git add quartz.config.yaml quartz.lock.json
git commit -m "Initial Quartz v5 setup"
git push
```

## Configure GitLab Pages

### Add the CI/CD Configuration

Create a new file `.gitlab-ci.yml` in the root of your repository with the following content:

```yaml title=".gitlab-ci.yml"
stages:
  - build
  - deploy

image: node:24
cache:
  - key: npm-$CI_COMMIT_REF_SLUG
    paths:
      - .npm/
  - key: plugins-$CI_COMMIT_REF_SLUG
    paths:
      - .quartz/plugins/

build:
  stage: build
  rules:
    - if: '$CI_COMMIT_REF_NAME == "v5"'
  before_script:
    - hash -r
    - npm ci --cache .npm --prefer-offline
  script:
    - npx quartz plugin install
    - npx quartz build
  artifacts:
    paths:
      - public
  tags:
    - gitlab-org-docker

pages:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_REF_NAME == "v5"'
  script:
    - echo "Deploying to GitLab Pages..."
  artifacts:
    paths:
      - public
```

> [!TIP] Plugin install is mandatory in v5
> Quartz v5 downloads community plugins into `.quartz/plugins/` at build time. The `npx quartz plugin install` step **must** run before `npx quartz build`, otherwise the build will fail. The `.quartz/plugins/` cache above keys on the branch name so plugins persist across CI runs.

### Verify GitLab Pages is Enabled

1. Go to your repository on GitLab.
2. Navigate to **Deploy** > **Pages**.
3. GitLab Pages should be enabled by default for public projects.

Your site will be deployed to `<username>.gitlab.io/<project-name>`.

### Set v5 as the Default Branch

After verifying the pipeline runs successfully on `v5`:

1. Go to your repository on GitLab.
2. Navigate to **Settings** > **Repository** > **Branch defaults**.
3. Change the default branch to `v5`.
4. Save the change.

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
   - **Branch**: `v5`
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

Don't forget to update `baseUrl` in `quartz.config.yaml` to match your custom domain.

## Self-Managed GitLab

If you're using a self-managed GitLab instance:

1. Replace `gitlab.com` with your GitLab instance URL in the Remote URL.
2. Generate a token from your instance's Personal Access Tokens page.
3. Ensure GitLab Pages is enabled by your administrator.
