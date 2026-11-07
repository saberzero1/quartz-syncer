# V2 divergences

Findings from the 2.2.0 documentation pass (`docs/`, October 2026), and the state of each after the follow-up pass that worked through them.

Baseline for every v1 comparison is tag `1.18.0`, the last v1 release. Note its entry point was a root-level `main.ts`; v2's is `src/main.ts`. Searching only `src/` will silently miss all of v1's command and settings registration.

Status at a glance:

| | Item | State |
|---|---|---|
| 1.1 | Escaped-pipe wikilinks in tables | **Verified, no defect** |
| 1.2 | Alias redirects for renamed pages | **Was wrong — fixed** |
| 1.3 | Dataview and Datacore index queries | Open — needs the docs vault |
| 1.4 | Documented from source reading | Open |
| 2.1 | No UI route to clear the cache | **Fixed** |
| 2.2 | No UI route to toggle the publish property | **Fixed** |
| 2.3–2.5 | Quartz Hub lost v1's theme/font/analytics/layout editing | Open — product decision |
| 3.1 | `NodeDetector` floor below what Quartz needs | **Fixed** |
| 3.2 | CLI config key documentation was wrong | Already fixed in the docs pass |
| 3.3 | `set` creates unknown keys and does not validate | Open — scoped separately |
| 3.4 | `pluginHandler` honours three undeclared flags | **Fixed** |
| 3.5 | `timestampFormat` is dead weight | **Fixed** |
| 3.6 | Every docs URL the plugin emitted was a 404 | Already fixed in the docs pass |

---

## Resolved

### 1.1 Escaped-pipe wikilinks in tables — verified, no defect

The ~33 instances of `[[Target\|label]]` inside Markdown tables render correctly. Settled by building `docs/` with the real Quartz v5 checkout and reading the emitted HTML, rather than by static analysis:

```
<td><a href="../settings/overview/" class="internal internal-link alias"
       data-slug="settings/overview/index">Overview</a></td>
```

The `alias` class confirms the aliased form was parsed, not merely linked. Mechanically, `@quartz-community/remark-obsidian` tokenises the alias group as `(\\?\|[^[]\]#]*)?` — the backslash is an explicitly optional part of the pattern — and the handler strips it with `replace(/^\\\||\|/, "")`.

Four pages still contain a literal `[[` in their output, all expected: Excalidraw JSON point arrays, a syntax-highlighted `![[` example in `apply-embeds`, and the changelog.

No action needed, and the remediation list the original finding carried is moot.

### 1.2 Alias redirects — the original claim was wrong, now fixed

The four renamed pages carried `aliases`, and the alias emitter was active, but the redirects **were not landing at the old URLs**. A bare alias is treated as a root-absolute slug: `aliases: [Auto-clean orphaned media]` emitted `/auto-clean-orphaned-media`, not `/settings/performance/auto-clean-orphaned-media`. `processAliases` only joins an alias onto its own folder when `isRelativeURL(aliasTarget)` is true, which a bare alias is not.

So all four old URLs were still 404, and eight junk redirect pages sat at the site root. `docs/index.md`'s `aliases: [home]` worked only because that file is already at the root.

Fixed by making each alias a full path from the content root, which slugifies to the real old URL. Verified by render:

```
/settings/performance/auto-clean-orphaned-media        -> ../../settings/performance/automatically-clean-orphaned-media
/settings/note-properties/include-all-notes-by-default -> ../../settings/note-properties/all-notes-publishable-by-default
/settings/note-properties/updated-timestamp-keys       -> ../../settings/note-properties/modified-timestamp-keys
/settings/ui/arbitrary-file-publishing                 -> ../../settings/ui/allow-custom-file-publishing
/settings/git/vault-root-folder-name                   -> ../../settings/git/vault-root-folder
```

Two things the original finding missed:

- **A fifth renamed page.** `Settings/Git/Vault root folder.md` carried `aliases: [Vault root folder name]` from an earlier rename, with the same root-scoping bug.
- **The three case-only aliases were actively harmful, not merely unnecessary.** The finding correctly said `Access Token` → `Access token` needs no redirect, because the site lowercases paths. But the aliases had been added anyway, and because they emitted at the root they *captured* internal links: `[[CORS Proxy]]` in `docs/Troubleshooting/Authentication.md` rendered as `href="../cors-proxy"`, routing readers through a root-level redirect instead of straight to `settings/git/cors-proxy`. The three aliases are removed and that link is normalised to `[[CORS proxy]]`.

