# Obsidian Integration Improvements

Replace regex-based markdown parsing with Obsidian's `CachedMetadata` API and Quartz's `remark-obsidian` plugin. This eliminates an entire class of parsing bugs caused by regex pattern matching on raw text.

## Context

Quartz Syncer's compiler pipeline (`SyncerPageCompiler`) currently uses ~10 regexes to discover links, embeds, and file references in markdown text. This approach is structurally fragile:

- Regexes don't understand document structure (frontmatter vs body vs code blocks)
- `String.replace()` replaces the first occurrence, which may be in the wrong section
- Every new Obsidian syntax feature (anchors, block refs) requires regex surgery
- Near-identical regexes are maintained separately (`TRANSCLUDED_FILE_REGEX` vs `TRANSCLUDED_SVG_REGEX`)

Obsidian already parses all of this into structured data via `CachedMetadata`. Quartz v5 has extracted its OFM parser into standalone packages (`remark-obsidian`, `rehype-obsidian`).

## Phase 1: Replace Regex-Based Asset Discovery with CachedMetadata

**Goal:** Eliminate `TRANSCLUDED_FILE_REGEX`, `FILE_REGEX`, and manual anchor-stripping in `extractBlobLinks()`.

**Risk:** Low. Uses stable Obsidian API (available since 0.9.7+). No new dependencies.

### What CachedMetadata Provides

```typescript
// From metadataCache.getCache(file.path):
interface CachedMetadata {
  links?: LinkCache[];           // All [[wikilinks]] in body
  embeds?: EmbedCache[];         // All ![[embeds]] in body  
  frontmatterLinks?: FrontmatterLinkCache[];  // Wikilinks inside frontmatter (since 1.4.0)
  // ... headings, tags, blocks, sections, etc.
}

// Each link/embed entry:
interface ReferenceCache {
  link: string;        // Link destination (e.g. "path/to/note" or "img.webp")
  original: string;    // Raw text as written (e.g. "[[path/to/note|display]]" or "![[img.webp#right]]")
  displayText?: string; // Display name if different from link
  position: Pos;       // Exact position in the document (line, col, offset)
}

// Pre-computed resolution map:
metadataCache.resolvedLinks: Record<string, Record<string, number>>;
// Maps source file path -> { destination file path -> link count }
```

### Changes to `extractBlobLinks()` (SyncerPageCompiler.ts)

**Current:** Reads file text, matches `TRANSCLUDED_FILE_REGEX` and `FILE_REGEX`, manually strips anchors, resolves paths via `getFirstLinkpathDest`.

**Target:** Use `CachedMetadata.embeds` for embed discovery. Use `resolvedLinks` for pre-resolved paths.

```typescript
// BEFORE (regex-based):
extractBlobLinks = async (file: PublishFile) => {
  const text = await file.cachedRead();
  const assets: string[] = [];
  
  // Canvas handling (keep as-is — canvas files aren't markdown)
  if (file.getType() === "canvas") { /* JSON parsing — keep */ }
  
  // Regex matching for ![[blob.png]] and ![](blob.png)
  const transcludedBlobMatches = text.match(TRANSCLUDED_FILE_REGEX);
  // ... manual anchor stripping, path resolution loop
  const blobMatches = text.match(FILE_REGEX);
  // ... same pattern
  return assets;
};

// AFTER (CachedMetadata-based):
extractBlobLinks = async (file: PublishFile) => {
  const assets: string[] = [];

  // Canvas files are JSON, not markdown — keep JSON parsing
  if (file.getType() === "canvas") {
    // ... existing JSON parsing logic stays
    return assets;
  }

  const cache = this.metadataCache.getCache(file.getPath());
  if (!cache?.embeds) return assets;

  const ASSET_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "webp",
    "mp4", "mkv", "mov", "avi",
    "mp3", "wav", "ogg",
    "pdf"
  ]);

  for (const embed of cache.embeds) {
    try {
      const linkedFile = this.metadataCache.getFirstLinkpathDest(
        getLinkpath(embed.link),
        file.getPath(),
      );

      if (linkedFile && ASSET_EXTENSIONS.has(linkedFile.extension)) {
        assets.push(linkedFile.path);
      }
    } catch {
      continue;
    }
  }

  return assets;
};
```

**Key insight:** `embed.link` already has the anchor stripped by Obsidian's parser. `![[img.webp#right]]` produces `embed.link = "img.webp"` and `embed.original = "![[img.webp#right]]"`. No manual anchor stripping needed.

