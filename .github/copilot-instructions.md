# Quartz Syncer - Copilot Development Guide

## Project Overview

Quartz Syncer is an Obsidian plugin for managing and publishing notes to Quartz, a fast static-site generator. This is a TypeScript/Svelte project that compiles to a single JavaScript bundle (`main.js`) for use as an Obsidian plugin.

**Repository Size**: ~250MB (mostly node_modules)  
**Main Entry Point**: `main.ts` (534 lines)  
**Languages**: TypeScript, Svelte, JavaScript  
**Build Tool**: esbuild  
**Package Manager**: npm  
**Node Version**: 20.6.0 (specified in `.nvmrc`)

## Build and Development Commands

### Critical: Command Execution Order

**ALWAYS run `npm install` first** before any other command after cloning or when dependencies change. Build, lint, and test commands will fail without dependencies installed.

### Standard Commands (Run in Order)

1. **Install dependencies** (REQUIRED FIRST):
   ```bash
   npm install
   ```
   - Takes ~45-50 seconds
   - Installs git hooks via husky (runs automatically via prepare script)
   - May show deprecation warnings (safe to ignore)
   - May show 3 moderate security vulnerabilities in svelte dependencies (known issue, doesn't affect build)

2. **Development build** (with sourcemaps):
   ```bash
   npm run dev
   ```
   - Creates `main.js` with inline sourcemaps (~3.3MB)
   - Takes ~800-900ms
   - Runs post-build script `generateSyncerSettings.mjs` automatically
   - Also copies files to `./docs/.obsidian/plugins/quartz-syncer/` for testing

3. **Production build**:
   ```bash
   npm run build
   ```
   - Creates optimized `main.js` (~1.0MB, no sourcemaps)
   - Takes ~800ms
   - **THIS IS THE COMMAND CI USES** - always validate with this before committing

4. **Run tests**:
   ```bash
   npm run test
   ```
   - Uses Jest with ts-jest preset
   - Takes ~5-6 seconds
   - Currently 2 test suites, 7 tests (all passing)
   - Test files: `src/utils/utils.test.ts`, `src/publisher/Publisher.test.ts`

5. **Lint code**:
   ```bash
   npm run lint
   ```
   - Uses ESLint with TypeScript and Svelte support
   - Checks `.ts` and `.svelte` files
   - Takes ~2-3 seconds when passing
   - **Run before committing** - CI will fail if linting fails

6. **Check formatting**:
   ```bash
   npm run check-formatting
   ```
   - Uses Prettier to check formatting
   - Takes ~1-2 seconds
   - **Run before committing** - CI will fail if formatting is wrong

7. **Auto-fix formatting**:
   ```bash
   npm run format
   ```
   - Auto-formats all files with Prettier
   - Takes ~2-3 seconds
   - Run this if `check-formatting` fails

8. **Type checking**:
   ```bash
   npm run typecheck
   ```
   - Runs TypeScript compiler in check mode (no emit)
   - Takes ~2-3 seconds
   - **Run before committing** - CI will fail if types are wrong

### Complete Validation Sequence

Before committing changes, run these commands in order (this matches CI):
```bash
npm install
npm run lint
npm run check-formatting
npm run typecheck
npm run build
npm run test
```

Shortcut using justfile (if `just` is installed):
```bash
just check  # Runs lint, test, check-formatting, typecheck
just full   # Runs lint, check, and prod build
```

## Continuous Integration (GitHub Actions)

### CI Workflows Overview

CI runs on **every PR and push to main/master**. The following jobs run in parallel:

1. **lint-and-check-formatting**: ESLint + Prettier checks
2. **build**: Production build (uploads `main.js` artifact)
3. **run-tests**: Jest tests
4. **run-typecheck**: TypeScript type checking

**All four jobs must pass** for CI to succeed. Each job:
- Uses Node version from `.nvmrc` (20.6.0)
- Runs `npm install` first
- Uses npm cache for faster builds

### Additional Workflows

- **CodeQL Advanced**: Security scanning (runs on push to main/backup, PRs, and weekly schedule)
- **Release**: Creates GitHub releases when tags are pushed (runs `npm ci --include=dev` then `npm run build`)

### Common CI Failures

- **Linting failures**: Run `npm run lint-fix` then `npm run format` to auto-fix most issues
- **Type errors**: Fix TypeScript errors shown by `npm run typecheck`
- **Test failures**: Fix tests shown by `npm run test`
- **Formatting failures**: Run `npm run format` to auto-fix

## Project Structure

### Root Files
- `main.ts` - Plugin entry point (534 lines, defines DEFAULT_SETTINGS, main plugin class)
- `manifest.json` - Obsidian plugin manifest (version, metadata)
- `package.json` - npm dependencies and scripts
- `tsconfig.json` - TypeScript configuration (extends @tsconfig/svelte)
- `jest.config.js` - Jest test configuration
- `eslint.config.mjs` - ESLint configuration (flat config format)
- `esbuild.config.mjs` - Build configuration
- `.prettierrc.json` - Prettier formatting rules (tabs, 80 chars, semicolons)
- `.editorconfig` - Editor settings (tabs, UTF-8)
- `.nvmrc` - Node version (20.6.0)
- `justfile` - Just task runner recipes (optional, not required)
- `version-bump.mjs` - Script to update version in manifest.json, versions.json, package.json
- `styles.css` - Plugin styles (11KB)

### Source Code Structure (`src/`)

```
src/
├── compiler/               # Frontmatter and plugin compilation
│   ├── FrontmatterCompiler.ts
│   ├── PluginCompiler.ts
│   ├── SyncerPageCompiler.ts
│   └── plugins/            # Dataview, Excalidraw, Mermaid compilers
├── models/                 # Data models and settings
│   ├── settings.ts         # Plugin settings interface
│   ├── ProgressBar.ts
│   ├── SyncerTab.ts
│   └── TreeNode.ts
├── publishFile/            # File publishing logic
│   ├── PublishFile.ts
│   ├── Validator.ts
│   ├── DataStore.ts
│   ├── FileMetaDataManager.ts
│   └── ObsidianFrontMatterEngine.ts
├── publisher/              # Publishing workflow
│   ├── Publisher.ts
│   ├── PublishStatusManager.ts
│   └── Publisher.test.ts   # Tests
├── repositoryConnection/   # GitHub API integration
│   ├── RepositoryConnection.ts
│   └── QuartzSyncerSiteManager.ts
├── ui/                     # UI components (Svelte)
│   ├── Icon.svelte
│   ├── LineDiff.svelte
│   ├── TreeView/           # TreeNode.svelte, TreeView.svelte
│   └── suggest/            # Auto-suggest components
├── utils/                  # Utility functions
│   ├── utils.ts
│   ├── utils.test.ts       # Tests
│   ├── regexes.ts
│   └── styles.ts
└── views/                  # Settings and UI views
    ├── QuartzSyncerSettingTab.ts
    ├── PublicationCenter/  # DiffView.svelte, PublicationCenter.svelte
    └── SettingsView/       # Settings UI components
```

### Other Directories

- `docs/` - Documentation markdown files (Obsidian vault for plugin documentation)
- `content/` - Test content (gitignored except .obsidian config)
- `scripts/` - Build scripts (`generateSyncerSettings.mjs`)
- `__mocks__/` - Jest mocks

## Configuration Files Deep Dive

### ESLint (`eslint.config.mjs`)
- Uses flat config format (new ESLint style)
- **Ignores**: `**/*.js`, build outputs, scripts, test vaults, content, docs
- **Plugins**: TypeScript, Svelte, TSDoc, Prettier
- **Key Rules**:
  - `prettier/prettier: error` - Prettier violations are errors
  - `@typescript-eslint/no-explicit-any: error` - No `any` type allowed
  - `no-unused-vars` with ignore pattern `^_` for unused params
  - Custom padding rules for blank lines before returns/ifs/functions
  - Svelte files must use `script lang="ts"`

### Prettier (`.prettierrc.json`)
- **Print width**: 80 characters
- **Indentation**: Tabs (not spaces)
- **Semicolons**: Required
- **Quotes**: Double quotes
- **Plugin**: prettier-plugin-svelte

### TypeScript (`tsconfig.json`)
- Extends `@tsconfig/svelte/tsconfig.json`
- **Target**: es2024
- **Module**: commonjs
- **Strict**: `noImplicitAny: true`
- **Includes**: All `.ts`, `.js`, `.svelte` files, config files

### Build (`esbuild.config.mjs`)
- **Entry**: `main.ts`
- **Output**: `main.js` (CommonJS format)
- **External**: obsidian, electron, built-in Node modules
- **Target**: es2024
- **Sourcemap**: Inline for dev, false for production
- **Plugins**: esbuild-svelte with svelte-preprocess
- Svelte CSS is injected into bundle

## Dependencies

### Runtime Dependencies
- `obsidian` - Obsidian API (dev dependency, provided by Obsidian)
- `@octokit/core` - GitHub REST API client
- `obsidian-dataview`, `@blacksmithgu/datacore` - Dataview integration
- `axios` - HTTP client
- `luxon` - Date/time handling
- `diff` - Text diffing
- `crypto-js`, `js-base64`, `lz-string` - Encoding/encryption utilities
- `svelte` - UI framework (dev dependency, compiled into bundle)

### Development Tools
- TypeScript 5.2.2
- ESLint 9.28.0 with TypeScript and Svelte plugins
- Prettier 3.0.3
- Jest 29.7.0 with ts-jest
- esbuild 0.25.5
- Husky 8.0.3 (git hooks)
- lint-staged 16.1.0 (pre-commit formatting)

## Common Development Patterns

### Making Code Changes

1. **Before starting**: Ensure clean build state
   ```bash
   npm install
   npm run build
   npm run test
   ```

2. **During development**: Use dev build for faster iteration
   ```bash
   npm run dev
   ```

3. **Before committing**: Run full validation
   ```bash
   npm run format          # Auto-fix formatting
   npm run lint            # Check code quality
   npm run typecheck       # Check types
   npm run build           # Production build
   npm run test            # Run tests
   ```

### Adding New Dependencies

1. Install the dependency:
   ```bash
   npm install <package-name>
   ```
   
2. For dev dependencies:
   ```bash
   npm install --save-dev <package-name>
   ```

3. If adding external runtime deps, add to `external` array in `esbuild.config.mjs` if they should not be bundled (e.g., Obsidian API)

### Adding Tests

- Test files use `.test.ts` suffix (e.g., `utils.test.ts`)
- Place tests next to the code they test
- Use Jest with ts-jest preset
- Mock Obsidian API as needed (see `__mocks__/` directory)
- Run specific test: `npx jest <test-file-path>`

### Svelte Components

- Use `.svelte` extension
- Must have `<script lang="ts">` (enforced by ESLint)
- Follow existing patterns in `src/ui/` and `src/views/`
- Svelte components are compiled and CSS is injected into the bundle

## Known Issues and Workarounds

### Security Vulnerabilities
- 3 moderate vulnerabilities in `svelte` package (inherited from `obsidian-dataview` → `obsidian-calendar-ui`)
- **Workaround**: This is a known dependency issue and doesn't affect the build. Do not run `npm audit fix --force` as it will break dependencies.

### Build Warnings
- esbuild shows "⚠️" for `main.js` size (1.0MB production, 3.3MB dev) - this is expected and normal for Obsidian plugins with dependencies

### Git Hooks
- Husky installs on `npm install` but pre-commit hooks may not be configured
- lint-staged is configured in `package.json` but hooks may need manual setup
- **Workaround**: Always run validation commands manually before committing

### Dependency Installation Issues
- If you encounter `MODULE_NOT_FOUND` errors after installing dependencies, the node_modules may be corrupted
- **Workaround**: Remove and reinstall dependencies:
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```
- This can happen if dependencies are installed with different npm versions or in different environments

### File Generation
- `npm run dev` generates `main.js` and copies it to `docs/.obsidian/plugins/quartz-syncer/`
- This is for testing the plugin in the docs vault
- **Important**: `main.js` in root is gitignored (should be in releases only)

## Git and Version Control

### .gitignore Highlights
- `/main.js` - Build output (should only be in releases)
- `*.map` - Source maps
- `node_modules/` - Dependencies
- `data.json` - Obsidian plugin data (except test vaults)
- `docs/.obsidian/` - Obsidian workspace files
- Test vault workspace files

### Versioning
- Version is in 3 places: `package.json`, `manifest.json`, `versions.json`
- Use `version-bump.mjs` to update all three consistently:
  ```bash
  npm_package_version=1.2.3 node version-bump.mjs
  ```
- Or use justfile: `just bump 1.2.3`

## Tips for Efficient Development

1. **Trust these instructions first** - Only search/explore the codebase if information here is incomplete or incorrect

2. **Use parallel commands** when exploring:
   ```bash
   # View multiple files at once
   cat file1.ts & cat file2.ts & cat file3.ts
   ```

3. **Build time is fast** (~800ms) - don't hesitate to rebuild frequently to catch errors early

4. **Test coverage is minimal** - Only 2 test files exist. When adding significant features, consider adding tests following existing patterns.

5. **Formatting is strict** - Use tabs (not spaces), 80 char lines. Run `npm run format` frequently to avoid CI failures.

6. **TypeScript strict mode** - `noImplicitAny: true` means all function parameters and variables need explicit types. No `any` allowed (enforced by ESLint).

7. **Main plugin logic** is in `main.ts` - Start there to understand the plugin lifecycle (onload, onunload, settings, commands)

8. **GitHub API integration** is in `src/repositoryConnection/` - For changes to GitHub communication

9. **Compilation/publishing logic** is split between:
   - `src/compiler/` - Converting Obsidian content to Quartz format
   - `src/publisher/` - Publishing workflow and status management
   - `src/publishFile/` - File validation and metadata

10. **Obsidian plugin development** specifics:
    - Plugin must be compatible with Obsidian API (desktop and mobile)
    - Uses Obsidian's APIs for file access, settings, commands, UI
    - Follow Obsidian's plugin guidelines and best practices
    - Mobile support: `isDesktopOnly: false` in manifest
