# Sagittarius Font Cascade — Architecture Document

**Author:** AI51 (Project Lead)  
**Reviewed by:** ChatGPT Assistant  
**Baseline:** Build 0157 (`sag_claude_0157.html`, 699 tests)  
**Status:** APPROVED

---

## Problem

The codebase has 45+ hardcoded `"Georgia"` references spread across
defaults, fallbacks, layout code, and tests. Georgia is a
Microsoft-licensed font that cannot legally be embedded in exported
PDF or EPUB. Changing the default font currently requires editing
30+ locations — shotgun surgery.

`defaultBookDesign()` declares `fontFamily: "Georgia"` on every
section even though they all use the same font. This redundancy
bloats the design object and persisted JSON with identical values.

---

## Solution: Model-Level Canonical Source + Helper Accessor

### Canonical Source

The single source of truth for the default font lives in the model:

```
defaultBookSettings().defaults.defaultFontId
```

This value changes from `"Georgia"` to `"Libre Baskerville"`.

At runtime, the live value is `doc.bookSettings.defaults.defaultFontId`.

There is no competing constant. No `var SAG_DEFAULT_FONT`. The
model owns the default font.

### Helper Function

One function provides runtime access:

```javascript
/* Return the canonical default font family.
   Reads from the live document if available,
   falls back to defaultBookSettings() during
   initialization before doc exists. */
function getDefaultFont() {
  if (doc && doc.bookSettings && doc.bookSettings.defaults
      && doc.bookSettings.defaults.defaultFontId) {
    return doc.bookSettings.defaults.defaultFontId;
  }
  return defaultBookSettings().defaults.defaultFontId;
}
```

### Access Rule

**All font fallback reads go through `getDefaultFont()`.** No code
anywhere reads `doc.bookSettings.defaults.defaultFontId` directly.
No code uses a hardcoded font string as a fallback. The helper is
the only runtime access path.

---

## Inheritance Model

### `defaultBookDesign()` Omits fontFamily

Sections do not declare `fontFamily` when using the global default.
A section only carries `fontFamily` when the user explicitly sets
it to something different.

**Before (15 redundant declarations):**
```
heading.label:       fontFamily: "Georgia", fontSize: 11, ...
heading.title:       fontFamily: "Georgia", fontSize: 20, ...
body:                fontFamily: "Georgia", fontSize: 12, ...
sceneBreak:          fontFamily: "Georgia", fontSize: 12, ...
... (12 more)
```

**After (fontFamily omitted — inherits from model):**
```
heading.label:       fontSize: 11, ...
heading.title:       fontSize: 20, fontWeight: "bold", ...
body:                fontSize: 12, ...
sceneBreak:          fontSize: 12, ...
```

### Consumer Fallback Pattern

Every location that reads a section's font:

```javascript
var font = section.fontFamily || getDefaultFont();
```

### Drop Cap Chain

```javascript
var dcFont = firstParagraph.dropCapFont
          || body.fontFamily
          || getDefaultFont();
```

Only stored when the user explicitly wants a different drop cap
font than body text.

### `defaultRunStyle()` / `v2BookDefaults()`

```javascript
fontFamily: getDefaultFont()
```

No hardcoded string. Reads from the same canonical source.

---

## What Changes

| Location | Current | Proposed |
|----------|---------|----------|
| `defaultBookSettings().defaults.defaultFontId` (line 526) | `"Georgia"` | `"Libre Baskerville"` |
| New helper function | — | `getDefaultFont()` added after `defaultBookSettings()` |
| `defaultBookDesign()` (15 sections) | `fontFamily: "Georgia"` | `fontFamily` removed |
| `defaultRunStyle()` (line 825) | `fontFamily: "Georgia"` | `fontFamily: getDefaultFont()` |
| 7 fallback strings (`|| "Georgia"`) | Hardcoded string | `|| getDefaultFont()` |
| `defaultBookDesign().body.firstParagraph.dropCapFont` | `"Georgia"` | Removed (inherits via chain) |
| Toolbar font dropdown (line 236) | MS-licensed fonts | OFL fonts |
| Designer font selects (line 15193) | MS-licensed fonts | OFL fonts |
| Google Fonts `<link>` | — | Added in `<head>` |
| Hidden font preload `<span>` | — | Added in `<body>` |
| Migration in `loadSavedDoc()` | — | Strip `fontFamily` when it matches old default |
| Migration in auto-load init | — | Same |

---

## Impact on the JSON

### Before (every section stores font):
```json
{
  "chapter": {
    "heading": {
      "label": { "fontFamily": "Georgia", "fontSize": 11 },
      "title": { "fontFamily": "Georgia", "fontSize": 20 }
    },
    "body": { "fontFamily": "Georgia", "fontSize": 12 }
  }
}
```

### After (default font inherited, not stored):
```json
{
  "chapter": {
    "heading": {
      "label": { "fontSize": 11 },
      "title": { "fontSize": 20 }
    },
    "body": { "fontSize": 12 }
  }
}
```

### With explicit user override:
```json
{
  "chapter": {
    "heading": {
      "label": { "fontSize": 11 },
      "title": { "fontFamily": "EB Garamond", "fontSize": 20 }
    },
    "body": { "fontSize": 12 }
  }
}
```

Only the title has `fontFamily` because the user chose EB Garamond.
Everything else inherits via `getDefaultFont()`.

---

## What Does NOT Change

- Layout engine logic (token processing, word wrap, line breaking)
- Render pipeline
- Undo/redo system
- Save/load JSON structure (same shape, just leaner)
- Test framework (`assert`, `saveState`, `restoreState`)
- Designer panel structure (only font values in dropdowns change)

---

## Migration

Existing saved documents have `fontFamily: "Georgia"` stamped on
sections. Migration strips these when they match the old default:

```javascript
/* For each section in bookDesign that has fontFamily === "Georgia",
   delete the property so it falls through to getDefaultFont(). */
```

Same block in both `loadSavedDoc()` and auto-load init.

`bookDefaults.run.fontFamily` if stored as `"Georgia"` also migrates
to match the new default or is removed to fall through.

---

## Rules Going Forward

1. **No hardcoded font strings anywhere.** Not in defaults, not in
   fallbacks, not in layout code. `getDefaultFont()` is the only
   runtime path.
2. **No direct reads of `doc.bookSettings.defaults.defaultFontId`.**
   Always go through the helper.
3. **Sections only store `fontFamily` when explicitly overridden.**
   Default inheritance is the norm, explicit storage is the exception.
4. **All fonts in dropdowns must be OFL.** No MS-licensed fonts in
   any user-facing selector.

---

## Benefits

1. **One-line font change.** Change `defaultBookSettings().defaults.defaultFontId`.
2. **Smaller JSON.** Default values not stored. Only overrides persist.
3. **No licensing risk.** Georgia eliminated completely. All fonts OFL.
4. **No shotgun surgery.** One canonical source, one accessor.
5. **No future drift.** No competing constants or second sources of truth.
6. **Theme-ready.** A theme can set `defaultFontId` and everything inherits.