### Changes to `convertLinksToFullPath()` (SyncerPageCompiler.ts)

**Current:** Strips frontmatter/code from text for matching, finds `[[links]]` via regex, splits on `|`, escapes pipe with `\|`, does `String.replace()` on full text (now scoped to body to avoid frontmatter collision).

**Target:** Use `CachedMetadata.links` with position info for precise replacement.

```typescript
// AFTER (CachedMetadata-based):
convertLinksToFullPath: TCompilerStep = (file) => async (text) => {
  const cache = this.metadataCache.getCache(file.getPath());
  if (!cache?.links) return text;

  // Process in reverse position order so replacements don't shift offsets
  const sortedLinks = [...cache.links].sort(
    (a, b) => b.position.start.offset - a.position.start.offset
  );

  let result = text;

  for (const linkCache of sortedLinks) {
    try {
      const linkedFile = this.metadataCache.getFirstLinkpathDest(
        getLinkpath(linkCache.link),
        file.getPath(),
      );

      if (!linkedFile) continue;

      if (linkedFile.extension === "md") {
        const extensionlessPath = linkedFile.path.substring(
          0, linkedFile.path.lastIndexOf(".")
        );

        // Reconstruct the wikilink with full path
        const displayPart = linkCache.displayText 
          ? `\\|${linkCache.displayText}` 
          : "";

        // linkCache.link may contain #header or #^block — preserve it
        const headerPart = linkCache.link.includes("#")
          ? "#" + linkCache.link.split("#").slice(1).join("#")
          : "";

        const replacement = `[[${extensionlessPath}${headerPart}${displayPart}]]`;

        // Position-based replacement — no first-occurrence bugs
        const start = linkCache.position.start.offset;
        const end = linkCache.position.end.offset;
        result = result.substring(0, start) + replacement + result.substring(end);
      }
    } catch (e) {
      console.log(e);
      continue;
    }
  }

  return result;
};
```

**Key benefits:**
- Position-based replacement eliminates frontmatter collision (Bug 1 root cause)
- `linkCache.displayText` gives the display name without manual pipe splitting
- `linkCache.link` gives the link target without manual anchor handling
- No need for `stripAwayCodeFencesAndFrontmatter` — `CachedMetadata.links` only contains body links
- Reverse-order processing means offset shifts from earlier replacements don't affect later ones

### Changes to `convertFileLinks()` (SyncerPageCompiler.ts)

**Current:** Matches `TRANSCLUDED_FILE_REGEX` and `FILE_REGEX`, manually extracts blob names, strips anchors, resolves paths, converts to base64.

**Target:** Use `CachedMetadata.embeds` with position info.

```typescript
// Key change: Use cache.embeds instead of regex matching
// Each embed has .link (path without anchor), .original (raw text), .position
// Process in reverse offset order for safe position-based replacement
```

The same pattern as `convertLinksToFullPath` applies. `EmbedCache.link` gives the clean path, `EmbedCache.original` gives the raw text for matching, and `EmbedCache.position` enables precise replacement.

### Regexes That Can Be Removed After Phase 1

From `src/utils/regexes.ts`:
- `TRANSCLUDED_FILE_REGEX` — replaced by `CachedMetadata.embeds`
- `FILE_REGEX` — replaced by `CachedMetadata.embeds`

From `SyncerPageCompiler.ts`:
- Inline `linkedFileRegex` (`/\[\[(.+?)\]\]/g`) — replaced by `CachedMetadata.links`
- `stripAwayCodeFencesAndFrontmatter` — no longer needed for link discovery

### Regexes That Stay (Phase 1)

- `FRONTMATTER_REGEX` — still used by `convertFrontMatter` step
- `BLOCKREF_REGEX` — used in transclusion to strip block refs
- `CODEBLOCK_REGEX`, `CODE_FENCE_REGEX` — used by `removeObsidianComments`
- `EXCALIDRAW_REGEX` — Excalidraw-specific
- `TRANSCLUDED_SVG_REGEX` — SVG inlining (could migrate in Phase 2)
- `DATAVIEW_*` regexes — Dataview integration-specific

### Verification Checklist

