# Build 0158: Font Cascade Refactor + Libre Baskerville

## ⛔ MANDATORY DIRECTIVE

**If anything is unclear, STOP. Write zero code. Report back.**

---

## Baseline

**File:** `sag_claude_0157.html`
**Tests:** 699 passed, 0 failed

---

## Purpose

Eliminate all hardcoded `"Georgia"` font references from the
codebase. Establish a single canonical font source in the model
(`defaultBookSettings().defaults.defaultFontId`) with a pure
accessor helper (`getDefaultFont()`). Remove redundant `fontFamily`
declarations from `defaultBookDesign()`. Load Libre Baskerville
from Google Fonts as the new default. Migrate saved documents.

After this build, changing the global default font is a one-line
edit in `defaultBookSettings()`. No other code needs to change.

---

## Critical Rules

1. All existing tests must pass (with documented modifications).
2. RINT-14 must pass.
3. `getDefaultFont()` is the ONLY runtime path for reading the
   default font. No direct reads of
   `doc.bookSettings.defaults.defaultFontId` outside the helper.
4. `getDefaultFont()` is a pure accessor — reads and returns.
   No side effects, no caching, no conditional logic.
5. No layout engine logic changes (token processing, word wrap,
   line breaking).
6. No render pipeline changes.
7. No undo system changes.

---

## Scope — What Does NOT Change

- Layout engine logic (`runLayout` internals) — untouched
- Render pipeline (`render`) — untouched
- Undo/redo system — untouched
- Save/load JSON structure — untouched (same shape, leaner data)
- Test framework (`assert`, `saveState`, `restoreState`) — untouched
- Designer panel structure — untouched (only font values change)
- Selection, clipboard, keyboard handling — untouched
- Spellcheck, find/replace — untouched

---

## Change Order

All changes are listed top-to-bottom by line number in the file.
After inserting or removing lines, recalculate subsequent positions.
Work through these sequentially — do not jump around.

---

### Change 1: Google Fonts Link

**Location:** After line 5 (`</title>`), before line 6 (`<style>`).

**Insert:**
```html
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

---

### Change 2: Hidden Font Preload Span

**Location:** After line 218 (`<body>`), before line 220
(`<div class="tw">`).

**Insert:**
```html
<span style="position:absolute;left:-9999px;font-family:'Libre Baskerville',serif;">.</span>
```

---

### Change 3: Toolbar Font Dropdown — Add Libre Baskerville

**Location:** Line 236, the `<select id="font-family">` element.

**Change:** Add Libre Baskerville as the first option and make it
the selected default. Keep existing fonts for now (full OFL
replacement is a future build).

**Current:**
```html
<select id="font-family" title="Font" style="min-width:82px;"><option value="Georgia" selected>Georgia</option><option value="Times New Roman">Times New Roman</option>...
```

**Change to:**
```html
<select id="font-family" title="Font" style="min-width:82px;"><option value="Libre Baskerville" selected>Libre Baskerville</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option><option value="Arial">Arial</option><option value="Helvetica">Helvetica</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option><option value="Trebuchet MS">Trebuchet MS</option><option value="Courier New">Courier New</option><option value="Palatino Linotype">Palatino</option><option value="Garamond">Garamond</option></select>
```

**What changed:** Libre Baskerville added as first option with
`selected`. Georgia lost `selected` but remains in the list.

---

### Change 4: `defaultBookSettings()` — Canonical Font Source

**Location:** Line 526 inside `defaultBookSettings()`.

**Change:**
```
      defaultFontId: "Georgia",
```
**To:**
```
      defaultFontId: "Libre Baskerville",
```

---

### Change 5: `getDefaultFont()` Helper

**Location:** After the closing `}` of `defaultBookSettings()`
(line 533), before the `defaultBookDesign()` comment block.

**Insert:**
```javascript

/* Return the canonical default font family.
   Reads from the live document when available.
   Falls back to defaultBookSettings() during
   initialization before doc exists.
   This is the ONLY runtime path for the default font.
   Pure accessor — no side effects, no caching. */
