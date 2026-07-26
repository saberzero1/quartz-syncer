# Changelog

## 2.0.0

### Changed
- Rebuilt from the ground up for performance and reliability
- Git transport: forked isomorphic-git with GC/pack repacking and Vault API adapter
- UI: vanilla Obsidian APIs (removed Svelte dependency)
- Settings: Obsidian 1.13 declarative settings API
- Tests: migrated from Jest to Vitest
- Minimum Obsidian version: 1.13.0

### Added
- Zero-config onboarding wizard (GitHub)
- Background precompilation (compile on vault change, publish instantly)
- Auto-publish timer (desktop only)
- Encrypted token storage via electron.safeStorage (desktop)
- Diff viewer with split/unified modes and scroll synchronization
- 12 CLI commands for terminal automation
- Quartz v5 npm plugin specifier support

### Removed
- Svelte dependency
- @isomorphic-git/lightning-fs (replaced by Vault API adapter)
- Jest test runner (replaced by Vitest)

### Migration
- Settings automatically migrate from v1
- Old lightning-fs cache can be cleaned up via the migration notice on first v2 load
- Quartz upstream upgrade temporarily requires manual `npx quartz update`