- [ ] `extractBlobLinks()` returns same asset paths as before for: plain embeds, embeds with anchors (`#right`), embeds with size (`|100`), markdown-style images, canvas files
- [ ] `convertLinksToFullPath()` produces same output for: simple wikilinks, wikilinks with display text, wikilinks with headers, wikilinks with block refs, wikilinks in tables (pipe escaped), wikilinks in frontmatter (NOT pipe escaped)
- [ ] `convertFileLinks()` produces same compiled output with correct base64 assets
- [ ] All existing tests pass (Layer 1 regex contracts + Layer 2 compiler unit tests)
- [ ] Layer 3 E2E smoke tests pass against a real Obsidian instance
- [ ] No regressions in published output (test with a sample vault)

### Testing Strategy (Three-Layer Parity Gate)

The migration uses a three-layer testing strategy. All layers must pass before and after each phase to guarantee behavioral parity.

**Layer 1 — Pure regex contract tests** (`src/utils/regexes.test.ts`, 66 tests)
Define what each regex matches, rejects, and captures. During migration, the regex implementation gets swapped but these contracts must hold. Documents known limitations (e.g. `FRONTMATTER_REGEX` requires LF, not CRLF; `FILE_REGEX` matches HTTP URLs — filtering happens in compiler code).

**Layer 2 — Compiler step unit tests** (129 tests across 4 files)
- `src/compiler/SyncerPageCompiler.test.ts` — `astTransform` (comment stripping, link resolution, vault path stripping), `linkTargeting`, `convertFrontMatter`, `extractBlobLinks`, `runCompilerSteps`
- `src/compiler/SyncerPageCompiler.transclusion.test.ts` — `createTranscludedText` with mocked `PublishFile` instances covering depth limits, block refs, header slicing, recursion, excalidraw skip, vault path filtering
- `src/compiler/FrontmatterCompiler.test.ts` — `compile`, `addPermalink`, `addDefaultPassThrough`, `addTags`, `addCSSClasses`, `addSocialImage`, `addTimestampsFrontmatter`
- `src/utils/utils.test.ts` — `generateUrlPath`, `generateBlobHash`, `sanitizePermalink`, `escapeRegExp`, `wrapAround`, `getSyncerPathForNote`, `getRewriteRules`

**Layer 3 — E2E integration tests** (`test/e2e/compile.e2e.ts`, 5 tests)
Run against a real sandboxed Obsidian instance via `wdio-obsidian-service`. Verify the plugin loads, the vault opens, wikilinks resolve, images are detected, and frontmatter is parsed correctly. Uses test fixtures in `test/vaults/compile-test/`.

**Commands:**
- `npm run test:unit` — Layers 1 + 2 (Jest)
- `npm run test:e2e` — Layer 3 (WebdriverIO + Obsidian)
- `just full` — format + lint + typecheck + build + all tests

**Environment notes:**
- E2E requires Obsidian desktop. On NixOS, use `nix develop` for dynamic linker libs.
- CI uses xvfb + herbstluftwm for headless Obsidian (see `.github/workflows/actions.yml`).
- ESLint uses `tsconfig.eslint.json` (includes E2E + wdio files); `tsc` uses `tsconfig.json` (excludes them) since E2E types come from wdio, not the main project.

---

## Phase 2: Replace String-Replace Content Transforms with remark-obsidian

**Goal:** Replace the sequential string-transform compiler pipeline with AST-based transforms using `remark-obsidian`.

**Risk:** Medium. Requires `remark-obsidian` as a dependency. Significant refactor of the compiler pipeline.

**Prerequisite:** Phase 1 complete. `remark-obsidian` package published to npm with stable API.

**Status:** Core transforms implemented. Comment stripping, link resolution, and vault path stripping consolidated into a single `astTransform` compiler step.

### Dependencies (installed)

```json
{
  "dependencies": {
    "@quartz-community/remark-obsidian": "^0.1.0",
    "unified": "^11.x",
    "remark-parse": "^11.x",
    "remark-stringify": "^11.x",
    "remark-frontmatter": "^5.x",
    "unist-util-visit": "^5.x"
  }
}
```

**Browser compatibility verified:** The unified ecosystem is browser-safe. `vfile` uses subpath imports for browser fallbacks. `micromark`'s only Node dependency (`stream`) is only used for streaming APIs, not by remark. `remark-obsidian` has zero Node imports. esbuild handles ESM→CJS interop when bundling.

### Architecture Change

