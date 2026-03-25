# Sagittarius Build System — MANIFEST

## Purpose

Sagittarius is a single-file HTML application (~15K lines). This build system
splits it into logical parts so AI agents can work on individual sections
without needing the full file in context. The build script concatenates
everything back into a single testable HTML — no server, no bundler,
just open in browser.

## Quick Start

```bash
./build.sh                    # → sag_build.html (full, with tests)
./build.sh --no-tests         # → sag_build.html (without test harness)
./build.sh my_output.html     # → my_output.html
```

Open the output HTML directly in any browser. No server required.

## File Structure

```
sag-build/
├── build.sh              # Concatenation build script
├── MANIFEST.md           # This file
├── shell/
│   ├── head.html         # DOCTYPE + CSS + HTML body (lines 1–453)
│   └── tail.html         # </script></body></html> (lines 15630–15634)
└── parts/                # JS sections (inside main IIFE)
    ├── 01-core.js        #   932 lines — Config, document model, defaults
    ├── 02-layout.js      #  1570 lines — Layout engine, drop caps
    ├── 03-render.js      #  1161 lines — Page window manager, renderer
    ├── 04-input.js       #   624 lines — Hit test, mouse, navigation
    ├── 05-undo-edit.js   #   683 lines — Undo/redo, editing operations
    ├── 06-keyboard-clipboard.js  # 560 lines — Keyboard, clipboard
    ├── 07-toolbar.js     #   619 lines — Toolbar, style application
    ├── 08-persist.js     #   477 lines — IndexedDB, migration, validation
    ├── 09-spell-debug.js #   576 lines — Spellcheck, selection debug
    ├── 10-tests.js       #  5183 lines — Test harness (excludable)
    ├── 11-cascade.js     #   447 lines — Document cascade & sections
    ├── 12-sidebar.js     #   820 lines — Dev menu, navigator sidebar
    ├── 13-designer.js    #  1082 lines — Book designer view
    └── 14-stats-find-init.js # 442 lines — Stats, find, preflight, init
```

## Part File Contents (detailed)

### 01-core.js (932 lines)
Opens the main IIFE. Contains:
- `<script>` tag and `(function() {`
- `SCREEN_DPI`, page dimension variables
- `computePageDimensions()`
- `defaultBookSettings()`, `defaultBookDesign()`
- Text decoration helpers (`tdHas`, `tdAdd`, `tdRemove`, `tdToggle`)
- `defaultRunStyle()`, `defaultParaStyle()`
- `sectionOfPara()`, `clampToSection()`, `currentSectionId()`
- Run/paragraph factory functions (`makeRun`, `makePara`, `createImagePara`)
- `fontStr()`, `styleMatch()`, `paraTextLen()`, `paraText()`
- `posToRun()`, `runStyleAt()`, `splitRunAt()`, `mergeAdjacentRuns()`
- `extractRunSlice()`, `removeRunSlice()`, `insertRunSlice()`, `clonePara()`
- List support (bullet/number), role presets (headings, blockquote, verse)
- **The `doc` object** with default paragraphs and section meta

**Dependencies:** None (this is the foundation)
**Depended on by:** Everything

### 02-layout.js (1570 lines)
- Position model (`mkPos`, `cmpPos`, `eqPos`, `clampPos`)
- Cursor and selection state (`cursor`, `selAnchor`, `selFocus`)
- Layout engine tokenizer (`tokenizePara`, `getSegCharWidths`)
- Font metrics (`fontMetrics`)
- Drop cap subsystem (`dropCapFirstLetter`, `computeDropCap`, etc.)
- Small caps system (`measureXHeight`, `measureCapHeight`, `computeAutoScale`, `applySmallCaps`)
- `requestLayout()`, `requestFullLayout()`
- **`runLayout()`** — the main layout function (~1100 lines)

**Dependencies:** 01-core
**This is the heart of the editor.** Touch with extreme care.

### 03-render.js (1161 lines)
- Page window manager (virtualizes page canvas mounting)
- `syncPages()`, `applyZoom()`
- Main render function: margin guides, page breaks, heading blocks,
  images, highlights, links, debug overlay, selection, cursor
- `posToCoords()` — maps document positions to screen coordinates

**Dependencies:** 01-core, 02-layout

### 04-input.js (624 lines)
- `hitTest()` — resolves mouse coordinates to document positions
- Link utilities (URL validation, normalization)
- Mouse event handlers (click, drag, double-click, triple-click)
- Cursor navigation (arrow keys, home/end, page up/down)

**Dependencies:** 01-core, 02-layout, 03-render

### 05-undo-edit.js (683 lines)
- Delta-based undo/redo system
- `createDelta()`, `pushDelta()`, `applyUndo()`, `applyRedo()`
- Low-level paragraph helpers (`deleteCharsInPara`, `insertTextInPara`,
  `splitParaAt`, `mergeParaAt`, `applyStyleToPara`)
