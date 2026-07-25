# Quartz Syncer Reimagined

A strategic analysis for rebuilding Quartz Syncer from the ground up, targeting Obsidian 1.13 and Quartz v5's npm-based plugin architecture.

---

## Table of Contents

- [Current State Assessment](#current-state-assessment)
- [Architecture Analysis](#architecture-analysis)
  - [Git & Repository Layer](#git--repository-layer)
  - [Compilation Pipeline](#compilation-pipeline)
  - [Caching System](#caching-system)
  - [UI Layer](#ui-layer)
  - [CLI System](#cli-system)
  - [Quartz Services](#quartz-services)
- [Ecosystem Research](#ecosystem-research)
  - [Git Providers: Options & Tradeoffs](#git-providers-options--tradeoffs)
  - [Quartz v5 Plugin Architecture](#quartz-v5-plugin-architecture)
  - [Obsidian 1.13 & Platform Capabilities](#obsidian-113--platform-capabilities)
  - [UI Framework Landscape](#ui-framework-landscape)
- [Strategic Opportunities](#strategic-opportunities)
  - [Background Processing](#background-processing)
  - [Desktop/Mobile Feature Split](#desktopmobile-feature-split)
  - [Zero-Config Onboarding](#zero-config-onboarding)
  - [Competitive Positioning](#competitive-positioning)
- [Component-Level Rebuild Decisions](#component-level-rebuild-decisions)
- [Risk Assessment](#risk-assessment)

---

## Current State Assessment

### Plugin at a Glance

| Metric | Value |
|--------|-------|
| Version | 1.18.0 |
| Source files | ~70 TypeScript + 6 Svelte |
| Dependencies | 14 runtime, 30 dev |
| Bundle target | Browser (CJS via esbuild) |
| Git library | isomorphic-git 1.36.1 + lightning-fs 4.6.2 |
| UI framework | Svelte 5 |
| Test coverage | 155 unit tests (Jest) + 5 E2E (WebdriverIO) |
| CLI commands | 12 commands via Obsidian CLI |
| Quartz support | v4 + v5 (YAML config) |
| Platform | Desktop + Mobile (`isDesktopOnly: false`) |

### Key Strengths (Carry Forward)

1. **Multi-provider Git support** — GitHub, GitLab, Bitbucket, Codeberg, Gitea, self-hosted. This is a genuine differentiator over competing plugins that only support GitHub.
2. **Smart merge conflict resolution** — File ownership model (user-owned vs framework files) with three-phase merge: preflight detection → custom merge driver → post-merge restore. This is ~300 lines of carefully engineered conflict handling that no other plugin has.
3. **Plugin integration ecosystem** — Dataview, Datacore, Fantasy Statblocks, Excalidraw, Auto Card Link, Bases, Canvas. Each compiles dynamic content to static output before publishing.
4. **Quartz v5 config management** — Full YAML config read/write with comment preservation, plugin management, layout editing, upgrade service. This is the most complete Quartz management interface that exists.
5. **Comprehensive CLI** — 12 commands covering the full publishing workflow, automatable from terminal.
6. **Caching architecture** — IndexedDB-backed with in-memory preloading, dynamic content detection (Dataview/Datacore always recompile), and dirty-tracking flush. Genuinely performant for large vaults.

### Key Pain Points (Fix in Rebuild)

1. **Publishing is blocking** — The entire compile → stage → commit → push flow blocks the UI. User must wait for everything to finish. No background work happens before user clicks publish.
2. **Initial setup is cumbersome** — User must: create a Quartz repo, configure GitHub token, enter remote URL, set branch. Could be automated to "enter GitHub token, we handle the rest."
3. **isomorphic-git limitations** — No SSH, no rebase, no sparse checkout, IndexedDB filesystem overhead, CORS proxy needed for browser environments. The `RepositoryConnection.ts` is 1,517 lines of workarounds.
4. **Svelte adds complexity without proportional value** — 1,356 lines across 6 components. Settings UI (2,169 lines) already uses vanilla Obsidian APIs and is arguably better for it.
5. **No background preprocessing** — Files are only compiled when user opens the publication center. Could precompile on vault changes and cache results, making publish nearly instant.
6. **Quartz v5 npm migration gap** — The Quartz v5 default config now uses `@quartz-community/*` npm specifiers. Quartz Syncer's plugin management was built for git-based `github:org/repo` specifiers and needs to handle both.
7. **No offline indicator or graceful degradation** — When network is unavailable, operations fail with generic errors.

---

## Architecture Analysis

### Git & Repository Layer

**Current**: `RepositoryConnection.ts` (1,517 lines) wraps isomorphic-git with a virtual IndexedDB filesystem (lightning-fs).

**Git operations used**: clone, fetch, push, commit, add, remove, walk, readBlob, readTree, readCommit, resolveRef, merge, findMergeBase, listRemotes, addRemote, deleteRemote, getRemoteInfo, listServerRefs, checkout, branch.

**Performance optimizations already in place**:
- Shallow clone/fetch (depth=1)
- Shared git index cache (O(1) vs O(n) for bulk staging)
- Bulk blob reading via single `git.walk()` traversal
- Batch file staging via `git.add(filepath: string[])`
- Exponential backoff retry on push (1s, 2s, 4s)
- Progress callbacks with `requestAnimationFrame` to avoid UI blocking

**Authentication flow**:
- Token stored in Obsidian's `SecretStorage` API (cross-platform, but plaintext localStorage under the hood)
- Three auth modes: `none`, `basic` (username + token), `bearer` (x-access-token + token)
- Custom HTTP client wrapping Obsidian's `requestUrl()` for CORS-safe network access
- Optional CORS proxy support

**Merge conflict resolution** (upgrade flow):
1. **Preflight**: Walk both trees to detect framework file modifications
2. **Merge**: Custom `mergeDriver` callback — user-owned files keep "ours", framework files accept "theirs"
3. **Restore**: Snapshot user-owned files before merge, force-restore after (catches clean-merge overwrites)
4. File ownership classification: `quartz.config.yaml`, `quartz.lock.json`, `content/`, `.github/`, `quartz/static/`, `quartz/styles/syncer/` are user-owned

**Known limitations**:
- No SSH authentication (HTTPS + token only)
- No rebase (merge only)
- No sparse/partial checkout (full repo in IndexedDB)
- No git gc/repack (growing `.git` directory)
- Binary merge conflicts unresolvable
- Memory pressure on mobile (full packfiles loaded into JS heap)
- CORS proxy required for some providers in browser

### Compilation Pipeline

**Current pipeline** (4 steps, reduced from 8 after Phase 3 minimization):

```
raw text
  → convertFrontMatter       Enrich frontmatter (permalinks, timestamps, tags, CSS classes)
  → convertIntegrations      Compile Dataview/Datacore/Statblocks to static HTML
  → linkTargeting            Remove target="_blank" from Dataview-generated links
  → astTransform             Strip Obsidian comments + vault path from links/images (via remark-obsidian)
  → convertFileLinks         Extract binary assets, convert embeds to base64
```

**Key insight**: The compiler was already minimized in a three-phase effort documented in `OBSIDIAN_INTEGRATION_IMPROVEMENTS.md`. Quartz v5 now handles wikilink resolution, transclusion expansion, SVG inlining, comment removal, and highlight/tag rendering. Syncer only does what Quartz can't: frontmatter enrichment, integration pre-compilation, and asset extraction.

**Integration system** (registry-based):
- Each integration declares patterns (regex), compile methods (async), and optional SCSS assets
- Enabled integrations sorted by priority, pattern matches executed sequentially
- Dataview: calls `dvApi.tryQueryMarkdown()` / `executeJs()` — cannot parallelize (API limitation)
- Datacore: renders to DOM, serializes HTML — has 400+ lines of SCSS
- Fantasy Statblocks: renders markdown, waits 5s for DOM, serializes — has 400+ lines of SCSS
- `AssetSyncer`: collects SCSS from integrations, writes to `quartz/styles/syncer/`, manages `custom.scss` imports

### Caching System

**Current**: Two-tier system.

**Tier 1 — DataStore** (IndexedDB via `localspace`):
- Per-file cache entries: `localHash`, `remoteHash`, `localData`, `remoteData`, `hasDynamicContent`, `version`, `time`
- **Preload optimization**: `preloadCache()` bulk-loads all entries into in-memory `Map`, eliminating per-file IndexedDB round-trips during compilation
- **Write-back pattern**: Writes during batch ops update memory only (marked dirty), `flushCache()` persists to IndexedDB
- **Dynamic content detection**: Files with Dataview/Datacore always recompile regardless of mtime
- **Version-based invalidation**: Entire cache invalidated on plugin version change
- Cache key: `file:{path}`, instance name: `quartz-syncer-{vaultName}-{pluginId}-{version}`

**Tier 2 — ExtendedCacheService** (Obsidian metadata cache wrapper):
- Wraps `obsidian-extended-metadatacache` singleton
- Provides inverse cache API for backlink/reference queries
- Managed lifecycle with ready-state promise

### UI Layer

**Svelte components** (1,356 lines total):

| Component | Lines | Complexity | Purpose |
|-----------|-------|------------|---------|
| `PublicationCenter.svelte` | 542 | HIGH | Main modal: file trees, progress tracking, publish actions |
| `DiffView.svelte` | 487 | MODERATE | Split/unified diff viewer with synchronized scrolling |
| `TreeNode.svelte` | 184 | MODERATE | Recursive tree node with checkboxes, expansion, diff triggers |
| `TreeView.svelte` | 113 | LOW | Tree container managing parent-child relationships |
| `LineDiff.svelte` | 24 | TRIVIAL | **DEAD CODE** — unused, not imported anywhere |
| `Icon.svelte` | 6 | TRIVIAL | Thin wrapper around Obsidian's `getIcon()` |

**Vanilla Obsidian UI** (already in place, 3,315 lines):

| Component | Lines | API Used |
|-----------|-------|----------|
| `QuartzV5SettingsTab.ts` | 2,169 | Obsidian `SettingPage` |
| `GitSettings.ts` | 576 | Obsidian `SettingPage` |
| `PluginBrowserModal.ts` | 299 | Obsidian `Modal` |
| `QuartzSyncerSettingTab.ts` | 220 | Obsidian `SettingTab` |
| `ConfirmModal.ts` | 51 | Obsidian `Modal` |

**Assessment**: Svelte provides ~30% value for 100% complexity cost. The most complex UI (settings, plugin browser) is already vanilla and works well. The tree logic and diff algorithm in the Svelte components are pure JS — Svelte only handles the rendering glue.

### CLI System

**12 commands across 3 tiers**:

| Tier | Commands | Purpose |
|------|----------|---------|
| Core | `status`, `sync`, `publish` | Daily publishing workflow |
| Useful | `delete`, `mark`, `test` | Extended operations |
| Power | `cache`, `config`, `upgrade`, `version`, `plugin`, `quartz-config` | Automation & management |

**Architecture**: Centralized registration in `registerCliHandlers.ts`, consistent error handling via `formatCliOutput()`, pre-flight checks, JSON/text output formatting, verbose mode support.

**Global flags**: `format=json|text`, `help`, `verbose`, `dry-run`, `force`

### Quartz Services

**Mature services**:
- `QuartzConfigService`: YAML/JSON config read/write with comment preservation
- `QuartzPluginManager`: Add/remove/find plugins with deduplication
- `QuartzPluginRegistry`: Community registry fetch with concurrent request deduplication
- `QuartzUpgradeService`: Upstream merge with version detection and conflict handling
- `QuartzVersionDetector`: Detects v5-yaml, v5-json, v4 by probing config files

**Basic services**:
- `QuartzTemplateService`: Template listing and application
- `QuartzPluginManifestService`: Manifest fetching with ref resolution
- `QuartzPluginUpdateChecker`: Locked commit vs remote HEAD comparison

**Gaps**:
- No plugin dependency resolution/validation
- No persistent manifest cache (in-memory per session only)
- Hardcoded upstream (`jackyzha0/quartz#v5`)
- No rollback for failed upgrades
- No schema validation for configs before write
- Generic null returns instead of structured errors

---

## Ecosystem Research

### Git Providers: Options & Tradeoffs

#### Option 1: isomorphic-git (Current)

| Aspect | Assessment |
|--------|------------|
| Status | Actively maintained (v1.38.5, June 2026), community-driven, two volunteer maintainers |
| Mobile | Works but problematic — loads entire packfiles into memory, iOS heap exhaustion reported |
| Desktop | Works well with workarounds |
| Provider support | Any git host (HTTPS only) |
| Bundle size | ~500KB |
| Known issues | No SSH, no rebase, no sparse checkout, no GC/repack, CORS proxy needed |

#### Option 2: GitHub REST API (Git Database)

| Aspect | Assessment |
|--------|------------|
| Status | Officially supported, stable, well-documented |
| Mobile | Excellent — bounded memory (largest single file, not vault size) |
| Desktop | Excellent |
| Provider support | GitHub only (GitLab, Bitbucket, Gitea have different APIs) |
| Bundle size | ~10KB (just HTTP calls) |
| Proven by | obsidian-github-publisher, github-easy-sync, obsidian-vault-sync |

**Workflow**:
```
createBlob → createTree → createCommit → updateRef
```
Four API calls per publish. No `.git/` directory, no filesystem, no CORS issues.

**Rate limit**: 5,000 requests/hour (authenticated).

#### Option 3: GitHub GraphQL (`createCommitOnBranch`)

| Aspect | Assessment |
|--------|------------|
| Status | Official since 2021 |
| Advantage | Single mutation for commit creation, auto GPG signing |
| Limitation | Cannot set custom committer, limited read operations |
| Provider support | GitHub only |

#### Option 4: Native git via `child_process` (Desktop Only)

| Aspect | Assessment |
|--------|------------|
| Status | Proven by obsidian-git (most popular git plugin) |
| Capability | Full git: SSH, GPG, rebase, submodules, sparse checkout |
| Limitation | Desktop only — no `child_process` on mobile |
| Dependency | Requires git binary installed on user's system |

#### Option 5: wasm-git (libgit2 → WebAssembly)

| Aspect | Assessment |
|--------|------------|
| Status | Active development (Emscripten 4.0.23), OPFS support emerging |
| Advantage | True git implementation, better memory than isomorphic-git |
| Limitation | ~10MB bundle, complex setup, small community (826 stars), no SSH in browser |

#### Option 6: Forked isomorphic-git (Bundled, Cross-Platform)

| Aspect | Assessment |
|--------|------------|
| Status | 8,292 stars, MIT license, well-structured pure JS codebase (~509 files, ~6,500 lines bundled) |
| Forkability | High — modular architecture, clean command separation. Strip to ~20 of 48 commands |
| What a fork fixes | GC/pack repacking (prevents repo bloat), memory management, merge conflict support |
| Reference | Shakespeare project implemented custom GC (~500 lines). obsidian-git already uses isomorphic-git with custom `MyAdapter` filesystem bridge |
| Effort | 2-4 weeks minimal viable fork (GC + memory); 2-3 months for full merge/conflict support |
| Bundle size | ~2-4 MB (stripped) |

#### Provider API Coverage

Not all providers have sufficient REST APIs. Research shows three architectural patterns:

| Pattern | Providers | How it works |
|---------|-----------|-------------|
| **A: Low-level Git Objects** | GitHub, Gitea/Forgejo (Codeberg) | `createBlob → createTree → createCommit → updateRef`. Explicit control over git objects. **GitHub and Gitea share identical API surface** — one implementation serves both |
| **B: File-Change Abstraction** | GitLab, Azure DevOps | Submit file changes in a single request, provider builds tree/commit internally. GitLab: `actions[]` array. Azure: `changes[]` array |
| **C: File Upload** | Bitbucket Cloud | Multipart form upload, provider builds commit. Limited control (no custom parent SHA) |
| **D: Insufficient API** | Gogs, Bitbucket Server | File-by-file only (1 commit per file), or no git plumbing endpoints at all |

**Full capability matrix**:

| Provider | Read Tree | Read Blob | Multi-file Commit | Full API Workflow |
|----------|:-:|:-:|:-:|:-:|
| GitHub | ✅ | ✅ | ✅ | ✅ |
| GitLab | ✅ | ✅ | ✅ (batch actions) | ✅ |
| Bitbucket Cloud | ✅ | ✅ | ✅ (multipart upload) | ✅ |
| Bitbucket Server | ✅ | ✅ | ❌ (1 file = 1 commit) | ⚠️ |
| Gitea/Forgejo | ✅ | ✅ | ✅ | ✅ |
| Gogs | ✅ | ✅ | ❌ | ❌ |
| Azure DevOps | ✅ | ✅ | ✅ (pushes API) | ✅ |

**Key insight**: 5 of 7 providers support full API-based publishing. Only Gogs and Bitbucket Server lack sufficient APIs, and both are rare in the Quartz user base.

#### Comparison Matrix

| Criteria | isomorphic-git (fork) | Provider APIs | child_process | wasm-git |
|----------|:---:|:---:|:---:|:---:|
| Mobile support | ✅ (with fixes) | ✅ (5 of 7 providers) | ❌ | ✅ |
| Desktop support | ✅ | ✅ | ✅ | ✅ |
| Multi-provider | ✅ any git host | ⚠️ 5 of 7 | ✅ | ✅ any git host |
| Memory efficiency | ⚠️ (fixable in fork) | ✅ | ✅ | ✅ |
| SSH support | ❌ | ❌ | ✅ | ❌ |
| Offline support | ✅ | ❌ | ✅ | ✅ |
| CORS issues | ⚠️ needs proxy | ✅ none | ✅ none | ✅ none |
| Bundle size | ~2-4 MB (stripped) | ~10KB per provider | 0 (external) | ~800KB-1.5MB WASM |
| No system dependency | ✅ | ✅ | ❌ requires git | ✅ |
| Feature completeness | ~85% (with fixes) | ~60% (publish only) | 100% | ~95% |

#### Recommended: Three-Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    GitBackend (interface)                  │
│   readTree() | readBlob() | writeFiles() | commit()       │
│   push() | fetch() | merge() | testConnection()          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   LAYER 1: Provider REST APIs (preferred, no git needed)   │
│   ┌──────────────┬──────────┬────────────┬──────────────┐ │
│   │ GitHub +     │ GitLab   │ Bitbucket  │ Azure DevOps │ │
│   │ Gitea/Forgejo│ API      │ Cloud API  │ API          │ │
│   │ (shared impl)│          │            │              │ │
│   └──────────────┴──────────┴────────────┴──────────────┘ │
│   Memory-safe, no CORS, no IndexedDB, works everywhere    │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   LAYER 2: Bundled Git (forked isomorphic-git)             │
│   For providers without REST APIs (Gogs, Bitbucket Server, │
│   self-hosted, any generic git host). Works on all         │
│   platforms. No system git required.                       │
│   Fork fixes: GC/pack repacking, memory, merge conflicts   │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   LAYER 3: System Git (desktop bonus, optional)            │
│   child_process.spawn('git', ...) when git binary exists.  │
│   Adds: SSH, GPG signing, rebase, sparse checkout.         │
│   Auto-detected. Falls back to Layer 1 or 2 if absent.     │
│                                                            │
└──────────────────────────────────────────────────────────────┘
```

**Strategy**: The `GitBackend` interface abstracts all three layers. Backend selection is automatic:

1. **Provider API detected?** → Use Layer 1 (fastest, lightest, works everywhere)
2. **No API but desktop with git installed?** → Use Layer 3 (full features)
3. **No API, no system git?** → Use Layer 2 (forked isomorphic-git, bundled)

This means **every user gets a working experience regardless of platform, provider, or installed tools**. GitHub/GitLab/Gitea/Bitbucket Cloud/Azure DevOps users never need git installed at all — not even on desktop. Gogs/Bitbucket Server/self-hosted users fall back to the bundled git implementation, with an optional upgrade path to system git on desktop for SSH and full features.

**The fork question**: isomorphic-git is MIT-licensed, well-structured, and forkable. A focused fork that strips unused commands (28 of 48), adds GC/pack repacking (reference: Shakespeare project's ~500 line implementation), and fixes memory management would serve as a reliable Layer 2 fallback. This is the same "fork and fix" approach that made the codemirror-vim fork successful — own the dependency, fix what upstream won't.

### Quartz v5 Plugin Architecture

Quartz v5 operates a **dual plugin resolution system**:

#### Git-based plugins (original v5)
- Source format: `github:org/repo`, `github:org/repo#ref`, `git+https://...`
- Cloned into `.quartz/plugins/<name>/`
- Pre-built `dist/` shipped in repo → skip build
- Fallback: `npm install` → `npm run build` → `npm prune`
- Tracked in `quartz.lock.json`

#### npm-based plugins (emerging)
- Source format: `@quartz-community/plugin-name`
- Standard npm dependency in `package.json`
- Loaded via `import(spec.name)` directly
- No `.quartz/plugins/` directory needed
- Version controlled by `package.json` semver

#### Current default: npm specifiers

The `quartz.config.default.yaml` **already uses** `@quartz-community/*` npm specifiers. 44+ official plugins are published to npm. The git-based path remains functional and is used by third-party/community plugins.

#### Impact on Syncer's plugin management

| Operation | Git-based | npm-based |
|-----------|-----------|-----------|
| Add plugin | Append to `plugins[]` in YAML | Append to `plugins[]` in YAML + add to `package.json` |
| Remove plugin | Remove from `plugins[]` | Remove from `plugins[]` + remove from `package.json` |
| Enable/disable | Set `enabled: true/false` | Set `enabled: true/false` |
| Configure | Update `options` in YAML | Update `options` in YAML |
| Update | Change `#ref` or let CI handle | Update semver in `package.json` |
| Install | Handled by Quartz CLI `prebuild` | Handled by `npm install` |

**Key insight**: Syncer only needs to edit `quartz.config.yaml` (and optionally `package.json` for npm plugins). The build pipeline handles actual installation. Syncer should support both source formats transparently.

### Obsidian 1.13 & Platform Capabilities

#### What 1.13 brings

- **Declarative settings API**: `getSettingDefinitions()` replaces imperative `display()`. Settings auto-appear in global search. Conditional visibility via `visible` predicates. Old API remains supported.
- **Settings window**: Opens in new window with search and keyboard navigation.
- **Security**: URI confirmation dialogs, plugin sync warnings.
- **OKLCH migration**: `--callout-color` must be valid CSS color (breaking for custom themes).

#### Desktop vs Mobile capabilities

| Capability | Desktop (Electron) | Mobile (Capacitor) |
|------------|:---:|:---:|
| Obsidian Vault API | ✅ | ✅ |
| `child_process` | ✅ | ❌ |
| `node:fs` (outside vault) | ✅ | ❌ |
| `node:path`, `node:os` | ✅ | ❌ |
| `electron` module | ✅ | ❌ |
| Web Workers | ✅ | ✅ (fragile under memory pressure) |
| `SecretStorage` | ✅ | ✅ (plaintext localStorage) |
| `electron.safeStorage` | ✅ (encrypted) | ❌ |
| Obsidian CLI | ✅ | ❌ |
| `requestUrl()` | ✅ | ✅ |
| `fetch()` | ✅ | ✅ |

#### Feature gating pattern (from obsidian-git)

```typescript
// Keep isDesktopOnly: false so mobile users can install
// Gate individual features at runtime:
if (Platform.isDesktopApp) {
  this.gitManager = new NativeGitBackend(this);
} else {
  this.gitManager = new APIGitBackend(this);
}

// Conditional command registration
if (Platform.isDesktopApp) {
  this.addCommand({ id: 'auto-publish', ... });
}

// Conditional settings UI
if (Platform.isDesktopApp) {
  new Setting(container).setName("SSH key path")...;
}
```

### UI Framework Landscape

#### What Obsidian itself uses

Obsidian is vanilla JavaScript — no React, no Vue, no Svelte. CodeMirror 6 for the editor, PIXI.js for the graph, `createEl()` and `Setting` for UI. This proves no framework is needed for even complex UIs.

#### Framework comparison for Obsidian plugins

| Framework | Bundle Overhead | Officially Documented | Used By | Assessment |
|-----------|:---:|:---:|---------|------------|
| **Vanilla TS** | 0 KB | ✅ (default) | Linter (2k ⭐), Obsidian itself | Best for settings, modals, most UIs |
| **Svelte 5** | ~10-30 KB | ✅ | Projects, Quartz Syncer | Good DX, small runtime. Runes system |
| **Preact** | ~3-9 KB | ❌ | Dataview (9.2k ⭐), Commander | Tiny footprint, React-compatible API |
| **React** | ~40+ KB | ✅ | Kanban, Excalidraw | Large ecosystem, significant overhead |

#### For Quartz Syncer specifically

The settings UI (2,169 lines) and plugin browser (299 lines) are already vanilla and work well. The publication center and diff viewer use Svelte for reactive state management, but the core logic (tree building, diff computation, scroll sync) is pure JS.

**Recommendation**: Migrate to vanilla Obsidian APIs for the rebuild. The publication center's tree view and diff view can be implemented with Obsidian's `createEl()` pattern plus a lightweight reactive state wrapper (~50 lines). This eliminates esbuild-svelte, svelte-preprocess, and the Svelte 5 runtime from the build chain.

---

## Strategic Opportunities

### Background Processing

This is the single biggest opportunity for making Quartz Syncer feel "super snappy."

#### Current flow (everything blocking)

```
User clicks Publish → [WAIT 5-30s]
  fetch remote → compile ALL files → compare hashes → show selection UI
User selects files → [WAIT 5-30s]
  stage → commit → push
```

#### Proposed flow (precomputed)

```
Background (continuous):
  On vault file change (debounced 2s):
    → Recompile changed file
    → Update cache hash
    → Mark file as "dirty" (local ≠ remote)

  On periodic interval (every 60s, desktop only):
    → Fetch remote content tree (lightweight: just hashes)
    → Update remote hashes in cache
    → Detect new remote-only files

User clicks Publish → [INSTANT]
  Show precomputed diff (already know which files changed)
  → Selection UI appears immediately

User selects files → [WAIT 2-5s]
  Stage precompiled content → commit → push
  (No compilation needed — already done in background)
```

**Implementation approach**:
- **File change monitoring**: Hook into `vault.on('modify')`, `vault.on('create')`, `vault.on('delete')`, `vault.on('rename')` events. Debounce with 2s delay.
- **Background compilation**: Run `SyncerPageCompiler.generateMarkdown()` in microtask queue or Web Worker (if deps allow).
- **Incremental cache updates**: Only recompile changed files. Use `hasDynamicContent` flag to also recompile Dataview files when any note changes (they might reference the changed note).
- **Remote hash prefetch**: Periodic lightweight fetch of the content tree (just tree entries, not file contents). Compare OIDs against cached remote hashes.

**Limitation**: Dataview/Datacore queries depend on vault state and can't be precompiled in a Worker (they need the Obsidian API). They must run on the main thread but can be debounced and cached aggressively.

**Desktop enhancement**: On desktop, native git can do `git ls-remote` and `git diff --stat` extremely fast. Background auto-publish (configurable interval) becomes feasible.

### Desktop/Mobile Feature Split

#### Desktop (full experience)

- Native git backend (SSH, full protocol, sparse checkout)
- Background auto-publish on interval
- Split diff view
- CLI commands
- `electron.safeStorage` for encrypted token storage
- Direct filesystem access for Quartz setup
- Web Workers for heavy compilation
- Commit message scripts

#### Mobile (light experience)

- GitHub/GitLab REST API backend (memory-safe, no IndexedDB filesystem)
- Manual publish only (no background)
- Unified diff view
- Basic token auth via `SecretStorage`
- Core features: mark notes, preview changes, publish, delete

#### Shared (cross-platform)

- Vault file monitoring and cache management
- Frontmatter compilation
- Integration pre-compilation (Dataview, Datacore, etc.)
- Quartz config management (YAML read/write)
- Plugin browser and settings
- All Obsidian UI components

### Zero-Config Onboarding

The initial Quartz setup is the biggest barrier to adoption. Today, users must:
1. Fork/clone Quartz repo on GitHub
2. Set up GitHub Pages or Netlify
3. Create a GitHub personal access token
4. Enter remote URL, branch, username, and token in Quartz Syncer settings
5. Test the connection manually

#### Proposed "One-Click Setup" (Desktop)

```
User provides: GitHub token
Plugin handles everything:

1. Detect: Does user already have a Quartz repo?
   → Yes: Clone it, detect version, configure settings
   → No: Continue to step 2

2. Create: Fork jackyzha0/quartz (or create from template)
   → Via GitHub API: POST /repos/{template}/generate

3. Configure: Set up GitHub Pages
   → Via GitHub API: PUT /repos/{owner}/{repo}/pages

4. Connect: Clone repo, set branch, configure auth
   → All settings auto-populated

5. Ready: "Your Quartz site is live at {url}. Mark notes with 'publish: true' to get started."
```

**Technical feasibility**: All steps use the GitHub REST API, which is available on all platforms. The `POST /repos/{template_owner}/{template_repo}/generate` endpoint creates a new repo from a template. The `PUT /repos/{owner}/{repo}/pages` endpoint enables GitHub Pages.

#### Mobile simplified setup

```
User provides: GitHub token + (optional) existing repo name
Plugin: If no repo → create via API. If exists → connect via API.
```

### Competitive Positioning

#### Current landscape

| Plugin | Approach | Strengths | Weaknesses |
|--------|----------|-----------|------------|
| **obsidian-github-publisher** | GitHub REST API | Simple, fast, good markdown processing | GitHub-only, no Quartz-specific features |
| **obsidian-git** | Hybrid (native + isomorphic-git) | Full git support, auto-sync | Not publishing-focused, no Quartz integration |
| **Enveloppe** | GitHub REST API | Multi-site support | No Quartz-specific features |
| **Quartz Syncer** (current) | isomorphic-git | Multi-provider, Quartz-native, plugin management | Slow publishing, complex setup, mobile issues |

#### Where Quartz Syncer can win

1. **"The Quartz companion"** — No other plugin understands Quartz's architecture. Plugin management, config editing, upgrade handling, version detection — this is unique. Lean into it.

2. **"Instant publish"** — Background preprocessing makes publish feel instant. Nobody else does this. The current "click and wait 30 seconds" is the #1 UX complaint.

3. **"Zero to published in 60 seconds"** — One-click setup eliminates the biggest adoption barrier. Enter a token, pick a name, done. Your Quartz site is live.

4. **"Fork and fix" mentality** — Like your codemirror-vim success, fork isomorphic-git (or more likely, build provider-specific API backends) and fix the limitations nobody else addresses. Own the git layer.

5. **"Desktop power, mobile simplicity"** — Desktop gets native git, auto-publish, split diffs. Mobile gets instant API-based publishing. Both feel polished. Nobody else does this split well.

---

## Component-Level Rebuild Decisions

### 1. Git Backend

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Primary transport | isomorphic-git | **Three-layer: provider APIs → bundled git fork → system git** | Provider APIs (Layer 1) cover 5 of 7 providers with zero git dependency. Forked isomorphic-git (Layer 2) covers the rest on all platforms. System git (Layer 3) is an optional desktop upgrade |
| Bundled git | Upstream isomorphic-git (unfixed) | **Fork isomorphic-git**: strip to ~20 commands, add GC/pack repacking, fix memory | Same "fork and fix" approach as codemirror-vim. Own the dependency, fix what upstream won't |
| Filesystem | lightning-fs (IndexedDB) | **Custom Vault API adapter for fork** (like obsidian-git's `MyAdapter`). **None for API backends** | API backends don't need a virtual filesystem. Fork bridges to Vault API directly |
| Authentication | Custom HTTP client + SecretStorage | **Keep SecretStorage + add electron.safeStorage on desktop** | SecretStorage is cross-platform. safeStorage adds encryption |
| Merge handling | Custom merge driver + file ownership | **Carry forward** — this is battle-tested domain logic | 300 lines of carefully engineered conflict resolution. Provider-agnostic |
| Multi-provider | All HTTPS git hosts | **Full coverage**: GitHub+Gitea (shared API impl), GitLab, Bitbucket Cloud, Azure DevOps via REST APIs. Gogs/Bitbucket Server/self-hosted via bundled git fork | No user is left without a working backend, regardless of platform or provider |
| System git dependency | Not used | **Optional Layer 3 on desktop**: auto-detect git binary, offer SSH/GPG/rebase if present. Never required | Bonus features for power users. No user blocked if git isn't installed |

### 2. Compilation Pipeline

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Architecture | 4-step sequential pipeline | **Keep pipeline, add background trigger** | Pipeline is already minimized and clean. Just needs to run proactively |
| Frontmatter | `FrontmatterCompiler` | **Carry forward** | Quartz can't know Syncer's permalink/timestamp rules |
| Integrations | Registry-based, 7 integrations | **Carry forward, clean up registry** | Good extensible pattern. Add base class for integrations |
| AST transform | remark-obsidian | **Carry forward** | Already modern, replaces regexes with AST |
| Asset extraction | Regex + CachedMetadata hybrid | **Complete migration to CachedMetadata** | Phase 1 plan in OBSIDIAN_INTEGRATION_IMPROVEMENTS.md is ready |
| Background | None | **Add vault change listener → debounced recompile** | The key UX improvement |
| Dynamic content | Always recompile | **Add dependency tracking** | Track which files Dataview queries reference. Only recompile when dependencies change |

### 3. Caching

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Storage | IndexedDB (localspace) | **Keep IndexedDB for file cache** | Proven, performant with preload optimization |
| Preloading | Bulk load to memory Map | **Carry forward** | Eliminates per-file async overhead |
| Invalidation | Version-based (coarse) | **Add per-file invalidation** | Don't nuke entire cache on plugin update |
| Remote hashes | Fetched on publish | **Prefetch periodically in background** | Know which files changed before user opens publish modal |
| Manifest cache | In-memory per session | **Add persistent manifest cache with TTL** | Avoid refetching plugin manifests on every launch |

### 4. UI

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Framework | Svelte 5 (6 components) | **Vanilla Obsidian APIs** | Settings already vanilla. Eliminates build complexity. Obsidian's APIs are purpose-built |
| Settings | Vanilla `SettingPage` (2,169 lines) | **Migrate to 1.13 declarative API** | Auto search, conditional visibility, cleaner code |
| Publication center | Svelte modal | **Vanilla `Modal` + reactive state class** | Tree logic is pure JS. DOM updates via `createEl()` + simple diffing |
| Diff viewer | Svelte with scroll sync | **Vanilla with same scroll sync logic** | The diff algorithm and scroll sync are framework-agnostic JS |
| Plugin browser | Already vanilla | **Carry forward** | Works well |
| Cleanup | `LineDiff.svelte` (dead), `Icon.svelte` (trivial) | **Remove** | Dead code |

### 5. CLI

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Architecture | 12 commands, centralized registration | **Carry forward** | Well-designed, extensible |
| New commands | — | **Add `setup` and `background` commands** | `setup` for one-click onboarding, `background` for controlling auto-publish |
| Output | JSON/text dual format | **Carry forward** | Good for automation |
| Migration | — | **Add `migrate` command for v4→v5** | Guided migration for existing users |

### 6. Quartz Services

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Config | YAML read/write with comment preservation | **Carry forward + add schema validation** | Use JSON Schema from Quartz for pre-write validation |
| Plugin management | Git-based source parsing | **Add npm specifier support** | Quartz default config now uses `@quartz-community/*` |
| Plugin registry | Community registry fetch | **Carry forward + add persistent cache** | Current fetch-per-session is wasteful |
| Upgrade service | Upstream merge with conflict handling | **Carry forward + add rollback** | Snapshot before merge, restore on failure |
| Version detection | v5-yaml, v5-json, v4 probing | **Carry forward** | Works well |
| Dependency validation | Not implemented | **Add dependency graph validation** | Warn when disabling plugins that others depend on |

### 7. Testing

| Aspect | Current | Recommendation | Rationale |
|--------|---------|----------------|-----------|
| Unit tests | 155 tests (Jest) | **Migrate to Vitest** | Faster, native ESM support, compatible API |
| E2E tests | 5 tests (WebdriverIO + Obsidian) | **Expand E2E coverage** | Critical for publish flow verification |
| Integration tests | None | **Add mock integration tests** | Test Dataview/Datacore compilation with mocked APIs |
| Git backend tests | None | **Add per-backend integration tests** | Test native git, GitHub API, GitLab API independently |

---

## Risk Assessment

### High Risk

| Risk | Mitigation |
|------|------------|
| **GitHub API rate limiting** | Cache aggressively, batch operations, show rate limit status. 5,000/hr is generous for publishing |
| **Breaking change in Quartz v5 config format** | Pin to schema version, validate before write, handle migration gracefully |
| **Obsidian 1.13 API changes** | Use declarative settings API (stable contract), keep fallback to `display()` |
| **Vault sync conflicts with background processing** | Per-file `mtime` tracking (see Design Constraints). Record `mtime` on read, verify on cache-write — discard if file changed between read and write. Debounce recompilation after sync events |

### Medium Risk

| Risk | Mitigation |
|------|------------|
| **Background processing performance** | Debounce file changes (2s), limit concurrent compilations, skip unchanged files |
| **Dataview dependency tracking** | Start conservative (recompile all dynamic files), optimize later |
| **Multi-provider API differences** | GitHub+Gitea share identical API (one implementation). GitLab/Bitbucket Cloud/Azure DevOps each need a thin adapter. Start with GitHub+Gitea, add others early since they're small |
| **Mobile memory pressure** | API backends eliminate the problem. Bundled git fork only used for providers without APIs (rare). Fork includes memory fixes |
| **Token security** | Desktop: electron.safeStorage. Mobile: SecretStorage (plaintext but per-vault) |
| **Bundle size** | Current `main.js` is 877KB with full isomorphic-git. Obsidian Sync hard limit is 5MB. A stripped fork adds ~1-3MB — well within limits. No lazy loading required for size reasons, though still beneficial for startup performance |

### Low Risk

| Risk | Mitigation |
|------|------------|
| **Maintaining isomorphic-git fork** | Focused fork (20 commands) is far smaller surface than upstream (48 commands). GC fix is ~500 lines (reference: Shakespeare project) |
| **Svelte → vanilla migration effort** | Settings already vanilla. Publication center is ~1,000 lines to convert |
| **Cache corruption** | Version-stamped entries, automatic cleanup on version change |
| **CLI backward compatibility** | Keep existing command IDs, add new ones alongside |

---

## Design Constraints & Implementation Notes

### HTTP Client

All provider API backends and network requests **must use Obsidian's `requestUrl()`** — not `fetch()`. `requestUrl` handles CORS, Capacitor mobile networking, and Electron's security context. `fetch` fails on mobile due to CORS restrictions and Capacitor networking differences. The current codebase already uses `requestUrl` consistently (6 files). This is a hard constraint for the rebuild.

### Dependencies

- **`@quartz-community/remark-obsidian`**: Published to npm as `@quartz-community/remark-obsidian`. The rebuild should switch from the current GitHub-linked dependency to the npm version.
- **`obsidian-extended-metadatacache`** (v0.5.1, npm): Provides inverse cache lookups (backlinks/references) as a complement to Obsidian's `MetadataCache` API. Maintained by the same author as Quartz Syncer. Keep as a dependency — it fills a deliberate gap in the Obsidian API.
- **`localspace`**: IndexedDB wrapper for the `DataStore`. Stable, proven in production. Carry forward.
- **`diff`**: Diff algorithm library. Framework-agnostic, carry forward.
- **`yaml`**: YAML parser/serializer with comment preservation. Critical for Quartz config management. Carry forward.

### Data Storage Split

- **`data.json`** (Obsidian plugin data): Settings and cache timestamp only. Keep small — Obsidian Sync transfers this file. Do not store compiled content or large cache data here.
- **IndexedDB** (`localspace` / `DataStore`): All compiled file content, hashes, and metadata. Per-vault, per-plugin-version. Not synced by Obsidian Sync. This is the right split and must be preserved.

### Bundle Size Budget

Current `main.js` is **877KB** (production, minified) with full isomorphic-git bundled. The Obsidian Sync hard limit is **5MB**. A stripped isomorphic-git fork (~20 of 48 commands) adds ~1-3MB to the bundle — well within limits even if statically bundled. Dynamic import is still beneficial for startup performance (don't parse/compile the git fork until needed) but is not required for size reasons.

### Per-File Modified Time Tracking

Background processing and cache validity depend on accurate `mtime` tracking. The `DataStore` must:

1. **Record `mtime` when reading a file for compilation** — store alongside the compiled result
2. **Check `mtime` before using a cached result** — if the file's current `mtime` differs from the cached `mtime`, the cache entry is stale and must be recompiled
3. **Check `mtime` before writing a cache result** — if the file was modified between the read and the cache-write (by Obsidian Sync, iCloud, etc.), discard the result rather than caching stale data
4. **Track `mtime` per file in the cache schema** — add `sourceMtime: number` to `QuartzSyncerCache`

This eliminates race conditions with vault sync services and ensures background precompilation never serves outdated content.

---

## Summary: What This Rebuild Enables

| Capability | Current | After Rebuild |
|------------|---------|---------------|
| Time to first publish | 5-10 minutes (manual setup) | 60 seconds (one-click setup) |
| Publish latency | 5-30 seconds (compile + push) | 2-5 seconds (precompiled, just push) |
| Mobile publishing | Works but fragile (memory) | Reliable: API backends for major providers, bundled git fork (with fixes) for the rest |
| Desktop git features | HTTPS only, no SSH, no rebase | System git (optional): SSH, GPG, rebase, sparse checkout. Works without git installed too |
| System git dependency | N/A (isomorphic-git only) | Never required. Provider APIs or bundled fork handle all platforms. System git is a bonus |
| Offline awareness | Fails silently | Graceful degradation with status indicator |
| Quartz plugin management | Git-based only | Git + npm specifier support |
| Background processing | None | Continuous precompilation + remote hash prefetch |
| Build complexity | esbuild + Svelte + svelte-preprocess | esbuild only |
| Bundle size | ~500KB (isomorphic-git) + Svelte runtime | ~10-50KB (API clients) + ~2-4MB (stripped git fork, loaded on demand) + 0 framework |
