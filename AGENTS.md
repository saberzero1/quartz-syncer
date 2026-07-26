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
- **isomorphic-git fork**: The plugin uses a fork of `isomorphic-git` at `~/Repos/isomorphic-git` (`saberzero1/isomorphic-git`) as the primary git transport. The fork strips unused commands, adds GC/pack repacking, and uses Obsidian's `requestUrl()` as HTTP transport. The fork maintains a `DIFFERENCES.md` documenting all changes from upstream.
    - **IMPORTANT: dependency URL in `package.json`**: The `isomorphic-git` dependency MUST point to `https://github.com/saberzero1/isomorphic-git.git` (the remote URL) before committing. During local development, use `npm install ~/Repos/isomorphic-git` for fast iteration, but **always switch back to the HTTPS URL before committing** — `file:../isomorphic-git` breaks CI and anyone cloning the repo. Check `git diff package.json package-lock.json` before every commit to verify no local path leaked.

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
