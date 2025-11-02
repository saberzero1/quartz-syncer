# Quartz Syncer - Copilot Development Guide

## Project Overview

Obsidian plugin for publishing notes to Quartz static-site generator. TypeScript/Svelte project that compiles to `main.js` bundle.

**Tech Stack**: TypeScript, Svelte, esbuild | **Node**: 20.6.0 (`.nvmrc`) | **Entry**: `main.ts` (534 lines)

## Build Commands

**CRITICAL: Always run `npm install` first** after cloning or when dependencies change.

### Essential Commands
```bash
npm install              # Install deps (~50s, shows 3 known svelte warnings - ignore)
npm run build            # Production build (~800ms, creates 1.0MB main.js) - CI uses this
npm run dev              # Dev build (3.3MB with sourcemaps, copies to docs/.obsidian/)
npm run test             # Jest tests (~6s, 2 suites, 7 tests)
npm run lint             # ESLint check (~3s)
npm run format           # Auto-fix formatting with Prettier
npm run check-formatting # Check Prettier formatting
npm run typecheck        # TypeScript type check (~3s)
```

### Pre-Commit Validation (matches CI)
```bash
npm run lint && npm run check-formatting && npm run typecheck && npm run build && npm run test
```

## CI/CD (GitHub Actions)

**Runs on**: Every PR and push to main/master. **All 4 jobs must pass**:
1. `lint-and-check-formatting`: ESLint + Prettier
2. `build`: Production build (uploads main.js artifact)
3. `run-tests`: Jest tests  
4. `run-typecheck`: TypeScript check

**Also runs**: CodeQL security scanning (weekly + on PRs), Release workflow (on tags)

**Fix CI failures**:
- Lint: `npm run format && npm run lint-fix`
- Types: Fix errors from `npm run typecheck`
- Tests: Fix failures from `npm run test`

## Project Structure

### Key Source Directories
```
src/
├── compiler/          # Frontmatter/plugin compilation (Dataview, Excalidraw, Mermaid)
├── models/            # Data models, settings.ts (plugin settings interface)
├── publishFile/       # File validation, metadata, PublishFile.ts
├── publisher/         # Publishing workflow, Publisher.ts, *.test.ts
├── repositoryConnection/ # GitHub API (RepositoryConnection.ts, QuartzSyncerSiteManager.ts)
├── ui/                # Svelte components (Icon.svelte, LineDiff.svelte, TreeView/)
├── utils/             # Utilities (utils.ts, utils.test.ts, regexes.ts)
└── views/             # Settings UI (QuartzSyncerSettingTab.ts, PublicationCenter/, SettingsView/)
```

### Root Files
- `main.ts` - Plugin entry point (DEFAULT_SETTINGS, main plugin class)
- `package.json` - npm scripts (dev, build, test, lint, format, etc.)
- `tsconfig.json` - TypeScript config (extends @tsconfig/svelte, target es2024, commonjs)
- `esbuild.config.mjs` - Build config (bundles to main.js, external: obsidian/electron)
- `eslint.config.mjs` - ESLint flat config (TS/Svelte, ignores: *.js, scripts, docs, content)
- `.prettierrc.json` - Prettier config (tabs, 80 chars, semicolons, double quotes)
- `manifest.json` - Obsidian plugin manifest (version, author, minAppVersion)
- `justfile` - Optional task runner (check, full, dev, prod commands)

## Configuration & Code Style

**ESLint** (`eslint.config.mjs` - flat config):
- Ignores: `**/*.js`, scripts, test vaults, content, docs
- Rules: No `any` type, unused vars prefixed with `_`, prettier/prettier errors, blank lines before returns/ifs
- Svelte files must use `<script lang="ts">`

**Prettier** (`.prettierrc.json`):
- Tabs (not spaces), 80 chars, semicolons required, double quotes

**TypeScript** (`tsconfig.json`):
- Target es2024, commonjs, `noImplicitAny: true`

**Build** (`esbuild.config.mjs`):
- Entry: `main.ts` → `main.js` (CommonJS)
- External: obsidian, electron, Node builtins
- Svelte CSS injected into bundle

**Git**: `main.js` gitignored (only in releases), `node_modules`, test vault workspace files

## Known Issues & Workarounds

**Security warnings**: 3 moderate svelte vulnerabilities (from obsidian-dataview dependency) - **safe to ignore**, don't run `npm audit fix --force`

**Build size warning**: esbuild shows ⚠️ for main.js size (1.0MB prod, 3.3MB dev) - **expected and normal**

**MODULE_NOT_FOUND after install**: If dependencies fail after `npm install`, run:
```bash
rm -rf node_modules package-lock.json && npm install
```

## Development Tips

1. **Fast build** (~800ms) - rebuild frequently to catch errors early
2. **Use tabs, not spaces** - enforced by Prettier
3. **No `any` types** - enforced by ESLint, all params need explicit types  
4. **Test files**: `*.test.ts` suffix, placed next to code, uses Jest with ts-jest
5. **Svelte components**: Must have `<script lang="ts">`, CSS injected into bundle
6. **Main entry**: `main.ts` has plugin lifecycle (onload, onunload, settings)
7. **GitHub API**: `src/repositoryConnection/` for API communication
8. **Compilation logic**: `src/compiler/` converts Obsidian → Quartz format
9. **Version updates**: Use `version-bump.mjs` to sync package.json, manifest.json, versions.json
10. **Trust these instructions first** - only explore codebase if info here is incomplete/incorrect