Only `/home` now emits a root-level redirect, which is correct.

### 2.1 Clear cache restored to the UI

A **Clear cache** action is back on the Performance settings screen, between **Enable caching** and **Clean up caches from other vaults** (`src/views/settings/PerformanceSettings.ts`). It calls `dataStore.dropAllFiles()`, as v1's did.

It also resets `settings.cache` and `settings.cacheTimestamp`. Those are a v1-era mirror that nothing reloads from — `loadFromDataJson` and `persistToDataJson` have no callers anywhere in `src/` — but `OperabilitySnapshot` still derives a cache file count from them, so leaving them behind would make the snapshot contradict a successful clear.

Verified by clicking the real row in a running Obsidian: cache entries went 3 → 0 and the notice read `Quartz Syncer: cache cleared.`

New page: `docs/Settings/Performance/Clear cache.md`. The Performance index lists its contents through a Datacore path-prefix query, so no index edit was needed.

> **Known platform limitation.** The row declares `visible: () => settings.useCache`, but Obsidian 1.13 does not honour `visible` for these declarative rows — the row renders with caching off either way. Verified live, including after a full settings reopen. The pre-existing **Remote fetch interval** row beside it behaves identically, so this is not a regression. The predicate is kept for consistency with that sibling, and the docs describe the actual behaviour rather than claiming the row hides.

### 2.2 Publish-property commands restored

The three v1 commands are registered again, on all platforms, restoring mobile parity:

| Command | Effect |
|---|---|
| `Quartz Syncer: Add publication flag` | sets the publish key `true` on the active note |
| `Quartz Syncer: Remove publication flag` | sets it `false` |
| `Quartz Syncer: Toggle publication flag` | flips it |

Rather than duplicating `markHandler`'s logic, the per-file mutation is extracted to `src/publishFile/publishFlag.ts` and **both** the palette commands and the CLI handler call it, so the two surfaces cannot drift. `markHandler` keeps its own path resolution and state-word parsing.

Verified in a running Obsidian against a real note — `true → false → true → false → true` across toggle/remove/add, plus a note with no frontmatter at all correctly gaining `publish: true`, plus the guard refusing to write with a PNG active (`Quartz Syncer: open a markdown note first.`, file left untouched).

The palette now registers 8 commands, up from 5.

### 3.1 `NodeDetector` floor raised to 22

`MIN_NODE_MAJOR` is now `22` (`src/quartz/NodeDetector.ts`), matching `package.json`'s `>=22.12.0`, `.nvmrc`'s `24.14.0`, and Quartz v5's own CLI. Node 18–21 is now reported unavailable at the gate instead of passing the Hub's check and then failing inside `npx quartz` with an error that never mentions Node.

`docs/Guides/Quartz Hub.md` and `AGENTS.md` are updated; the doc no longer has to describe an inconsistency.

### 3.4 Plugin install flags declared

`from-config`, `latest` and `clean` are declared in the `quartz-syncer:plugin` entry of `COMMAND_REGISTRY`, so they appear in generated help and are classified by declaration rather than by the heuristic fallback. They were already honoured by `src/cli/handlers/pluginHandler.ts`, and are now documented in `docs/Guides/CLI.md`.

The existing `pluginHandler` tests build `CliParams` by hand and so could not have caught this. The new coverage lives in `test/unit/cli/registerCliHandlers.test.ts`, which pins the declared flag set exactly and dispatches raw `CliData`.

### 3.5 `timestampFormat` removed

Dropped from `DEFAULT_SETTINGS`, made optional on the interface so existing `data.json` records and migration code still type-check, and deleted by a new schema **v6** migration.

The original suggestion — add it to the v3 deletion list — would not have worked: `migrateDeprecatedSettingsV3` early-returns for any record already at schema 3+, which is every 2.0+ install. That is precisely why this one key survived while its five siblings were deleted. `migrateDeprecatedSettingsV6` is therefore deliberately unguarded, like `migratePublishTargetV5`: deleting a key is idempotent, and a `>= 6` guard would read the merged-in default rather than the persisted version and skip every record that still carries the key.

