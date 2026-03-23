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
- `src/compiler/SyncerPageCompiler.test.ts` — `removeObsidianComments`, `linkTargeting`, `applyVaultPath`, `convertFrontMatter`, `convertLinksToFullPath`, `extractBlobLinks`, `runCompilerSteps`
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

### Dependencies

```json
{
  "dependencies": {
    "@quartz-community/remark-obsidian": "^x.y.z",
    "unified": "^11.x",
    "remark-parse": "^11.x",
    "remark-stringify": "^11.x",
    "remark-frontmatter": "^5.x"
  }
}
```

**Note:** Verify all dependencies work in Obsidian's browser-like runtime. The unified ecosystem is generally browser-compatible but some plugins may assume Node APIs.

### Architecture Change

**Current pipeline (string transforms):**
```
raw text
  → convertFrontMatter (string replace)
  → createTranscludedText (regex match + string replace, recursive)
  → convertIntegrations (plugin-specific)
  → convertLinksToFullPath (regex match + string replace)
  → removeObsidianComments (regex match + string replace)
  → createSvgEmbeds (regex match + string replace)
  → linkTargeting (regex replace)
  → applyVaultPath (regex replace)
  → convertFileLinks (regex match + string replace, produces assets)
```

**Target pipeline (AST transforms):**
```
raw text
  → remark-parse + remark-obsidian → mdast (AST)
  → convertFrontMatter (modify frontmatter node)
  → createTranscludedText (replace embed nodes with content subtrees)
  → convertIntegrations (plugin-specific, may still use string transforms)
  → convertLinksToFullPath (walk wikilink nodes, update paths)
  → removeObsidianComments (remove comment nodes)
  → createSvgEmbeds (replace SVG embed nodes with raw HTML)
  → linkTargeting (walk link nodes, remove target attrs)
  → applyVaultPath (walk link/embed nodes, strip vault prefix)
  → convertFileLinks (walk embed nodes, collect assets)
  → remark-stringify → compiled text
```

### Compiler Step Interface Change

```typescript
// BEFORE:
type TCompilerStep = (file: PublishFile) =>
  | ((text: string) => Promise<string>)
  | ((text: string) => string);

// AFTER:
import { Root } from "mdast";

type TCompilerStep = (file: PublishFile) =>
  | ((tree: Root) => Promise<Root>)
  | ((tree: Root) => Root);

// generateMarkdown changes:
async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
  const vaultFileText = await file.cachedRead();
  
  // Parse once
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkObsidian);
  
  let tree = processor.parse(vaultFileText);
  
  // Transform
  for (const step of COMPILE_STEPS) {
    tree = await step(file)(tree);
  }
  
  // Serialize once
  const compiledText = processor.stringify(tree);
  const [text, blobs] = await this.collectAssets(file)(tree);
  
  return [text, { blobs }];
}
```

### Methods to Convert

**`convertLinksToFullPath`** → Walk `wikiLink` nodes in the AST. Each node has `value` (link target), `data.alias` (display text), and structural context (parent node type). Transform `value` to full path. No string replacement needed.

**`createTranscludedText`** → Walk `wikiLink` nodes with `data.embed: true`. Read the target file, parse it into a subtree, and replace the embed node with the subtree contents. Recursive transclusion = recursive tree insertion.

**`createSvgEmbeds`** → Walk embed nodes where the target is `.svg`. Read SVG content, create a raw HTML node, replace the embed node.

**`removeObsidianComments`** → `remark-obsidian` should parse `%% comments %%` into dedicated nodes. Walk and remove them.

**`applyVaultPath`** → Walk all link/embed nodes, strip vault path prefix from `value`.

**`convertFileLinks`** → Walk embed nodes for asset files, read binary content, collect as assets, update paths.

### What Stays as String Transforms

- `convertIntegrations` — Dataview/Datacore/Statblocks compilation. These plugins have their own APIs that output HTML strings. They'd need to produce mdast nodes to be fully integrated, which is out of scope. Keep as a post-serialization string transform, or wrap the output in raw HTML mdast nodes.

