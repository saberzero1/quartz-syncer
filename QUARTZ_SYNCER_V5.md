# Quartz Syncer v5 Integration Notes

Notes and decisions for implementing Quartz v5 plugin management support in Quartz Syncer (Obsidian plugin). This document captures the architectural changes that affect Syncer and the specific integration points.

---

## Table of Contents

- [Overview of Changes](#overview-of-changes)
- [File Ownership Model](#file-ownership-model)
- [quartz.config.yaml — The Syncer's Interface](#quartzconfigyaml--the-syncers-interface)
- [Operations Syncer Can Perform](#operations-syncer-can-perform)
- [Plugin Installation Lifecycle](#plugin-installation-lifecycle)
- [Schema Validation](#schema-validation)
- [Layout System](#layout-system)
- [Frame/Template System](#frametemplate-system)
- [Plugin Manifest (package.json quartz field)](#plugin-manifest-packagejson-quartz-field)
- [Migration Considerations](#migration-considerations)
- [Edge Cases and Gotchas](#edge-cases-and-gotchas)
- [Syncer Issue #35 Resolution](#syncer-issue-35-resolution)

---

## Overview of Changes

Quartz v5 moves all user configuration from TypeScript files (`quartz.config.ts`, `quartz.layout.ts`) into a single YAML file (`quartz.config.yaml`). This eliminates the need for AST parsing or TypeScript manipulation — Syncer can now manage the entire Quartz configuration through plain YAML read/write operations. In v5, these TypeScript files are consolidated into a single `quartz.ts` wrapper.

**Before (v4):**

- Configuration spread across `quartz.config.ts` (TypeScript) and `quartz.layout.ts` (TypeScript) in v4
- Syncer could not safely edit these files (no TS parser in isomorphic-git/LightningFS environment)
- Plugin management required manual file editing

**After (v5):**

- All user configuration in `quartz.config.yaml` (YAML)
- TypeScript files are upstream-owned thin templates (consolidated into `quartz.ts`) that read from the YAML config
- Syncer can fully manage configuration via YAML read/write -> git commit -> push

---

## File Ownership Model

| File                             | Owner    | Syncer Can Edit? | Notes                                                              |
| -------------------------------- | -------- | ---------------- | ------------------------------------------------------------------ |
| `quartz.config.yaml`            | **User** | **Yes**          | The source of truth. Syncer's primary interface.                   |
| `quartz.config.default.yaml`    | Upstream | **No**           | Reference only. Seed file copied on `npx quartz create`.           |
| `quartz.ts`                     | Upstream | **No**           | Thin template. Just imports from YAML loader.                      |
| `quartz.lock.json`              | CLI      | Read only        | Tracks installed plugin versions/commits. Useful for display.      |
| `.quartz/plugins/`              | CLI      | **No**           | Git clones managed by CLI. `.gitignore`d.                          |
| `.quartz/plugins/*/package.json`| CLI      | Read only        | Plugin manifests. Read `quartz` field for metadata.                |
| `.quartz/plugins/*/frames/`     | CLI      | Read only        | Plugin-provided page frames (templates). Discovered via manifests. |
| `quartz/components/frames/`     | Upstream | **No**           | Built-in page frames: `default`, `full-width`, `minimal`.          |
| `content/`                      | User     | **Yes**          | Existing Syncer behavior unchanged.                                |

**Key insight:** Syncer only needs to read/write `quartz.config.yaml`. Everything else is handled by the CLI on the build side.

---

## quartz.config.yaml — The Syncer's Interface

### Top-Level Structure

```yaml
# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
configuration:
  # GlobalConfiguration fields
  pageTitle: My Quartz Site
  enableSPA: true
  # ...

plugins:
  # Array of plugin entries
  - source: "github:quartz-community/explorer"
    enabled: true
    options: {}
    order: 50

layout:
  # Global layout overrides
  groups: {}
  byPageType: {}
```

### configuration Object

Maps directly to Quartz's `GlobalConfiguration` type. Fields Syncer should support editing:

| Field             | Type     | Description                          |
| ----------------- | -------- | ------------------------------------ |
| `pageTitle`       | string   | Site title (required)                |
| `pageTitleSuffix` | string   | Appended to page titles in `<title>` |
| `enableSPA`       | boolean  | Single-page app navigation (required)|
| `enablePopovers`  | boolean  | Link preview popovers                |
| `analytics`       | object   | Analytics provider config            |
| `locale`          | string   | Locale string (e.g., `"en-US"`) (required) |
| `baseUrl`         | string   | Base URL for deployment              |
| `ignorePatterns`  | string[] | Glob patterns to ignore              |
| `theme`           | object   | Colors, typography (required)        |

> **Note:** `defaultDateType` is **not** a global configuration field. It was moved to the `created-modified-date` plugin's `options` (e.g., `options.defaultDateType: "modified"`). The valid values are `"created"`, `"modified"`, and `"published"`.

### plugins Array

Each entry:

```yaml
# String source (most common)
- source: "github:quartz-community/explorer"
  enabled: true
  options: {}
  order: 50
  layout:
    position: left
    priority: 50
    display: all
    condition: null
    group: null
    groupOptions: null

# Object source (for monorepo plugins or overrides)
- source:
    name: quartz-themes
    repo: "github:saberzero1/quartz-themes"
    subdir: plugin
    ref: main
  enabled: true
  options: {}
```

| Field     | Type             | Required | Description                                                                                                  |
| --------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `source`  | string \| object | Yes      | Plugin identifier. String: `github:org/repo`, `github:org/repo#ref`, `git+https://...`, local path. Object: `{ repo, subdir?, ref?, name? }` for monorepo plugins. |
| `enabled` | boolean          | Yes      | Whether the plugin is active                                                                                 |
| `options` | object           | No       | Plugin-specific configuration (passed to factory function)                                                   |
| `order`   | number           | No       | Execution order within its category (lower = earlier, minimum 0)                                             |
| `layout`  | object           | No       | Only for component-providing plugins                                                                         |

#### Source Object Fields

When `source` is an object:

| Field    | Type   | Required | Description                                                      |
| -------- | ------ | -------- | ---------------------------------------------------------------- |
| `repo`   | string | Yes      | Git repository (same formats as string source: `github:org/repo`, etc.) |
| `subdir` | string | No       | Subdirectory within the repository containing the plugin         |
| `ref`    | string | No       | Git ref (branch or tag) to pin to. Defaults to the default branch. |
| `name`   | string | No       | Override name for the plugin directory. Auto-derived from repo URL if omitted. |

### layout Object (Global)

```yaml
layout:
  groups:
    toolbar:
      priority: 35
      direction: row
      gap: "0.5rem"
  byPageType:
    folder:
      exclude:
        - reader-mode
      positions:
        right: []
    "404":
      positions:
        beforeBody: []
        left: []
        right: []
```

---

## Operations Syncer Can Perform

### Read Operations

| Operation               | How                                                         |
| ----------------------- | ----------------------------------------------------------- |
| List all plugins        | Read `plugins` array                                        |
| Get plugin status       | Check `enabled` field                                       |
| Get plugin options      | Read `options` field                                        |
| Get site configuration  | Read `configuration` object                                 |
| Get layout arrangement  | Read `layout` fields on plugin entries + global `layout`    |
| Check installed version | Read `quartz.lock.json` for commit hashes                   |
| Get plugin metadata     | Read `.quartz/plugins/{name}/package.json` -> `quartz` field |

### Write Operations

| Operation             | How                                                        |
| --------------------- | ---------------------------------------------------------- |
| Enable plugin         | Set `plugins[i].enabled = true`                            |
| Disable plugin        | Set `plugins[i].enabled = false`                           |
| Change plugin options | Update `plugins[i].options`                                |
| Reorder plugins       | Change `plugins[i].order` values                           |
| Rearrange layout      | Change `plugins[i].layout.position` and `.priority`        |
| Change site config    | Update fields in `configuration`                           |
| Add plugin            | Append new entry to `plugins` array with source + defaults |
| Remove plugin         | Remove entry from `plugins` array                          |

### Add Plugin Flow (Syncer-initiated)

1. Syncer appends a new plugin entry to `quartz.config.yaml`:
   ```yaml
   - source: "github:quartz-community/some-plugin"
     enabled: true
     options: {}
     order: 50
   ```
2. Syncer commits and pushes the change
3. On next build, the `prebuild` script (`npm run install-plugins`) detects the plugin is declared but not installed
4. Build automatically installs missing plugins via `npx tsx ./quartz/plugins/loader/install-plugins.ts`
5. Alternatively, user runs `npx quartz plugin restore` manually

**Important:** Syncer does NOT need to handle git clone or npm install. It only edits the YAML config.

### Remove Plugin Flow (Syncer-initiated)

1. Syncer removes the plugin entry from `plugins` array
2. Syncer commits and pushes
3. On next build, the orphaned plugin clone in `.quartz/plugins/` is harmless (ignored)
4. User can run `npx quartz plugin remove <name>` to clean up the clone

---

## Schema Validation

The JSON Schema is at `quartz/plugins/quartz-plugins.schema.json`. Syncer can use this for:

1. **Client-side validation** before committing changes
2. **Autocomplete hints** for configuration fields
3. **Type checking** for plugin options

The `quartz.config.yaml` file references the schema via a YAML language server comment on the first line:

```yaml
# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
```

This provides IDE autocompletion and validation when using editors that support the YAML language server (VS Code with YAML extension, IntelliJ, etc.). Syncer should preserve this comment when writing the file.

### Validation Points

- `configuration` requires: `pageTitle`, `enableSPA`, `locale`, `theme`
- `configuration.theme` requires: `fontOrigin`, `cdnCaching`, `typography`, `colors`
- `configuration.theme.fontOrigin` must be one of: `"googleFonts"`, `"local"`
- `plugins[].source` must be a non-empty string OR an object with required `repo` field
- `plugins[].enabled` must be boolean
- `plugins[].order` must be a number >= 0
- `plugins[].layout.position` must be one of: `"left"`, `"right"`, `"beforeBody"`, `"afterBody"`, `"body"`
- `plugins[].layout.display` must be one of: `"all"`, `"mobile-only"`, `"desktop-only"`

---

## Layout System

### Positions

Components can be placed in these layout positions:

| Position     | Description                          |
| ------------ | ------------------------------------ |
| `beforeBody` | Between header and content           |
| `left`       | Left sidebar                         |
| `right`      | Right sidebar                        |
| `afterBody`  | Between content and footer           |
| `body`       | Main content body (content replacement) |

> **Note:** `head`, `header`, and `footer` are **not** valid layout positions. Plugins like `footer` are placed by the page type's frame/template, not through the `layout.position` field.
>
> The `body` position is used by plugins that replace the main page content (e.g., `encrypted-pages`).

### Priority

Within a position, components are sorted by `priority` (ascending). Lower numbers appear first/higher.

### Display Modifiers

| Value           | Effect                     |
| --------------- | -------------------------- |
| `"all"`         | Show on all viewport sizes |
| `"mobile-only"` | Show only on mobile        |
| `"desktop-only"` | Show only on desktop       |

### Conditions

Named presets that control when a component renders:

| Condition        | Effect                                          |
| ---------------- | ----------------------------------------------- |
| `"not-index"`    | Hide on the root index page                     |
| `"has-tags"`     | Only show when the page has tags                |
| `"has-toc"`      | Only show when the page has a table of contents |
| `"has-backlinks"`| Only show when the page has backlinks           |

Custom conditions can be registered by plugins via `registerCondition(name, predicate)`.

### Groups

Components can be grouped into flex containers:

```yaml
# Per-plugin layout entry
layout:
  group: toolbar
  groupOptions:
    grow: true
```

Global group definitions:

```yaml
layout:
  groups:
    toolbar:
      priority: 35
      direction: row
      gap: "0.5rem"
```

Group definition fields:

| Field       | Type   | Description                                                           |
| ----------- | ------ | --------------------------------------------------------------------- |
| `priority`  | number | Sort priority for the group                                           |
| `direction` | string | Flex direction: `"row"`, `"row-reverse"`, `"column"`, `"column-reverse"` |
| `gap`       | string | Gap between items (e.g., `"0.5rem"`)                                  |
| `wrap`      | string | Flex wrap: `"nowrap"`, `"wrap"`, `"wrap-reverse"`                     |

Per-plugin group options:

| Field     | Type    | Description          |
| --------- | ------- | -------------------- |
| `grow`    | boolean | Flex grow            |
| `shrink`  | boolean | Flex shrink          |
| `basis`   | string  | Flex basis           |
| `order`   | number  | Flex order           |
| `align`   | string  | Alignment (`start`, `end`, `center`, `stretch`) |
| `justify` | string  | Justification (`start`, `end`, `center`, `between`, `around`) |

### Per-Page-Type Overrides

The global `layout.byPageType` object can override layout for specific page types:
- `content` — standard markdown content pages
- `folder` — folder listing pages
- `tag` — tag listing pages
- `canvas` — Obsidian canvas pages
- `bases` — Obsidian Bases database pages
- `404` — not found page

Each can `exclude` specific plugins or override `positions` entirely.

---

## Frame/Template System

Page frames control the inner HTML structure of a page inside the `<div id="quartz-root">` shell. Different frames produce different page layouts (e.g., with/without sidebars, full-width content) while the outer shell (html, head, body, quartz-root) remains stable for SPA navigation.

### Built-in Frames

Quartz ships with three built-in frames at `quartz/components/frames/`:

| Frame Name    | Description                                           |
| ------------- | ----------------------------------------------------- |
| `default`     | Standard three-column Quartz layout (left, body, right) |
| `full-width`  | Full-width layout without sidebars                    |
| `minimal`     | Minimal layout (used by the 404 page)                 |

### Plugin-Provided Frames

Plugins can provide custom frames via the `frames` field in their `package.json` manifest. For example, the `canvas-page` plugin provides a `CanvasFrame`:

```json
{
  "quartz": {
    "frames": {
      "CanvasFrame": {
        "exportName": "CanvasFrame"
      }
    }
  }
}
```

Plugin frames are loaded from the plugin's `./frames` export path (e.g., `.quartz/plugins/canvas-page/dist/frames/index.js`) and registered in the frame registry under their declared `name` property.

### Frame Resolution

When rendering a page, the frame is resolved with the following priority:

1. **Config override** — `layout.byPageType.<type>.template` in `quartz.config.yaml`
2. **Page type declaration** — The `frame` property on the page type plugin instance
3. **Default** — Falls back to the `"default"` frame

If a frame name cannot be resolved, Quartz logs a warning and falls back to `"default"`.

### Syncer Integration

Syncer can read which frames are available by:

1. **Built-in frames**: Always available — `default`, `full-width`, `minimal`
2. **Plugin frames**: Read the `frames` field from `.quartz/plugins/*/package.json` manifests
3. **Active frame overrides**: Read `layout.byPageType.<type>.template` from `quartz.config.yaml` (if present)

Syncer can allow users to override the frame for specific page types via the `template` field:

```yaml
layout:
  byPageType:
    canvas:
      template: CanvasFrame
    "404":
      template: minimal
```

> **Note:** Syncer should NOT modify frame source files. It only reads frame metadata from manifests and can set the `template` field in `quartz.config.yaml`.

---

## Plugin Manifest (package.json quartz field)

Each plugin's `package.json` contains a `quartz` field with metadata. Syncer can read this for display purposes (plugin names, descriptions, categories) but should NOT modify it.

```json
{
  "quartz": {
    "name": "note-properties",
    "displayName": "Note Properties",
    "category": ["transformer", "component"],
    "version": "1.0.0",
    "quartzVersion": ">=5.0.0",
    "dependencies": [],
    "defaultOrder": 5,
    "defaultEnabled": true,
    "defaultOptions": {},
    "optionSchema": {},
    "components": {
      "NotePropertiesComponent": {
        "displayName": "Note Properties",
        "defaultPosition": "beforeBody",
        "defaultPriority": 15
      }
    },
    "frames": {
      "CanvasFrame": {
        "exportName": "CanvasFrame"
      }
    }
  }
}
```

> **Note:** Plugin manifests remain JSON (they live in `package.json`). Only the user-facing config file is YAML.
>
> **Note:** The `description` field is typically set at the `package.json` root level, not inside the `quartz` object. The config loader reads `quartz.description` first and falls back to the root-level `description` if absent.
>
> **Note:** There is currently a naming inconsistency in the Quartz v5 codebase: plugins use `optionSchema` in their `package.json` manifests, but the config loader reads `configSchema`. Until this is resolved upstream, Syncer should read `optionSchema` from manifests (matching what plugins actually publish) and be prepared to also check `configSchema` for forward compatibility.

### Categories

| Category      | Description                                     |
| ------------- | ----------------------------------------------- |
| `transformer` | Processes markdown/HTML during build            |
| `filter`      | Filters which pages to include/exclude          |
| `emitter`     | Generates output files and provides components  |
| `pageType`    | Defines how specific content types are rendered |
| `component`   | Provides UI components without emitting files   |

> **Note:** A plugin's `category` field can be a single string or an array of strings (e.g., `["transformer", "component"]` for plugins that both transform content and provide a component).

### Additional Manifest Fields

The following fields are also available in the `quartz` manifest object:

| Field            | Type    | Description                                                                                      |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `keywords`       | string[]| Searchable keywords for plugin discovery                                                         |
| `frames`         | object  | Page frames provided by this plugin (see [Frame/Template System](#frametemplate-system))         |
| `requiresInstall`| boolean | Whether the plugin requires `npm install` after cloning (e.g., for native dependencies like sharp)|

### Using Manifest Defaults

When adding a new plugin via Syncer, use the manifest's defaults to populate the initial entry:

```javascript
// Pseudo-code for Syncer
const manifest = readPackageJson(pluginPath).quartz
const entry = {
  source: `github:quartz-community/${manifest.name}`,
  enabled: manifest.defaultEnabled,
  options: manifest.defaultOptions || {},
  order: manifest.defaultOrder || 50,
}

// Add layout if plugin has components
if (manifest.components) {
  const [componentName, componentMeta] = Object.entries(manifest.components)[0]
  entry.layout = {
    position: componentMeta.defaultPosition,
    priority: componentMeta.defaultPriority,
    display: "all",
  }
}
```

---

## Migration Considerations

### Detecting v5 vs v4

- **v5 (new system):** `quartz.config.yaml` exists at repository root (legacy fallback: `quartz.plugins.json`)
- **v4 (old system):** Neither `quartz.config.yaml` nor `quartz.plugins.json` exists; `quartz.config.ts` contains full configuration

Syncer should check for `quartz.config.yaml` first, then fall back to `quartz.plugins.json` for legacy v5 installs, to determine which mode to operate in.

### Recommending Migration

If Syncer detects v4 mode (no config file), it should prompt the user:

> "Your Quartz site uses the v4 configuration format. Run `npx quartz migrate` to enable plugin management from Obsidian."

Syncer should NOT attempt to run the migration itself — it requires Node.js/tsx to extract TypeScript config values.

### Post-Migration

After migration, `quartz.ts` becomes a thin template:

```typescript
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
```

Syncer should not modify these files.

---

## Edge Cases and Gotchas

### 1. Plugin Not Yet Installed

A plugin can be declared in `quartz.config.yaml` but not yet installed (no clone in `.quartz/plugins/`). This is normal — the build process handles installation. Syncer should:

- Show the plugin in the list
- Mark it as "pending install" if the lockfile doesn't have it
- Allow enabling/disabling/configuring it regardless

### 2. Multiple Components per Plugin

Some plugins provide multiple components (though currently none do). The `components` object in the manifest is a map, not a single entry. Syncer should handle this gracefully.

### 3. Dependency Validation

Plugins can declare `dependencies` on other plugins. When disabling a plugin via Syncer, warn the user if other enabled plugins depend on it. The dependency is declared by plugin source string (e.g., `"github:quartz-community/content-index"`).

The config loader validates:
- **Missing dependencies** — Error if required plugin not installed
- **Disabled dependencies** — Warning if required plugin is disabled
- **Order conflicts** — Error if dependent plugin runs before its dependency
- **Circular dependencies** — Error if plugins form a cycle

### 4. Order Conflicts

Multiple plugins can have the same `order` value. This is fine — they'll be sorted stably. Syncer does not need to enforce unique order values.

### 5. YAML Comments

`quartz.config.yaml` is YAML, which natively supports comments. Users can add comments to annotate their configuration, and Syncer should preserve them when possible. The YAML parser (`yaml` npm package v2.x) supports comment roundtrip preservation via `keepSourceTokens: true`.

### 6. Schema Reference

The first line of `quartz.config.yaml` should contain the YAML language server schema reference comment:

```yaml
# yaml-language-server: $schema=./quartz/plugins/quartz-plugins.schema.json
```

This comment should be preserved as-is when editing. It's a relative path to the schema file in the Quartz installation and provides IDE autocompletion.

### 7. quartz.lock.json Format

```json
{
  "version": "1.0.0",
  "plugins": {
    "explorer": {
      "source": "github:quartz-community/explorer",
      "resolved": "https://github.com/quartz-community/explorer.git",
      "commit": "01c780361b12e55b02ee2db0982ee5386e99ce31",
      "installedAt": "2026-03-22T21:03:34.275Z"
    },
    "quartz-themes": {
      "source": {
        "name": "quartz-themes",
        "repo": "github:saberzero1/quartz-themes",
        "subdir": "plugin"
      },
      "resolved": "https://github.com/saberzero1/quartz-themes.git",
      "commit": "7fcda8ef4a67f5b80960103ae8cad2045f3e64c0",
      "subdir": "plugin",
      "installedAt": "2026-03-22T21:04:47.942Z"
    }
  }
}
```

Lock file entry fields:

| Field         | Type             | Description                                                     |
| ------------- | ---------------- | --------------------------------------------------------------- |
| `source`      | string \| object | Matches the source from `quartz.config.yaml`                    |
| `resolved`    | string           | Resolved git URL (always full HTTPS)                            |
| `commit`      | string           | Pinned commit hash                                              |
| `installedAt` | string           | ISO 8601 timestamp of when the plugin was installed             |
| `subdir`      | string           | (Optional) Subdirectory path, present when source is an object  |

This is CLI-managed. Syncer should only read it for display (showing installed versions), never write to it.

> **Note:** The lock file remains JSON. Only the user-facing config is YAML.

### 8. Configuration Field Types

Some `configuration` fields have complex types:

- `theme.colors` has `lightMode` and `darkMode` sub-objects with specific color fields
- `theme.typography` has `header`, `body`, `code` font family strings
- `theme.fontOrigin` must be `"googleFonts"` or `"local"`
- `theme.cdnCaching` is a boolean
- `analytics` has a `provider` field that determines the shape of the rest of the object

Refer to the JSON Schema for exact types and constraints.

### 9. Legacy JSON Fallback

The Quartz CLI includes backward compatibility for `quartz.plugins.json`. If Syncer encounters a site with the legacy JSON config instead of `quartz.config.yaml`, it should:

1. Read/write the JSON file normally (standard `JSON.parse` / `JSON.stringify`)
2. Optionally suggest migration: "Consider running `npx quartz migrate` to upgrade to the YAML config format"

The CLI's config loader handles this fallback automatically — it checks for `quartz.config.yaml` first, then falls back to `quartz.plugins.json`.

### 10. Schema Discrepancies

The JSON Schema at `quartz/plugins/quartz-plugins.schema.json` has a few known discrepancies with the runtime TypeScript types:

- **Missing `priority` in groups**: The schema's `layout.groups` definition only includes `direction`, `wrap`, and `gap` properties. The `priority` field (used by the runtime `FlexGroupConfig` type and documented above) is missing from the schema. Syncer should still support `priority` in groups — it works at runtime even though the schema doesn't validate it.
- **`wrap` type mismatch**: The schema defines `wrap` as `boolean`, but the TypeScript type uses string enum values (`"nowrap"`, `"wrap"`, `"wrap-reverse"`). The runtime accepts both forms, but Syncer should prefer the string enum values for consistency with the TypeScript types.
- **Schema description text**: The schema's `description` field reads `"Schema for validating quartz.plugins.json configuration files"` — a remnant from before the YAML migration. The schema is valid for both YAML and JSON config formats.

### 11. Object Source Format

The `source` field supports an object format for monorepo-style plugins where the plugin code lives in a subdirectory of a larger repository. Syncer must handle both string and object source formats when:

- Reading plugin entries from config
- Displaying plugin names (use `source.name` if present, otherwise derive from `source.repo`)
- Comparing against lock file entries (lock file preserves the original source format)

---

## Syncer Issue #35 Resolution

This architecture directly addresses [Quartz Syncer Issue #35](https://github.com/saberzero1/quartz-syncer/issues/35) — "Manage Quartz configuration from Obsidian."

### What Syncer Can Now Do

1. **Plugin Management UI** — List, enable/disable, configure, reorder plugins
2. **Layout Editor** — Drag-and-drop component arrangement (positions + priorities)
3. **Site Settings** — Edit pageTitle, theme colors, analytics, etc.
4. **Plugin Discovery** — Read manifests to show available plugins with descriptions
5. **Validation** — Use JSON Schema to validate changes before committing

### Minimal Implementation Path

1. Read `quartz.config.yaml` on sync
2. Parse YAML (using the `yaml` npm package)
3. Present a settings UI in Obsidian
4. On save: write updated YAML, commit, push
5. Let the CI/build pipeline handle the rest

No TypeScript parsing. No AST manipulation. No Node.js subprocess. Just YAML.

---

## Quick Reference: All Default Plugins

| Plugin                     | Category                         | Default Enabled | Has Component | Default Position |
| -------------------------- | -------------------------------- | --------------- | ------------- | ---------------- |
| note-properties            | transformer, component           | Yes             | Yes           | beforeBody       |
| created-modified-date      | transformer                      | Yes             | No            | -                |
| syntax-highlighting        | transformer                      | Yes             | No            | -                |
| obsidian-flavored-markdown | transformer                      | Yes             | No            | -                |
| github-flavored-markdown   | transformer                      | Yes             | No            | -                |
| table-of-contents          | transformer, component           | Yes             | Yes           | right            |
| crawl-links                | transformer                      | Yes             | No            | -                |
| description                | transformer                      | Yes             | No            | -                |
| latex                      | transformer                      | Yes             | No            | -                |
| citations                  | transformer                      | No              | No            | -                |
| hard-line-breaks           | transformer                      | No              | No            | -                |
| ox-hugo                    | transformer                      | No              | No            | -                |
| roam                       | transformer                      | No              | No            | -                |
| remove-draft               | filter                           | Yes             | No            | -                |
| explicit-publish           | filter                           | No              | No            | -                |
| alias-redirects            | emitter                          | Yes             | No            | -                |
| content-index              | emitter                          | Yes             | No            | -                |
| favicon                    | emitter                          | Yes             | No            | -                |
| og-image                   | emitter                          | Yes             | No            | -                |
| cname                      | emitter                          | Yes             | No            | -                |
| canvas-page                | pageType, component              | Yes             | Yes           | -                |
| content-page               | pageType, component              | Yes             | Yes           | -                |
| bases-page                 | transformer, pageType, component | Yes             | Yes           | -                |
| folder-page                | pageType, component              | Yes             | Yes           | -                |
| tag-page                   | pageType, component              | Yes             | Yes           | -                |
| explorer                   | component                        | Yes             | Yes           | left             |
| graph                      | component                        | Yes             | Yes           | right            |
| search                     | component                        | Yes             | Yes           | left             |
| backlinks                  | component                        | Yes             | Yes           | right            |
| article-title              | component                        | Yes             | Yes           | beforeBody       |
| content-meta               | component                        | Yes             | Yes           | beforeBody       |
| tag-list                   | component                        | No              | Yes           | beforeBody       |
| page-title                 | component                        | Yes             | Yes           | left             |
| darkmode                   | component                        | Yes             | Yes           | left             |
| reader-mode                | component                        | Yes             | Yes           | left             |
| breadcrumbs                | component                        | Yes             | Yes           | beforeBody       |
| comments                   | component                        | No              | Yes           | afterBody        |
| footer                     | component                        | Yes             | Yes           | -                |
| recent-notes               | component                        | No              | Yes           | -                |
| spacer                     | component                        | Yes             | Yes           | left             |
| encrypted-pages            | transformer                      | Yes             | Yes           | body             |
| stacked-pages              | component                        | No              | Yes           | afterBody        |

> **Note:** The `footer` plugin's component is placed by the page frame/template, not through the standard `layout.position` system. The `encrypted-pages` plugin uses a special `body` position for content replacement that is outside the standard layout position enum. The `tag-list` plugin defaults to disabled in the default configuration.
>
> **Note:** Page type plugins (`canvas-page`, `content-page`, `folder-page`, `tag-page`, `bases-page`) typically have both `pageType` and `component` categories. The `bases-page` plugin additionally includes `transformer` for its data processing logic.
