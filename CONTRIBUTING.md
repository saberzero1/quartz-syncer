# Contributing to Quartz Syncer

Thanks for your interest in contributing to Quartz Syncer!

Quartz Syncer is an Obsidian plugin for managing and publishing notes to Quartz. Contributions of bug fixes, improvements, documentation updates, and new features are all welcome.

## Before you start

Before opening a pull request:

- Check existing issues and pull requests to avoid duplicating work.
- For large changes, consider opening an issue or starting a discussion first.
- Keep changes focused and scoped to a single improvement when possible.

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) — use the version specified in `.nvmrc`
- `npm`
- Optional: `nix develop` for running E2E and integration test environments

### Install dependencies

```bash
npm install
```

### Run the development build

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

## Codebase structure

Quartz Syncer uses a feature-per-directory layout under `src/`. Key areas:

- `src/main.ts` — plugin entry point and lifecycle wiring
- `src/cli/` — CLI handler registration, output formatting, and command handlers
- `src/git/` — git backends, HTTP transport, and path mapping
- `src/compiler/` — compilation pipeline and integration adapters
- `src/cache/` — persisted compilation metadata
- `src/services/` — background engine and orchestration services
- `src/publisher/` — publish coordination and status management
- `src/publishFile/` — file metadata, validation, and frontmatter handling
- `src/quartz/` — Quartz config, plugin, and upgrade services
- `src/views/` — settings UI, onboarding wizard, diff viewer, and publication center
- `src/models/` and `src/utils/` — shared types and utilities
- `test/` — unit + E2E specs and helpers
- `e2e/` — Playwright Quartz integration configuration

## Testing

Quartz Syncer has three testing tiers:

1. **Unit (Vitest)**
   ```bash
   npm run test:unit
   ```
2. **E2E (WebdriverIO)**
   ```bash
   npx wdio wdio.conf.mts
   ```
3. **Quartz integration (Playwright)**
   ```bash
   npx playwright test -c e2e/playwright.config.ts
   ```

Shared helpers live in `test/helpers.ts`.

## Adding features

### New git backend

- Implement a backend under `src/git/backends/`.
- Register it in `src/git/GitBackendFactory.ts`.
- Update types in `src/git/types.ts` and add tests where applicable.

### New compilation integration

- Add the integration under `src/compiler/integrations/`.
- Register it in `src/compiler/integrations/registry.ts` and export it from `src/compiler/integrations/index.ts`.

### New CLI command

- Add a handler in `src/cli/handlers/`.
- Register it in `src/cli/registerCliHandlers.ts`.
- Update the README command table to keep the CLI surface documented.

### New settings

- Add definitions in `getSettingDefinitions()`.
- Update the appropriate settings page under `src/views/settings/`.
- Keep migrations in `src/main.ts`.

## Code conventions

- Strict TypeScript.
- No `as any`, no `@ts-ignore`.
- Tabs for indentation.
- Sentence case for user-facing strings.

## PR requirements

At minimum, run:

```bash
npm run lint
npm run check-formatting
npm run build
npm run test:unit
```

If your change affects UI flows, CLI behavior, or Quartz publishing, also run the E2E and/or Playwright suites.

Please update documentation for user-facing changes.

## Questions

If you are unsure whether a change fits the project, start with an issue or discussion before investing significant effort.

Thanks again for contributing!
