# V2 divergences

Findings from the 2.2.0 documentation pass (`docs/`, October 2026). Three separate kinds of work are mixed together below, deliberately kept apart because they have different owners and different risk:

- **[Part 1 — Verification needed](#part-1--verification-needed)** — claims in the refreshed docs that were validated statically but never observed rendering or running.
- **[Part 2 — Capability dropped since v1](#part-2--capability-dropped-since-v1)** — functionality that existed in `1.18.0` and has no equivalent today. Product decisions, not bugs.
- **[Part 3 — Code defects and drift](#part-3--code-defects-and-drift)** — things the docs had to describe as-is, where the code is arguably wrong.

Baseline for every v1 comparison is tag `1.18.0`, the last v1 release. Note its entry point was a root-level `main.ts`; v2's is `src/main.ts`. Searching only `src/` will silently miss all of v1's command and settings registration.

Every claim below was verified against source at the cited location, or by `curl` against the live docs site. Where something was *not* verified, it says so.

---

## Part 1 — Verification needed

### 1.1 Escaped-pipe wikilinks in tables — highest risk

**What:** The refreshed docs contain roughly 40 instances of `[[Target\|label]]` inside Markdown tables. The backslash is required — an unescaped `|` would terminate the table cell.

**Why it needs checking:** The pre-existing docs never used this pattern. Aliased wikilinks appeared only in prose, where no escape is needed. This pattern is new in this pass, and it was validated only by static analysis, never by rendering a page.

**Risk:** Binary and highly visible. Either Quartz's wikilink transformer runs on the unescaped cell content and every link resolves, or it does not and ~40 links render as literal `[[Target\|label]]` text. It will not fail subtly.

**How to check:** Render any page with a settings table — `docs/Settings/index.md` has several — and confirm the table cells show linked labels rather than raw brackets. One page is enough to settle all of them.

**If it fails:** Replace the aliased form with the bare form inside tables (`[[Target]]`), which needs no escape. The affected files:

```
docs/Settings/index.md
docs/Settings/Overview/index.md
docs/Settings/Overview/Publish to.md
docs/Settings/Git/index.md
docs/Settings/Git/Access token.md
docs/Settings/Quartz/Content folder.md
docs/Setup Guide.md
docs/Usage Guide.md
docs/Guides/CLI.md
docs/Guides/Quartz Hub.md
```

A guard against regression, which also catches the inverse error of an escaped pipe in prose:

```bash
# An escaped pipe outside a table row renders the backslash literally.
grep -rn '\[\[[^]]*\\|' docs --include=*.md | grep -v '^\s*|'
```

### 1.2 Alias redirects for four renamed pages

Four pages were renamed to match their real UI labels, which changes their URLs. Each carries an `aliases` entry so the old URL redirects.

| Old URL | New URL |
|---|---|
| `settings/performance/auto-clean-orphaned-media` | `settings/performance/automatically-clean-orphaned-media` |
| `settings/note-properties/include-all-notes-by-default` | `settings/note-properties/all-notes-publishable-by-default` |
| `settings/note-properties/updated-timestamp-keys` | `settings/note-properties/modified-timestamp-keys` |
| `settings/ui/arbitrary-file-publishing` | `settings/ui/allow-custom-file-publishing` |

**Verified:** The alias emitter is active on the live site — `docs/index.md` declares `aliases: [home]` and `/quartz-syncer-docs/home` returns `200`.

**Not verified:** These four specific redirects, which cannot be confirmed until the site rebuilds. Check each old URL returns 200 or 30x after the next deploy.

Three further renames were **case-only** (`Access Token.md` → `Access token.md`, `Authentication Type.md` → `Authentication type.md`, `CORS Proxy.md` → `CORS proxy.md`). These are URL-neutral: the site lowercases paths, confirmed by `curl`, so both spellings produce the same URL. No redirect needed.

### 1.3 Dataview and Datacore index queries

`docs/Settings/Overview/` is a new folder, and several new pages were added to existing folders. The folder index pages list their contents via Dataview or Datacore queries, which could not be executed here.

- `docs/Settings/index.md` lists sub-folders via `startswith(file.folder, this.file.folder)` filtered to `file.name = "index"`. `Settings/Overview/index.md` should appear.
- Each folder index renders a `default_value` column. Every new page sets that field, using `n/a` for the two pages that document an action or a removed setting rather than a live control.
- `docs/Settings/Integrations/index.md` additionally filters on `file.frontmatter.description`; all new pages set one.

Confirm the Overview row appears in the top-level settings table and that no `default_value` cell is empty.

### 1.4 Documented from source reading, not from use

Accurate as far as the code goes, but not observed at runtime. Worth a glance if any of it drives user-facing decisions:

| Claim | Source | Doc |
|---|---|---|
| Hub **Layout** and **Templates** tab contents | `src/views/QuartzHub/LayoutTab.ts`, `TemplatesTab.ts` | `docs/Guides/Quartz Hub.md` |
| Status bar error-state tooltip carries the error message | `src/views/StatusBar.ts` | `docs/Settings/index.md` |
| Publish skips selected **Published** notes | `src/views/PublicationCenter/PublicationCenter.ts` | `docs/Usage Guide.md` |
| Preview takes 15–20s, `npm install` 30s+ | `AGENTS.md` timing table | `docs/Guides/Quartz Hub.md` |

---

## Part 2 — Capability dropped since v1

v1.18.0 registered **6** command-palette commands; v2 registers **5**, and **only one overlaps**.

| v1 command | `1.18.0:main.ts` | Status in v2 |
|---|---|---|
| `open-publish-modal` | 378 | Kept, renamed *Open Publication Center* |
| `mark-note-for-publish` | 386 | **Removed** |
| `unmark-note-for-publish` | 394 | **Removed** |
| `mark-toggle-publish-status` | 402 | **Removed** |
| `clear-cache-for-active-file` | 411 | **Removed** |
| `clear-cache-for-all-files` | 419 | **Removed** |

v2's five are in `src/main.ts:776-819`: `open-publish-modal`, `setup-wizard`, `open-hub`, `manual-setup`, `publish-status`.

Settings *keys* were checked separately and nothing was lost — v1's interface is a strict subset of v2's. The losses below are all UI affordances, not stored state.

The through-line: **capability migrated from UI to CLI, and the CLI is a desktop tool.** `registerCliHandlers` is called unconditionally (`src/main.ts:276`), so handlers exist on mobile, but the `obsidian` CLI is a remote control for the desktop app — there is no terminal on mobile to invoke it from. Every item below therefore lands hardest on mobile, which has no replacement path at all.

### 2.1 No UI route to clear the cache — most severe

v1 offered three ways; v2 offers none.

- Settings button *Clear cache* — `1.18.0:src/views/SettingsView/Views/PerformanceSettings.ts:46`, calling `datastore.dropAllFiles()`
- Command *Clear cache for active file* — `1.18.0:main.ts:411`
- Command *Clear cache for all files* — `1.18.0:main.ts:419`

v2 has no clear-cache affordance anywhere in `src/views/`. The only routes are `quartz-syncer:cache action=clear` and `action=clear-file`.

The button that does exist, *Clean up caches from other vaults*, is not a substitute: it deliberately **excludes** the current vault's caches. See the comment at `src/services/CacheMaintenanceService.ts:23` — *"Protect this vault's current caches, including its remote-dependent clone."* It cannot clear your own cache by design.

**Impact:** A user with a stale or corrupted cache has no in-app recovery. On desktop they need a terminal. On mobile the only workaround is toggling `useCache` off, which disables caching rather than clearing it.

**Suggested fix:** Restore a *Clear cache* button to the Performance settings page. The service method it needs (`dropAllFiles`) still exists.

### 2.2 No UI route to toggle the publish property

The three `mark-*` commands are gone. `src/cli/handlers/markHandler.ts` is now the **only** code path that writes the publish property — verified by searching all `publishFrontmatterKey` references. There is no file-menu or editor-menu item either: `src/main.ts` registers no `file-menu` or `editor-menu` handler.

**Impact:** Marking a note requires either Obsidian's properties editor by hand, a third-party plugin, or the CLI. This is the first thing a new user must do, and `docs/Usage Guide.md` now has to say so.

**Suggested fix:** Re-register the three commands as thin wrappers over the existing `markHandler` logic. Low cost, and it restores mobile parity.

### 2.3 Quartz theme and font configuration lost its UI

v1's `QuartzV5SettingsTab.ts` exposed:

| Control | Line in `1.18.0` |
|---|---|
| Header font | 1224 |
| Body font | 1234 |
| Code font | 1244 |
| CDN caching | 1255 |
| Use Quartz Themes | 1275 |
| Theme | 1444, 1462 |
| Variation | 1507 |

v2's `src/views/QuartzHub/ConfigTab.ts:121-150` exposes only `pageTitle`, `pageTitleSuffix`, `baseUrl`, `locale`, `enableSPA`, `enablePopovers`. No theme, font, or colour field exists anywhere in the Hub.

**Partially superseded:** reachable via `quartz-syncer:quartz-config` using `configuration.theme.*` keys. CLI-only, desktop-only.

### 2.4 Analytics and ignore patterns have no UI

v1 had *Analytics provider* (`1.18.0:…/QuartzV5SettingsTab.ts:1173`) and *Ignore patterns* (`:1186`). Neither exists in `ConfigTab.ts`.

Both **are** settable via the CLI, contrary to what the docs claimed for both v1 and the first draft of this pass — see [3.2](#32-cli-config-key-documentation-was-wrong-in-three-ways) below. So this is a UI gap rather than a total loss, but the only routes are the CLI and hand-editing YAML.

### 2.5 Per-page-type layout overrides became read-only

v1 could edit a page type's `Template` and `Excluded plugins` (`1.18.0:…/QuartzV5SettingsTab.ts:2127`).

v2's Layout tab contains exactly **one** editable input — plugin priority, at `src/views/QuartzHub/LayoutTab.ts:298`. Positions, groups and per-page-type overrides are displayed but not editable.

---

## Part 3 — Code defects and drift

### 3.1 `NodeDetector` floor is below what Quartz actually needs

`src/quartz/NodeDetector.ts:23` sets `MIN_NODE_MAJOR = 18`, gating on `major >= MIN_NODE_MAJOR` at line 51.

But `package.json` requires `node >=22.12.0`, `.nvmrc` pins `24.14.0`, and Quartz v5's own CLI wants Node 22+. A user on Node 18–21 therefore **passes** the Hub's availability check and then fails inside `npx quartz` with an error that does not mention Node at all.

`docs/Guides/Quartz Hub.md` currently documents the honest position — the detector accepts 18, but 22 is the practical floor — which is awkward precisely because the code is inconsistent.

**Suggested fix:** Raise `MIN_NODE_MAJOR` to 22 so the failure is caught at the gate with a clear message, then simplify the doc.

### 3.2 CLI config key documentation was wrong in three ways

All three errors predate this pass; they were inherited from the v1-era doc and have now been corrected in `docs/Guides/CLI.md`. Flagged here because each points at real code behaviour worth reviewing.

**(a) `config` keys are flat, not nested.** The docs showed `key=git.branch`. Settings were flattened in the schema v1→v2 migration (`src/main.ts:504-531`), so the correct key is `gitBranch`. Pinned by `test/unit/cli/handlers/configHandler.test.ts:29`.

**(b) `quartz-config` keys need a `configuration.` prefix.** The docs showed `key=pageTitle` and `key=theme.typography.header`. `src/cli/handlers/quartzConfigHandler.ts:38,58` resolves paths from the **root** of the config file, whose top-level keys are `configuration`, `plugins` and `layout`. A bare `pageTitle` returns `Config key not found`. Pinned by `test/unit/cli/handlers/quartzConfigHandler.test.ts:107`.

**(c) `analytics` and `ignorePatterns` are settable after all.** The docs claimed they "cannot be set via CLI due to their complex structure", and directed users to a settings UI that no longer exists. In fact `parseCliValue` (`src/cli/handlers/cliUtils.ts`) parses JSON objects and arrays, and `setValueByPath` walks nested paths, so both work:

```bash
obsidian quartz-syncer:quartz-config action=set key=configuration.ignorePatterns value='["private/**"]'
obsidian quartz-syncer:quartz-config action=set key=configuration.analytics value='{"provider":"plausible"}'
```

### 3.3 `set` creates unknown keys instead of rejecting them, and does not validate

Shared by both config commands.

`setValueByPath` in `src/cli/handlers/cliUtils.ts` creates every missing path segment as it walks. Neither handler checks that the key exists before writing, and `quartzConfigHandler` performs **no schema validation** despite the docs having claimed *"Values are validated against the Quartz v5 schema"*.

Two consequences:

- A typo silently writes a junk key into `data.json` or `quartz.config.yaml` and reports success.
- An out-of-range value is accepted and only surfaces later as a Quartz build failure. `configuration.theme.fontOrigin` accepts only `googleFonts` or `local`, but the CLI will write anything.

The docs now warn about both. A validating `set` would be better: reject unknown keys unless something like `--create` is passed, and validate against the types already declared in `src/quartz/QuartzConfigTypes.ts`.

### 3.4 `pluginHandler` honours three undeclared flags

`src/cli/handlers/pluginHandler.ts:147-149` reads `from-config`, `latest` and `clean` for `action=install`. None appear in that command's declared `flags` in `COMMAND_REGISTRY` (`src/cli/registerCliHandlers.ts:275-281`), which lists only `dry-run` and `help`.

Per `AGENTS.md`, undeclared names fall back to heuristic classification, and they are absent from generated help — so they work by accident and are undiscoverable. They were **deliberately left out** of the rewritten CLI guide rather than documenting an accident.

**Decide:** declare them in the registry and document them, or remove the handler branches. `latest` in particular maps to a documented Quartz workflow (`npx quartz plugin install --latest`) that `docs/Troubleshooting/Quartz.md` already recommends, so declaring it looks right.

### 3.5 `timestampFormat` is dead weight

`timestampFormat` is declared at `src/models/settings.ts:143`, defaulted to `"MMM dd, yyyy h:mm a"` at `src/main.ts:104`, and listed in `DEPRECATED_SETTING_KEYS` at `src/models/settings.ts:275` — but **nothing reads it**, and nothing did in v1 either.

Timestamps have always been ISO 8601, emitted by `toISOString()` at `src/publishFile/FileMetaDataManager.ts:43,66,89`. Timestamps taken from a note's own frontmatter are passed through verbatim.

It is also the one deprecated key the migration never deletes: `src/main.ts:566-578` removes `syncCache`, `persistCache`, `noteSettingsIsInitialized`, `lastUpstreamCommitSha` and `upgradeCheckStrategy`, but not this one.

This caused a real documentation error. `docs/Settings/Note properties/Frontmatter format.md` showed `created: Jan 09, 2026 7:32 AM` — the dead setting's format, which the code has never produced. Corrected in this pass, along with the property order, which is fixed by the compiler rather than following the source note.

**Suggested fix:** drop it from `DEFAULT_SETTINGS` and add it to the schema-v3 deletion list.

### 3.6 Fixed in this pass: every docs URL the plugin emitted was a 404

Recorded for completeness; already corrected.

The plugin and README linked to capitalised paths while the site serves lowercase. All of these returned 404, confirmed by `curl`:

| Was | Now |
|---|---|
| `/Setup-Guide` | `/setup-guide` |
| `/Usage-Guide` | `/usage-guide` |
| `/Guides/` | `/guides/` |
| `/Troubleshooting/` | `/troubleshooting/` |
| `/Settings/Git/Access-Token` | `/settings/git/access-token` |
| `/Settings/Note-properties/` | `/settings/note-properties/` |

Fixed in `README.md`, `src/views/QuartzSyncerSettingTab.ts:189,196`, `src/views/settings/GitSettingsPage.ts:210`, `src/compiler/FrontmatterCompiler.ts:39`. Verified with `npx tsc --noEmit` (0 errors), `npm run build` (exit 0) and `npx vitest run` (2146 passed).

Nothing enforces this. A link-check over emitted URLs would stop it recurring:

```bash
grep -rho 'https://saberzero1.github.io/quartz-syncer-docs/[A-Za-z0-9/_-]*' README.md src/ \
  | sort -u | while read -r u; do
      printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u")" "$u"
    done
```

---

## Suggested order of work

1. **1.1** — one render, unblocks confidence in the whole docs pass.
2. **2.1** and **2.2** — smallest fixes with the largest user impact; both reuse existing service code and restore mobile parity.
3. **3.1**, **3.4**, **3.5** — small, self-contained correctness fixes.
4. **3.3** — validating `set` is a real feature, worth scoping separately.
5. **2.3**, **2.4**, **2.5** — UI restoration. Largest effort, and genuinely a product decision about whether the Hub should reach full parity with v1's settings tab.
6. **1.2**, **1.3** — confirm after the next docs deploy.
