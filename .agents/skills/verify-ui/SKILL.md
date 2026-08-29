---
name: verify-ui
description: UI verification workflow — open modals, query DOM contract selectors, interact with inputs, take screenshots, and validate UI rendering via the operability facade.
triggers:
    - verify ui
    - check ui
    - test modal
    - does it render
    - publication center
    - onboarding wizard
    - quartz hub
    - settings tab
argument-hint: '<modal-name>'
---

# Verify UI Skill

## Purpose

After modifying view code (PublicationCenter, OnboardingWizard, QuartzHub, DiffModal, StatusBar, settings), verify the UI renders correctly by querying DOM contract selectors, interacting with inputs, and taking screenshots.

## Prerequisites

- Obsidian must be running with the test vault open.
- Plugin must be built with `npm run build:dev` (copies to test vault, enables facade via `__DEV__` flag).
- Facade must be available (`obsidian eval code="typeof window.__QS__" 2>/dev/null` returns `=> object`).
- Console capture requires `obsidian dev:debug on 2>/dev/null` (once per session).

## When to Activate

Activate when:
- Changes were made to files in `src/views/`
- CSS changes in `styles.css` that affect plugin UI
- TreeRenderer, TreeState, or PublicationTree changes
- Settings tab or declarative settings changes
- Quartz Hub changes

## Important: Interaction Patterns

**Suppress CLI noise.** Always append `2>/dev/null` to every `obsidian` CLI command.

**Async eval pattern.** Use IIFE + `console.log` for async calls:
```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

**Setting input values.** DOM `.value` assignment does NOT trigger event listeners. Always dispatch an input event:
```bash
obsidian eval code="const el=document.querySelector('[data-qs=\"hub-setup-clone-url\"]');el.value='https://example.com/repo.git';el.dispatchEvent(new Event('input',{bubbles:true}))" 2>/dev/null
```

**Wait after operations.** Approximate wait times:
- Modal open: 2 seconds
- Button click with async effect: 3-5 seconds
- Build/install commands: 10-60 seconds
- Plugin reload: 3 seconds

**Verify actions took effect.** After triggering an action, always query the DOM to confirm:
```bash
obsidian eval code="document.querySelector('[data-qs=\"hub-action\"][data-qs-value=\"build\"]')?.click()" 2>/dev/null
sleep 3 && obsidian dev:dom selector='.qs-terminal-output' total 2>/dev/null
```

**Stacked modals.** When a modal opens another (e.g., Hub → Plugin Browser), close in reverse order:
```bash
# Close Plugin Browser first (topmost)
obsidian eval code="document.querySelector('.quartz-syncer-plugin-browser .modal-close-button')?.click()" 2>/dev/null
sleep 1
# Then close the Hub
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'hub.close'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

**TerminalOutputModal.** Has no `data-qs` attributes. Close with:
```bash
obsidian eval code="document.querySelector('.qs-terminal-output .qs-terminal-output-actions button:last-child')?.click()" 2>/dev/null
```

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
| `[data-qs="hub"]` | Quartz Hub modal |
| `[data-qs="hub-tab"]` | Hub tab button (has `data-qs-value`) |
| `[data-qs="hub-status"]` | Hub status panel |
| `[data-qs="hub-action"]` | Hub action button (has `data-qs-value`) |
| `[data-qs="hub-setup-link-path"]` | Hub setup link path input |
| `[data-qs="hub-setup-link"]` | Hub setup link button |
| `[data-qs="hub-setup-clone-url"]` | Hub setup clone URL input |
| `[data-qs="hub-setup-clone-dest"]` | Hub setup clone destination input |
| `[data-qs="hub-setup-clone"]` | Hub setup clone button |

## Workflow

### Verifying the Publication Center

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.open'});console.log(JSON.stringify(r))})()" 2>/dev/null
sleep 2

obsidian dev:dom selector='[data-qs="pub-center"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="pub-row"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="pub-category"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="pub-publish-btn"]' text 2>/dev/null
obsidian dev:dom selector='[data-qs="pub-tab"]' total 2>/dev/null

obsidian dev:screenshot path=/tmp/pub-center.png 2>/dev/null

obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'pub.close'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

### Verifying the Quartz Hub

```bash
obsidian command id=quartz-syncer:open-hub 2>/dev/null
sleep 2

obsidian dev:dom selector='[data-qs="hub"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="hub-tab"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="hub-status"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="hub-action"]' total 2>/dev/null

obsidian dev:screenshot path=/tmp/hub.png 2>/dev/null

# Switch to Setup tab
obsidian eval code="document.querySelector('[data-qs=\"hub-tab\"][data-qs-value=\"setup\"]')?.click()" 2>/dev/null
sleep 1
obsidian dev:dom selector='[data-qs="hub-setup-link"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="hub-setup-clone"]' total 2>/dev/null

obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'hub.close'});console.log(JSON.stringify(r))})()" 2>/dev/null
```

### Verifying Hub Setup — Link via DOM

```bash
obsidian command id=quartz-syncer:open-hub 2>/dev/null
sleep 2
obsidian eval code="document.querySelector('[data-qs=\"hub-tab\"][data-qs-value=\"setup\"]')?.click()" 2>/dev/null
sleep 1

# Set path and trigger validation
obsidian eval code="const el=document.querySelector('[data-qs=\"hub-setup-link-path\"]');el.value='/path/to/quartz';el.dispatchEvent(new Event('input',{bubbles:true}))" 2>/dev/null
sleep 1

obsidian dev:screenshot path=/tmp/hub-link.png 2>/dev/null
# Check validation showed "Quartz repo detected" before clicking Link
obsidian eval code="document.querySelector('[data-qs=\"hub-setup-link\"]')?.click()" 2>/dev/null
```

### Verifying Hub Setup — Clone via operability (recommended)

```bash
obsidian eval code="(async()=>{const r=await window.__QS__.act({name:'hub.setup.clone',params:{url:'https://github.com/user/quartz.git',dest:'/path/to/dest',confirm:true}});console.log(JSON.stringify(r))})()" 2>/dev/null
```

### Verifying the Onboarding Wizard

```bash
obsidian command id=quartz-syncer:setup-wizard 2>/dev/null
sleep 2

obsidian dev:dom selector='[data-qs="wizard"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="wizard-step"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="wizard-input"]' total 2>/dev/null
obsidian dev:dom selector='[data-qs="wizard-next"]' text 2>/dev/null
obsidian dev:dom selector='[data-qs="wizard-error"]' total 2>/dev/null

obsidian dev:screenshot path=/tmp/wizard.png 2>/dev/null
```

### Verifying the Status Bar

```bash
obsidian dev:dom selector='[data-qs="statusbar"]' attr=data-qs-state 2>/dev/null
```

## MUST DO

- Always use `[data-qs="..."]` selectors — never raw CSS classes.
- Always append `2>/dev/null` to all CLI commands.
- Always wait after opening modals (2s) and clicking buttons (3-5s).
- Always verify element exists (`total`) before querying content (`text`, `attr`).
- Always use `dispatchEvent` after setting input `.value`.
- Always take screenshots for visual changes.
- Always use the IIFE pattern for async eval calls.

## MUST NOT DO

- Do NOT use CSS class selectors for verification — exception: TerminalOutputModal (`.qs-terminal-output`) which lacks `data-qs`.
- Do NOT omit `2>/dev/null` — GTK warnings break output parsing.
- Do NOT use top-level `await` in eval — use the IIFE pattern.
- Do NOT set `.value` without `dispatchEvent` — event listeners won't fire.
- Do NOT assume element counts — always query first.