function getDefaultFont() {
  if (typeof doc !== "undefined" && doc
      && doc.bookSettings && doc.bookSettings.defaults
      && doc.bookSettings.defaults.defaultFontId) {
    return doc.bookSettings.defaults.defaultFontId;
  }
  return defaultBookSettings().defaults.defaultFontId;
}

```

---

### Change 6: `defaultBookDesign()` — Remove fontFamily + Update Comment

**Location:** Lines 535–768 (`defaultBookDesign()` function).

**6a: Update the comment block (lines 535–547).**

**Change:**
```javascript
/* Default book design template. Defines the visual presentation
   of every section type. Values match current editor behavior
   exactly — Georgia 12pt, 1.4 line height, 18pt indent, etc.
   The renderer will read these values in future builds.
   For now, the template is stored and persisted but not consumed.
```
**To:**
```javascript
/* Default book design template. Defines the visual presentation
   of every section type. Font family is inherited from the
   canonical default (getDefaultFont()) and is NOT stored here.
   Sections only carry fontFamily when explicitly overridden.
```

**6b: heading.label — remove fontFamily (line 572).**

Delete this line:
```
          fontFamily: "Georgia",
```

**6c: heading.number — remove fontFamily (line 583).**

Delete this line:
```
          fontFamily: "Georgia",
```

**6d: heading.title — remove fontFamily (line 593).**

Delete this line:
```
          fontFamily: "Georgia",
```

**6e: heading.epigraph — remove fontFamily (line 612).**

Delete this line:
```
          fontFamily: "Georgia",
```

**6f: body — remove fontFamily (line 633).**

Delete this line:
```
        fontFamily: "Georgia",
```

**6g: body.firstParagraph — remove dropCapFont (line 644).**

Delete this line:
```
          dropCapFont: "Georgia",
```

**6h: subHeadings.h2 — remove fontFamily (line 664).**

In the line:
```
          fontFamily: "Georgia", fontSize: 16,
```
**Change to:**
```
          fontSize: 16,
```

**6i: subHeadings.h3 — remove fontFamily (line 672).**

In the line:
```
          fontFamily: "Georgia", fontSize: 14,
```
**Change to:**
```
          fontSize: 14,
```

**6j: subHeadings.h4 — remove fontFamily (line 680).**

In the line:
```
          fontFamily: "Georgia", fontSize: 12,
```
**Change to:**
```
          fontSize: 12,
```

**6k: blockQuote — remove fontFamily (line 690).**

In the line:
```
        fontFamily: "Georgia", fontSize: 11,
```
**Change to:**
```
        fontSize: 11,
```

**6l: verse — remove fontFamily (line 701).**

In the line:
```
        fontFamily: "Georgia", fontSize: 11,
```
**Change to:**
```
        fontSize: 11,
```

**6m: sceneBreak — remove fontFamily (line 710).**

Delete this line:
```
        fontFamily: "Georgia",
```

**6n: footnotes.font — remove fontFamily (line 728).**

In the line:
```
          fontFamily: "Georgia", fontSize: 9,
```
**Change to:**
```
          fontSize: 9,
```

**6o: runningHeaders.font — remove fontFamily (line 743).**

In the line:
```
          fontFamily: "Georgia", fontSize: 9,
```
**Change to:**
```
          fontSize: 9,
```

**6p: pageNumbers.font — remove fontFamily (line 759).**

In the line:
```
          fontFamily: "Georgia", fontSize: 10,
```
**Change to:**
```
          fontSize: 10,
```

---

### Change 7: `defaultRunStyle()` — Use Helper

**Location:** Line 825.

**Change:**
```javascript
  return { fontFamily: "Georgia", fontSize: 12, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", color: "#1a1a1a", "x-script": "normal", "x-linkHref": null, backgroundColor: null };
```
**To:**
```javascript
  return { fontFamily: getDefaultFont(), fontSize: 12, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", color: "#1a1a1a", "x-script": "normal", "x-linkHref": null, backgroundColor: null };
```

**Also update the comment at lines 815–820.** Find:
```
   The CSS values in both systems MUST match:
     defaultRunStyle().fontFamily === v2BookDefaults().run.fontFamily
```
This remains true — both now read from `getDefaultFont()`.

---

### Change 8: Drop Cap Font Fallback

**Location:** Line 1591.

**Change:**
```javascript
  var fontFam = para.runs[0].fontFamily || "Georgia";
```
**To:**
```javascript
  var fontFam = para.runs[0].fontFamily || getDefaultFont();
```

---

### Change 9: Heading Title Token Fallback

**Location:** Line 2169.

**Change:**
```javascript
        fontFamily: _ttpl.fontFamily || "Georgia",
```
**To:**
```javascript
        fontFamily: _ttpl.fontFamily || getDefaultFont(),
```

---

### Change 10: Lead-In Small Caps Font Fallback

**Location:** Line 2305.

**Change:**
```javascript
          var liFontFam = para.runs[0].fontFamily || "Georgia";
```
**To:**
```javascript
          var liFontFam = para.runs[0].fontFamily || getDefaultFont();
```

---

### Change 11: Migration in `loadSavedDoc()`

**Location:** Inside `loadSavedDoc()`, after the `label.case`
migration block (ends approximately line 7017), before the
`/* Populate heading.title */` comment.

**Insert:**
```javascript
    /* Migration: strip default Georgia fontFamily from bookDesign
       sections. Georgia was the old default and is no longer used.
       Sections without fontFamily inherit from getDefaultFont(). */
    if (doc.bookDesign && doc.bookDesign.chapter) {
      var _ch = doc.bookDesign.chapter;
      var _stripFont = function(obj) {
        if (obj && obj.fontFamily === "Georgia") {
          delete obj.fontFamily;
        }
      };
      if (_ch.heading) {
        _stripFont(_ch.heading.label);
        _stripFont(_ch.heading.number);
        _stripFont(_ch.heading.title);
        _stripFont(_ch.heading.epigraph);
      }
      _stripFont(_ch.body);
      if (_ch.body && _ch.body.firstParagraph
          && _ch.body.firstParagraph.dropCapFont === "Georgia") {
        delete _ch.body.firstParagraph.dropCapFont;
      }
      if (_ch.subHeadings) {
        _stripFont(_ch.subHeadings.h2);
        _stripFont(_ch.subHeadings.h3);
        _stripFont(_ch.subHeadings.h4);
      }
      _stripFont(_ch.blockQuote);
      _stripFont(_ch.verse);
      _stripFont(_ch.sceneBreak);
      if (_ch.footnotes && _ch.footnotes.font) _stripFont(_ch.footnotes.font);
      if (_ch.runningHeaders && _ch.runningHeaders.font) _stripFont(_ch.runningHeaders.font);
      if (_ch.pageNumbers && _ch.pageNumbers.font) _stripFont(_ch.pageNumbers.font);
    }
    /* Migration: update bookSettings defaultFontId if still Georgia */
    if (doc.bookSettings && doc.bookSettings.defaults
        && doc.bookSettings.defaults.defaultFontId === "Georgia") {
      doc.bookSettings.defaults.defaultFontId = "Libre Baskerville";
    }
    /* Migration: update bookDefaults.run.fontFamily if still Georgia */
    if (doc.bookDefaults && doc.bookDefaults.run
        && doc.bookDefaults.run.fontFamily === "Georgia") {
      doc.bookDefaults.run.fontFamily = "Libre Baskerville";
    }