- Editing operations: `deleteRange()`, `insertText()`, `splitParagraph()`,
  `doBackspace()`, `doDelete()`, `getSelectedText()`

**Dependencies:** 01-core, 02-layout

### 06-keyboard-clipboard.js (560 lines)
- Keyboard input handler (keystroke dispatch)
- Clipboard system (sentinel-based paste detection)
- Rich content extraction and insertion
- `doPaste()`, `copySelection()`, `insertRichContent()`

**Dependencies:** 01-core, 02-layout, 05-undo-edit

### 07-toolbar.js (619 lines)
- `updateToolbar()` — syncs toolbar state to current selection
- Style toggling (`toggleStyle`, `applyRunStyleToSelection`)
- Paragraph alignment, indent, line spacing
- Link bar (show/hide/apply)
- All toolbar button event listeners

**Dependencies:** 01-core, 05-undo-edit

### 08-persist.js (477 lines)
- IndexedDB with localStorage fallback
- `saveDoc()`, `loadSavedDoc()`, `exportJSON()`
- `migrateDoc()` — version upgrades (v1→v2→v3→v4→v5)
- `validateDoc()` — structural integrity checks
- Auto-save timer

**Dependencies:** 01-core, 11-cascade

### 09-spell-debug.js (576 lines)
- Selection debug display
- Spellcheck subsystem (Typo.js integration)
- Personal dictionary (localStorage)
- Spell popup UI
- Pipeline debug display

**Dependencies:** 01-core, 02-layout

### 10-tests.js (5183 lines) ⚡ EXCLUDABLE
- Self-contained IIFE with test runner
- Regression suite: V2-001 through V2-056+
- Run via `__sag.runTests()` in browser console
- Can be excluded with `./build.sh --no-tests`

**Dependencies:** Reads from all modules via `__sag` API
**Safe to exclude for production builds.**

### 11-cascade.js (447 lines)
- `v2BookDefaults()`, `v2RoleStyles()`
- `v2ResolveParaStyle()`, `v2ResolveRunStyle()`
- `v2StripParaStyle()`, `v2StripRunStyle()`
- `flattenSections()`, `regroupSections()`
- `resolveDocument()`, `stripDocument()`

**Dependencies:** 01-core
**Critical for save/load. Changes here affect every document.**

### 12-sidebar.js (820 lines)
- Dev menu toggle and event wiring
- Layout panel (page setup dialog)
- `buildSectionMap()`, `rebuildSectionIndex()`
- `navigateToSection()`
- `updateSidebar()`, `updateNavigatorActive()`
- `addNewChapter()` — compound delta operation
- View switching (`setView()` — editor ↔ designer)

**Dependencies:** 01-core, 02-layout, 05-undo-edit

### 13-designer.js (1082 lines)
- `renderDesignerPreview()` — canvas preview of chapter opener
- Designer interaction (section list clicks, property group activation)
- Changeset management (`desSetChange`, `desCommitChangeset`, `desDiscardChangeset`)
- Control builders (`desCtlSelect`, `desCtlNumber`, `desCtlToggle`, etc.)
- `desRenderChapterHeadControls()` — populates the Stylist panel

**Dependencies:** 01-core, 02-layout, 03-render

### 14-stats-find-init.js (442 lines)
- `updateStats()` — word/chapter/page counts
- Find & replace system
- `preflight()` — pre-export validation
- **Initialization block** — storage detection, auto-load, first layout
- Closes the main IIFE: `})();`

**Dependencies:** Everything (init wires it all together)

## Rules for AI Agents

1. **Never edit the built HTML.** Always edit part files, then rebuild.
2. **One part file per change.** Don't scatter changes across 5 files.
3. **Run `./build.sh` after every edit.** Open the HTML to test.
4. **The part files are raw JS fragments**, not standalone modules.
   They share scope inside one IIFE. No imports/exports.
5. **If you add a new function**, put it in the correct part file
   based on the dependency list above.
6. **If you add a new section**, create a new numbered part file
   (e.g., `15-newfeature.js`) and it will be picked up automatically
   by the alphabetical glob in build.sh.
7. **Tests go in 10-tests.js only.** The test IIFE is self-contained.
8. **CSS changes go in shell/head.html.** HTML structure changes too.

## Verification

After any build, you can verify integrity:

```bash
# Quick check — line count should match expectations
wc -l sag_build.html

# Full check — compare MD5 against known-good build
md5sum sag_build.html
```

The initial split was verified byte-for-byte identical to Build 0155:
```
MD5: 99778d520d8ab280ed54ca9f20f5b283
Lines: 15633
```