Verified against a real running vault: `settingsSchemaVersion` is 6 and `'timestampFormat' in settings` is `false`.

---

## Still open

### 1.3 Dataview and Datacore index queries

Unchanged, and not verifiable from the Quartz side: these queries execute in Obsidian, not during the site build.

The folder indexes query by path prefix and exclude `index`, so `Settings/Overview/index.md` and the new `Clear cache.md` should appear automatically, and both set `description` and `default_value`. To confirm, open `docs/` as a vault in Obsidian with Dataview and Datacore enabled, then check that the Overview row appears in the top-level settings table and that no `default_value` cell is empty.

### 1.4 Documented from source reading, not from use

Unchanged. Accurate as far as the code goes, but not observed at runtime.

| Claim | Source | Doc |
|---|---|---|
| Hub **Layout** and **Templates** tab contents | `src/views/QuartzHub/LayoutTab.ts`, `TemplatesTab.ts` | `docs/Guides/Quartz Hub.md` |
| Status bar error-state tooltip carries the error message | `src/views/StatusBar.ts` | `docs/Settings/index.md` |
| Publish skips selected **Published** notes | `src/views/PublicationCenter/PublicationCenter.ts` | `docs/Usage Guide.md` |
| Preview takes 15–20s, `npm install` 30s+ | `AGENTS.md` timing table | `docs/Guides/Quartz Hub.md` |

### 2.3 / 2.4 / 2.5 Quartz Hub has no theme, font, analytics, ignore-pattern or layout-override editing

Deliberately not attempted — the largest item by effort, and genuinely a product decision about whether the Hub should reach parity with v1's settings tab rather than a defect.

v1's `QuartzV5SettingsTab.ts` exposed header/body/code fonts (1224–1244), CDN caching (1255), Quartz themes (1275), theme and variation (1444–1507), analytics provider (1173), ignore patterns (1186), and per-page-type `Template` / `Excluded plugins` (2127). v2's `src/views/QuartzHub/ConfigTab.ts:121-150` exposes only `pageTitle`, `pageTitleSuffix`, `baseUrl`, `locale`, `enableSPA` and `enablePopovers`, and `LayoutTab.ts:298` has exactly one editable input — plugin priority. Positions, groups and per-page-type overrides are displayed but not editable.

All of it remains reachable via `quartz-syncer:quartz-config` using `configuration.*` keys, which is CLI-only and therefore desktop-only.

### 3.3 `set` creates unknown keys instead of rejecting them, and does not validate

Unchanged, and worth scoping as its own feature.

`setValueByPath` in `src/cli/handlers/cliUtils.ts` creates every missing path segment as it walks. Neither config handler checks that the key exists before writing, and `quartzConfigHandler` performs no schema validation. So a typo silently writes a junk key into `data.json` or `quartz.config.yaml` and reports success, and an out-of-range value is accepted and only surfaces later as a Quartz build failure — `configuration.theme.fontOrigin` accepts only `googleFonts` or `local`, but the CLI will write anything.

The docs warn about both. A validating `set` would reject unknown keys unless something like `--create` is passed, and validate against the types already declared in `src/quartz/QuartzConfigTypes.ts`.

---

## Regression guards worth adding

None of these is wired up. All are cheap, and each catches a class of error no existing test can see.

An escaped pipe outside a table row renders the backslash literally, the inverse of 1.1. Note the `:` in the exclusion — `grep -rn` prefixes each line with `file:line:`, so the `'^\s*|'` form this guard was originally written with can never match and reports all 36 hits as false positives:

```bash
grep -rn '\[\[[^]]*\\|' docs --include=*.md | grep -v ':[[:space:]]*|'
```

A link check over the URLs the plugin emits, which is what 3.6 was:

```bash
grep -rho 'https://saberzero1.github.io/quartz-syncer-docs/[A-Za-z0-9/_-]*' README.md src/ \
  | sort -u | while read -r u; do
      printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u")" "$u"
    done
```

And one 1.2 would have caught: every alias in `docs/` must either be a full path from the content root or live on a root-level page, because a bare alias silently emits at the site root.

```bash
grep -rn '^aliases:' docs --include=*.md \
  | grep -v '^docs/[^/]*\.md:' \
  | grep -v 'aliases: \[[A-Za-z0-9 ]*/' 
```
