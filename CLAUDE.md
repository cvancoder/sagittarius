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
The output goes to the project root. Nginx serves it from there.
After any edit, always run `./build.sh` so the live preview updates.

## File Structure
- `shell/head.html` — DOCTYPE, CSS, HTML body (edit CSS and HTML structure here)
- `shell/tail.html` — closing tags
- `parts/01-core.js` through `parts/14-stats-find-init.js` — JS modules
- `sag_build.html` — built output (DO NOT edit directly, always rebuild)

See `MANIFEST.md` for detailed contents of each part file.

## Critical Rules

### Never Do
- Never edit `sag_build.html` directly — always edit part files and rebuild
- Never change a default value in `defaultRunStyle()` or `defaultParaStyle()`
  without also changing it in `v2BookDefaults()` (in `parts/11-cascade.js`)
- Never modify the undo delta format without updating both `applyUndo()` and
  `applyRedo()` in `parts/05-undo-edit.js`
- Never add code that runs on every frame/scroll without measuring performance
- Never introduce `contenteditable` — this is a canvas-based editor

### Always Do
- Run `./build.sh` after every edit
- Add tests in `parts/10-tests.js` for any new function
- Keep each change to ONE part file when possible
- Preserve the section comment headers (`/* === ... === */`)
- Use `var` not `let`/`const` — the codebase is ES5 throughout

### Coordinate System
- JSON styles: stored in POINTS (1pt = 1/72 inch)
- Layout engine: works in SCREEN PIXELS (points × 96/72)
- Canvas display: screen pixels × zoom
- PDF export: screen pixels × (72/96) = PDF points

### Architecture Patterns
- `_isChapterHeading` flag pattern for heading detection
- Section isolation: paragraphs carry `x-sectionId`
- Selection clamped to anchor's section
- Compound deltas for multi-step operations (e.g., Add Chapter)
- `bookDesign` is the live design template; themes replace it entirely

### Designer/Stylist Panel
- Purple gradient headers: closed `#534AB7→#1E1A4A`, open `#7F77DD→#3C3489`
- Font: Barlow Semi Condensed (self-hosted in production)
- See `sagittarius_stylist_panel_spec.md` for full design spec
- Controls write to `bookDesign` via changeset system
- Preview renders from `desMergedDesign()`, never writes to `bookDesign`

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
