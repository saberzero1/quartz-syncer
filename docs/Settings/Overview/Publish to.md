---
title: Publish to
description: Where publishing writes — a remote Git repository or a local Quartz folder.
created: 2026-10-01T12:00:00Z+0200
modified: 2026-10-01T12:00:00Z+0200
publish: true
tags: [settings, settings/overview]
default_value: "`Remote repository`"
---

Quartz Syncer can publish to two different places. This setting picks which one, and it is the only thing that picks it.

| Option | Where notes are written | Availability |
| --- | --- | --- |
| **Remote repository** (default) | Committed and pushed to the Git remote configured under [[Settings/Git/index\|Git settings]]. | All platforms |
| **Local folder (desktop only)** | Written straight into the Quartz checkout at [[Local Quartz repo path]]. No commit, no push. | Desktop only |

> [!IMPORTANT] The destination is never guessed
>
> Earlier versions inferred the destination from whatever happened to be configured. They no longer do. If you select a destination that is not configured, Quartz Syncer tells you so instead of quietly publishing somewhere else.

## Choosing local publishing

Publishing to a local folder is useful when you already keep a Quartz checkout on disk and want to control the Git side yourself — or not use Git at all, for example when building and deploying locally.

With local publishing selected, Quartz Syncer writes compiled notes and media directly into the content folder of the checkout at [[Local Quartz repo path]]. Committing and deploying is then your job; the [[Guides/Quartz Hub|Quartz Hub]] and [[Guides/CLI#quartz-syncerquartz-sync|`quartz-sync` CLI command]] can do it for you.

> [!NOTE] The local repo path has a second, separate job
>
> [[Local Quartz repo path]] is also what Quartz *site management* uses — builds, local preview, plugin management, config editing, templates and upgrades. Those read the path regardless of what **Publish to** is set to, so selecting **Remote repository** does not disable the Quartz Hub, and you never need to clear the path to switch destinations.

## On mobile

Local publishing cannot work on mobile, because it depends on desktop file and command access.

If **Publish to** is set to the local folder and you open your vault on mobile:

- If a Git remote is configured, Quartz Syncer publishes to the remote instead and tells you: *"Local publishing is desktop only, so this device publishes to the remote."*
- If no Git remote is configured, nothing resolves, and you are prompted to set one up.

Either way your local repo path is preserved, so your desktop keeps publishing locally. This is the only automatic override Quartz Syncer performs.

## When no destination resolves

If the selected destination is not usable, Quartz Syncer refuses to pick the other one. The Overview replaces the Status row with the specific problem and a button that fixes it:

| Problem | Message | The button opens |
| --- | --- | --- |
| No repository at all | *No repository configured.* | The [[Setup Guide#Quick setup with the onboarding wizard\|setup wizard]] on desktop, manual setup on mobile |
| Local selected, no local path | *Publish target is the local folder, but no local Quartz repo path is set.* | The [[Guides/Quartz Hub\|Quartz Hub]], to link a checkout |
| Remote selected, no remote URL | *Publish target is the remote, but no git remote URL is set.* | The setup wizard, or manual setup |
| Local selected, on mobile | *Local publishing is desktop only…* | The setup wizard, or manual setup |

In each of the middle three cases the other destination *is* configured — so switching **Publish to** back is also a valid fix, and usually the faster one.

While nothing resolves, the [[Settings/index#Status bar|status bar]] reads `Quartz Syncer: not configured`.

## Readiness warnings

A destination can resolve and still be unable to publish. These problems appear as an inline warning under **Publish to** rather than replacing the Status row:

| Warning | Fix |
| --- | --- |
| *No branch is set, so publishing cannot run.* | Set [[Branch]]. |
| *No token is stored, so publishing to the remote will fail authentication.* | Save an [[Access token]]. |
| *The local Quartz repo path does not exist, so publishing will fail.* | Correct [[Local Quartz repo path]]. |
| *The local Quartz repo path is not a directory, so publishing will fail.* | Point the path at the repository folder, not a file inside it. |
| *No Quartz config was found at the local repo path, so publishing may go to the wrong folder.* | Check that the path is a Quartz checkout — it should contain a `quartz.config.*` file. |
| *Desktop commands are off, so Quartz builds, preview and plugin management are unavailable. Publishing is unaffected.* | Turn on [[Enable system commands]], if you want Quartz management. |

## Where else the destination shows up

- **Publication Center** — the footer reads `Publishing to local folder` or `Publishing to remote`, and the publish button is labelled to match. If nothing resolves, the blocker text is shown there too.
- **Connection test** — [[Settings/Git/index#Connection test|testing the connection]] and [[Guides/CLI#quartz-syncertest|`quartz-syncer:test`]] test the destination publishing actually uses. On a local destination the test validates the checkout instead of a network connection.
- **CLI** — [[Guides/CLI#quartz-syncerrepo|`quartz-syncer:repo action=info`]] reports the requested target, the effective target, whether it was overridden, and any blocker.

## Publish status is per destination

Publish status is a comparison against one destination's file tree, so it is cached per destination. Switching **Publish to** invalidates that cache and recomputes the status; results that arrive for the destination you just switched away from are discarded.

This is why switching destinations can briefly show a loading state in the Publication Center even when the status was warm a moment earlier.
