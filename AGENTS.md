# Quartz Syncer Agents Guide

## Project overview
- Quartz Syncer is an Obsidian Community Plugin.
- Source is TypeScript, bundled to JavaScript with esbuild for Obsidian.
- Purpose: publish Obsidian notes to Quartz with provider-agnostic Git support.

## Environment
- Package manager: npm
- Build: esbuild
- Unit testing: Vitest
- E2E testing: WebdriverIO
- Quartz integration testing: Playwright

## File conventions
- Keep feature code in `src/` with feature-per-directory structure.
- Keep `src/main.ts` minimal and focused on lifecycle + settings.
- Avoid cross-feature imports; prefer local feature modules.

## Settings conventions
- Declarative settings only (Obsidian minAppVersion 1.13).
- Settings definitions live in `getSettingDefinitions()`.
- Settings schema migrations stay in `src/main.ts`.

## Testing
- Unit: fast logic tests (Vitest).
- E2E: UI/system workflows (WebdriverIO).
- Quartz integration: real Quartz repo flows (Playwright).

## Coding conventions
- Strict TypeScript.
- No `as any`, no `@ts-ignore`.
- Tabs for indentation.
- Sentence case for user-facing strings.

## Agent do / don’t
Do:
- Follow the settings-first approach for UI updates.
- Keep changes scoped and incremental.
- Run `tsc --noEmit` and esbuild before claiming completion.

Don’t:
- Introduce new frameworks or runtime dependencies.
- Add non-declarative settings UI or bypass migrations.
- Inflate `main.ts` with feature logic.