### Verification Checklist

- [ ] Parse → transform → serialize produces identical output to current pipeline for all test cases
- [ ] Transclusion (including recursive up to depth 4) works correctly (parity with `createTranscludedText` transclusion tests)
- [ ] SVG embedding produces identical inline SVG output
- [ ] Obsidian comments are properly removed (not inside code blocks)
- [ ] Vault path stripping works for all link types
- [ ] Integration transforms (Dataview, Statblocks) still produce correct output
- [ ] All three test layers pass (`just full`): Layer 1 regex contracts, Layer 2 compiler unit tests, Layer 3 E2E
- [ ] Performance: AST parse/serialize overhead is acceptable (< 2x current)
- [ ] Browser compatibility: all unified dependencies work in Obsidian runtime

---

## Phase 3: Minimize the Compiler

**Goal:** Push raw Obsidian Flavored Markdown to Quartz and let Quartz's build pipeline handle rendering transforms.

**Risk:** High. Requires Quartz v5 adoption. Changes what Syncer's output looks like.

**Prerequisite:** Phase 2 complete. Quartz v5 stable with `remark-obsidian` + `rehype-obsidian` in its build pipeline. Confirmation that Quartz handles all transforms users rely on.

### What Quartz v5's Pipeline Handles

Verify that Quartz v5's `remark-obsidian` + `rehype-obsidian` handles:
- [ ] Wikilink → standard link conversion
- [ ] Embed/transclusion expansion
- [ ] SVG inlining
- [ ] Obsidian comment removal (`%% ... %%`)
- [ ] Block reference resolution
- [ ] Callout/admonition rendering
- [ ] Dataview link target cleanup

### What Syncer Still Needs

1. **Frontmatter enrichment** — `FrontmatterCompiler` stays. Quartz can't know Syncer's permalink rules, timestamp policies, or tag transformations.

2. **Asset collection** — `CachedMetadata.embeds` + `resolvedLinks` + canvas JSON parsing. Quartz needs the files to exist in the repo.

3. **Integration pre-compilation** — Dataview/Datacore/Statblocks queries must be compiled to static content before push. Quartz's build environment doesn't have access to the Obsidian vault's live data.

4. **Vault path handling** — Strip vault path prefix from file paths when pushing.

### What Gets Removed

| Method | Reason |
|---|---|
| `convertLinksToFullPath()` | Quartz resolves wikilinks during build |
| `createTranscludedText()` | Quartz expands transclusions during build |
| `createSvgEmbeds()` | Quartz handles SVG embeds during build |
| `removeObsidianComments()` | Quartz strips comments during build |
| `linkTargeting()` | Quartz handles link attributes during build |
| `applyVaultPath()` | Handled at push time, not in content |
| `stripAwayCodeFencesAndFrontmatter()` | No longer needed |

### Simplified Pipeline

```typescript
async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
  const vaultFileText = await file.cachedRead();

  if (file.getType() === "base" || file.getType() === "canvas") {
    return [vaultFileText, { blobs: [] }];
  }

  const COMPILE_STEPS: TCompilerStep[] = [
    this.convertFrontMatter,        // Enrich frontmatter
    this.convertIntegrations,       // Compile Dataview/Statblocks to static
  ];

  const compiledText = await this.runCompilerSteps(file, COMPILE_STEPS)(vaultFileText);
  const [text, blobs] = await this.convertFileLinks(file)(compiledText);

  return [text, { blobs }];
}
```

### Migration Considerations

- **Backward compatibility:** Users on Quartz v4 won't have the new remark/rehype plugins. Syncer may need a compatibility mode or version gate.
- **Feature parity verification:** Before removing any transform, verify Quartz v5's output matches Syncer's current output for that transform. Diff test with a representative vault.
- **Opt-in migration:** Consider a setting like `quartzVersion: "v4" | "v5"` that controls which pipeline runs. Remove the v4 path after a deprecation period.

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
