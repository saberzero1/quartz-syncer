---
name: verify-ui
description: UI verification workflow — open modals, query DOM contract selectors, take screenshots, and validate UI rendering via the operability facade.
triggers:
    - verify ui
    - check ui
    - test modal
    - does it render
    - publication center
    - onboarding wizard
    - settings tab
argument-hint: '<modal-name>'
---

# Verify UI Skill

## Purpose

After modifying view code (PublicationCenter, OnboardingWizard, DiffModal, StatusBar, settings), verify the UI renders correctly by querying DOM contract selectors and taking screenshots. Uses `obsidian dev:dom` with `[data-qs="..."]` selectors exclusively.

## Prerequisites

- Obsidian must be running with the test vault open.
- Plugin must be built with `npm run build:dev` (copies to test vault, enables facade via `__DEV__` flag).
- Operability facade must be available (`obsidian eval code="typeof window.__QS__"` returns `=> object`).
- Console capture requires `obsidian dev:debug on` (once per session).

## When to Activate

Activate when:
- Changes were made to files in `src/views/`
- CSS changes in `styles.css` that affect plugin UI
- TreeRenderer, TreeState, or PublicationTree changes
- Settings tab or declarative settings changes

## DOM Contract Reference

All queryable elements use `data-qs` attributes. Never use raw CSS classes for verification.

| Selector | Element |
|---|---|
| `[data-qs="pub-center"]` | Publication center modal |
| `[data-qs="pub-row"]` | File row (has `data-qs-path`) |
| `[data-qs="pub-checkbox"]` | Checkbox (has `data-qs-path` or `data-qs-category`) |
| `[data-qs="pub-category"]` | Category header (has `data-qs-value`) |
| `[data-qs="pub-tab"]` | Tab button (has `data-qs-value`) |
| `[data-qs="pub-publish-btn"]` | Publish button |
| `[data-qs="pub-delete-btn"]` | Delete button |
| `[data-qs="pub-search"]` | Filter input |
| `[data-qs="pub-progress"]` | Progress bar |
| `[data-qs="wizard"]` | Onboarding wizard |
| `[data-qs="wizard-step"]` | Step indicator (has `data-qs-value`) |
| `[data-qs="wizard-next"]` | Next/continue button |
| `[data-qs="wizard-input"]` | Input field (has `data-qs-field`) |
| `[data-qs="wizard-error"]` | Error display |
| `[data-qs="statusbar"]` | Status bar (has `data-qs-state`) |
| `[data-qs="diff-view"]` | Diff viewer |

## Workflow

### Verifying the Publication Center

```bash
# Open it
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()"

# Verify modal is open
obsidian dev:dom selector='[data-qs="pub-center"]' total
# Expected: 1

# Count file rows
obsidian dev:dom selector='[data-qs="pub-row"]' total

# Check categories present
obsidian dev:dom selector='[data-qs="pub-category"]' total

# Check buttons exist
obsidian dev:dom selector='[data-qs="pub-publish-btn"]' text
obsidian dev:dom selector='[data-qs="pub-delete-btn"]' text

# Check tabs
obsidian dev:dom selector='[data-qs="pub-tab"]' total
# Expected: 2

# Check checkboxes
obsidian dev:dom selector='[data-qs="pub-checkbox"]' total

# Take screenshot
obsidian dev:screenshot path=/tmp/pub-center.png

# Close it
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.close'});console.log(JSON.stringify(r))})()"
```

### Verifying file selection (programmatic)

```bash
# Open and select specific files
obsidian eval code="(async()=>{await window.__QS__.act({name:'pub.open'})})()"
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.select',params:{paths:['notes/Recipe.md']}});console.log(JSON.stringify(r))})()"

# Verify selection
obsidian dev:dom selector='[data-qs="pub-row"][data-qs-path="notes/Recipe.md"]' text

# Select all
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.selectAll'});console.log(JSON.stringify(r))})()"

# Deselect all
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.deselectAll'});console.log(JSON.stringify(r))})()"
```

### Verifying the Onboarding Wizard

```bash
# Open via command
obsidian command id=quartz-syncer:setup-wizard

# Verify modal is open
obsidian dev:dom selector='[data-qs="wizard"]' total
# Expected: 1

# Check steps rendered
obsidian dev:dom selector='[data-qs="wizard-step"]' total
# Expected: 5 (on desktop)

# Check inputs
obsidian dev:dom selector='[data-qs="wizard-input"]' total

# Check next button
obsidian dev:dom selector='[data-qs="wizard-next"]' text

# Take screenshot
obsidian dev:screenshot path=/tmp/wizard.png

# Check for errors
obsidian dev:dom selector='[data-qs="wizard-error"]' total
# Expected: 0 (no errors on fresh open)
```

### Verifying the Status Bar

```bash
# Check state
obsidian dev:dom selector='[data-qs="statusbar"]' attr=data-qs-state
# Expected: "ready" or "compiling" or "unconfigured"

# Check text content
obsidian dev:dom selector='[data-qs="statusbar"]' text
```

### Verifying after CSS changes

```bash
# Check specific CSS properties
obsidian dev:css selector='[data-qs="pub-center"]' prop=display
obsidian dev:css selector='[data-qs="statusbar"]' prop=visibility

# Take screenshots at different states
obsidian dev:screenshot path=/tmp/before-change.png
# ... make change, rebuild, reload ...
obsidian dev:screenshot path=/tmp/after-change.png
```

## MUST DO

- Always use `[data-qs="..."]` selectors — never raw CSS classes.
- Always check `total` before querying `text` — an element may not exist.
- Always take screenshots for visual changes — DOM queries can't verify layout/styling.
- Check `dev:console level=error` after opening modals — rendering errors may not be visible.

## MUST NOT DO

- Do NOT use CSS class selectors (`.qs-pub-center`, `.tree-item`, etc.) — they're internal and may change.
- Do NOT assume element counts — always query and verify.
- Do NOT skip screenshots for visual changes — DOM presence doesn't mean correct rendering.
