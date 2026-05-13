# Contributing to Quartz Syncer

Thanks for your interest in contributing to Quartz Syncer!

Quartz Syncer is an Obsidian plugin for managing and publishing notes to Quartz. Contributions of bug fixes, improvements, documentation updates, and new features are all welcome.

## Before you start

Before opening a pull request:

- Check existing issues and pull requests to avoid duplicating work.
- For large changes, consider opening an issue or starting a discussion first.
- Keep changes focused and scoped to a single improvement when possible.

## Development setup

### Requirements

- [Node.js](https://nodejs.org/) — use the version specified in `.nvmrc`
- `npm`
- Optional: [`just`](https://github.com/casey/just) for running common development tasks

### Install dependencies

```bash
npm install
```

## Project structure

A few important files and directories:

- `src/` — main source code
- `main.ts` — plugin entry point
- `test/` — tests
- `docs/` — local documentation/plugin testing assets
- `.github/workflows/` — CI workflows
- `justfile` — shortcuts for common development tasks

## Common commands

You can run most tasks either directly with `npm` scripts or through the `justfile`.

### Using npm

#### Run development build

```bash
npm run dev
```

#### Build for production

```bash
npm run build
```

#### Run tests

```bash
npm run test
```

#### Run end-to-end tests

```bash
npm run test:e2e
```

#### Run linting

```bash
npm run lint
```

#### Auto-fix lint/style issues

```bash
npm run lint-fix
```

#### Check formatting

```bash
npm run check-formatting
```

#### Format the codebase

```bash
npm run format
```

#### Run type checking

```bash
npm run typecheck
```

### Using `just`

If you have `just` installed, the repository provides shortcuts for common workflows:

```bash
just
```

This lists the available recipes.

Some useful examples:

```bash
just dev
just prod
just check
just test
just test-full
```

Notable recipes:
- `just dev` — runs the development build and copies plugin files into the local `docs` plugin directory
- `just prod` — builds for production and copies plugin files into the local `docs` plugin directory
- `just check` — runs linting, tests, formatting checks, and typechecking
- `just test-full` — runs unit and end-to-end tests

## Coding conventions

Please follow the conventions already used in the repository:

- Use **tabs** for indentation.
- Keep formatting consistent with **Prettier**.
- Follow **ESLint** rules and fix warnings/errors before submitting.
- Use TypeScript consistently and avoid introducing unnecessary `any` types.
- Keep changes minimal and focused.

If you are unsure about a pattern or convention, follow the surrounding code in the file you are editing.

## Testing expectations

Before submitting a pull request, please run the relevant checks locally.

At minimum:

```bash
npm run lint
npm run check-formatting
npm run build
npm run test
npm run typecheck
```

Or, if you use `just`:

```bash
just check
```

If your change affects end-to-end behavior, also run:

```bash
npm run test:e2e
```

Or:

```bash
just test-full
```

## Continuous integration

GitHub Actions runs checks on pull requests and pushes, including:

- linting
- formatting checks
- build
- tests
- typechecking
- end-to-end tests

Please make sure your changes pass the relevant local checks before opening a pull request.

## Pull request guidelines

When opening a pull request:

- Write a clear title and description.
- Explain the problem being solved and your approach.
- Link related issues when applicable.
- Include screenshots or recordings for UI changes when helpful.
- Keep pull requests reasonably small and easy to review.

## Documentation

If your change affects user-facing behavior, configuration, or workflow, please update relevant documentation as part of the same pull request.

## Questions

If you are unsure whether a change fits the project, start with an issue or discussion before investing significant effort.

Thanks again for contributing!
