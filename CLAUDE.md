# Sagittarius — Canvas Book Editor

## What This Is
A single-file HTML5 Canvas book editor targeting indie authors. Competes with
Atticus and Reedsy. The app is a single HTML file assembled from split parts
via `build.sh`.

## Build System
```bash
./build.sh                    # → sag_build.html (full)
./build.sh --no-tests         # → sag_build.html (without test harness)
```
The output goes to the project root. After any edit, always run `./build.sh`.

## File Structure
- `shell/head.html` — DOCTYPE, CSS, HTML body (edit CSS and HTML structure here)
- `shell/tail.html` — closing tags
- `parts/01-core.js` through `parts/14-stats-find-init.js` — JS modules
- `specs/` — build specifications (read-only reference, never modify)
- `sag_build.html` — built output (NEVER edit directly, always rebuild)

See `MANIFEST.md` for detailed contents of each part file.

## ════════════════════════════════════════════
## MANDATORY RULES — VIOLATIONS WILL BE REJECTED
## ════════════════════════════════════════════

### Scope Control
- **ONLY modify files explicitly listed in the spec's "Files to Modify" section**
- **NEVER make changes "while you're in there" — no drive-by fixes**
- **NEVER refactor, rename, reformat, or "improve" code outside the spec scope**
- **If you discover a bug outside scope, REPORT IT in the commit message — do NOT fix it**
- **If the spec is ambiguous, STOP and ask in the commit message — do NOT guess**

### Code Integrity
- NEVER change `defaultRunStyle()` or `defaultParaStyle()` without also
  changing `v2BookDefaults()` in `parts/11-cascade.js`
- NEVER modify the undo delta format without updating both `applyUndo()`
  and `applyRedo()` in `parts/05-undo-edit.js`
- NEVER add code that runs on every frame/scroll without measuring performance
- NEVER introduce `contenteditable` — this is a canvas-based editor
- NEVER change the coordinate system (points in JSON, screen pixels in layout)
- NEVER modify the section isolation model (x-sectionId, clampToSection)
- NEVER change the save/load format without a migration path in `parts/08-persist.js`

### Code Style
- Use `var` not `let`/`const` — the codebase is ES5 throughout
- Preserve section comment headers (`/* === ... === */`)
- Match existing naming patterns in the file you're editing
- No new dependencies or external libraries without spec approval

### Pre-Commit Checklist (MANDATORY — DO ALL OF THESE)
1. Run `./build.sh` — must succeed with no errors
2. List EVERY file you modified in the commit message
3. Confirm you modified ZERO files outside the spec's scope
4. If tests exist for modified functions, verify they still pass
5. If you added new functions, add tests in `parts/10-tests.js`
6. State what you changed and why for each file

### Commit Message Format
```
Build XXXX: [short description]

Files modified:
- parts/XX-name.js: [what changed and why]
- shell/head.html: [what changed and why]

Files NOT modified (confirming scope):
- All other part files unchanged
- No changes to undo system, cascade, or persistence

Tests: [passed/added N new/not applicable]
Discovered issues (not fixed): [list any bugs found but not touched]
```

## ════════════════════════════════════════════
## ARCHITECTURE REFERENCE
## ════════════════════════════════════════════

### Coordinate System
- JSON styles: stored in POINTS (1pt = 1/72 inch)
- Layout engine: works in SCREEN PIXELS (points × 96/72)
- Canvas display: screen pixels × zoom
- PDF export: screen pixels × (72/96) = PDF points

### Architecture Patterns (DO NOT DEVIATE)
- `_isChapterHeading` flag pattern for heading detection
- Section isolation: paragraphs carry `x-sectionId`
- Selection clamped to anchor's section
- Compound deltas for multi-step operations (e.g., Add Chapter)
- `bookDesign` is the live design template; themes replace it entirely
- Designer changeset system: `desSetChange` → `desCommitChangeset` / `desDiscardChangeset`
- Preview renders from `desMergedDesign()`, NEVER writes to `bookDesign`

### Designer/Stylist Panel
- Purple gradient headers: closed `#534AB7→#1E1A4A`, open `#7F77DD→#3C3489`
- Font: Barlow Semi Condensed (self-hosted in production)
- See `sagittarius_stylist_panel_spec.md` for full design spec

### Key File Locations
| What | Where |
|------|-------|
| Layout engine | `parts/02-layout.js` — `runLayout()` |
| Document model | `parts/01-core.js` — `doc` object, factories |
| Undo system | `parts/05-undo-edit.js` |
| Designer view | `parts/13-designer.js` |
| Cascade/sections | `parts/11-cascade.js` |
| Tests | `parts/10-tests.js` |
| CSS + HTML | `shell/head.html` |
| Persistence | `parts/08-persist.js` |

## Testing
Tests run in browser console via `__sag.runTests()`.
After any code change, open the built HTML and run the tests.