**Previous pipeline (string transforms):**
```
raw text
  → convertFrontMatter (string replace)
  → createTranscludedText (regex match + string replace, recursive)
  → convertIntegrations (plugin-specific)
  → convertLinksToFullPath (regex match + string replace)  ← REMOVED
  → removeObsidianComments (regex match + string replace)  ← REMOVED
  → createSvgEmbeds (regex match + string replace)
  → linkTargeting (regex replace)
  → applyVaultPath (regex replace)                         ← REMOVED
  → convertFileLinks (regex match + string replace, produces assets)
```

**Current pipeline (hybrid string + AST transforms):**
```
raw text
  → convertFrontMatter (string replace)
  → createTranscludedText (regex match + string replace, recursive)
  → convertIntegrations (plugin-specific)
  → createSvgEmbeds (regex match + string replace)
  → linkTargeting (regex replace)
  → astTransform:                                          ← NEW
      parse with remark-parse + remark-frontmatter + remark-obsidian
      → comment stripping (remark-obsidian built-in tree transform)
      → wikilink resolution (visit wikilink nodes, resolve via getFirstLinkpathDest)
      → vault path stripping (visit link/image nodes, strip prefix)
      serialize with remark-stringify + remark-obsidian toMarkdown handlers
  → convertFileLinks (regex match + string replace, produces assets)
```

### What Was Implemented

#### remark-obsidian toMarkdown serializers (in `~/Repos/remark-obsidian`)

Four serialization handlers added to `remark-obsidian` v0.1.0 so that the unified pipeline can round-trip OFM syntax through parse → transform → serialize:

- `wikilinkToMarkdown()` — Serializes `Wikilink` nodes: `[[path#heading|alias]]`, `![[embed]]`
- `commentToMarkdown()` — Serializes `Comment` nodes: `%%content%%`
- `highlightToMarkdown()` — Serializes `Highlight` nodes: `==content==`
- `tagToMarkdown()` — Serializes `Tag` nodes: `#tagname`

All handlers use `import type` only — zero runtime dependencies added. Registration is automatic when using `remarkObsidian` plugin, controlled by the same options flags.

#### `astTransform` compiler step (in `SyncerPageCompiler.ts`)

Consolidated three separate string-based steps into a single AST pass:

1. **Comment stripping** — `remark-obsidian`'s built-in tree transform removes `Comment` nodes during `processor.run()`. Respects code blocks (comments inside code are not parsed as AST nodes).

2. **Wikilink resolution** — Visits `Wikilink` nodes, resolves paths via `metadataCache.getFirstLinkpathDest()`, strips `.md` extension, strips vault path prefix. Skips embedded wikilinks (handled by `createTranscludedText`/`convertFileLinks`). Skips unresolvable links (leaves them unchanged).

3. **Vault path stripping** — Visits `Link` and `Image` nodes, strips vault path prefix from URLs. Only active when `vaultPath` is not `/` or empty.

A `stripVaultPath(text)` private helper was added for non-AST contexts (used by `createTranscludedText` and `convertFileLinks`).

#### Methods removed

- `removeObsidianComments` — Replaced by remark-obsidian's comment stripping
- `convertLinksToFullPath` — Replaced by wikilink visitor in `astTransform`
- `applyVaultPath` — Replaced by link/image visitors in `astTransform`

#### Regexes removed

- `CODEBLOCK_REGEX` — Was used by `removeObsidianComments` to skip code blocks
- `CODE_FENCE_REGEX` — Was used by `removeObsidianComments` to skip code fences
- `EXCALIDRAW_REGEX` — Was used by `removeObsidianComments`

### What Stays as String Transforms

- `convertFrontMatter` — Replaces frontmatter block, operates on raw text
- `createTranscludedText` — Complex recursive transclusion with depth limits; would need AST subtree insertion to migrate
- `convertIntegrations` — Dataview/Datacore/Statblocks plugins output HTML strings
- `createSvgEmbeds` — SVG inlining, replaces embed with raw HTML
- `linkTargeting` — Removes `target="_blank"` from Dataview-generated HTML links
- `convertFileLinks` — Asset collection and base64 conversion

### Verification Checklist