```

---

### Change 12: Test Helper — `buildTestDoc()`

**Location:** Line 7706 inside `buildTestDoc()`.

**Change:**
```javascript
                 fontFamily: "Georgia", fontSize: 12, fontWeight: "normal", fontStyle: "normal",
```
**To:**
```javascript
                 fontFamily: getDefaultFont(), fontSize: 12, fontWeight: "normal", fontStyle: "normal",
```

---

### Change 13: RINT Test Fixtures

**Location:** Line 8632 (bold run in RINT test).

**Change:**
```javascript
        makeRun("bold", { fontFamily: "Georgia", fontSize: 12, fontWeight: "bold",
```
**To:**
```javascript
        makeRun("bold", { fontFamily: getDefaultFont(), fontSize: 12, fontWeight: "bold",
```

**Location:** Line 8714 (chapter heading fixture).

**Change:**
```javascript
        runs: [makeRun("Chapter Five", { fontFamily: "Georgia", fontSize: 24,
```
**To:**
```javascript
        runs: [makeRun("Chapter Five", { fontFamily: getDefaultFont(), fontSize: 24,
```

**Location:** Line 8731 (blockquote fixture).

**Change:**
```javascript
        runs: [makeRun("A quoted passage.", { fontFamily: "Georgia", fontSize: 12,
```
**To:**
```javascript
        runs: [makeRun("A quoted passage.", { fontFamily: getDefaultFont(), fontSize: 12,
```

---

### Change 14: BKDS-005a Test

**Location:** Lines 10092–10093.

**Change:**
```javascript
    assert("BKDS-005a: fontFamily Georgia",
      body005.fontFamily === "Georgia");
```
**To:**
```javascript
    assert("BKDS-005a: body has no fontFamily (inherits from getDefaultFont)",
      body005.fontFamily === undefined);
```

---

### Change 15: DCHD-006 Test

**Location:** Lines 11317–11320.

**Change:**
```javascript
    assert("DCHD-006: font select value is Georgia",
      selects002.length >= 3
        && selects002[2].value === "Georgia");
```
**To:**
```javascript
    assert("DCHD-006: font select value is Libre Baskerville",
      selects002.length >= 3
        && selects002[2].value === "Libre Baskerville");
```

---

### Change 16: DCHD-022d Test

**Location:** Lines 11494–11496.

**Change:**
```javascript
    assert("DCHD-022d: undo restored fontFamily",
      doc.bookDesign.chapter.heading.label.fontFamily
        === "Georgia");
```
**To:**
```javascript
    assert("DCHD-022d: undo restored fontFamily to default (undefined)",
      doc.bookDesign.chapter.heading.label.fontFamily
        === undefined);
```

---

### Change 17: Small Caps Test Fixtures

All small caps tests that use `"Georgia"` as a font argument
change to `getDefaultFont()`.

**Line 11737:**
```javascript
    var xH001 = measureXHeight("Georgia");
```
→
```javascript
    var xH001 = measureXHeight(getDefaultFont());
```

**Line 11738:**
```javascript
    var capH001 = measureCapHeight("Georgia");
```
→
```javascript
    var capH001 = measureCapHeight(getDefaultFont());
```

**Line 11747:**
```javascript
    var autoScale002 = computeAutoScale("Georgia");
```
→
```javascript
    var autoScale002 = computeAutoScale(getDefaultFont());
```

**Line 11756:**
```javascript
      { fontFamily: "Georgia", fontSize: 12,
```
→
```javascript
      { fontFamily: getDefaultFont(), fontSize: 12,
```

**Line 11763:**
```javascript
      tokens003, testPara003, "Georgia", 12,
```
→
```javascript
      tokens003, testPara003, getDefaultFont(), 12,
```

**Line 11808:**
```javascript
      [], testPara003, "Georgia", 12,
```
→
```javascript
      [], testPara003, getDefaultFont(), 12,
```

**Line 11851:**
```javascript
      { fontFamily: "Georgia", fontSize: 14,
```
→
```javascript
      { fontFamily: getDefaultFont(), fontSize: 14,
```

**Line 11858:**
```javascript
      tokens011, testPara011, "Georgia", 14,
```
→
```javascript
      tokens011, testPara011, getDefaultFont(), 14,
```

**Line 11875:**
```javascript
      { fontFamily: "Georgia", fontSize: 12,
```
→
```javascript
      { fontFamily: getDefaultFont(), fontSize: 12,
```

**Line 11889:**
```javascript
      tokens012, testPara012, "Georgia", 12,
```
→
```javascript
      tokens012, testPara012, getDefaultFont(), 12,
```

---

### Change 18: V2 Model Tests

**Line 11940:**
```javascript
    assert("V2-001d: body run has fontFamily", r001r.fontFamily === "Georgia", "got " + r001r.fontFamily);
```
→
```javascript
    assert("V2-001d: body run has fontFamily", r001r.fontFamily === getDefaultFont(), "got " + r001r.fontFamily);
```

**Line 11957:**
```javascript
    assert("V2-003c: heading2 run fontFamily from defaults", r003r.fontFamily === "Georgia", "got " + r003r.fontFamily);
```
→
```javascript
    assert("V2-003c: heading2 run fontFamily from defaults", r003r.fontFamily === getDefaultFont(), "got " + r003r.fontFamily);
```

**Line 11969:**
```javascript
    assert("V2-005b: run fontFamily from defaults", r005r.fontFamily === "Georgia", "got " + r005r.fontFamily);
```
→
```javascript
    assert("V2-005b: run fontFamily from defaults", r005r.fontFamily === getDefaultFont(), "got " + r005r.fontFamily);
```

**Line 12153:**
```javascript
      sparseDoc025.paragraphs[0].runs[0].fontFamily === "Georgia");
```
→
```javascript
      sparseDoc025.paragraphs[0].runs[0].fontFamily === getDefaultFont());
```

**Line 12193:**
```javascript
        makePara("Bold text", { fontFamily: "Georgia", fontSize: 12,
```
→
```javascript
        makePara("Bold text", { fontFamily: getDefaultFont(), fontSize: 12,
```

**Line 12470:**
```javascript
      noDefaultsDoc.paragraphs[0].runs[0].fontFamily === "Georgia");
```
→
```javascript
      noDefaultsDoc.paragraphs[0].runs[0].fontFamily === getDefaultFont());
```

Also update the assertion name on line 12469:
```javascript
    assert("V2-038a: fallback fontFamily is Georgia",
```
→
```javascript
    assert("V2-038a: fallback fontFamily is default",
```

---

### Change 19: `v2BookDefaults()` — Use Helper

**Location:** Line 12903.

**Change:**
```javascript
      fontFamily: "Georgia",
```
**To:**
```javascript
      fontFamily: getDefaultFont(),
```

---

### Change 20: Designer Preview Fallbacks

**Line 14268:**
```javascript
      + (hLabel.fontFamily || "Georgia");
```
→
```javascript
      + (hLabel.fontFamily || getDefaultFont());
```

**Line 14334:**
```javascript
    + (hTitle.fontFamily || "Georgia");
```
→
```javascript
    + (hTitle.fontFamily || getDefaultFont());
```

**Line 14377:**
```javascript
    + (body.fontFamily || "Georgia");
```
→
```javascript
    + (body.fontFamily || getDefaultFont());
```

---

### Change 21: Designer Font Select

**Location:** Lines 15193–15205.

**Change the font list and fallback.** Add Libre Baskerville as
first option. Change fallback from `"Georgia"` to
`getDefaultFont()`.

**Current:**
```javascript
  desCtlSelect(container, "Font", [
    {v: "Georgia", t: "Georgia"},
    {v: "Times New Roman", t: "Times New Roman"},
    {v: "Palatino Linotype", t: "Palatino"},
    {v: "Garamond", t: "Garamond"},
    {v: "Arial", t: "Arial"},
    {v: "Helvetica", t: "Helvetica"},
    {v: "Verdana", t: "Verdana"},
    {v: "Tahoma", t: "Tahoma"},
    {v: "Trebuchet MS", t: "Trebuchet MS"},
    {v: "Courier New", t: "Courier New"}
  ], lbl.fontFamily || "Georgia",
    "chapter.heading.label.fontFamily");
```

**Change to:**
```javascript
  desCtlSelect(container, "Font", [
    {v: "Libre Baskerville", t: "Libre Baskerville"},
    {v: "Georgia", t: "Georgia"},
    {v: "Times New Roman", t: "Times New Roman"},
    {v: "Palatino Linotype", t: "Palatino"},
    {v: "Garamond", t: "Garamond"},
    {v: "Arial", t: "Arial"},
    {v: "Helvetica", t: "Helvetica"},
    {v: "Verdana", t: "Verdana"},
    {v: "Tahoma", t: "Tahoma"},
    {v: "Trebuchet MS", t: "Trebuchet MS"},
    {v: "Courier New", t: "Courier New"}
  ], lbl.fontFamily || getDefaultFont(),
    "chapter.heading.label.fontFamily");
```

---

### Change 22: Migration in Auto-Load Init

**Location:** Inside the auto-load section, after the `label.case`
migration block (ends approximately line 15667), before the
`/* Populate heading.title */` comment.

**Insert the identical migration block from Change 11, with
indentation adjusted to match the surrounding code (10 spaces):**

```javascript
          /* Migration: strip default Georgia fontFamily from bookDesign */
          if (doc.bookDesign && doc.bookDesign.chapter) {
            var _ch = doc.bookDesign.chapter;
            var _stripFont = function(obj) {
              if (obj && obj.fontFamily === "Georgia") {
                delete obj.fontFamily;
              }
            };
            if (_ch.heading) {
              _stripFont(_ch.heading.label);
              _stripFont(_ch.heading.number);
              _stripFont(_ch.heading.title);
              _stripFont(_ch.heading.epigraph);
            }
            _stripFont(_ch.body);
            if (_ch.body && _ch.body.firstParagraph
                && _ch.body.firstParagraph.dropCapFont === "Georgia") {
              delete _ch.body.firstParagraph.dropCapFont;
            }
            if (_ch.subHeadings) {
              _stripFont(_ch.subHeadings.h2);
              _stripFont(_ch.subHeadings.h3);
              _stripFont(_ch.subHeadings.h4);
            }
            _stripFont(_ch.blockQuote);
            _stripFont(_ch.verse);
            _stripFont(_ch.sceneBreak);
            if (_ch.footnotes && _ch.footnotes.font) _stripFont(_ch.footnotes.font);
            if (_ch.runningHeaders && _ch.runningHeaders.font) _stripFont(_ch.runningHeaders.font);
            if (_ch.pageNumbers && _ch.pageNumbers.font) _stripFont(_ch.pageNumbers.font);
          }
          /* Migration: update bookSettings defaultFontId if still Georgia */
          if (doc.bookSettings && doc.bookSettings.defaults
              && doc.bookSettings.defaults.defaultFontId === "Georgia") {
            doc.bookSettings.defaults.defaultFontId = "Libre Baskerville";
          }
          /* Migration: update bookDefaults.run.fontFamily if still Georgia */
          if (doc.bookDefaults && doc.bookDefaults.run
              && doc.bookDefaults.run.fontFamily === "Georgia") {
            doc.bookDefaults.run.fontFamily = "Libre Baskerville";
          }
```

---

### Change 23: New Test Function

**Location:** Add immediately before the `testV2Model()` function
definition. Find the comment block:
```
  // ================================================================
```
followed by `function testV2Model()`. Insert the new function
before that comment block.

```javascript
  // ================================================================
  // TEST: Font Cascade + getDefaultFont()
  // ================================================================

  function testFontCascade() {
    // FONT-001: getDefaultFont returns Libre Baskerville
    assert("FONT-001: getDefaultFont returns Libre Baskerville",
      getDefaultFont() === "Libre Baskerville",
      "got " + getDefaultFont());

    // FONT-002: Google Fonts link present
    var fontLinks = document.querySelectorAll(
      'link[href*="Libre+Baskerville"]');
    assert("FONT-002: Google Fonts link present",
      fontLinks.length >= 1);

    // FONT-003: preload span present
    var preloadSpans = document.querySelectorAll(
      'span[style*="Libre Baskerville"]');
    assert("FONT-003: preload span present",
      preloadSpans.length >= 1);

    // FONT-004: defaultBookDesign body has no fontFamily
    var bd004 = defaultBookDesign();
    assert("FONT-004: body has no fontFamily property",
      !bd004.chapter.body.hasOwnProperty("fontFamily"));

    // FONT-005: defaultBookDesign heading.label has no fontFamily
    assert("FONT-005: heading label has no fontFamily property",
      !bd004.chapter.heading.label.hasOwnProperty("fontFamily"));

    // FONT-006: canonical source is Libre Baskerville
    var bs006 = defaultBookSettings();
    assert("FONT-006: defaultFontId is Libre Baskerville",
      bs006.defaults.defaultFontId === "Libre Baskerville",
      "got " + bs006.defaults.defaultFontId);

    // FONT-007: defaultRunStyle uses getDefaultFont
    var drs007 = defaultRunStyle();
    assert("FONT-007: defaultRunStyle fontFamily matches getDefaultFont",
      drs007.fontFamily === getDefaultFont(),
      "got " + drs007.fontFamily);

    // FONT-008: v2BookDefaults uses getDefaultFont
    var bd008 = v2BookDefaults();
    assert("FONT-008: v2BookDefaults run fontFamily matches getDefaultFont",
      bd008.run.fontFamily === getDefaultFont(),
      "got " + bd008.run.fontFamily);
  }
```

### Test Call

**Location:** In `runTests`, find the line `testSmallCaps();`.
Add immediately after it:

```javascript
      testFontCascade();
```

---

## Test Count

- Existing tests: 699
- Modified tests: ~25 (assertion expectations updated, no adds/removes)
- New assertions: 8 (FONT-001 through FONT-008)
- **Expected total: 707**

---

## Post-Delivery Verification Checklist

### Check 1: No hardcoded "Georgia" in defaults or fallbacks
```bash
grep -n '"Georgia"' sag_claude_0158.html | grep -v "test\|assert\|Test\|makePara\|makeRun\|option\|Migration\|strip\|_strip\|V2-035\|V2-036\|V2-037\|DCHD-022" | head -20
```
Expected: zero lines outside of migration code and toolbar option list

### Check 2: getDefaultFont exists
```bash
grep -c "function getDefaultFont" sag_claude_0158.html
```
Expected: 1

### Check 3: Google Fonts link present
```bash
grep -c "Libre+Baskerville" sag_claude_0158.html
```
Expected: 1

### Check 4: Preload span present
```bash
grep -c "Libre Baskerville.*serif" sag_claude_0158.html
```
Expected: at least 1

### Check 5: defaultBookSettings updated
```bash
grep "defaultFontId" sag_claude_0158.html
```
Expected: contains "Libre Baskerville"

### Check 6: No fontFamily in defaultBookDesign sections
```bash
grep -A2 "function defaultBookDesign" sag_claude_0158.html | head -5
```
Then visually verify no `fontFamily:` lines inside the function body.

### Check 7: Test function exists
```bash
grep -c "testFontCascade" sag_claude_0158.html
```
Expected: at least 2 (definition + call)

### Check 8: Fallbacks use getDefaultFont
```bash
grep '|| "Georgia"' sag_claude_0158.html
```
Expected: zero matches

---

## Verification (Visual/Functional)

1. All 707 tests pass
2. RINT-14 passes
3. Open dev tools Network tab — Libre Baskerville loads from CDN
4. `document.fonts.check('12px "Libre Baskerville"')` returns
   `true` in console
5. `getDefaultFont()` returns `"Libre Baskerville"` in console
6. Designer preview renders text (font falls through to default)
7. Toolbar font dropdown shows Libre Baskerville as first option

---

## What NOT to Do

- Do NOT read `doc.bookSettings.defaults.defaultFontId` directly
  anywhere except inside `getDefaultFont()`
- Do NOT add any hardcoded font string as a fallback
- Do NOT add side effects or caching to `getDefaultFont()`
- Do NOT modify layout engine token processing or word wrap logic
- Do NOT modify the render pipeline
- Do NOT modify the undo system
- Do NOT remove Georgia from the toolbar dropdown (it's still a
  valid user choice for inline formatting — full OFL dropdown
  replacement is a future build)
- If anything is unclear: STOP. Report back. Zero code.

---

## Coding Rules

- `var` not `let`/`const`
- One operation per line
- Guard every property read with `&&` checks
- Match surrounding indentation exactly
- Comment migration blocks with build context
