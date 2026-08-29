# Quartz Syncer Reimagined — Implementation Strategy Overview

> **Historical document** — This implementation roadmap was written during the v2.0 planning phase. The v2.0 implementation is complete. See `CHANGELOG.md` for what was shipped.

High-level implementation roadmap for the ground-up rebuild. Each section describes a discrete workstream that will be planned in detail separately. This document establishes the order of operations, dependencies between workstreams, and the quality infrastructure that supports them.

Companion document: [`QUARTZ_SYNCER_REIMAGINED.md`](./QUARTZ_SYNCER_REIMAGINED.md) (strategic analysis).

---

## Table of Contents

- [Guiding Principles](#guiding-principles)
- [Implementation Phases](#implementation-phases)
  - [Phase 0 — Foundation](#phase-0--foundation)
  - [Phase 1 — Core Engine](#phase-1--core-engine)
  - [Phase 2 — User Experience](#phase-2--user-experience)
  - [Phase 3 — Power Features](#phase-3--power-features)
  - [Phase 4 — Polish & Ship](#phase-4--polish--ship)
- [Quality Infrastructure](#quality-infrastructure)
  - [Testing Strategy](#testing-strategy)
  - [CI/CD Pipeline](#cicd-pipeline)
  - [Issue Reproduction Workflows](#issue-reproduction-workflows)
- [Development Workflow](#development-workflow)
- [Workstream Dependency Graph](#workstream-dependency-graph)
- [Migration & Compatibility](#migration--compatibility)

---

## Guiding Principles

1. **Ship incrementally** — Each phase produces a usable plugin. Users never wait for the "big rewrite" to land. The old plugin continues working while the new one matures.

2. **Test before build** — Establish the test harness and CI pipeline before writing feature code. Every workstream starts with its test fixtures, not its implementation.

3. **Background-first architecture** — Design every pipeline operation assuming it will run in the background. Foreground interactions (publish modal, diff viewer) consume precomputed results.

4. **Platform-aware from day one** — The `GitBackend` interface and all feature code must account for the desktop/mobile split from the first commit, not bolted on later.

5. **Carry forward domain logic, rebuild infrastructure** — The file ownership model, merge conflict resolution, integration registry, and Quartz config services are battle-tested domain logic. The git transport, virtual filesystem, UI framework, and build chain are infrastructure that gets replaced.

6. **Patterns from motions and dev-mode** — Adopt the three-tier testing architecture (golden/E2E/unit), `justfile` workflow automation, `AGENTS.md` agentic documentation, Nix-pinned E2E environments, and `wdio-obsidian-service` for real-Obsidian testing. Adopt dev-mode's E2E fixture pattern for testing against real Quartz sites.

---

## Implementation Phases

### Phase 0 — Foundation

**Goal**: Empty shell plugin that builds, lints, type-checks, and has a green CI pipeline. No features yet — just the skeleton and quality infrastructure.

**Workstreams**:

#### 0.1 — Project Scaffold

New project structure, build system, and configuration. No Svelte — vanilla TypeScript with esbuild.

- Source layout: `src/` with feature-per-directory organization (matching motions pattern)
- Entry point: `src/main.ts` (minimal lifecycle: onload, onunload, settings)
- Build: esbuild (CJS, browser platform, external obsidian/electron/builtins)
- TypeScript: strict mode, ES2024 target, no implicit any
- Linting: ESLint with `eslint-plugin-obsidianmd`
- Formatting: Prettier
- Package manager: npm
- `justfile`: `check` (lint → tsc → build → test:unit), `bump`, `tag`, `lint`
- `AGENTS.md`: Project overview, environment, conventions, testing, agent do/don't
- `manifest.json`: `isDesktopOnly: false`, minimum Obsidian version 1.13

#### 0.2 — Test Infrastructure

Set up the three-tier testing architecture before writing any feature code.

- **Unit tests**: Vitest (replaces Jest). Configuration, mock setup, global window shim
- **E2E tests**: WebdriverIO + `wdio-obsidian-service` + Mocha. Test vault with fixture notes
- **Quartz integration tests**: Playwright-based fixture builds (adapted from dev-mode pattern). Build a minimal Quartz site, verify published content renders correctly
- **Nix flake**: Pin ChromeDriver, Chromium, system libraries for reproducible E2E
- **Test helpers**: Shared utilities for common E2E patterns (open settings, trigger publish, verify git state)

#### 0.3 — CI/CD Pipeline

Four GitHub Actions workflows (matching motions pattern).

- **lint.yml**: Build + lint + unit tests on all branches (Node 20.x, 22.x matrix)
- **e2e.yml**: E2E tests on main/master (parallel spec execution, Xvfb + herbstluftwm)
- **release.yml**: Tag-triggered release with provenance attestation
- **docs.yml**: Documentation site deployment (optional, if docs are rebuilt)

#### 0.4 — Settings & Configuration

Plugin settings interface with Obsidian 1.13 declarative API.

- Settings schema: flat keys (matching current `data.json` format for migration compatibility)
- Dual settings implementation: `getSettingDefinitions()` (1.13+) and `display()` fallback
- Settings migration: detect old schema versions, migrate transparently
- `SecretStorageService`: token management (carry forward from current implementation)
- Platform-conditional settings: desktop-only settings hidden on mobile via `visible` predicate

---

### Phase 1 — Core Engine

**Goal**: The plugin can connect to a Git repository, compile notes, and publish them. No UI yet — all operations driven by commands and CLI.

**Workstreams**:

#### 1.1 — Git Backend Interface + HttpClient

The abstraction layer and shared HTTP infrastructure. Git-first architecture: bundled fork is the primary publishing path.

- `GitBackend` interface: `clone()`, `fetch()`, `push()`, `commit()`, `readTree()`, `readBlob()`, `writeFiles()`, `deleteFiles()`, `getRemoteInfo()`, `listBranches()`, `testWriteAccess()`, `merge()`
- `GitBackendFactory`: selects backend — bundled git (default, all providers) or system git (desktop, if detected and preferred)
- `HttpClient`: wraps Obsidian's `requestUrl()` with retry, rate-limit tracking, error normalization. Used by bundled git fork as HTTP transport AND by provider API helpers
- Error types: structured errors (not null returns) for auth failure, network error, conflict, rate limit
- Progress reporting: callback-based progress for all long-running operations
- `PathMapper`: vault path ↔ repo path conversion. `contentFolder` prefix handling. Backends receive repo-relative paths only

#### 1.2 — Bundled Git Backend (Layer 1 — Primary)

Forked isomorphic-git as the primary publishing path for ALL providers. Works on all platforms via git smart HTTP protocol.

- Fork of isomorphic-git (MIT license, ~70 commands, pure JS)
- **HTTP transport**: use `HttpClient` (wrapping `requestUrl()`) instead of isomorphic-git's built-in HTTP — solves CORS
- **Filesystem adapter**: bridge to Obsidian's Vault API (reference: obsidian-git's `MyAdapter` pattern)
- Strip unused commands: keep ~20 of ~70 (clone, fetch, push, commit, add, remove, status, readTree, readBlob, writeBlob, writeTree, resolveRef, merge, walk, listRemotes, getRemoteInfo, listServerRefs)
- **GC/pack repacking**: implement pack consolidation to prevent repo bloat (reference: Shakespeare project's ~500 line implementation)
- **Memory management**: fix cache handling, chunked pack processing
- Atomic multi-file commits on every provider — no per-file commit pollution
- Tests: unit tests for git operations with mock HTTP transport, E2E tests against test repos

#### 1.3 — Provider API Helpers (Layer 2 — Non-Publishing)

Provider REST APIs for specific operations where APIs are faster or more capable than git protocol. NOT used for publishing.

- **GitHub API**: zero-config onboarding (repo creation via template, Pages setup, token validation), fast tree reading (skip fetch for status checks), connection testing
- **Other providers**: connection testing, fast tree reading (where available). Added incrementally based on demand
- Authentication: Bearer token via `SecretStorageService`
- Rate limit awareness: track provider-specific headers
- These are helpers — the Publisher always uses the bundled git backend for actual commits and pushes

#### 1.4 — System Git (Layer 3, Desktop Bonus)

Optional desktop upgrade for users who have git installed. Adds capabilities that bundled git cannot provide.

- `child_process.spawn('git', ...)` via `window.require('child_process')`
- Git binary detection: check PATH, configurable path in settings
- Operations: clone, fetch, push, commit, status, diff, log, rebase, sparse checkout
- SSH support: detect SSH URLs, use system SSH agent
- GPG signing: use system GPG for signed commits
- Auto-detected: if git binary exists, offer as upgrade; never required
- Fallback: if git binary not found, fall back to Layer 1 (bundled git)
- Tests: E2E tests against real git binary with test repo

#### 1.5 — Compilation Pipeline

The note transformation engine. Carried forward from current implementation with cleanup.

- `SyncerPageCompiler`: 4-step pipeline (frontmatter → integrations → link targeting → AST transform)
- `FrontmatterCompiler`: permalinks, timestamps, tags, CSS classes (carry forward)
- `PluginCompiler` + integration registry: Dataview, Datacore, Fantasy Statblocks, Excalidraw, Canvas, Bases (carry forward, clean up base class)
- `remark-obsidian` AST transform: comment stripping, vault path handling (carry forward)
- Asset extraction: `extractBlobLinks()` using `CachedMetadata` (complete Phase 1 migration from `OBSIDIAN_INTEGRATION_IMPROVEMENTS.md`)
- Tests: unit tests for each compiler step (carry forward 155 existing tests, migrate to Vitest)

#### 1.6 — Caching System

IndexedDB-backed file cache with background awareness.

- `DataStore`: IndexedDB via `localspace` (carry forward core design)
- Preload/flush pattern: bulk load to memory Map, dirty tracking, batch flush (carry forward)
- Per-file invalidation: replace version-based nuke with per-file `mtime` + hash comparison
- **`mtime` tracking**: record source file `mtime` when compiling. Before using cached result, verify current `mtime` matches. Before writing cache, verify file hasn't changed since read (guards against vault sync race conditions). Add `sourceMtime: number` to `QuartzSyncerCache` schema
- Dynamic content detection: `hasDynamicContent` flag for Dataview/Datacore files (carry forward)
- Remote hash cache: store remote tree OIDs for instant change detection
- Background-ready API: `markDirty(path)`, `getStaleFiles()`, `getPrecompiledResult(path)`
- Tests: unit tests for cache hit/miss/invalidation logic, **including mtime race condition tests** (simulate file modification between read and cache-write)

#### 1.7 — Publisher

The orchestrator connecting compilation, caching, and git operations.

- `Publisher.getPublishStatus()`: compare local cache hashes vs remote hashes
- `Publisher.publishBatch()`: compile (or use cached) → stage → commit → push via `GitBackend`
- `Publisher.deleteBatch()`: remove files from remote via `GitBackend`
- `PublishStatusManager`: categorize files (unpublished, changed, published, deleted)
- `PublishFile`: file wrapper with compilation and metadata (carry forward)
- Integration asset collection: SCSS files from integrations → `AssetSyncer` (carry forward)
- Backend-agnostic: works identically whether the underlying `GitBackend` is a provider API, bundled git, or system git
- Tests: E2E test publishing a note to a test repo, verifying it appears in the content tree

---

### Phase 2 — User Experience

**Goal**: The plugin has a full UI — publication center, diff viewer, settings, plugin browser. Background processing makes publish feel instant.

**Workstreams**:

#### 2.1 — Publication Center (Vanilla)

The main publish modal, rebuilt with vanilla Obsidian APIs.

- `PublicationCenter` extends `Modal`: file tree, selection, progress, publish action
- Tree view: recursive DOM builder using `createEl()` with checkbox state management
- File categorization display: unpublished (green), changed (yellow), deleted (red)
- Progress tracking: Obsidian's `ProgressBarComponent` for compile/push progress
- Batch selection: select all, deselect all, toggle by category
- Responsive: adapts layout for mobile (simplified, no split panes)
- Tests: E2E test opening modal, selecting files, verifying UI state

#### 2.2 — Diff Viewer (Vanilla)

Side-by-side and unified diff viewer, rebuilt without Svelte.

- `DiffModal` extends `Modal`: split and unified views
- Diff computation: `diff` library (carry forward algorithm)
- Scroll synchronization: `requestAnimationFrame`-based sync (carry forward logic)
- Auto mode: split on desktop, unified on mobile (carry forward)
- Syntax highlighting: use Obsidian's `MarkdownRenderer.render()` for preview
- Tests: E2E test opening diff view, verifying content matches expected diff

#### 2.3 — Background Processing Engine

The key UX differentiator — precompile notes so publish is instant.

- **Vault change listener**: `vault.on('modify')`, `vault.on('create')`, `vault.on('delete')`, `vault.on('rename')` → debounced recompilation (2s delay)
- **Compilation queue**: priority queue with concurrency limit. Changed files enqueued immediately, dynamic content files (Dataview) enqueued on any vault change
- **Remote hash prefetch**: periodic fetch of remote content tree (configurable interval, desktop only). Compare OIDs against local cache to detect remote changes
- **Status indicator**: ribbon icon badge or status bar showing "3 files ready to publish" / "synced" / "offline"
- **Desktop auto-publish** (optional): configurable interval for automatic publishing of all pending changes
- **Cancellation**: all background work cancellable via `AbortController`
- Tests: unit test for queue behavior, E2E test verifying publish is fast after background precompilation

#### 2.4 — Quartz Config Management

Quartz v5 YAML config editing, plugin management, upgrade service.

- `QuartzConfigService`: YAML read/write with comment preservation (carry forward)
- `QuartzPluginManager`: add/remove/find plugins (carry forward + add npm specifier support)
- `QuartzPluginRegistry`: community registry fetch with persistent cache (carry forward + add TTL cache)
- `QuartzVersionDetector`: v5-yaml, v5-json, v4 detection (carry forward)
- `QuartzUpgradeService`: upstream merge with conflict handling (carry forward + add rollback)
- Plugin browser modal: vanilla Obsidian `Modal` (carry forward existing vanilla implementation)
- npm specifier support: detect `@quartz-community/*` format, handle alongside `github:org/repo`
- Schema validation: use Quartz's JSON Schema for pre-write validation
- Plugin dependency graph: warn when disabling plugins that others depend on
- Tests: unit tests for YAML roundtrip, plugin resolution, version detection

#### 2.5 — CLI System

Command-line interface for automation and scripting.

- 12+ commands: carry forward all existing commands (status, sync, publish, delete, mark, test, cache, config, upgrade, version, plugin, quartz-config)
- New commands: `setup` (one-click onboarding), `background` (control background processing)
- Handler pattern: centralized registration, consistent error handling, JSON/text output (carry forward)
- Pre-flight checks: connection test, auth validation (carry forward)
- Tests: unit tests for CLI argument parsing, E2E tests for key commands

---

### Phase 3 — Power Features

**Goal**: Desktop-exclusive capabilities, advanced onboarding, and multi-provider support.

**Workstreams**:

#### 3.1 — Zero-Config Onboarding

Guided setup that creates a Quartz site from scratch.

- **Setup wizard modal**: step-by-step flow in vanilla Obsidian `Modal`
- **GitHub token input**: single field, validate token permissions via API
- **Repo detection**: check if user already has a Quartz repo (search GitHub repos)
- **Repo creation**: fork/template from `jackyzha0/quartz` via GitHub API
- **GitHub Pages setup**: enable Pages via API, configure deployment
- **Auto-configure**: set remote URL, branch, content folder automatically
- **First publish**: guide user through marking a note and publishing
- Desktop: full wizard with repo creation. Mobile: connect to existing repo only
- Tests: E2E test for the complete onboarding flow (with mock GitHub API)

#### 3.2 — Bundled Git Fork Enhancements

Ongoing improvements to the forked isomorphic-git (Layer 2 backend).

- **Advanced merge conflict resolution**: full 3-way merge with conflict markers, ours/theirs/union strategies
- **Performance profiling**: identify and fix bottlenecks for large vaults
- **Pack optimization**: delta compression, thin packs for faster push
- **TypeScript migration**: optional but improves contributor experience
- **Upstream cherry-picking**: selectively pull fixes from upstream isomorphic-git
- Tests: stress tests with large repos, merge conflict scenarios, pack bloat detection

#### 3.3 — Advanced Desktop Features

Features that leverage Electron/Node.js capabilities.

- `electron.safeStorage`: encrypted token storage on desktop
- Auto-publish on interval: configurable background publish timer
- Commit message scripts: run shell command to generate commit message (matching obsidian-git pattern)
- External grep: ripgrep integration for fast vault search (if applicable to publishing workflows)
- File watcher optimization: `@parcel/watcher` or `chokidar` for efficient filesystem monitoring (vs polling)
- Tests: desktop-only E2E tests gated by `Platform.isDesktopApp`

---

### Phase 4 — Polish & Ship

**Goal**: Production-ready release with migration path, documentation, and community feedback.

**Workstreams**:

#### 4.1 — Migration Path

Transparent upgrade from current Quartz Syncer to the rebuilt version.

- Settings migration: detect schema version, transform old settings to new format
- Cache migration: preserve existing IndexedDB cache if format is compatible, or clear gracefully
- Git state: new backends don't use lightning-fs — old IndexedDB filesystem can be cleaned up
- No breaking changes to `data.json` key names where possible
- Version gate: show one-time migration notice on first load of new version
- Tests: migration tests with fixture `data.json` files from various old versions

#### 4.2 — Documentation

User-facing and contributor documentation.

- `AGENTS.md`: complete agentic workflow documentation (matching motions pattern)
- `CONTRIBUTING.md`: development guide, codebase structure, testing, conventions
- `README.md`: updated feature list, installation, setup guide
- Documentation site: Quartz v5 (matching motions pattern) at `saberzero1.github.io/quartz-syncer-docs/`
- Change-to-page routing: feature changes → doc updates (matching motions pattern)
- Auto-generated pages: CHANGELOG.md, KNOWN_LIMITATIONS.md (CI-built)

#### 4.3 — Beta Program & Community Feedback

Controlled rollout for early feedback.

- Beta releases via BRAT (Obsidian42 BRAT plugin)
- GitHub Discussions for feedback collection
- Issue templates: bug report (with reproduction steps), feature request
- Telemetry: none (privacy-first, matching Obsidian developer policies)
- Feedback-driven iteration: prioritize Phase 3 workstreams based on beta feedback

---

## Quality Infrastructure

### Testing Strategy

Three-tier architecture adapted from motions, with a Quartz-specific integration layer adapted from dev-mode.

#### Tier 1 — Unit Tests (Vitest)

Fast, isolated tests for pure logic. Run on every commit, all branches.

| Domain | What's tested | Mock strategy |
|--------|--------------|---------------|
| Compilation pipeline | Frontmatter enrichment, AST transforms, integration pattern matching | Mock `MetadataCache`, mock integration APIs |
| Caching | Cache hit/miss, invalidation, preload/flush, dynamic content detection | In-memory store (no IndexedDB) |
| Git backends | Request construction, response parsing, error handling, retry logic | Mock HTTP responses |
| CLI | Argument parsing, output formatting, pre-flight checks | Mock plugin instance |
| Quartz services | YAML roundtrip, plugin resolution, version detection, config validation | Fixture YAML/JSON files |
| Settings | Migration between schema versions, default merging | Fixture `data.json` files |
| Background engine | Queue behavior, debouncing, cancellation, concurrency limits | Mock compiler, mock vault events |

#### Tier 2 — E2E Tests (WebdriverIO + wdio-obsidian-service)

Real Obsidian instance tests. Run on main/master only. Parallel spec execution.

| Domain | What's tested | Setup |
|--------|--------------|-------|
| Plugin lifecycle | Load, unload, reload, settings persistence | Test vault with fixture notes |
| Publication center | Open modal, file tree rendering, selection, progress display | Mock git backend (no real push) |
| Diff viewer | Split/unified rendering, scroll sync, content accuracy | Pre-computed diff fixtures |
| Settings UI | All settings render, toggles persist, platform gating works | Fresh plugin instance |
| Commands | All Obsidian commands registered and executable | Command palette interaction |
| CLI commands | CLI handler invocation and output format | `obsidian command id=` via WDIO |
| Background processing | Status indicator updates, precompilation triggers | Vault file modification events |
| Onboarding wizard | Step-by-step flow, validation, error states | Mock GitHub API |

#### Tier 3 — Quartz Integration Tests (Playwright + dev-mode fixture pattern)

End-to-end verification that published content renders correctly in Quartz. Adapted from dev-mode's E2E fixture pattern.

| Scenario | What's verified |
|----------|----------------|
| Basic publish | Markdown note published via API → Quartz builds → page renders with correct content |
| Frontmatter | Permalinks, timestamps, tags appear correctly in rendered page |
| Dataview output | Pre-compiled Dataview queries render as static HTML in Quartz |
| Asset embedding | Images published as base64 or binary blobs render in browser |
| Plugin config | Quartz config changes via Syncer → site rebuilds with correct plugins |
| Upgrade | Upstream merge → site still builds → no broken pages |

**Fixture infrastructure**:
- Minimal Quartz v5 clone with test content
- `build-fixture.ts` script: copy test content → build Quartz site → serve static output
- Playwright tests verify rendered HTML against expected content
- Runs separately from E2E (longer, requires Quartz build toolchain)

#### Coverage Tracking

- Unit test coverage: Vitest c8 reporter (track statement/branch/function coverage)
- E2E coverage: command-level coverage tracking via `neovim-command-index.yaml`-style manifest (list every publishable action, track which have E2E tests)
- Integration test coverage: fixture-level coverage (which publish scenarios are tested)

### CI/CD Pipeline

Four workflows matching motions pattern, plus one Quartz-specific workflow.

```
┌──────────────────────────────────────────────────────┐
│                    lint.yml                            │
│  Trigger: push (all branches), PR                     │
│  Matrix: Node 20.x, 22.x                             │
│  Steps: checkout → npm ci → build → lint → test:unit  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    e2e.yml                             │
│  Trigger: push (main/master), PR to main              │
│  Steps: discover specs → parallel jobs (1 per spec)   │
│  Setup: Xvfb + herbstluftwm + Obsidian cache          │
│  Timeout: 30 minutes                                  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│               quartz-integration.yml                  │
│  Trigger: push (main), weekly schedule                │
│  Steps: clone Quartz → build fixtures → Playwright    │
│  Timeout: 15 minutes                                  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  release.yml                          │
│  Trigger: push tag (no v prefix)                      │
│  Steps: build → attest provenance → gh release create │
│  Artifacts: main.js, manifest.json, styles.css        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    docs.yml                           │
│  Trigger: push (main, docs/**), manual                │
│  Steps: build Quartz docs site → deploy GitHub Pages  │
│  Auto-generate: CHANGELOG, KNOWN_LIMITATIONS          │
└──────────────────────────────────────────────────────┘
```

**Quality gates** (all must pass before merge):
- ESLint (obsidianmd plugin rules)
- TypeScript strict mode (`tsc --noEmit`)
- Vitest unit tests (all pass)
- esbuild production build (no errors)
- E2E tests (all pass, main branch only)

### Issue Reproduction Workflows

Systematic approach to reproducing, verifying, and preventing regressions.

#### Bug Triage Protocol

1. **Reproduce first**: Every bug report gets a reproduction attempt before investigation. If it can't be reproduced, request more information with a template
2. **Fixture capture**: When a bug is reproduced, capture the minimal reproduction as a test fixture (vault content, settings, steps). This fixture becomes a permanent regression test
3. **Write the failing test first**: Before fixing, write a test that fails with the current code and demonstrates the bug. This is the TDD anchor — the fix is only valid when this test passes
4. **Fix minimally**: No refactoring during bug fixes. The diff should be the smallest change that makes the failing test pass
5. **Regression gate**: The fixture test stays in the test suite permanently. If a future change breaks it, CI catches it

#### Reproduction Infrastructure

- **Test vault fixtures**: `test/vaults/` directory with named scenarios (e.g., `dataview-inline-query/`, `nested-wikilinks/`, `unicode-filenames/`)
- **Settings fixtures**: `test/fixtures/settings/` with `data.json` snapshots from various configurations
- **Git state fixtures**: `test/fixtures/git/` with mock repository states (clean, dirty, conflicted, diverged)
- **Quartz config fixtures**: `test/fixtures/quartz/` with various `quartz.config.yaml` states (v4, v5-json, v5-yaml, custom plugins)

#### Agentic Issue Investigation

When an issue is reported that can't be immediately reproduced:

1. **Explore agent**: Search codebase for the affected code path, identify potential failure modes
2. **Librarian agent**: Research if the issue is known in upstream dependencies (isomorphic-git, Obsidian API, Quartz)
3. **Oracle consultation**: If the failure mode is unclear after exploration, consult Oracle with the full error context and code path
4. **Fixture creation**: Create a test vault that exercises the exact scenario described in the issue
5. **E2E verification**: Run the fixture through the E2E suite to confirm reproduction or non-reproduction
6. **Document**: Add findings to the issue, either as a confirmed reproduction with test fixture or a "cannot reproduce" with investigation notes

---

## Development Workflow

### Local Development

```bash
# First-time setup
nix develop                    # Enter reproducible dev environment
npm install                    # Install dependencies

# Daily development
npm run dev                    # Watch mode (rebuilds on change)
# → Symlink or copy main.js + manifest.json + styles.css to vault plugin dir

# Before committing
just check                     # lint → tsc → build → test:unit

# E2E testing
npm run test:e2e               # Full E2E suite (requires nix develop)
npx wdio run ./wdio.conf.mts --spec test/specs/publish.e2e.ts  # Single spec

# Quartz integration testing
npm run test:quartz            # Build Quartz fixture + Playwright tests
```

### justfile Recipes

```
just check              # Full pre-commit: lint → tsc → build → test:unit
just bump <version>     # Bump version in manifest.json + versions.json
just tag <version>      # Create and push git tag
just lint               # Prettier + ESLint
just e2e                # Full E2E suite
just quartz             # Quartz integration tests
```

### AGENTS.md Structure

Comprehensive agentic workflow documentation (matching motions pattern):

- Project overview (TypeScript → bundled JavaScript, Obsidian community plugin)
- Environment & tooling (npm, esbuild, Vitest, WebdriverIO, Playwright)
- Architecture overview (git backend interface, compilation pipeline, caching, background engine)
- Platform split (desktop capabilities, mobile capabilities, feature gating pattern)
- File & folder conventions (source layout, one feature per file, registration pattern)
- Testing (three tiers, test helpers, fixture patterns, coverage tracking)
- Settings (dual implementation: declarative + imperative, migration)
- CLI commands (handler pattern, flag conventions)
- Git backend contract (interface methods, error types, progress reporting)
- Quartz services (config service, plugin management, upgrade service)
- Agent do/don't (carry forward from motions, add Quartz-specific rules)
- Common tasks (add a git backend, add an integration, add a CLI command, add a setting)

---

## Workstream Dependency Graph

```
Phase 0 (Foundation)
  0.1 Project Scaffold ─────────────────────────────────────┐
  0.2 Test Infrastructure ──── depends on 0.1 ──────────────┤
  0.3 CI/CD Pipeline ────────── depends on 0.1, 0.2 ────────┤
  0.4 Settings & Configuration ─ depends on 0.1 ────────────┘

Phase 1 (Core Engine) ─── all depend on Phase 0
  1.1 Git Backend Interface + HttpClient ────────────────────┐
  1.2 Bundled Git Backend (fork) ── depends on 1.1 ──────────┤
  1.3 Provider API Helpers ──────── depends on 1.1 (parallel w/1.2)
  1.4 System Git Backend ────────── depends on 1.1 (deferred to Phase 3)
  1.5 Compilation Pipeline ──────── independent of 1.1-1.4 ──┤
  1.6 Caching System ────────────── depends on 1.5 ──────────┤
  1.7 Publisher ─────────────────── depends on 1.2, 1.5, 1.6 ┘

Phase 2 (User Experience) ─── all depend on Phase 1
  2.1 Publication Center ────── depends on 1.7 ──────────────┐
  2.2 Diff Viewer ───────────── depends on 1.7 (parallel w/2.1)
  2.3 Background Processing ── depends on 1.5, 1.6, 1.7 ────┤
  2.4 Quartz Config Management ─ depends on 1.1 (parallel) ──┤
  2.5 CLI System ──────────────── depends on 1.7, 2.4 ───────┘

Phase 3 (Power Features) ─── depends on Phase 2
  3.1 Zero-Config Onboarding ── depends on 1.3 (GitHub API helpers) ┐
  3.2 Bundled Git Fork Enhancements ── depends on 1.2 ──────────────┤
  3.3 Advanced Desktop Features ── depends on 1.4, 2.3 ────────────┘

Phase 4 (Polish & Ship)
  4.1 Migration Path ────────── depends on Phase 2 complete
  4.2 Documentation ─────────── depends on Phase 2 complete
  4.3 Beta Program ──────────── depends on 4.1, 4.2
```

**Parallelism opportunities**:
- 1.2, 1.3, and 1.4 can all be built in parallel (all implement 1.1 interface)
- 1.5 is independent of the git layer — can be built in parallel with 1.1-1.4
- 2.1 and 2.2 can be built in parallel
- 2.4 is largely independent of 2.1-2.3
- Phase 3 workstreams are all independent of each other
- 0.2 and 0.4 can start as soon as 0.1 is done

**Critical path**: 0.1 → 0.2 → 1.1 → 1.2 → 1.7 → 2.1 → 2.3 → 4.1 → 4.3

**Git-first build order**: Start with 1.2 (bundled git fork — works with ALL providers, one codepath). Provider API helpers (1.3) and system git (1.4) are incremental additions that don't block core publishing.

---

## Migration & Compatibility

### Settings Compatibility

- New plugin reads old `data.json` format transparently
- Schema version field (`settingsSchemaVersion`) used to detect and migrate
- All existing setting keys preserved where possible (no gratuitous renames)
- New settings get sensible defaults that match old behavior

### Cache Compatibility

- Old lightning-fs IndexedDB databases can be detected and cleaned up (offer "clear old cache" in migration notice)
- New `DataStore` uses same `localspace` library — cache entries from old version may be partially compatible
- Safe default: clear cache on major version upgrade, recompile everything

### Quartz Version Support

- Quartz v5 (YAML config): full support from Phase 1
- Quartz v5 (JSON config, legacy): read support with migration prompt
- Quartz v4: detect and show upgrade prompt (no active support in rebuilt version)

### Feature Parity Checklist

Before shipping the rebuilt version, verify parity with current v1.18.0:

- [ ] Connect to GitHub/GitLab/Bitbucket/Codeberg/Gitea/self-hosted
- [ ] Publish notes with frontmatter enrichment
- [ ] Delete notes from remote
- [ ] Dataview/Datacore/Fantasy Statblocks integration
- [ ] Excalidraw/Canvas/Bases support
- [ ] Diff viewer (split + unified)
- [ ] Selective publishing (choose which notes)
- [ ] Cache management (clear per-file, clear all)
- [ ] Quartz config editing (site settings, plugin management, layout)
- [ ] Quartz upstream upgrade with conflict resolution
- [ ] CLI commands (all 12)
- [ ] CORS proxy support (for non-API git backends)
- [ ] Multi-provider authentication (basic, bearer, none)

### What's Intentionally Dropped

- Svelte runtime and build dependency
- Upstream `isomorphic-git` as a direct dependency (replaced by `saberzero1/isomorphic-git` fork with GC, memory fixes, stripped to essential commands)
- `@isomorphic-git/lightning-fs` virtual filesystem (replaced by custom Vault API adapter for the fork)
- Provider REST APIs as the publishing transport (git push via bundled fork handles all providers universally. APIs demoted to helpers for onboarding and fast reads)
- `jest` test runner (replaced by Vitest)
- Regex-based link/embed discovery (replaced by `CachedMetadata` API)
- System git as a hard requirement on any platform (always optional, never the only path)
- Per-file commits via provider Contents APIs (bundled git fork produces clean atomic commits on every provider)