- [x] Obsidian comments are properly removed (not inside code blocks) — 6 tests
- [x] Wikilink resolution works (full paths, headers, aliases, unresolvable) — 7 tests
- [x] Vault path stripping works for wikilinks and markdown links — 5 tests
- [x] All unit tests pass: 172 tests across 6 test suites
- [x] TypeScript type check passes (`tsc --noEmit`)
- [x] Browser compatibility: all unified dependencies verified browser-safe
- [ ] Transclusion tests pass with astTransform in pipeline (covered by existing transclusion tests — 42 pass)
- [ ] Integration transforms (Dataview, Statblocks) still produce correct output (requires E2E)
- [ ] Performance: AST parse/serialize overhead is acceptable (< 2x current)
- [ ] Layer 3 E2E tests pass against a real Obsidian instance

### Jest Configuration

ESM-only packages in the unified ecosystem require `transformIgnorePatterns` in `jest.config.js`:

```javascript
transformIgnorePatterns: [
  "node_modules/(?!(unified|remark-.+|@quartz-community/remark-obsidian|unist-util-.+|mdast-util-.+|micromark|micromark-.+|decode-named-character-reference|character-entities|devlop|longest-streak|ccount|escape-string-regexp|markdown-table|zwitch|trough|bail|is-plain-obj|vfile|vfile-message|fault|format)/)",
],
```

The symlinked `@quartz-community/remark-obsidian` also needs a `moduleNameMapper` entry for Jest resolution:

```javascript
moduleNameMapper: {
  "^@quartz-community/remark-obsidian$":
    "<rootDir>/node_modules/@quartz-community/remark-obsidian/dist/index.js",
},
```

---

## Phase 3: Minimize the Compiler

**Goal:** Push raw Obsidian Flavored Markdown to Quartz and let Quartz's build pipeline handle rendering transforms.

**Risk:** High. Requires Quartz v5 adoption. Changes what Syncer's output looks like.

**Prerequisite:** Phase 2 complete. Quartz v5 stable with `remark-obsidian` + `rehype-obsidian` in its build pipeline. Confirmation that Quartz handles all transforms users rely on.

**Status:** Implemented. Compiler minimized from 900 lines to ~500 lines. Pipeline reduced from 8 steps to 4.

### What Quartz v5's Pipeline Handles (verified)

- [x] Wikilink resolution (link → standard link conversion)
- [x] Embed/transclusion expansion
- [x] SVG inlining
- [x] Obsidian comment removal (`%% ... %%`)
- [x] Highlight syntax (`==highlights==`)
- [x] Tag rendering (`#tags`)
- [ ] Dataview link target cleanup (`target="_blank"` removal) — **not handled, kept in Syncer**

### What Syncer Still Does

1. **Frontmatter enrichment** — `convertFrontMatter` stays. Quartz can't know Syncer's permalink rules, timestamp policies, or tag transformations.

2. **Integration pre-compilation** — `convertIntegrations` stays. Dataview/Datacore/Statblocks queries must be compiled to static content before push.

3. **Link targeting** — `linkTargeting` stays. Removes `target="_blank" rel="noopener"` from Dataview-generated links. Quartz doesn't handle this.

4. **AST transform** — `astTransform` stays (simplified). Strips Obsidian comments via remark-obsidian and strips vault path prefix from markdown links/images.

5. **Asset collection** — `convertFileLinks` + `extractBlobLinks` stay. Quartz needs binary assets in the repo.

6. **Vault path handling** — `stripVaultPath` helper for non-AST contexts.

### What Was Removed

| Method | Reason | Phase |
|---|---|---|
| `removeObsidianComments()` | remark-obsidian strips comments during AST transform | Phase 2 |
| `convertLinksToFullPath()` | Quartz resolves wikilinks during build | Phase 2 |
| `applyVaultPath()` | Consolidated into `astTransform` for links/images | Phase 2 |
| `createTranscludedText()` | Quartz expands transclusions during build | Phase 3 |
| `createSvgEmbeds()` | Quartz handles SVG embeds during build | Phase 3 |
| `cacheFilesMarkedForPublishing()` | Only consumer was `createTranscludedText` | Phase 3 |
| `clearPublishCache()` | Only consumer was `createTranscludedText` | Phase 3 |
| `getCachedPublishFiles()` | Only consumer was `createTranscludedText` | Phase 3 |
| `getCachedPublishFilesByPath()` | Only consumer was `createTranscludedText` | Phase 3 |
| `stripAwayCodeFencesAndFrontmatter()` | Removed in Phase 1 | Phase 1 |

### Imports/Dependencies Removed

