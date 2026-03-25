<script>
(function() {

/* ================================================================
   CONFIG: Page dimensions are computed from doc.bookSettings.
   All layout coordinates are in screen pixels (96 DPI) regardless
   of zoom level. Zoom is applied at the rendering layer only.
   Font sizes are stored in points throughout the model.
   Conversion: inches * 96 = screen pixels, inches * 72 = PDF points.
   ================================================================ */
var SCREEN_DPI = 96;

/* Computed from bookSettings on every layout pass */
var PAGE_W, PAGE_H, M_TOP, M_BOT, M_LEFT, M_RIGHT, CONTENT_W;

/* ── COORDINATE SYSTEM REFERENCE (2026-03-18) ──
   JSON styles:    stored in POINTS (1pt = 1/72 inch)
   Layout engine:  works in SCREEN PIXELS (points × 96/72)
   Canvas display: screen pixels × zoom
   PDF export:     screen pixels × (72/96) = PDF points

   PDF EXPORT: Do NOT re-run layout. Read the existing lines[]
   and _paraYState[] arrays. Multiply every x,y by 72/96.
   Page breaks and line breaks are identical to canvas.

   IMAGES: Must have source pixels >= printSizeInches × 300
   for 300 DPI print quality. Text is vector — no DPI concern.

   WYSIWYG: The canvas layout IS the print layout. */

/* Recompute page dimensions from the current document bookSettings. */
function computePageDimensions() {
  var bs = doc.bookSettings;
  PAGE_W = Math.round(bs.trim.widthIn * SCREEN_DPI);
  PAGE_H = Math.round(bs.trim.heightIn * SCREEN_DPI);
  M_TOP = Math.round(bs.marginsIn.top * SCREEN_DPI);
  M_BOT = Math.round(bs.marginsIn.bottom * SCREEN_DPI);
  M_LEFT = Math.round(bs.marginsIn.left * SCREEN_DPI);
  M_RIGHT = Math.round(bs.marginsIn.right * SCREEN_DPI);
  CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;
}

var zoomLevels = [0.50, 0.75, 1.00, 1.25, 1.50, 2.00, 3.00];
var zoom = 1.25;
var dpr = window.devicePixelRatio || 1;

/* ================================================================
   DOCUMENT MODEL: Paragraph + styled runs architecture (v3).
   Paragraphs carry x-sectionId linking them to section entries.
   Cascade defaults come from doc.bookDefaults and doc.roleStyles.
   The document is an object containing version, metadata, book
   settings, and an array of paragraphs. Each paragraph has a style
   object (indent, line spacing, alignment, spacing before/after)
   and an array of styled runs. Each run is a contiguous span of
   text sharing the same character-level formatting.
   Font sizes are in points. Dimensions in bookSettings are inches.
   ================================================================ */

/* Default book settings: trim size, margins, header/footer, drop cap params. */
function defaultBookSettings() {
  return {
    trim: { name: "5.5x8.5", widthIn: 5.5, heightIn: 8.5 },
    units: { pdfDpi: 72, screenDpi: 96 },
    marginsIn: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.85, gutter: 0.2 },
    headerFooter: {
      enabled: false,
      headerHeightIn: 0.35,
      footerHeightIn: 0.35,
      pageNumber: { enabled: true, position: "footer-center", startAt: 1, suppressOn: ["title", "copyright"] },
      runningHead: { enabled: false, mode: "chapterTitle" }
    },
    defaults: {
      defaultFontId: "Georgia",
      defaultFontSizePt: 12,
      defaultLineHeightMult: 1.4
    },
    dropCaps: { lines: 3, gapPt: 3 },
    bleed: { enabled: false, amountIn: 0.125 }
  };
}

/* Default book design template. Defines the visual presentation
   of every section type. Values match current editor behavior
   exactly — Georgia 12pt, 1.4 line height, 18pt indent, etc.
   The renderer will read these values in future builds.
   For now, the template is stored and persisted but not consumed.
   
   Structure:
     bookDesign.chapter    — chapter heading, body, scene breaks, etc.
     bookDesign.margins    — gutter/mirror margin rules
     bookDesign.typography — widow/orphan rules
   
   A "theme" IS a bookDesign object. Applying a theme means
   replacing bookDesign with a different set of values. */
function defaultBookDesign() {
  return {
    margins: {
      top: 72,
      bottom: 72,
      outside: 54,
      inside: 72,
      mirror: true
    },

    typography: {
      widowMinLines: 2,
      orphanMinLines: 2,
      sceneBreakNotLastOnPage: true,
      sceneBreakNotFirstOnPage: true,
      headingKeepWithNext: 2
    },

    chapter: {
      heading: {
        label: {
          text: "CHAPTER",
          show: true,
          "case": "none",
          fontFamily: "Georgia",
          fontSize: 11,
          fontWeight: "normal",
          fontStyle: "normal",
          color: "#666666",
          letterSpacing: 2,
          underline: false
        },
        number: {
          show: true,
          format: "arabic",
          fontFamily: "Georgia",
          fontSize: 11,
          fontWeight: "normal",
          color: "#666666",
          "case": "title",
          combineWithLabel: true,
          separator: " "
        },
        title: {
          show: true,
          fontFamily: "Georgia",
          fontSize: 20,
          fontWeight: "bold",
          fontStyle: "normal",
          color: "#1a1a1a",
          "case": "none",
          maxLines: 3,
          alignment: "center"
        },
        ornament: {
          type: "none",
          text: "* * *",
          assetId: null,
          color: "#999999",
          width: 100,
          thickness: 1
        },
        epigraph: {
          show: true,
          fontFamily: "Georgia",
          fontSize: 10,
          fontStyle: "italic",
          color: "#666666",
          alignment: "center",
          maxWidth: 280,
          attributionPrefix: "\u2014 ",
          attributionFontStyle: "normal",
          spacingAbove: 12,
          spacingBelow: 18
        },
        layout: {
          dropFromTop: 154,
          alignment: "center",
          spacingLabelToTitle: 8,
          spacingTitleToOrnament: 12,
          spacingToBody: 12
        }
      },

      body: {
        fontFamily: "Georgia",
        fontSize: 12,
        lineHeight: 1.2,
        textIndent: 18,
        textAlign: "left",
        color: "#1a1a1a",
        paragraphSpacing: 0,
        firstParagraph: {
          indent: 0,
          dropCap: false,
          dropCapLines: 3,
          dropCapFont: "Georgia",
          dropCapWeight: "normal",
          dropCapColor: "#1a1a1a",
          leadIn: {
            enabled: false,
            wordCount: 4,
            mode: "auto",
            scaleRatio: 0.70,
            strokeRatio: 0.020,
            kerningRatio: 0.031
          }
        },
        afterSceneBreak: {
          indent: 0,
          dropCap: false
        }
      },

      subHeadings: {
        h2: {
          fontFamily: "Georgia", fontSize: 16,
          fontWeight: "bold", fontStyle: "normal",
          color: "#1a1a1a", alignment: "left",
          "case": "none",
          spacingAbove: 24, spacingBelow: 12,
          indent: 0
        },
        h3: {
          fontFamily: "Georgia", fontSize: 14,
          fontWeight: "bold", fontStyle: "italic",
          color: "#333333", alignment: "left",
          "case": "none",
          spacingAbove: 18, spacingBelow: 8,
          indent: 0
        },
        h4: {
          fontFamily: "Georgia", fontSize: 12,
          fontWeight: "bold", fontStyle: "normal",
          color: "#333333", alignment: "left",
          "case": "none",
          spacingAbove: 12, spacingBelow: 6,
          indent: 0
        }
      },

      blockQuote: {
        fontFamily: "Georgia", fontSize: 11,
        fontStyle: "italic", color: "#333333",
        lineHeight: 1.3, textAlign: "left",
        marginLeft: 36, marginRight: 36,
        spacingAbove: 12, spacingBelow: 12,
        border: {
          left: { show: false, width: 2, color: "#cccccc" }
        }
      },

      verse: {
        fontFamily: "Georgia", fontSize: 11,
        fontStyle: "italic", color: "#333333",
        lineHeight: 1.4, alignment: "center",
        spacingAbove: 12, spacingBelow: 12
      },

      sceneBreak: {
        type: "text",
        text: "* * *",
        fontFamily: "Georgia",
        fontSize: 12,
        fontStyle: "normal",
        color: "#666666",
        alignment: "center",
        spacingAbove: 12,
        spacingBelow: 12,
        ornamentAssetId: null,
        lineWidth: 100,
        lineThickness: 0.5,
        lineColor: "#cccccc"
      },

      footnotes: {
        enabled: false,
        numberFormat: "arabic",
        resetPerChapter: true,
        font: {
          fontFamily: "Georgia", fontSize: 9,
          color: "#444444", lineHeight: 1.3
        },
        dividerLine: {
          show: true, width: 72,
          thickness: 0.5, color: "#cccccc"
        },
        spacingAboveBlock: 12
      },

      runningHeaders: {
        enabled: false,
        verso: { content: "bookTitle", alignment: "left", customText: null },
        recto: { content: "chapterTitle", alignment: "right", customText: null },
        font: {
          fontFamily: "Georgia", fontSize: 9,
          fontStyle: "italic", fontWeight: "normal",
          color: "#888888"
        },
        position: "top",
        marginFromEdge: 36,
        dividerLine: false,
        dividerColor: "#cccccc",
        showOnFirstPage: false
      },

      pageNumbers: {
        enabled: false,
        format: "arabic",
        position: "bottom-center",
        font: {
          fontFamily: "Georgia", fontSize: 10,
          fontWeight: "normal", color: "#888888"
        },
        showOnFirstPage: false,
        showOnBlankPages: false,
        decorators: { before: "", after: "" }
      }
    }
  };
}

/* ================================================================
   TEXT DECORATION HELPERS
   textDecoration is a compound CSS property: "none", "underline",
   "line-through", or "underline line-through".
   ================================================================ */

/* Check if textDecoration value contains a keyword. */
function tdHas(td, keyword) {
  if (!td || td === "none") return false;
  return td.indexOf(keyword) !== -1;
}

/* Add a keyword to textDecoration. */
function tdAdd(td, keyword) {
  if (tdHas(td, keyword)) return td;
  if (!td || td === "none") return keyword;
  return td + " " + keyword;
}

/* Remove a keyword from textDecoration. */
function tdRemove(td, keyword) {
  if (!tdHas(td, keyword)) return td;
  var result = td.replace(keyword, "").trim();
  return result === "" ? "none" : result;
}

/* Toggle a keyword in textDecoration. */
function tdToggle(td, keyword) {
  return tdHas(td, keyword) ? tdRemove(td, keyword) : tdAdd(td, keyword);
}

/* ----------------------------------------------------------------
   DEFAULT FACTORY FUNCTIONS vs CASCADE DEFAULTS

   defaultRunStyle() and defaultParaStyle() are FACTORY functions.
   They create fully-stamped objects for new paragraphs and runs
   during editing (Enter key, paste, image insert, etc.). They
   include x- properties (x-role, x-list, x-dropCap, x-script,
   x-linkHref) that the editor requires on every paragraph/run.

   v2BookDefaults() is the CASCADE default — the base layer for
   property resolution. It contains only CSS properties, no x-
   properties. It serves as the fallback when doc.bookDefaults is
   missing, and as the factory value for new documents.

   The CSS values in both systems MUST match:
     defaultRunStyle().fontFamily === v2BookDefaults().run.fontFamily
     defaultParaStyle().textIndent === v2BookDefaults().para.textIndent
     etc.

   If you change a default value, change it in BOTH places.
   ---------------------------------------------------------------- */

/* Default run style: all properties at baseline values. */
function defaultRunStyle() {
  return { fontFamily: "Georgia", fontSize: 12, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", color: "#1a1a1a", "x-script": "normal", "x-linkHref": null, backgroundColor: null };
}

/* Default paragraph style: all properties at baseline values. */
function defaultParaStyle() {
  return {
    textIndent: 18, lineHeight: 1.2, textAlign: "left",
    marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    "x-list": null,
    "x-role": "body",
    "x-dropCap": { enabled: false }
  };
}

/* Return the x-sectionId of the paragraph at the cursor position.
   Falls back to the first section in _sectionMeta if not found. */

/* Return the sectionId of a paragraph, or null. */
/* Return the sectionId of a paragraph. Uses cache if available,
   falls back to direct style read. */
function sectionOfPara(pi) {
  if (_sectionIndex && _sectionIndex.byPara[pi]) {
    return _sectionIndex.byPara[pi];
  }
  /* Fallback: direct read (before first layout or during layout) */
  if (pi >= 0 && pi < doc.paragraphs.length && doc.paragraphs[pi].style["x-sectionId"]) {
    return doc.paragraphs[pi].style["x-sectionId"];
  }
  return null;
}

/* Clamp a position to stay within the section identified by anchorSecId. */
function clampToSection(pos, anchorSecId) {
  if (!anchorSecId) return pos;
  var posSec = sectionOfPara(pos.p);
  if (posSec === anchorSecId) return pos;

  if (typeof statusPill === "function") {
    statusPill("info", "Selection limited to current section");
  }

  /* Use cache for O(1) boundary lookup */
  if (_sectionIndex && _sectionIndex.byId[anchorSecId]) {
    var bounds = _sectionIndex.byId[anchorSecId];
    if (pos.p > bounds.last) {
      return mkPos(bounds.last, paraTextLen(doc.paragraphs[bounds.last]));
    } else if (pos.p < bounds.first) {
      return mkPos(bounds.first, 0);
    }
    return pos;
  }

  /* Fallback: scan (before first layout) */
  var secFirst = -1, secLast = -1;
  for (var pi = 0; pi < doc.paragraphs.length; pi++) {
    if (doc.paragraphs[pi].style["x-sectionId"] === anchorSecId) {
      if (secFirst < 0) secFirst = pi;
      secLast = pi;
    }
  }
  if (secFirst < 0) return pos;

  if (pos.p > secLast) {
    return mkPos(secLast, paraTextLen(doc.paragraphs[secLast]));
  } else if (pos.p < secFirst) {
    return mkPos(secFirst, 0);
  }
  return pos;
}

function currentSectionId() {
  if (cursor.p < doc.paragraphs.length && doc.paragraphs[cursor.p].style["x-sectionId"]) {
    return doc.paragraphs[cursor.p].style["x-sectionId"];
  }
  if (doc._sectionMeta && doc._sectionMeta.length > 0) {
    return doc._sectionMeta[0].id;
  }
  return null;
}

/* Create a run with text and style properties. */
function makeRun(text, style) {
  var s = style || defaultRunStyle();
  return { text: text, fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, fontStyle: s.fontStyle, textDecoration: s.textDecoration, color: s.color, "x-script": s["x-script"] || "normal", "x-linkHref": s["x-linkHref"] || null, backgroundColor: s.backgroundColor || null };
}

/* Create a paragraph with a single run. */
function makePara(text, runStyle, paraStyle) {
  return { style: paraStyle || defaultParaStyle(), runs: [makeRun(text, runStyle)] };
}

/* Create an image block paragraph. Stores image data in para.style
   with a sentinel empty run for schema compatibility. */
function createImagePara(dataUrl, widthPt, heightPt, naturalW, naturalH) {
  var s = defaultParaStyle();
  s["x-role"] = "image";
  s.imageSrc = dataUrl;
  s.imageWidthPt = widthPt;
  s.imageHeightPt = heightPt;
  s.imageNaturalW = naturalW;
  s.imageNaturalH = naturalH;
  s.textIndent = 0;
  s.marginTop = 6;
  s.marginBottom = 6;
  s.textAlign = "center";
  return { style: s, runs: [makeRun("")] };
}

/* Build a CSS font string from a run object for canvas measurement and rendering. */
function fontStr(run) {
  var s = "";
  if (run.fontStyle === "italic") s += "italic ";
  if (run.fontWeight === "bold") s += "bold ";
  s += run.fontSize + "pt " + run.fontFamily;
  return s;
}

/* Check if two run styles are identical. Used to decide whether to
   insert text into an existing run or create a new one. */
function styleMatch(a, b) {
  return a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.fontWeight === b.fontWeight &&
         a.fontStyle === b.fontStyle && a.textDecoration === b.textDecoration &&
         a.color === b.color &&
         (a["x-script"] || "normal") === (b["x-script"] || "normal") &&
         (a["x-linkHref"] || null) === (b["x-linkHref"] || null) &&
         (a.backgroundColor || null) === (b.backgroundColor || null);
}

/* Return total character count of a paragraph across all its runs. */
function paraTextLen(para) {
  var len = 0;
  for (var i = 0; i < para.runs.length; i++) len += para.runs[i].text.length;
  return len;
}

/* Return the full plain text of a paragraph. */
function paraText(para) {
  var t = "";
  for (var i = 0; i < para.runs.length; i++) t += para.runs[i].text;
  return t;
}

/* Convert an absolute character offset within a paragraph to a
   run index and offset within that run. */
function posToRun(para, offset) {
  var acc = 0;
  for (var r = 0; r < para.runs.length; r++) {
    var len = para.runs[r].text.length;
    if (offset <= acc + len) return { r: r, ro: offset - acc };
    acc += len;
  }
  var last = para.runs.length - 1;
  return { r: last, ro: para.runs[last].text.length };
}

/* Extract the run style at a given paragraph offset. Used to set
   the current typing style when the cursor moves.
   Uses strict < (not <=) because we want the run CONTAINING the
   character at this offset, not the insertion point. */
/* Get the run style at a character offset in a paragraph. */
function runStyleAt(para, offset) {
  var acc = 0;
  for (var r = 0; r < para.runs.length; r++) {
    var run = para.runs[r];
    if (offset < acc + run.text.length) {
      return { fontFamily: run.fontFamily, fontSize: run.fontSize, fontWeight: run.fontWeight, fontStyle: run.fontStyle, textDecoration: run.textDecoration, color: run.color, "x-script": run["x-script"] || "normal", "x-linkHref": run["x-linkHref"] || null, backgroundColor: run.backgroundColor || null };
    }
    acc += run.text.length;
  }
  var last = para.runs[para.runs.length - 1];
  return { fontFamily: last.fontFamily, fontSize: last.fontSize, fontWeight: last.fontWeight, fontStyle: last.fontStyle, textDecoration: last.textDecoration, color: last.color, "x-script": last["x-script"] || "normal", "x-linkHref": last["x-linkHref"] || null, backgroundColor: last.backgroundColor || null };
}

/* Split a run into two at the given offset within that run.
   Returns the index of the new right-side run. If offset is at
   the start or end, no split is needed and the appropriate
   boundary index is returned. */
/* Split a run at a character offset, creating two runs. */
function splitRunAt(para, runIdx, offset) {
  var run = para.runs[runIdx];
  var t = run.text;
  if (offset <= 0) return runIdx;
  if (offset >= t.length) return runIdx + 1;
  var left = makeRun(t.slice(0, offset), run);
  var right = makeRun(t.slice(offset), run);
  para.runs.splice(runIdx, 1, left, right);
  return runIdx + 1;
}

/* Merge adjacent runs that share identical styling. Called after
   every edit to keep the run array compact. */
function mergeAdjacentRuns(para) {
  var merged = [];
  for (var i = 0; i < para.runs.length; i++) {
    var run = para.runs[i];
    var prev = merged.length > 0 ? merged[merged.length - 1] : null;
    if (prev && styleMatch(prev, run)) {
      prev.text += run.text;
    } else {
      merged.push(makeRun(run.text, run));
    }
  }
  para.runs = merged.length > 0 ? merged : [makeRun("", defaultRunStyle())];
}

/* Split a run at an absolute character offset within a paragraph.
   Returns the run index boundary. Wrapper around posToRun+splitRunAt. */
function splitRunAtAbs(para, absOffset) {
  var loc = posToRun(para, absOffset);
  return splitRunAt(para, loc.r, loc.ro);
}

/* Extract a slice of runs between two absolute offsets in a paragraph.
   Returns { sliceRuns, startIdx, endIdx }. Handles index shift from
   double-split correctly. Does not modify the paragraph. */
function extractRunSlice(para, startAbs, endAbs) {
  var lenBefore = para.runs.length;
  var endIdx = splitRunAtAbs(para, endAbs);
  var lenAfterEnd = para.runs.length;
  var startIdx = splitRunAtAbs(para, startAbs);
  var delta = para.runs.length - lenAfterEnd;
  var endIdxAdj = endIdx + delta;
  var sliceRuns = [];
  for (var i = startIdx; i < endIdxAdj; i++) {
    sliceRuns.push(makeRun(para.runs[i].text, para.runs[i]));
  }
  return { sliceRuns: sliceRuns, startIdx: startIdx, endIdx: endIdxAdj };
}

/* Remove runs between startIdx and endIdx from a paragraph.
   Merges adjacent runs and ensures at least one run remains. */
function removeRunSlice(para, startIdx, endIdx) {
  var count = Math.max(0, endIdx - startIdx);
  if (count > 0) para.runs.splice(startIdx, count);
  if (para.runs.length === 0) para.runs.push(makeRun("", curStyle));
  mergeAdjacentRuns(para);
}

/* Insert an array of runs at an absolute offset within a paragraph.
   Deep-clones the runs before insertion. Merges adjacent afterward. */
function insertRunSlice(para, insertAbs, sliceRuns) {
  if (!sliceRuns || sliceRuns.length === 0) return;
  var idx = splitRunAtAbs(para, insertAbs);
  var cloned = [];
  for (var i = 0; i < sliceRuns.length; i++) {
    cloned.push(makeRun(sliceRuns[i].text, sliceRuns[i]));
  }
  for (var i = cloned.length - 1; i >= 0; i--) {
    para.runs.splice(idx, 0, cloned[i]);
  }
  mergeAdjacentRuns(para);
}

/* Deep clone a paragraph object (style + runs). */
function clonePara(para) {
  var newStyle = JSON.parse(JSON.stringify(para.style));
  var newRuns = [];
  for (var i = 0; i < para.runs.length; i++) {
    newRuns.push(makeRun(para.runs[i].text, para.runs[i]));
  }
  return { style: newStyle, runs: newRuns };
}

/* Compute total text length of an array of runs. */
function runsTextLen(runs) {
  var len = 0;
  for (var i = 0; i < runs.length; i++) len += runs[i].text.length;
  return len;
}

/* ================================================================
   LIST SUPPORT: Constants and helpers for bulleted/numbered lists.
   List data stored on paragraph style as list: { type, level }.
   ================================================================ */

var LIST_INDENT_PT = 24;
var BULLET_CHARS = ["\u2022", "\u25E6", "\u25AA", "\u2022", "\u25E6"];

/* Compute the display number for a numbered list item by counting
   consecutive same-level numbered paragraphs before it. */
function computeListNumber(pi) {
  var ps = doc.paragraphs[pi].style;
  if (!ps["x-list"] || ps["x-list"].type !== "number") return null;
  var level = ps["x-list"].level || 0;
  var num = 1;
  for (var i = pi - 1; i >= 0; i--) {
    var prev = doc.paragraphs[i].style;
    if (!prev["x-list"] || prev["x-list"].type !== "number") break;
    if ((prev["x-list"].level || 0) === level) num++;
    else if ((prev["x-list"].level || 0) < level) break;
  }
  return num;
}

/* Get the prefix string for a list paragraph. */
function getListPrefix(pi) {
  var ps = doc.paragraphs[pi].style;
  if (!ps["x-list"]) return "";
  var level = ps["x-list"].level || 0;
  if (ps["x-list"].type === "bullet") {
    return BULLET_CHARS[Math.min(level, BULLET_CHARS.length - 1)] + " ";
  }
  if (ps["x-list"].type === "number") {
    var num = computeListNumber(pi);
    return num + ". ";
  }
  return "";
}

/* Toggle list on/off for a set of paragraphs. If all are already
   the given type, remove list. Otherwise set list. */
function toggleList(type) {
  var paras = getAffectedParas();
  var capList = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  var allMatch = true;
  for (var i = 0; i < paras.length; i++) {
    var ls = doc.paragraphs[paras[i]].style["x-list"];
    if (!ls || ls.type !== type) { allMatch = false; break; }
  }
  for (var i = 0; i < paras.length; i++) {
    var ps = doc.paragraphs[paras[i]].style;
    if (allMatch) {
      ps["x-list"] = null;
    } else {
      ps["x-list"] = { type: type, level: (ps["x-list"] ? ps["x-list"].level : 0) || 0 };
    }
  }
  finishSplice(capList, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); updateToolbar(); resetBlink();
}

/* ================================================================
   ROLE PRESETS: Heading, block quote, and verse paragraph presets.
   applyRolePreset sets paragraph style + run formatting to match
   the selected role. Reverting to "body" resets to defaults.
   ================================================================ */

var HEADING_PRESETS = {
  heading2: { fontSize: 22, fontWeight: "bold", marginTop: 18, marginBottom: 6, textIndent: 0 },
  heading3: { fontSize: 18, fontWeight: "bold", marginTop: 14, marginBottom: 4, textIndent: 0 },
  heading4: { fontSize: 16, fontWeight: "bold", marginTop: 12, marginBottom: 4, textIndent: 0 },
  heading5: { fontSize: 14, fontWeight: "bold", marginTop: 10, marginBottom: 2, textIndent: 0 },
  heading6: { fontSize: 12, fontWeight: "bold", marginTop: 8, marginBottom: 2, textIndent: 0 }
};

var BLOCK_PRESETS = {
  blockQuote: { marginLeft: 36, marginRight: 36, textIndent: 0, marginTop: 6, marginBottom: 6 },
  verse: { marginLeft: 36, marginRight: 36, textIndent: 0, marginTop: 6, marginBottom: 6 }
};

/* Apply a role preset to a paragraph. Sets role, paragraph spacing,
   and for headings also modifies run font size and bold. */
function applyRolePreset(para, role) {
  para.style["x-role"] = role;
  var hp = HEADING_PRESETS[role];
  if (hp) {
    para.style.textIndent = hp.textIndent;
    para.style.marginTop = hp.marginTop;
    para.style.marginBottom = hp.marginBottom;
    para.style.marginLeft = 0;
    para.style.marginRight = 0;
    for (var i = 0; i < para.runs.length; i++) {
      para.runs[i].fontSize = hp.fontSize;
      para.runs[i].fontWeight = hp.fontWeight;
    }
    return;
  }
  var bp = BLOCK_PRESETS[role];
  if (bp) {
    para.style.textIndent = bp.textIndent;
    para.style.marginTop = bp.marginTop;
    para.style.marginBottom = bp.marginBottom;
    para.style.marginLeft = bp.marginLeft;
    para.style.marginRight = bp.marginRight || 0;
    return;
  }
  if (role === "body") {
    para.style.textIndent = 18;
    para.style.marginTop = 0;
    para.style.marginBottom = 0;
    para.style.marginLeft = 0;
    para.style.marginRight = 0;
    for (var i = 0; i < para.runs.length; i++) {
      para.runs[i].fontSize = 12;
      para.runs[i].fontWeight = "normal";
    }
  }
  if (role === "sceneBreak") {
    para.style.textIndent = 0;
    para.style.marginTop = 12;
    para.style.marginBottom = 12;
    para.style.marginLeft = 0;
    para.style.textAlign = "center";
    if (paraText(para).trim() === "" || paraText(para).trim() === "* * *") {
      para.runs = [makeRun("* * *")];
    }
  }
  if (role === "pageBreak") {
    para.style.textIndent = 0;
    para.style.marginTop = 0;
    para.style.marginBottom = 0;
    para.style.marginLeft = 0;
    para.runs = [makeRun("")];
  }
  if (role === "chapterTitle") {
    para.style.textIndent = 0;
    para.style.marginTop = 24;
    para.style.marginBottom = 12;
    para.style.marginLeft = 0;
    para.style.textAlign = "center";
  }
}

/* Clear all inline formatting on a run, resetting to defaults. */
function clearRunFormatting(run) {
  var d = defaultRunStyle();
  run.fontWeight = d.fontWeight;
  run.fontStyle = d.fontStyle;
  run.textDecoration = d.textDecoration;
  run["x-script"] = d["x-script"];
  run.fontSize = d.fontSize;
  run.fontFamily = d.fontFamily;
  run.color = d.color;
  run.backgroundColor = d.backgroundColor;
}

/* The document object (v2). All state is stored here and serialized
   to JSON for persistence. */
var doc = {
  version: 2,
  meta: { title: "A Star in the Southern Sky", author: "James Allen Vanderhixon", createdAt: Date.now() },
  bookSettings: defaultBookSettings(),
  bookDefaults: v2BookDefaults(),
  roleStyles: v2RoleStyles(),
  bookDesign: defaultBookDesign(),
  paragraphs: (function() {
    var d = defaultRunStyle;
    var dp = defaultParaStyle;
    function R(text, ov) {
      var r = makeRun(text);
      if (ov) for (var k in ov) r[k] = ov[k];
      return r;
    }
    function P(runs, sov) {
      var s = dp();
      if (sov) for (var k in sov) s[k] = sov[k];
      return { style: s, runs: Array.isArray(runs) ? runs : [makeRun(runs)] };
    }
    return [

      /* ── SECTION 1: Title Page (front / titlePage) ── 2 paragraphs */
      P([R("A Star in the Southern Sky", { fontSize: 24, fontWeight: "bold" })],
        { "x-role": "chapterTitle", textIndent: 0, marginTop: 120, marginBottom: 12, textAlign: "center" }),
      P([R("James Allen Vanderhixon", { fontSize: 14 })],
        { textAlign: "center", textIndent: 0, marginTop: 24 }),

      /* ── SECTION 2: Copyright (front / copyright) ── 3 paragraphs */
      P([R("Copyright \u00A9 2026 James Allen Vanderhixon. All rights reserved.", { fontSize: 9 })],
        { textAlign: "center", textIndent: 0, marginTop: 60 }),
      P([R("Published in the United States of America.", { fontSize: 9 })],
        { textAlign: "center", textIndent: 0 }),
      P([R("No part of this book may be reproduced in any form without written permission from the publisher, except for brief quotations in reviews.", { fontSize: 9 })],
        { textAlign: "center", textIndent: 0, marginTop: 6 }),

      /* ── SECTION 3: Dedication (front / dedication) ── 1 paragraph */
      P([R("For Elise, who taught me to look up.", { fontStyle: "italic" })],
        { textAlign: "center", textIndent: 0, marginTop: 120 }),

      /* ── SECTION 4: Chapter 1 (body / chapter) ── 11 paragraphs */
      P([R("The Weight of Light")],
        { "x-role": "chapterTitle", textIndent: 0, marginTop: 72, marginBottom: 12, textAlign: "center" }),
      P([R("The signal arrived on a Tuesday, long after anyone expected it. Dr. Maren Alcott sat alone in the observatory control room, her coffee cold, her eyes tracing the same anomalous frequency spike that had appeared six hours earlier. The instruments were not malfunctioning. She had checked twice.")],
        { "x-dropCap": { enabled: true } }),
      P([R("Outside, the desert stretched in every direction under a sky so clear the Milky Way looked close enough to touch. The Atacama had been her home for three years now. She had chosen this place for its silence, its altitude, its distance from the noise of the world. And the world had found her anyway.")]),
      P([R("She pressed record on the log. \"Anomaly persists at 1420.405 megahertz. Consistent with the hydrogen line. Duration now exceeds six hours. I am classifying this as a candidate event.\"")]),
      P([R("Her hand was steady. Her voice was not.")]),
      P([R("* * *")],
        { "x-role": "sceneBreak", textIndent: 0, marginTop: 12, marginBottom: 12, textAlign: "center" }),
      P([R("By dawn, three more receivers had confirmed the signal. It was not local interference. It was not a satellite. It was not a pulsar. The pattern repeated every forty-seven seconds with a precision that no natural source could produce.")]),
      P([R("Maren called Santiago first. He answered on the second ring, which meant he had not been sleeping either.")]),
      P([R("\"You see it,\" she said. Not a question.")]),
      P([R("\"I see it. I have been staring at it for two hours. Maren, this is not noise.\"")]),
      P([R("\"No. It is not.\"")]),

      /* ── SECTION 5: Chapter 2 (body / chapter) ── 10 paragraphs */
      P([R("The Quiet Room")],
        { "x-role": "chapterTitle", textIndent: 0, marginTop: 72, marginBottom: 12, textAlign: "center" }),
      P([R("The committee assembled in Building Nine, a windowless concrete structure that the staff called the Quiet Room. It had been built during the Cold War for reasons no one discussed, and it served now as the only place on the campus where electromagnetic interference was truly zero.")]),
      P([R("Maren recognized most of the faces. Dr. Yusuf Okafor from MIT, whose work on signal attenuation had become the standard reference. Dr. Lin Xiaoming from the Beijing Observatory, who had been the first to triangulate the Wow! signal's probable origin. And at the head of the table, Director Katherine Wells, whose expression betrayed nothing.")]),
      P([R("\"Dr. Alcott,\" Wells said. \"Walk us through it from the beginning.\"")]),
      P([R("Maren stood. She had prepared slides, but she found herself ignoring them. The data spoke plainly enough.")]),
      P([R("\"At 02:14 UTC on March third, our primary array detected a narrowband emission centered on the hydrogen line. The signal repeats on a forty-seven-second cycle. The bandwidth is less than one hertz. It is, by every measure we have, artificial.\"")]),
      P([R("The room was very quiet.")]),
      P([R("\"The source,\" she continued, \"lies in the direction of Sigma Octantis. The southern pole star. Approximately two hundred seventy light-years from Earth.\"")]),
      P([R("Okafor leaned forward. \"You are certain about the directionality?\"")]),
      P([R("\"Three independent arrays. The parallax is unambiguous.\"")]),

      /* ── SECTION 6: Chapter 3 (body / chapter) ── 9 paragraphs */
      P([R("What the Light Carries")],
        { "x-role": "chapterTitle", textIndent: 0, marginTop: 72, marginBottom: 12, textAlign: "center" }),
      P([R("Three weeks after first detection, the signal changed. The forty-seven-second pulse remained, but now it carried structure. Embedded within each repetition was a secondary pattern, a nested sequence that Maren's team began calling the watermark.")]),
      P([R("Santiago was the first to decode it. He had been living on caffeine and stubbornness, scrawling diagrams on the whiteboard in his office until the markers ran dry.")]),
      P([R("\"It is a coordinate system,\" he told Maren over a video call, his eyes ringed with exhaustion. \"They are telling us where they are. Not just the star. The planet. The orbital parameters. Everything.\"")]),
      P([R("\"They want us to know exactly where to look.\"")]),
      P([R("\"Yes.\" He paused. \"Or exactly where to aim.\"")]),
      P([R("Maren felt the weight of that sentence settle over her. Two hundred seventy light-years. Whatever had sent this signal, it had done so before the American Revolution. Before Shakespeare. Before the fall of Rome. The message they were receiving now was older than most of human civilization.")]),
      P([R("And yet here it was, precise and patient, repeating itself every forty-seven seconds as if it had all the time in the world.")]),
      P([R("Perhaps it did.")]),

      /* ── SECTION 7: Acknowledgments (back / acknowledgments) ── 3 paragraphs */
      P([R("Acknowledgments", { fontSize: 18, fontWeight: "bold" })],
        { "x-role": "heading2", textIndent: 0, marginTop: 24, marginBottom: 12, textAlign: "center" }),
      P([R("This book would not exist without the patience of Dr. Elena Vasquez, who answered my endless questions about radio astronomy with grace and humor. Thanks also to the staff of the Atacama Large Millimeter Array, who allowed me to visit and stand beneath a sky that changed the way I think about distance.")]),
      P([R("To my editor, Sarah Chen, who saw the story inside the science. To my agent, Marcus Webb, who believed in this project before anyone else. And to my family, who endured three years of dinner conversations about signal processing.")]),

      /* ── SECTION 8: About the Author (back / aboutAuthor) ── 2 paragraphs */
      P([R("About the Author", { fontSize: 18, fontWeight: "bold" })],
        { "x-role": "heading2", textIndent: 0, marginTop: 24, marginBottom: 12, textAlign: "center" }),
      P([R("James Allen Vanderhixon is a writer and amateur astronomer based in the American South. A Star in the Southern Sky is his debut novel. He lives with his wife, two dogs, and a telescope that he insists was a reasonable purchase.")])
    ];
  })()
};

/* Initialize section metadata for the inline test book.
   Eight sections across three regions. */
(function() {
  var sections = [
    { region: "front", type: "titlePage",       paraCount: 2 },
    { region: "front", type: "copyright",        paraCount: 3 },
    { region: "front", type: "dedication",       paraCount: 1 },
    { region: "body",  type: "chapter",          paraCount: 11 },
    { region: "body",  type: "chapter",          paraCount: 10 },
    { region: "body",  type: "chapter",          paraCount: 9 },
    { region: "back",  type: "acknowledgments",  paraCount: 3 },
    { region: "back",  type: "aboutAuthor",      paraCount: 2 }
  ];

  doc._sectionMeta = [];
  var paraIdx = 0;
  for (var si = 0; si < sections.length; si++) {
    var sid = generateSectionId();
    var meta = { id: sid, region: sections[si].region, type: sections[si].type };
    /* For chapter sections, extract heading title from chapterTitle paragraph */
    if (sections[si].type === "chapter") {
      for (var hi = paraIdx; hi < paraIdx + sections[si].paraCount; hi++) {
        if (doc.paragraphs[hi] && doc.paragraphs[hi].style["x-role"] === "chapterTitle") {
          meta.heading = { title: paraText(doc.paragraphs[hi]) };
          break;
        }
      }
      if (!meta.heading) meta.heading = { title: "" };
    }
    doc._sectionMeta.push(meta);
    for (var pi = 0; pi < sections[si].paraCount; pi++) {
      doc.paragraphs[paraIdx].style["x-sectionId"] = sid;
      paraIdx++;
    }
  }
  doc.version = 3;
})();

