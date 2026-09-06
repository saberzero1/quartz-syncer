# Changelog

## Unreleased

### Upgrade notes

Cache databases are now scoped per vault. Obsidian shares IndexedDB across an installation, so two vaults could previously share a repository clone or a compiled-output cache — the first could let two vaults publishing to the same remote overwrite each other's staged commits, and the second could serve one vault's compiled output to another.

As a result, the first publish after upgrading performs a one-time re-clone of the Quartz repository and a one-time recompile of published notes. Both happen lazily on first use rather than at startup, but large vaults and large repositories will notice the delay once. Databases from earlier versions are left in place so that downgrading still works.

### Fixed
- Publishing to Quartz v4 repositories is now explicitly supported; v5-only site management is refused with a clear message instead of failing confusingly
- Vault changes to several notes within one debounce window no longer drop all but the last note from background compilation
- Compilation queue no longer rescans and re-sorts on every insertion, and no longer processes the same file twice concurrently
- Disabling the cache no longer leaves cached reads and writes active during publishing, and media-link tracking now works with the cache disabled
- Publish status no longer walks every note's media links twice
- A repository read that is superseded by a publish no longer repopulates the remote tree cache with pre-publish state
- Removed the v1 migration notice's cache cleanup, which matched live repository clones rather than the caches it claimed to remove

## 2.0.0

### Architecture
- Rebuilt from the ground up for performance and reliability
- Git transport: forked isomorphic-git (`saberzero1/isomorphic-git`) with GC/pack repacking and `requestUrl()` HTTP transport
- UI: vanilla Obsidian APIs (removed Svelte dependency)
- Settings: Obsidian 1.13 declarative settings API (searchable, validated)
- Tests: migrated from Jest to Vitest (unit), WebdriverIO (E2E), Playwright (Quartz integration)
- Minimum Obsidian version: 1.13.0
- Replaced `localspace` with custom 80-line IndexedDBStore (saves 68KB)
- Replaced VaultFsAdapter with LightningFS for isomorphic-git filesystem

### Added
- Background pre-compilation: notes compile on vault change, Publication Center opens instantly
- Smart cache invalidation: Dataview/Datacore revision tracking for dynamic content
- Remote tree caching: periodic background fetch of remote repo state (configurable, default 60s)
- Zero-config onboarding wizard (GitHub): create repo from Quartz template, enable Pages, configure plugin
  - Repo name validation and availability pre-check
  - Private/public toggle with GitHub Pro hint
  - User-friendly error messages for GitHub API errors
- Auto-publish timer (desktop only)
- Encrypted token storage via electron.safeStorage (desktop) with SecretStorage fallback (mobile)
- Diff viewer with split/unified modes and scroll synchronization
- 12 CLI commands for terminal automation
- Quartz v5 npm plugin management (list, add, remove, update, registry browse)
- Quartz v5 site configuration read/write with schema validation
- ProcessRunner for desktop system binary execution (git, npm, npx, node)
- Publisher pauses background compilation during publish to prevent cache contention
- Settings changes invalidate cached Publisher instance (fresh PathMapper, RemoteTreeCache)

### Changed
- CompilationQueue: added pause/resume, deduplication, onStatusChange callback
- BackgroundEngine: full rewrite with CompilationQueue integration, Dataview/Datacore event listeners, focused-file skip, startup pre-warm, startup noise guard
- DataStore: added dataviewRevision/datacoreRevision tracking, trustDynamicCache parameter
- Publisher: uses RemoteTreeCache, pauses/resumes CompilationQueue, trusts dynamic cache from background engine
- Onboarding wizard: typed error mapping (ConflictError, AuthError, NotFoundError, NetworkError, RateLimitError), client-side name validation, v5 default branch fallback

### Removed
- Svelte dependency
- localspace dependency (replaced by custom IndexedDBStore)
- Jest test runner (replaced by Vitest)

### Performance
- Publication Center: compile phase reduced from ~3600ms to ~2ms with warm cache
- Remote tree fetch: cached with configurable interval, ~0ms on cache hit vs ~400ms network
- Background compilation: concurrency 1 with setTimeout(0) yielding, batched pre-warm (10 files/50ms)
- Active file skipped during background compilation to avoid UI interference

### Migration
- Settings automatically migrate from v1
- Old LightningFS cache can be cleaned up via the migration notice on first v2 load
- Quartz upstream upgrade temporarily requires manual `npx quartz update`
- First stable release should be 2.0.1 (not 2.0.0) to avoid BRAT semver upgrade trap