- `Publisher` import — only used for `getFilesMarkedForPublishing` type
- `PathRewriteRule` type — only used by `rewriteRule` field (transclusion)
- `slugify` — only used by header matching in transclusion
- `getRewriteRules`, `generateUrlPath`, `getSyncerPathForNote`, `sanitizePermalink` — only used by transclusion
- `fixSvgForXmlSerializer` — only used by SVG embedding
- `BLOCKREF_REGEX`, `TRANSCLUDED_SVG_REGEX` — only used by removed methods
- `Wikilink` type from remark-obsidian — wikilink resolution delegated to Quartz

### Constructor Simplified

```typescript
// BEFORE (6 parameters):
constructor(app, vault, settings, metadataCache, datastore, getFilesMarkedForPublishing)

// AFTER (5 parameters):
constructor(app, vault, settings, metadataCache, datastore)
```

### Current Pipeline

```typescript
const COMPILE_STEPS: TCompilerStep[] = [
  this.convertFrontMatter,     // Enrich frontmatter
  this.convertIntegrations,    // Compile Dataview/Statblocks to static
  this.linkTargeting,          // Remove target=_blank from Dataview links
  this.astTransform,           // Strip comments + vault path from links/images
];

// After pipeline:
const [text, blobs] = await this.convertFileLinks(file)(compiledText);
```

### Verification Checklist

- [x] All unit tests pass: 155 tests across 5 test suites
- [x] TypeScript type check passes (`tsc --noEmit`)
- [x] No LSP errors in any modified file
- [x] Constructor signature updated in all 3 call sites (Publisher, 2 test files)
- [x] PublishStatusManager cache calls removed
- [x] Transclusion test file removed (42 tests no longer applicable)
- [ ] Layer 3 E2E tests pass against a real Obsidian instance
- [ ] Manual testing with a sample vault pushed to Quartz v5

### Migration Considerations

- **Backward compatibility:** Users on Quartz v4 won't have `remark-obsidian`/`rehype-obsidian`. Consider a `quartzVersion: "v4" | "v5"` setting or version gate.
- **Feature parity verification:** Diff test Quartz v5 output against previous Syncer output with a representative vault.
- **Opt-in migration:** Remove the v4 compatibility path after a deprecation period.

---

## Reference: Obsidian API Surface

### CachedMetadata (metadataCache.getCache(path))

| Property | Type | Description |
|---|---|---|
| `links` | `LinkCache[]` | Body wikilinks with position, link target, display text |
| `embeds` | `EmbedCache[]` | Body embeds with position, link target, display text |
| `frontmatterLinks` | `FrontmatterLinkCache[]` | Frontmatter wikilinks (since 1.4.0) |
| `frontmatter` | `FrontMatterCache` | Parsed frontmatter key-value pairs |
| `frontmatterPosition` | `Pos` | Position of frontmatter block |
| `headings` | `HeadingCache[]` | All headings with level and position |
| `blocks` | `Record<string, BlockCache>` | Block references |
| `sections` | `SectionCache[]` | Document sections |
| `tags` | `TagCache[]` | All tags with position |

### MetadataCache Methods

| Method | Description |
|---|---|
| `getCache(path)` | Get CachedMetadata for a file |
| `getFirstLinkpathDest(linkpath, sourcePath)` | Resolve a link to a TFile |
| `fileToLinktext(file, sourcePath, omitMdExtension?)` | Generate shortest unique link text |
| `resolvedLinks` | Pre-computed source→dest link map |

### Key Types

```typescript
interface ReferenceCache extends CacheItem {
  link: string;          // Link destination (anchor-stripped)
  original: string;      // Raw text as written in document
  displayText?: string;  // Display name if pipe-aliased
  position: Pos;         // Exact document position
}

interface LinkCache extends ReferenceCache {}
interface EmbedCache extends ReferenceCache {}

interface FrontmatterLinkCache {
  key: string;           // Frontmatter property name
  link: string;          // Link destination
  original: string;      // Raw text
  displayText?: string;  // Display name
}

interface Pos {
  start: Loc;  // { line: number, col: number, offset: number }
  end: Loc;
}
```

### External Packages

| Package | Repository | Purpose |
|---|---|---|
| `@quartz-community/remark-obsidian` | https://github.com/quartz-community/remark-obsidian | Parse OFM to mdast (remark plugin) |
| `@quartz-community/rehype-obsidian` | https://github.com/quartz-community/rehype-obsidian | Transform OFM hast nodes (rehype plugin) |
