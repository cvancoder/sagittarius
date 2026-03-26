/* ================================================================
   POSITION MODEL: A position is { p, o } where p is the paragraph
   index and o is the character offset within that paragraph. This
   is independent of run boundaries, so positions remain stable
   when runs are split or merged during editing.

   NOTE: clampToSection() and sectionOfPara() are in the DOCUMENT
   MODEL section above — they depend on paragraph style data
   (x-sectionId) but are consumed by selection and mouse handlers.
   ================================================================ */

/* Create a position { p, o }. */
function mkPos(p, o) { return { p: p, o: o }; }

function cmpPos(a, b) {
  if (a.p !== b.p) return a.p - b.p;
  return a.o - b.o;
}

/* True if positions are equal. */
function eqPos(a, b) { return a.p === b.p && a.o === b.o; }
function minPos(a, b) { return cmpPos(a, b) <= 0 ? a : b; }
function maxPos(a, b) { return cmpPos(a, b) <= 0 ? b : a; }
function clonePos(pos) { return { p: pos.p, o: pos.o }; }

/* Clamp a position to valid document boundaries. */
function clampPos(pos) {
  pos.p = Math.max(0, Math.min(doc.paragraphs.length - 1, pos.p));
  pos.o = Math.max(0, Math.min(paraTextLen(doc.paragraphs[pos.p]), pos.o));
  return pos;
}

/* Cursor and selection state */
var cursor = mkPos(0, 0);
var selAnchor = null;
var selFocus = null;

/* Desired X position for vertical navigation. Set on horizontal
   movement or mouse click. Preserved during up/down arrow so the
   cursor returns to the original column after passing short lines. */
var desiredX = null;

/* Current typing style: determines formatting of next typed character.
   Updated when cursor moves or user changes toolbar without selection. */
var curStyle = defaultRunStyle();

/* True if there is an active selection. */
function hasSelection() {
  return selAnchor !== null && selFocus !== null && !eqPos(selAnchor, selFocus);
}

/* Return normalized selection range { s, e } or null. */
function getSelRange() {
  if (!hasSelection()) return null;
  return { s: minPos(selAnchor, selFocus), e: maxPos(selAnchor, selFocus) };
}

function clearSel() { selAnchor = null; selFocus = null; }

/* Returns an array of paragraph indices affected by the current selection.
   If no selection, returns just the cursor paragraph. Used by all
   paragraph-level operations (indent, spacing, alignment). */
function getAffectedParas() {
  if (hasSelection()) {
    var r = getSelRange();
    var result = [];
    for (var p = r.s.p; p <= r.e.p; p++) result.push(p);
    return result;
  }
  return [cursor.p];
}

/* ================================================================
   LAYOUT ENGINE: Tokenizes paragraphs into word/space chunks,
   measures them, breaks into lines with word wrapping, assigns
   pages, and applies alignment. Produces a lines[] array where
   each line contains positioned segments with per-character
   width data for hit testing and cursor placement.
   ================================================================ */

var lines = [];
var linesByPage = {};
var totalPages = 1;
var measureCanvas = document.createElement("canvas");
var measureCtx = measureCanvas.getContext("2d");

/* Image cache: reuses Image elements across renders to avoid re-decode. */
var imageCache = {};
function getImageCached(src) {
  if (!src) return null;
  if (imageCache[src]) return imageCache[src];
  var img = new Image();
  img.onload = function() { render(); };
  img.src = src;
  imageCache[src] = img;
  return img;
}

/* Break a paragraph into tokens (words and whitespace runs) from
   its styled runs. Each token carries its text, style, total width,
   and position references. Per-character widths are NOT computed
   here. They are resolved on demand by getSegCharWidths() only
   when needed for hit testing or rendering. */
function tokenizePara(para, paraIdx) {
  var tokens = [];
  var absOff = 0;
  for (var ri = 0; ri < para.runs.length; ri++) {
    var run = para.runs[ri];
    var t = run.text;
    var font = fontStr(run);
    var i = 0;
    while (i < t.length) {
      var isSpace = (t[i] === " " || t[i] === "\t");
      var j = i + 1;
      while (j < t.length && ((t[j] === " " || t[j] === "\t") === isSpace)) j++;
      var chunk = t.slice(i, j);
      measureCtx.font = font;
      var totalW = measureCtx.measureText(chunk).width;
      tokens.push({
        text: chunk, font: font, width: totalW,
        isSpace: isSpace,
        fontFamily: run.fontFamily, fontSize: run.fontSize, fontWeight: run.fontWeight, fontStyle: run.fontStyle,
        textDecoration: run.textDecoration, color: run.color,
        "x-script": run["x-script"] || "normal", "x-linkHref": run["x-linkHref"] || null,
        backgroundColor: run.backgroundColor || null,
        paraIdx: paraIdx, runIdx: ri,
        startOff: absOff + i, endOff: absOff + j
      });
      i = j;
    }
    absOff += t.length;
  }
  return tokens;
}

/* Lazily compute and cache per-character widths for a segment.
   Called on demand by hit testing, cursor positioning, and rendering.
   Uses cumulative substring measurement for accuracy with
   proportional fonts. */
function getSegCharWidths(seg) {
  if (seg._charWidths) return seg._charWidths;
  measureCtx.font = seg.font;
  var cw = [];
  var prev = 0;
  for (var i = 0; i < seg.text.length; i++) {
    var w = measureCtx.measureText(seg.text.slice(0, i + 1)).width;
    var charW = w - prev;
    /* Add kerning to every character except the last.
       seg.kerning is null for normal text — falsy check
       short-circuits with zero cost. */
    if (seg.kerning && i < seg.text.length - 1) {
      charW += seg.kerning;
    }
    cw.push(charW);
    prev = w;
  }
  seg._charWidths = cw;
  return cw;
}

/* Compute text metrics for a given font size. */
function fontMetrics(fs) {
  var em = fs * 1.333;
  return { ascent: em * 0.8, descent: em * 0.3 };
}

/* ================================================================
   DROP CAP SUBSYSTEM: Paragraph-level drop caps.
   Each paragraph carries its own dropCap property (true/false).
   Style parameters (lines, gapPt) come from bookSettings.dropCaps.
   Layout/render reads the paragraph property directly.
   ================================================================ */

/* Find the offset of the first alphabetic character in text.
   Returns -1 if no letter found. Used by layout to determine
   the dropped letter and which characters to strip. */
function dropCapFirstLetter(text) {
  for (var i = 0; i < text.length; i++) {
    if (/[a-zA-Z\u00C0-\u024F]/.test(text.charAt(i))) return i;
  }
  return -1;
}

/* Compute drop cap rendering info for a paragraph with dropCap enabled.
   Returns null if the paragraph has no renderable letter.

   STYLE PARAMETERS (from bookSettings.dropCaps):
   - lines: number of body lines the DC spans (default 3)
   - gapPt: space between DC right ink edge and body text, in points (default 3)

   METRIC-BASED GEOMETRY:
   - DC font size computed from actualBoundingBoxAscent scaling
   - DC exclusion uses actualBoundingBoxRight (ink extent, no side bearings)
   - Only the first alphabetic letter is enlarged as the drop cap
   - Any leading quotes/punctuation are stripped from layout but render
     at body size in the exclusion zone */
function computeDropCap(para, bodyFs, lineHeightMult, PT_TO_PX) {
  var dc = doc.bookSettings.dropCaps || {};
  var dropLines = dc.lines || 3;
  var gapPx = (dc.gapPt || 3) * PT_TO_PX;
  var text = paraText(para);
  var letterIdx = dropCapFirstLetter(text);
  if (letterIdx < 0) return null;
  var letter = text.charAt(letterIdx);
  var leadingText = text.slice(0, letterIdx); /* quotes/punct before letter */
  var fontFam = para.runs[0].fontFamily || "Georgia";
  var isBold = para.runs[0].fontWeight === "bold";
  var isItalic = para.runs[0].fontStyle === "italic";

  /* Body font string (pt units, matching tokenizer) */
  var bodyFontStr = (isItalic ? "italic " : "") + (isBold ? "bold " : "") + bodyFs + "pt " + fontFam;

  /* Body line height */
  var bodyMetrics = fontMetrics(bodyFs);
  var bodyLineH = (bodyMetrics.ascent + bodyMetrics.descent) * lineHeightMult;

  /* Actual body glyph ascent */
  measureCtx.font = bodyFontStr;
  var realBodyAscent = measureCtx.measureText(letter).actualBoundingBoxAscent || bodyMetrics.ascent;

  /* Measure leading text at body size */
  var leadingBodyWidth = 0;
  if (leadingText.length > 0) {
    measureCtx.font = bodyFontStr;
    leadingBodyWidth = measureCtx.measureText(leadingText).width;
  }

  /* Target DC ascent: from line 1 glyph top to line N baseline */
  var targetAscent = (dropLines - 1) * bodyLineH + realBodyAscent;

  /* Compute DC font size by scaling from reference measurement */
  var refSize = 60;
  measureCtx.font = refSize + "px " + fontFam;
  var refAscent = measureCtx.measureText(letter).actualBoundingBoxAscent || (refSize * 1.0664);
  var dcFs = targetAscent / refAscent * refSize;

  /* DC font string (px units for large rendering) */
  var dcFontParts = "";
  if (isItalic) dcFontParts += "italic ";
  if (isBold) dcFontParts += "bold ";
  var dcFont = dcFontParts + Math.round(dcFs) + "px " + fontFam;

  /* Measure DC letter ink extent at computed size */
  measureCtx.font = dcFont;
  var dcTM = measureCtx.measureText(letter);
  var dcLetterInkRight = dcTM.actualBoundingBoxRight || dcTM.width;

  /* Total exclusion width = leading body text + DC letter ink + gap */
  var exclusionWidth = leadingBodyWidth + dcLetterInkRight;

  return {
    letter: letter,
    letterOffset: letterIdx,
    leadingText: leadingText,
    leadingBodyWidth: leadingBodyWidth,
    skipChars: letterIdx + 1,
    fontSize: dcFs,
    font: dcFont,
    bodyFont: bodyFontStr,
    width: exclusionWidth,
    dcLetterInkRight: dcLetterInkRight,
    gapPx: gapPx,
    dropLines: dropLines,
    bodyLineH: bodyLineH,
    color: para.runs[0].color || "#1a1a1a"
  };
}

/* ── Small Caps Measurement ──
   Compute x-height and cap-height from actual glyph metrics.
   Used by auto mode to find the correct scale ratio for any
   font. Measures flat-topped glyphs only to avoid overshoot
   contamination from round letters. */

/* Measure x-height by averaging actualBoundingBoxAscent of
   flat-topped lowercase letters (x, v, w, z). These sit at
   true x-height with no overshoot. Measures at a large
   reference size (200px) for sub-pixel precision — the
   ratio is scale-independent. */
function measureXHeight(fontFamily) {
  var chars = "xvwz";
  var refPx = 200;
  measureCtx.font = refPx + "px " + fontFamily;
  measureCtx.textBaseline = "alphabetic";
  var heights = [];
  for (var i = 0; i < chars.length; i++) {
    var h = measureCtx.measureText(chars.charAt(i))
      .actualBoundingBoxAscent;
    if (h > 0) heights.push(h);
  }
  if (heights.length === 0) return refPx * 0.5;
  heights.sort(function(a, b) { return a - b; });
  if (heights.length >= 4) {
    heights = heights.slice(1, heights.length - 1);
  }
  var sum = 0;
  for (var j = 0; j < heights.length; j++) sum += heights[j];
  return sum / heights.length;
}

/* Measure cap height by averaging actualBoundingBoxAscent
   of flat-topped uppercase letters (H, E, T, I). */
function measureCapHeight(fontFamily) {
  var chars = "HETI";
  var refPx = 200;
  measureCtx.font = refPx + "px " + fontFamily;
  measureCtx.textBaseline = "alphabetic";
  var heights = [];
  for (var i = 0; i < chars.length; i++) {
    var h = measureCtx.measureText(chars.charAt(i))
      .actualBoundingBoxAscent;
    if (h > 0) heights.push(h);
  }
  if (heights.length === 0) return refPx * 0.7;
  heights.sort(function(a, b) { return a - b; });
  if (heights.length >= 4) {
    heights = heights.slice(1, heights.length - 1);
  }
  var sum = 0;
  for (var j = 0; j < heights.length; j++) sum += heights[j];
  return sum / heights.length;
}

/* Compute auto scale ratio for small caps.
   Returns xHeight / capHeight for the given font. */
function computeAutoScale(fontFamily) {
  var xH = measureXHeight(fontFamily);
  var capH = measureCapHeight(fontFamily);
  if (capH <= 0) return 0.70;
  return xH / capH;
}

/* ── Optically Corrected Small Caps ──
   General-purpose function that transforms tokens into faux
   small caps with optical correction: scaled to x-height,
   stroke-thickened, and per-character kerned.

   Used by the lead-in feature (layout loop) and will be
   used by future inline small caps (run-level property).
   Contains NO chapter-specific or lead-in-specific logic.

   MODIFIES TOKENS IN PLACE. Never touches the document model.

   Parameters:
     tokens     — token array (may be DC-stripped)
     para       — paragraph object (for full text via paraText)
     fontFamily — body font family string
     bodySizePt — body font size in points
     config     — {
         wordCount:    number of words to transform
         scaleRatio:   cap height ratio (or "auto")
         strokeRatio:  stroke width as fraction of SC px size
         kerningRatio: letter spacing as fraction of SC px size
         mode:         "auto" or "custom"
         color:        optional color override (absent = use token color)
       }
   Returns: true if any tokens were transformed, false otherwise.
*/
function applySmallCaps(tokens, para, fontFamily,
    bodySizePt, config, PT_TO_PX) {
  if (!tokens.length || !config) return false;
  var wordCount = config.wordCount || 4;
  if (wordCount < 1) return false;

  /* Determine scale ratio */
  var scaleRatio = config.scaleRatio || 0.70;
  if (config.mode === "auto") {
    scaleRatio = computeAutoScale(fontFamily);
  }

  /* Compute SC font size in pixels (fractional — no rounding) */
  var bodyPx = bodySizePt * PT_TO_PX;
  var scPxInitial = bodySizePt * scaleRatio * PT_TO_PX;

  /* Calibrate: measure actual rendered heights and correct
     proportionally. One measurement each, one multiplication.
     Corrects for pixel-grid quantization at small sizes. */
  measureCtx.font = bodyPx + "px " + fontFamily;
  measureCtx.textBaseline = "alphabetic";
  var targetXH = measureCtx.measureText("x")
    .actualBoundingBoxAscent;
  measureCtx.font = scPxInitial + "px " + fontFamily;
  var renderedCapH = measureCtx.measureText("H")
    .actualBoundingBoxAscent;
  var scPx = (renderedCapH > 0)
    ? scPxInitial * (targetXH / renderedCapH)
    : scPxInitial;

  /* Compute pixel values from ratios */
  var strokePx = scPx * (config.strokeRatio || 0);
  var kerningPx = scPx * (config.kerningRatio || 0);

  /* Compute character offset where lead-in ends.
     Walk full paragraph text, count word boundaries. */
  var fullText = paraText(para);
  var inWord = false;
  var wordsSeen = 0;
  var liEndOffset = fullText.length;
  for (var ci = 0; ci < fullText.length; ci++) {
    var ch = fullText.charAt(ci);
    var isWC = (ch !== " " && ch !== "\t");
    if (isWC && !inWord) {
      wordsSeen++;
      if (wordsSeen > wordCount) {
        liEndOffset = ci;
        break;
      }
    }
    inWord = isWC;
  }

  /* Convert scPx back to points for fontStr */
  var scPt = scPx / PT_TO_PX;
  var transformed = false;

  for (var ti = 0; ti < tokens.length; ti++) {
    var tok = tokens[ti];
    if (tok.startOff >= liEndOffset) break;
    if (tok.isSpace) continue;
    if (tok.endOff > liEndOffset) continue;

    /* Uppercase the text */
    tok.text = tok.text.toUpperCase();

    /* Scale font size (store as points for fontStr) */
    tok.fontSize = scPt;

    /* Apply color override if present in config */
    if (config.color) tok.color = config.color;

    /* Rebuild font string and remeasure base width */
    tok.font = fontStr({
      fontFamily: tok.fontFamily,
      fontSize: scPt,
      fontWeight: tok.fontWeight,
      fontStyle: tok.fontStyle
    });
    measureCtx.font = tok.font;
    var baseWidth = measureCtx.measureText(tok.text).width;

    /* Add kerning to width so word-wrap accounts for it.
       Kerning adds space after each character except the last. */
    var kerningTotal = (kerningPx > 0.01 && tok.text.length > 1)
      ? kerningPx * (tok.text.length - 1) : 0;
    tok.width = baseWidth + kerningTotal;

    /* Store rendering hints on the token. These carry
       through commitLine to segments. The renderer checks
       for their presence — absent means normal rendering. */
    if (strokePx > 0.01) tok.strokeWidth = strokePx;
    if (kerningPx > 0.01) tok.kerning = kerningPx;

    transformed = true;
  }
  return transformed;
}

/* ================================================================
   LAYOUT REQUEST: Boundary-aware relayout entry point.
   All code that needs layout recomputation should call requestLayout()
   instead of runLayout() directly. The hint object describes what
   changed so future incremental relayout can skip unchanged regions.

   hint = {
     fromPara: N    — earliest paragraph index that changed (0-based).
                      Paragraphs before this are assumed unchanged.
     reason: string — optional label for diagnostics ("insert", "delete",
                      "split", "merge", "style", "load", "undo", "zoom")
   }

   If hint is omitted or null, the system assumes a full-document change
   (equivalent to fromPara: 0). This is the correct default for undo,
   document load, and any case where the change scope is unknown.

   CURRENT STATUS: Internal execution is still full-document relayout.
   The hint is recorded for diagnostics but not yet used to skip work.
   This is honest groundwork — the incremental optimization is a
   separate future mission.
   ================================================================ */

var _lastLayoutHint = null;
var _statsDirty = true;

function requestLayout(hint) {
  _statsDirty = true;
  _lastLayoutHint = hint || { fromPara: 0, reason: "full" };
  /* Pass the restart boundary to the layout engine.
     runLayout will reuse cached lines before fromPara if possible. */
  runLayout(_lastLayoutHint.fromPara || 0);
}

/* Full-document layout entry point. Used when the entire document has
   changed (undo/redo, load, drag-move) and no restart boundary applies.
   Records the reason for diagnostics. */
function requestFullLayout(reason) {
  _statsDirty = true;
  _lastLayoutHint = { fromPara: 0, reason: reason || "full" };
  runLayout(0);
}

/* Main layout function. Rebuilds the lines[] array from paragraph
   fromPara to toPara (exclusive), reusing cached lines before/after.
   If fromPara is 0 or omitted, starts from the beginning.
   If toPara is omitted, runs to document end (or early-stop convergence).
   Stores per-paragraph boundary state (_paraYState) so future calls
   can restart from any paragraph without losing page/Y continuity. */

var _paraYState = []; /* [{page, y}] at the START of each paragraph */
var _layoutStats = { fromPara: 0, toPara: -1, stoppedAt: -1, totalParas: 0 }; /* diagnostics */
var _skipDOMSync = false; /* when true, runLayout skips syncPages/applyZoom/spellRefresh */

/* Pipeline generation counters — incremented at each stage for observability */
var _pipelineGen = {
  layout: 0,    /* runLayout completions */
  render: 0,    /* render() calls */
  scroll: 0,    /* scroll ticks processed */
  evict: 0,     /* evictOutsideWindow calls that actually evicted */
  realize: 0    /* ensureRealized calls that triggered runLayout */
};

/* Scroll pipeline synchronization state */
var _scrollSnap = {
  scrollTop: 0,
  viewH: 0,
  gen: 0          /* scroll snapshot generation — incremented per tick */
};
var _renderGen = 0;           /* generation of last completed render */
var _evictTimer = null;       /* deferred eviction timer */
var _EVICT_IDLE_MS = 400;     /* ms of scroll inactivity before eviction runs */

function runLayout(fromPara, toPara) {
  computePageDimensions();
  var PT_TO_PX = SCREEN_DPI / 72;

  fromPara = fromPara || 0;
  /* toPara: exclusive upper bound. Undefined/0 = run to document end. */
  var hasToPara = (typeof toPara === "number" && toPara > fromPara && toPara < doc.paragraphs.length);

  /* Validate restart boundary. If fromPara > 0 and we have cached
     state for that paragraph, extract the tail for convergence and truncate.
     Otherwise fall back to full relayout from 0. */
  var currentPage = 0;
  var y = M_TOP;
  var oldTailYState = null;  /* saved tail of _paraYState for convergence check */
  var oldTailLines = null;   /* saved tail of lines[] for early-stop restore */
  var oldParaCount = 0;      /* paragraph count at time of snapshot */
  var newParaYState = null;  /* built during layout, swapped atomically at end */

  if (fromPara > 0 && fromPara < doc.paragraphs.length && _paraYState[fromPara]) {
    oldParaCount = _paraYState.length;

    /* NON-DESTRUCTIVE copy of tail — _paraYState is never modified during layout */
    oldTailYState = _paraYState.slice(fromPara);
    newParaYState = _paraYState.slice(0, fromPara); /* keep prefix */
    /* Find the split point in lines[] */
    var keepCount = 0;
    for (var li = 0; li < lines.length; li++) {
      if (lines[li].paraIdx >= fromPara) break;
      keepCount++;
    }
    oldTailLines = lines.splice(keepCount);

    /* Restore carry-forward state from the first tail entry */
    currentPage = oldTailYState[0].page;
    y = oldTailYState[0].y;
  } else {
    /* Full relayout from paragraph 0 */
    fromPara = 0;
    lines = [];
    newParaYState = [];
    _headingBlocks = {};
  }

  _layoutStats = { fromPara: fromPara, toPara: hasToPara ? toPara : -1, stoppedAt: -1, totalParas: doc.paragraphs.length };

  /* ── SECTION BREAK MAP ──
     Build a quick O(1) lookup of which paragraph indices are
     section starts and what beginOn rule applies. Uses the proven
     buildSectionMap() function. Only the firstPara of each section
     (except the very first section) gets an entry. */
  var _secBreaks = {};
  var _secMapData = buildSectionMap();
  for (var _sbi = 1; _sbi < _secMapData.length; _sbi++) {
    var _sbEntry = _secMapData[_sbi];
    if (_sbEntry.firstPara >= 0) {
      _secBreaks[_sbEntry.firstPara] = _sbEntry.beginOn;
    }
  }

  for (var pi = fromPara; pi < doc.paragraphs.length; pi++) {

    /* ── SECTION BREAK ──
       If this paragraph is the first paragraph of a new section,
       force a new page and enforce the section's recto/verso rule.
       The _secBreaks map was built before the loop from the proven
       buildSectionMap() data. */
    if (_secBreaks.hasOwnProperty(pi)) {
      /* Always advance to a new page if we have content on current page */
      if (y > M_TOP + 0.5) {
        currentPage++;
        y = M_TOP;
      }
      /* Enforce recto/verso:
         recto = even page index (0, 2, 4...)
         verso = odd page index (1, 3, 5...) */
      var _beginOn = _secBreaks[pi];
      if (_beginOn === "right" && currentPage % 2 !== 0) {
        currentPage++;
        y = M_TOP;
      } else if (_beginOn === "left" && currentPage % 2 !== 1) {
        currentPage++;
        y = M_TOP;
      }
    }

    /* Record boundary state at the START of this paragraph */
    newParaYState[pi] = { page: currentPage, y: y };

    /* CONVERGENCE CHECK: If we've processed at least one paragraph past
       the restart point, and the carry-forward state matches the old cached
       tail for this paragraph, all downstream paragraphs would produce
       identical layout. Restore old tail lines/cache and stop early.
       GUARD: Only check when paragraph count is unchanged (no split/merge),
       because old tail indices correspond to different paragraphs after
       insertions/deletions. Comparison uses epsilon for floating-point Y. */
    var tailIdx = pi - fromPara;  /* offset into oldTailYState */
    if (oldTailYState && oldTailLines && oldTailLines.length > 0 &&
        pi > fromPara &&
        doc.paragraphs.length === oldParaCount &&
        tailIdx < oldTailYState.length &&
        currentPage === oldTailYState[tailIdx].page &&
        Math.abs(y - oldTailYState[tailIdx].y) < 0.01) {
      /* CONTIGUITY CHECK: The old tail must actually have lines starting
         at paragraph pi. After eviction, oldTailLines may only contain
         lines for distant paragraphs (e.g., paras 50+ when pi=1).
         Restoring such a tail would leave a gap (paras 1-49 with no lines). */
      var firstRestorePara = -1;
      for (var chk = 0; chk < oldTailLines.length; chk++) {
        if (oldTailLines[chk].paraIdx >= pi) {
          firstRestorePara = oldTailLines[chk].paraIdx;
          break;
        }
      }
      if (firstRestorePara >= 0 && firstRestorePara <= pi) {
        /* Contiguous — safe to restore */
        for (var oli = 0; oli < oldTailLines.length; oli++) {
          if (oldTailLines[oli].paraIdx >= pi) lines.push(oldTailLines[oli]);
        }
        for (var opi = tailIdx; opi < oldTailYState.length; opi++) {
          newParaYState[fromPara + opi] = oldTailYState[opi];
        }
        _layoutStats.stoppedAt = pi;
        break;
      }
      /* else: gap in old tail — continue producing lines */
    }

    /* BOUNDED-STOP CHECK: If a toPara boundary was specified and we've
       reached it, stop producing lines. Restore old tail lines/state
       if available (same mechanism as convergence). This enables bounded
       realization: only the target window has fresh geometry. */
    if (hasToPara && pi >= toPara) {
      if (oldTailLines && oldTailYState &&
          doc.paragraphs.length === oldParaCount && oldTailLines.length > 0) {
        /* Contiguity check: only restore LINES if old tail starts at or near pi */
        var bFirstPara = -1;
        for (var bchk = 0; bchk < oldTailLines.length; bchk++) {
          if (oldTailLines[bchk].paraIdx >= pi) { bFirstPara = oldTailLines[bchk].paraIdx; break; }
        }
        if (bFirstPara >= 0 && bFirstPara <= pi) {
          for (var bli = 0; bli < oldTailLines.length; bli++) {
            if (oldTailLines[bli].paraIdx >= pi) lines.push(oldTailLines[bli]);
          }
        }
      }
      /* Copy remaining _paraYState entries from old tail into newParaYState
         so the new array spans the full document. */
      if (oldTailYState && doc.paragraphs.length === oldParaCount) {
        var bTailIdx = pi - fromPara;
        for (var bpi = bTailIdx; bpi < oldTailYState.length; bpi++) {
          newParaYState[fromPara + bpi] = oldTailYState[bpi];
        }
      }
      _layoutStats.stoppedAt = pi;
      break;
    }

    var para = doc.paragraphs[pi];
    var ps = para.style;
    var curRole = ps["x-role"] || "body";
    /* Body paragraphs read lineHeight from bookDesign template.
       Non-body roles (headings, blockQuote, etc.) use their
       paragraph style as before. */
    var ls;
    if (curRole === "body" && doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.body) {
      ls = doc.bookDesign.chapter.body.lineHeight || 1.2;
    } else {
      ls = ps.lineHeight || 1.2;
    }

    /* Body paragraphs read textAlign from bookDesign template.
       Non-body roles use their paragraph style as before. */
    var _paraTextAlign = ps.textAlign || "left";
    if (curRole === "body" && doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.body) {
      _paraTextAlign = doc.bookDesign.chapter.body.textAlign || "left";
    }

    /* Page Break: force new page and emit a single empty line marker */
    if (curRole === "pageBreak") {
      if (y > M_TOP + 0.5) { currentPage++; y = M_TOP; }
      lines.push({
        page: currentPage, y: y, height: 0, baseline: y,
        maxFs: 12, paraIdx: pi, segments: [],
        leftEdge: M_LEFT, isPageBreak: true
      });
      continue;
    }

    /* Image block: compute dimensions, emit a single sized line */
    if (curRole === "image") {
      var imgW = (ps.imageWidthPt || 200) * PT_TO_PX;
      var imgH = (ps.imageHeightPt || 150) * PT_TO_PX;
      /* Constrain to content width */
      if (imgW > CONTENT_W) {
        var scl = CONTENT_W / imgW;
        imgW = CONTENT_W;
        imgH *= scl;
      }
      /* Clamp to max page content height */
      var maxH = PAGE_H - M_TOP - M_BOT;
      if (imgH > maxH) {
        var scl2 = maxH / imgH;
        imgH = maxH;
        imgW *= scl2;
      }
      /* Spacing before */
      var spaceBefore = (ps.marginTop || 0) * PT_TO_PX;
      if (spaceBefore > 0 && y > M_TOP + 0.5) y += spaceBefore;
      /* Page break if image doesn't fit remaining space */
      if (y + imgH > PAGE_H - M_BOT && y > M_TOP + 1) {
        currentPage++;
        y = M_TOP;
      }
      /* Compute x from alignment */
      var imgX = M_LEFT;
      if (ps.textAlign === "center") imgX = M_LEFT + (CONTENT_W - imgW) / 2;
      else if (ps.textAlign === "right") imgX = M_LEFT + CONTENT_W - imgW;
      lines.push({
        page: currentPage, y: y, height: imgH, baseline: y + imgH,
        maxFs: 12, paraIdx: pi, segments: [],
        leftEdge: M_LEFT, isImage: true,
        imageX: imgX, imageW: imgW, imageH: imgH
      });
      y += imgH;
      /* Spacing after */
      var spaceAfter = (ps.marginBottom || 0) * PT_TO_PX;
      if (spaceAfter > 0) y += spaceAfter;
      continue;
    }

    var tokens = tokenizePara(para, pi);

    /* ── Chapter heading title: override token fonts from template ──
       For chapterTitle paragraphs in chapter sections, replace font
       properties on all tokens with template title values. This makes
       the title render in the template font (e.g., 20pt bold) instead
       of the paragraph's default run font (12pt normal).
       The _isChapterHeading flag is reused by the heading block
       positioning code and spaceAfter override below.              */
    var _isChapterHeading = false;
    var _chSecId = null;
    if (curRole === "chapterTitle" && doc.bookDesign && doc.bookDesign.chapter) {
      _chSecId = sectionOfPara(pi);
      var _chSecType = null;
      if (_sectionIndex && _sectionIndex.byId[_chSecId]) {
        _chSecType = _sectionIndex.byId[_chSecId].type;
      } else if (doc._sectionMeta) {
        for (var _csmi = 0; _csmi < doc._sectionMeta.length; _csmi++) {
          if (doc._sectionMeta[_csmi].id === _chSecId) {
            _chSecType = doc._sectionMeta[_csmi].type;
            break;
          }
        }
      }
      _isChapterHeading = (_chSecType === "chapter");
    }

    if (_isChapterHeading) {
      var _ttpl = doc.bookDesign.chapter.heading.title;
      var _tFontObj = {
        fontFamily: _ttpl.fontFamily || "Georgia",
        fontSize: _ttpl.fontSize || 20,
        fontWeight: _ttpl.fontWeight || "bold",
        fontStyle: _ttpl.fontStyle || "normal"
      };
      var _tFont = fontStr(_tFontObj);
      for (var _ti = 0; _ti < tokens.length; _ti++) {
        tokens[_ti].fontFamily = _tFontObj.fontFamily;
        tokens[_ti].fontSize = _tFontObj.fontSize;
        tokens[_ti].fontWeight = _tFontObj.fontWeight;
        tokens[_ti].fontStyle = _tFontObj.fontStyle;
        tokens[_ti].color = _ttpl.color || "#1a1a1a";
        tokens[_ti].font = _tFont;
        /* Recompute width with new font */
        measureCtx.font = _tFont;
        tokens[_ti].width = measureCtx.measureText(tokens[_ti].text).width;
      }
    }

    /* ── Body text: override default tokens from template ──
       For body paragraphs, replace token properties that match
       the cascade baseline (bookDefaults.run) with bookDesign
       template values. Tokens the user explicitly changed to a
       different value are preserved. This is selective override,
       not blanket — bold, italic, links, user-chosen fonts all
       survive. Only "still at default" properties are replaced. */
    var _isTemplateBody = false;
    if (curRole === "body" && doc.bookDesign && doc.bookDesign.chapter
        && doc.bookDesign.chapter.body) {
      _isTemplateBody = true;
      var _bdBody = doc.bookDesign.chapter.body;
      var _bdRun = (doc.bookDefaults && doc.bookDefaults.run)
        ? doc.bookDefaults.run : { fontFamily: "Georgia", fontSize: 12, color: "#1a1a1a" };

      for (var _bi = 0; _bi < tokens.length; _bi++) {
        var _bt = tokens[_bi];
        var _changed = false;

        /* fontFamily: replace if still at cascade default */
        if (_bt.fontFamily === _bdRun.fontFamily
            && _bdBody.fontFamily
            && _bdBody.fontFamily !== _bdRun.fontFamily) {
          _bt.fontFamily = _bdBody.fontFamily;
          _changed = true;
        }

        /* fontSize: replace if still at cascade default */
        if (_bt.fontSize === _bdRun.fontSize
            && _bdBody.fontSize
            && _bdBody.fontSize !== _bdRun.fontSize) {
          _bt.fontSize = _bdBody.fontSize;
          _changed = true;
        }

        /* color: replace if still at cascade default */
        if (_bt.color === _bdRun.color
            && _bdBody.color
            && _bdBody.color !== _bdRun.color) {
          _bt.color = _bdBody.color;
          _changed = true;
        }

        /* Rebuild font string and remeasure if anything changed */
        if (_changed) {
          _bt.font = fontStr({
            fontFamily: _bt.fontFamily,
            fontSize: _bt.fontSize,
            fontWeight: _bt.fontWeight,
            fontStyle: _bt.fontStyle
          });
          measureCtx.font = _bt.font;
          _bt.width = measureCtx.measureText(_bt.text).width;
        }
      }
    }

    /* Compute first-line indent in pixels. Rule: no indent on body
       paragraph immediately following a chapterTitle paragraph.
       Indent applies only to the first line; continuation lines
       are flush to the paragraph's left margin. */
    /* Body paragraphs read textIndent from bookDesign template.
       Non-body roles use their paragraph style as before.
       Indent suppression after chapterTitle/sceneBreak still applies. */
    var indentPt;
    if (curRole === "body" && doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.body) {
      indentPt = doc.bookDesign.chapter.body.textIndent || 0;
    } else {
      indentPt = ps.textIndent || 0;
    }
    if (curRole === "body" && pi > 0) {
      var prevRole = doc.paragraphs[pi - 1].style["x-role"] || "body";
      if (prevRole === "chapterTitle" || prevRole === "sceneBreak") indentPt = 0;
    }
    var indentPx = indentPt * PT_TO_PX;
    var marginLeftPx = (ps.marginLeft || 0) * PT_TO_PX;
    var marginRightPx = (ps.marginRight || 0) * PT_TO_PX;

    /* List paragraphs: hanging indent replaces first-line indent.
       All lines are indented by (level+1)*LIST_INDENT_PT. The prefix
       is drawn in the renderer at level*LIST_INDENT_PT. */
    var listIndentPx = 0;
    if (ps["x-list"] && ps["x-list"].type) {
      var listLevel = ps["x-list"].level || 0;
      listIndentPx = (listLevel + 1) * LIST_INDENT_PT * PT_TO_PX;
      indentPx = 0;
    }

    var isFirstLine = true;

    /* Drop cap: check paragraph-level property.
       If this paragraph has dropCap enabled and is a body paragraph with text,
       compute the DC geometry, strip DC chars, and verify 3-line minimum. */
    var dcInfo = null;
    var dcLinesRemaining = 0;
    if (para.style["x-dropCap"] && para.style["x-dropCap"].enabled && curRole === "body") {
      var dcCandidate = computeDropCap(para, para.runs[0].fontSize || 12, ls, PT_TO_PX);
      if (dcCandidate) {
        /* Save original tokens in case DC must be skipped (< 3 lines) */
        var origTokens = tokens.slice();
        /* Strip first skipChars characters from token stream */
        var charsToStrip = dcCandidate.skipChars;
        var newTokens = [];
        for (var ti2 = 0; ti2 < tokens.length; ti2++) {
          var tok2 = tokens[ti2];
          if (charsToStrip <= 0) { newTokens.push(tok2); continue; }
          var tokLen = tok2.text.length;
          if (charsToStrip >= tokLen) {
            charsToStrip -= tokLen;
            continue; /* entire token consumed */
          }
          /* Partial strip: trim leading chars from this token */
          var remaining = tok2.text.slice(charsToStrip);
          measureCtx.font = tok2.font;
          var newW = measureCtx.measureText(remaining).width;
          var trimmed = {};
          for (var k in tok2) trimmed[k] = tok2[k];
          trimmed.text = remaining;
          trimmed.width = newW;
          trimmed.startOff = tok2.startOff + charsToStrip;
          charsToStrip = 0;
          newTokens.push(trimmed);
        }
        tokens = newTokens;

        /* 3-line minimum check: simulate word-wrap at DC-zone width.
           If the remaining text cannot fill at least dropLines lines,
           skip the drop cap and restore original tokens. */
        var testAvailW = (PAGE_W - M_RIGHT - marginRightPx) - (M_LEFT + marginLeftPx + dcCandidate.width + dcCandidate.gapPx);
        var simLineCount = 1, simLineW = 0;
        for (var ti3 = 0; ti3 < tokens.length; ti3++) {
          var tok3 = tokens[ti3];
          if (simLineW === 0 && tok3.isSpace) continue;
          if (simLineW > 0 && simLineW + tok3.width > testAvailW && !tok3.isSpace) {
            simLineCount++;
            simLineW = tok3.width;
          } else {
            simLineW += tok3.width;
          }
        }
        if (simLineCount >= dcCandidate.dropLines) {
          dcInfo = dcCandidate;
          dcLinesRemaining = dcInfo.dropLines;
          /* Suppress first-line indent when drop cap is active */
          indentPx = 0;
        } else {
          /* Not enough lines for drop cap — restore original tokens, skip DC,
             and auto-clear the invalid enabled state from the document model. */
          tokens = origTokens;
          para.style["x-dropCap"].enabled = false;
        }
      }
    }

    /* ── Lead-in small caps ──
       Apply optically corrected small caps to the first N
       words of body paragraphs that follow a chapter title.
       Reads config from bookDesign.chapter.body.firstParagraph
       .leadIn. Uses applySmallCaps which is general-purpose —
       no chapter-specific logic inside it.
       Works with or without drop cap: tokens may be
       DC-stripped, but token.startOff is absolute so word
       boundary detection is correct. */
    if (curRole === "body" && pi > 0) {
      var prevRoleLI = doc.paragraphs[pi - 1].style["x-role"]
        || "body";
      if (prevRoleLI === "chapterTitle") {
        var bdLI = doc.bookDesign;
        if (bdLI && bdLI.chapter && bdLI.chapter.body
            && bdLI.chapter.body.firstParagraph
            && bdLI.chapter.body.firstParagraph.leadIn
            && bdLI.chapter.body.firstParagraph.leadIn.enabled) {
          var liCfg = bdLI.chapter.body.firstParagraph.leadIn;
          var liBodyFs = para.runs[0].fontSize || 12;
          var liFontFam = para.runs[0].fontFamily || "Georgia";
          applySmallCaps(tokens, para, liFontFam, liBodyFs,
            liCfg, PT_TO_PX);
        }
      }
    }

    /* Apply paragraph spacing before. Suppress at top of page
       to prevent blank space above first paragraph on a page. */
    /* Scene break paragraphs read spacing from bookDesign template.
       All other roles read from paragraph style as before. */
    var spaceBefore;
    if (curRole === "sceneBreak" && doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.sceneBreak) {
      spaceBefore = (doc.bookDesign.chapter.sceneBreak.spacingAbove || 0) * PT_TO_PX;
    } else {
      spaceBefore = (ps.marginTop || 0) * PT_TO_PX;
    }
    if (spaceBefore > 0 && y > M_TOP + 0.5) y += spaceBefore;

    /* ── Heading Block: position chapterTitle below template label ──
       For chapterTitle paragraphs in chapter sections, override Y
       to account for the heading label+number above the title.
       The label is positioned at dropFromTop from the page top.
       The title is positioned below the label with spacing.
       Uses _isChapterHeading flag set during token override above. */
    if (_isChapterHeading) {
      var _hbTpl = doc.bookDesign.chapter.heading;
      var _hbLayout = _hbTpl.layout;

      /* Compute label position from template dropFromTop */
      var _hbDropPx = (_hbLayout.dropFromTop || 154) * PT_TO_PX;
      if (_hbDropPx < M_TOP) _hbDropPx = M_TOP;
      var _hbLabelFsPx = ((_hbTpl.label && _hbTpl.label.fontSize) || 11) * PT_TO_PX;
      var _hbSpacingPx = ((_hbLayout.spacingLabelToTitle) || 8) * PT_TO_PX;

      /* Title Y: label position + label height + spacing */
      y = _hbDropPx + _hbLabelFsPx + _hbSpacingPx;

      /* Compute chapter number and build label text */
      var _hbChNum = computeChapterNumber(_chSecId);
      var _hbLabelText = buildHeadingLabel(doc.bookDesign.chapter, _hbChNum);

      /* Build label font string */
      var _hbLabelFont = "";
      if (_hbTpl.label.fontStyle === "italic") _hbLabelFont += "italic ";
      if (_hbTpl.label.fontWeight === "bold") _hbLabelFont += "bold ";
      _hbLabelFont += _hbTpl.label.fontSize + "pt " + _hbTpl.label.fontFamily;

      /* Store heading block render data for this page */
      _headingBlocks[currentPage] = {
        labelText: _hbLabelText,
        labelFont: _hbLabelFont,
        labelColor: _hbTpl.label.color || "#666666",
        labelY: _hbDropPx,
        alignment: _hbLayout.alignment || "center",
        pageWidth: PAGE_W,
        labelFontSizePx: _hbLabelFsPx,
        labelLetterSpacing: _hbTpl.label.letterSpacing || 0,
        labelUnderline: _hbTpl.label.underline === true
      };
    }

    var lineTokens = [];
    var lineWidth = 0;
    var lineMaxFs = 12;

    /* Compute left edge and available width. marginLeftPx applies
       to all lines; indentPx applies only to the first line.
       Drop cap exclusion zone: first N lines are offset by
       dcWidth + gapPx (pure metrics, no compensation). */
    function getLineMetrics() {
      var dcOffset = (dcInfo && dcLinesRemaining > 0) ? (dcInfo.width + dcInfo.gapPx) : 0;
      var le = M_LEFT + marginLeftPx + listIndentPx + (isFirstLine ? indentPx : 0) + dcOffset;
      var aw = (PAGE_W - M_RIGHT - marginRightPx) - le;
      return { leftEdge: le, availW: aw };
    }

    var lm = getLineMetrics();

    /* Commits accumulated tokens as a finished line. Handles
       page overflow, computes baseline, and applies alignment.
       After commit, flips isFirstLine to false and recomputes
       line metrics for continuation lines. */
    function commitLine(tokens, maxFs, paraStyle) {
      var curLm = getLineMetrics();
      var m = fontMetrics(maxFs);
      var lh = (m.ascent + m.descent) * ls;
      if (y + lh > PAGE_H - M_BOT && y > M_TOP + 1) {
        currentPage++;
        y = M_TOP;
      }
      var baseline = y + m.ascent * ls;

      /* Build segments with x positions */
      var segments = [];
      var x = curLm.leftEdge;
      for (var ti = 0; ti < tokens.length; ti++) {
        var tok = tokens[ti];
        segments.push({
          x: x, text: tok.text, font: tok.font,
          width: tok.width, isSpace: tok.isSpace,
          fontFamily: tok.fontFamily, fontSize: tok.fontSize, fontWeight: tok.fontWeight, fontStyle: tok.fontStyle,
          textDecoration: tok.textDecoration, color: tok.color,
          "x-script": tok["x-script"] || "normal", "x-linkHref": tok["x-linkHref"] || null,
          backgroundColor: tok.backgroundColor || null,
          kerning: tok.kerning || null,
          strokeWidth: tok.strokeWidth || null,
          paraIdx: tok.paraIdx, startOff: tok.startOff, endOff: tok.endOff
        });
        x += tok.width;
      }

      /* Apply alignment offset */
      var textWidth = x - curLm.leftEdge;
      var offset = 0;
      if (paraStyle.textAlign === "center") offset = (curLm.availW - textWidth) / 2;
      else if (paraStyle.textAlign === "right") offset = curLm.availW - textWidth;
      else if (paraStyle.textAlign === "justify" && tokens.length > 1) {
        var gaps = 0;
        for (var ti = 0; ti < tokens.length; ti++) {
          if (tokens[ti].isSpace) gaps++;
        }
        if (gaps > 0) {
          var extra = (curLm.availW - textWidth) / gaps;
          var shift = 0;
          for (var si = 0; si < segments.length; si++) {
            segments[si].x += shift;
            if (segments[si].isSpace) shift += extra;
          }
        }
        offset = 0;
      }
      if (offset > 0) {
        for (var si = 0; si < segments.length; si++) segments[si].x += offset;
      }

      lines.push({
        page: currentPage, y: y, height: lh, baseline: baseline,
        maxFs: maxFs, paraIdx: pi, segments: segments,
        leftEdge: curLm.leftEdge, isFirstOfPara: isFirstLine,
        dropCap: (isFirstLine && dcInfo) ? dcInfo : null
      });
      y += lh;

      /* After first line committed, switch to flush left for continuation */
      if (isFirstLine) {
        isFirstLine = false;
        lm = getLineMetrics();
      }
      /* Drop cap zone: decrement lines remaining, recompute metrics when exiting zone */
      if (dcInfo && dcLinesRemaining > 0) {
        dcLinesRemaining--;
        if (dcLinesRemaining === 0) lm = getLineMetrics();
      }
    }

    /* Title alignment override: chapter headings may have
       independent alignment from the paragraph style.
       Create a shallow copy with the template alignment
       so commitLine uses the correct textAlign. */
    var _linePs = ps;
    /* Body textAlign from template */
    if (_isTemplateBody && _paraTextAlign !== ps.textAlign) {
      _linePs = {};
      for (var _pk in ps) _linePs[_pk] = ps[_pk];
      _linePs.textAlign = _paraTextAlign;
    }
    if (_isChapterHeading) {
      var _tAlign = doc.bookDesign.chapter.heading.title.alignment;
      if (_tAlign) {
        _linePs = {};
        for (var _pk in ps) _linePs[_pk] = ps[_pk];
        _linePs.textAlign = _tAlign;
      }
    }

    for (var ti = 0; ti < tokens.length; ti++) {
      var tok = tokens[ti];
      if (lineWidth === 0 && tok.isSpace) continue;
      if (lineWidth > 0 && lineWidth + tok.width > lm.availW && !tok.isSpace) {
        commitLine(lineTokens, lineMaxFs, _linePs);
        lineTokens = [];
        lineWidth = 0;
        lineMaxFs = 12;
      }
      lineTokens.push(tok);
      lineWidth += tok.width;
      if (tok.fontSize > lineMaxFs) lineMaxFs = tok.fontSize;
    }

    /* Commit remaining tokens or create empty line for empty paragraphs */
    if (lineTokens.length === 0) {
      var emptyFont = fontStr(para.runs[0]);
      lineTokens.push({
        text: "", font: emptyFont, width: 0,
        isSpace: false, fontFamily: para.runs[0].fontFamily, fontSize: para.runs[0].fontSize,
        fontWeight: "normal", fontStyle: "normal", textDecoration: "none",
        color: para.runs[0].color, paraIdx: pi, runIdx: 0,
        startOff: 0, endOff: 0
      });
    }
    commitLine(lineTokens, lineMaxFs, _linePs);
    lineTokens = [];
    lineWidth = 0;
    lineMaxFs = 12;

    /* Scene break and chapter heading paragraphs read spacing
       from bookDesign template. All other roles read from
       paragraph style as before. */
    var spaceAfter;
    if (curRole === "sceneBreak" && doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.sceneBreak) {
      spaceAfter = (doc.bookDesign.chapter.sceneBreak.spacingBelow || 0) * PT_TO_PX;
    } else if (_isChapterHeading && doc.bookDesign.chapter.heading.layout) {
      spaceAfter = (doc.bookDesign.chapter.heading.layout.spacingToBody || 0) * PT_TO_PX;
    } else {
      spaceAfter = (ps.marginBottom || 0) * PT_TO_PX;
    }
    if (spaceAfter > 0) y += spaceAfter;
  }

  /* Calculate total page count and build linesByPage index */
  totalPages = 1;
  linesByPage = {};
  for (var i = 0; i < lines.length; i++) {
    var pg = lines[i].page;
    if (pg + 1 > totalPages) totalPages = pg + 1;
    if (!linesByPage[pg]) linesByPage[pg] = [];
    linesByPage[pg].push(lines[i]);
  }
  /* Guard: totalPages must never shrink below the full-document page count.
     During partial realization, lines[] may only cover a subset of pages,
     but newParaYState always spans the full document. */
  for (var tpi = 0; tpi < newParaYState.length; tpi++) {
    if (newParaYState[tpi] && newParaYState[tpi].page + 1 > totalPages) {
      totalPages = newParaYState[tpi].page + 1;
    }
  }

  /* Even page count: physical books require an even number of pages.
     Every sheet of paper has two sides (recto + verso). */
  if (totalPages % 2 !== 0) {
    totalPages++;
  }

  /* Atomic swap: _paraYState is only ever replaced, never mutated during layout */
  _paraYState = newParaYState;

  /* Update layout region tracking (always needed) */
  if (typeof layoutRegion !== "undefined") layoutRegion.updateAfterLayout();

  /* DOM sync — skip during on-demand realization to avoid re-entrancy
     with render/scroll. Only performed during normal edit-triggered layout. */
  if (!_skipDOMSync) {
    syncPages();
    applyZoom();
    if (typeof spellRefresh === "function") spellRefresh();

    /* Update drop-cap button enabled/disabled state based on current cursor paragraph. */
    var dcBtn = document.getElementById("btn-dropcap");
    if (dcBtn && typeof cursor !== "undefined" && doc.paragraphs[cursor.p]) {
      var dcRole = doc.paragraphs[cursor.p].style["x-role"] || "body";
      var dcLC = (typeof layoutRegion !== "undefined") ? layoutRegion.paraLineCount(cursor.p) : 0;
      dcBtn.disabled = (dcRole !== "body" || dcLC < 3);
    }
  }
  _pipelineGen.layout++;
  rebuildSectionIndex();
}/* ================================================================
   LAYOUT REGION: Boundary between Tier 1 global index and Tier 2
   realized line geometry.

   TIER 1 — GLOBAL INDEX (cheap, always resident, full document):
   - _paraYState[pi] = {page, y} — paragraph page/position state
   - totalPages — page count
   - doc.paragraphs.length — paragraph count
   Tier 1 is NEVER evicted or truncated. It must always span the
   full document. It is the source of truth for page assignments,
   scroll position mapping, and totalPages.

   TIER 2 — REALIZED GEOMETRY (expensive, partially materialized):
   - lines[] — realized line objects with segments, positions, widths
   - linesByPage — page-to-lines index
   Tier 2 is windowed. Only a contiguous range of paragraphs has
   realized geometry at any time. Far regions are evicted to save
   memory. The scroll pipeline re-realizes on demand via
   ensureRealized() / ensurePagesRealized().

   CRITICAL RULES:
   - render() must NEVER trigger realization (use linesForPageDirect)
   - _paraYState must NEVER be destructively modified during layout
   - eviction must NEVER modify _paraYState or totalPages
   ================================================================ */

var layoutRegion = {
  /* Realized paragraph range [from, to). After full runLayout, this
     covers the entire document. After eviction, this covers only the
     retained window. ensureRealized() expands it on demand. */
  realizedFrom: 0,
  realizedTo: 0,

  /* OWNED GEOMETRY STATE — populated by updateAfterLayout().
     These are the authoritative references for all consumer access.
     runLayout() builds into global work arrays; updateAfterLayout()
     takes ownership of the results and builds derived indexes. */
  _lines: [],             /* realized line objects (ordered) */
  _linesByPage: {},       /* page → [line, ...] index */
  _paraLines: {},         /* paraIdx → [line, ...] index (excludes page-break markers) */
  _paraLineOffsets: {},   /* paraIdx → first global index in _lines for this para */

  /* Update after layout pass completes. Takes ownership of the global
     work arrays and builds per-paragraph line indexes.
     fromPara/toPara describe the freshly-materialized range. Lines
     outside this range may exist from prior passes or tail-restore. */
  updateAfterLayout: function() {
    /* Compute actual realized range from the lines array */
    var rFrom = 0;
    var rTo = doc.paragraphs.length;
    if (lines.length > 0) {
      rFrom = lines[0].paraIdx;
      rTo = lines[lines.length - 1].paraIdx + 1;
    }
    this.realizedFrom = rFrom;
    this.realizedTo = rTo;
    /* Take ownership of layout output */
    this._lines = lines;
    this._linesByPage = linesByPage;
    /* Build per-paragraph line indexes */
    this._paraLines = {};
    this._paraLineOffsets = {};
    for (var i = 0; i < this._lines.length; i++) {
      var pi = this._lines[i].paraIdx;
      if (!(pi in this._paraLineOffsets)) this._paraLineOffsets[pi] = i;
      if (!this._lines[i].isPageBreak) {
        if (!this._paraLines[pi]) this._paraLines[pi] = [];
        this._paraLines[pi].push(this._lines[i]);
      }
    }
  },

  /* Check if a paragraph has realized line geometry */
  isRealized: function(pi) {
    return pi >= this.realizedFrom && pi < this.realizedTo;
  },

  /* Check if a page has realized line geometry */
  isPageRealized: function(pg) {
    return pg >= 0 && pg < totalPages && !!this._linesByPage[pg];
  },

  _realizing: false,  /* re-entrancy guard */

  /* Ensure layout is realized for a paragraph range.
     Handles front gaps and tail gaps separately:
     - Front gap (fromPara < realizedFrom): run from gap start to convergence
     - Tail gap (toPara > realizedTo): run from realized end with bounded stop
     Uses _skipDOMSync to avoid DOM mutation during refill.
     Returns true if range is now realized. */
  ensureRealized: function(fromPara, toPara) {
    if (fromPara >= this.realizedFrom && toPara <= this.realizedTo) return true;
    if (this._realizing) return false; /* re-entrancy guard */
    this._realizing = true;
    _pipelineGen.realize++;
    _skipDOMSync = true;

    /* Front gap: fromPara is before current realized start */
    if (fromPara < this.realizedFrom) {
      var gapStart = fromPara;
      if (_paraYState[gapStart]) {
        runLayout(gapStart); /* convergence merges with existing lines */
      }
    }

    /* Tail gap: toPara is beyond current realized end */
    if (toPara > this.realizedTo) {
      var tailStart = this.realizedTo;
      if (tailStart < doc.paragraphs.length && _paraYState[tailStart]) {
        runLayout(tailStart, toPara); /* bounded: produce only the needed tail */
      }
    }

    _skipDOMSync = false;
    this._realizing = false;
    return (fromPara >= this.realizedFrom && toPara <= this.realizedTo);
  },

  /* Ensure layout is realized for a page range.
     Translates page range to paragraph range using _paraYState.
     Uses a verified-widening loop: after realization, checks that
     every requested page has lines in _linesByPage. If any page
     is missing (paragraph spanning from a prior page), widens the
     paragraph range backward and re-realizes. Deterministic, not
     heuristic — verifies the result, not guesses the range. */
  ensurePagesRealized: function(fromPage, toPage) {
    /* Find paragraph range from _paraYState */
    var pFrom = -1, pTo = -1;
    for (var pi = 0; pi < _paraYState.length; pi++) {
      if (_paraYState[pi] && _paraYState[pi].page >= fromPage && pFrom < 0) pFrom = pi;
      if (_paraYState[pi] && _paraYState[pi].page <= toPage) pTo = pi + 1;
    }
    if (pFrom < 0) pFrom = 0;
    if (pTo < 0) pTo = doc.paragraphs.length;

    /* Verified-widening loop: realize, verify, widen if needed */
    var MAX_WIDEN = 4;
    for (var attempt = 0; attempt <= MAX_WIDEN; attempt++) {
      this.ensureRealized(pFrom, pTo);
      /* Verify: every page in [fromPage, toPage] must have lines */
      var allPresent = true;
      for (var pg = fromPage; pg <= toPage; pg++) {
        if (!this._linesByPage[pg]) { allPresent = false; break; }
      }
      if (allPresent) return true;
      /* Widen backward: include more paragraphs that may span into the range */
      var widen = Math.min(pFrom, 5);
      if (widen === 0) break; /* can't go further back */
      pFrom -= widen;
    }
    return false; /* couldn't fill all pages — should be extremely rare */
  },

  /* LIGHTWEIGHT GLOBAL INDEX QUERIES — use _paraYState, not lines[].
     These are cheap and always available after any layout pass. */

  /* Which page is paragraph pi on? Returns -1 if unknown. */
  paraPage: function(pi) {
    return (_paraYState[pi]) ? _paraYState[pi].page : -1;
  },

  /* Which page contains document position {p, o}? */
  pageForPos: function(pos) {
    return this.paraPage(pos.p);
  },

  /* How many lines does paragraph pi have? Uses per-paragraph index. */
  paraLineCount: function(pi) {
    if (!this.isRealized(pi)) return -1;
    return (this._paraLines[pi]) ? this._paraLines[pi].length : 0;
  },

  /* Get lines for a page. Ensures the page is realized first.
     Returns array of line objects, or null if page is out of range. */
  linesForPage: function(pg) {
    if (pg < 0 || pg >= totalPages) return null;
    this.ensurePagesRealized(pg, pg);
    return this._linesByPage[pg] || null;
  },

  /* Get lines for a paragraph. Uses per-paragraph index.
     Returns array of line objects (excluding page-break markers). */
  linesForPara: function(pi) {
    this.ensureRealized(pi, pi + 1);
    return this._paraLines[pi] || [];
  },

  /* NON-REALIZING accessors — return what's already realized.
     Used by render() to avoid triggering layout mutations mid-paint. */
  linesForPageDirect: function(pg) {
    return this._linesByPage[pg] || null;
  },

  /* ORDERED LINE ACCESS — for vertical navigation (ArrowUp/Down).
     These provide global-ordered line access through the realization
     boundary. Vertical navigation inherently needs cross-paragraph
     line adjacency, so these expose the global ordering explicitly. */

  /* Total number of realized lines. */
  lineCount: function() { return this._lines.length; },

  /* Get a line by global index. Returns null if out of range. */
  lineAt: function(i) {
    if (i < 0 || i >= this._lines.length) return null;
    return this._lines[i];
  },

  /* Find the global line index for a document position.
     Uses per-paragraph offset index for fast paragraph lookup,
     then scans only that paragraph's lines. */
  lineIndexForPos: function(pos) {
    this.ensureRealized(pos.p, pos.p + 1);
    /* Use paragraph offset to start scan at the right place */
    var startIdx = this._paraLineOffsets[pos.p];
    if (startIdx !== undefined) {
      for (var i = startIdx; i < this._lines.length; i++) {
        var line = this._lines[i];
        if (line.paraIdx !== pos.p) break;
        var segs = line.segments;
        if (segs.length === 0) continue;
        if (pos.o >= segs[0].startOff && pos.o < segs[segs.length - 1].endOff) return i;
      }
      /* Fallback: last line of this paragraph */
      for (var i = startIdx; i < this._lines.length; i++) {
        if (this._lines[i].paraIdx !== pos.p) return Math.max(startIdx, i - 1);
      }
      return this._lines.length - 1;
    }
    /* Full fallback if no offset cached */
    for (var i = this._lines.length - 1; i >= 0; i--) {
      if (this._lines[i].paraIdx === pos.p) return i;
    }
    return 0;
  },

  /* ================================================================
     EVICTION: Controlled removal of far realized layout geometry.
     Keeps a contiguous window of realized paragraphs and trims
     lines outside that window. ensureRealized() refills on demand.
     ================================================================ */

  EVICT_PAGE_BUFFER: 5,   /* pages beyond visible range to retain */
  _lastEvictCheck: 0,     /* timestamp of last eviction check */
  EVICT_THROTTLE_MS: 500, /* minimum interval between eviction checks */

  /* Evict realized geometry outside [retainFrom, retainTo).
     Keeps _paraYState intact (lightweight global index).
     Rebuilds _lines, _linesByPage, _paraLines, _paraLineOffsets.
     Returns number of lines evicted. */
  evictOutsideWindow: function(retainFrom, retainTo) {
    if (retainFrom <= this.realizedFrom && retainTo >= this.realizedTo) return 0;
    retainFrom = Math.max(0, retainFrom);
    retainTo = Math.min(doc.paragraphs.length, retainTo);
    if (retainTo <= retainFrom) return 0;

    var oldCount = this._lines.length;
    var kept = [];
    for (var i = 0; i < this._lines.length; i++) {
      var pi = this._lines[i].paraIdx;
      if (pi >= retainFrom && pi < retainTo) kept.push(this._lines[i]);
    }
    if (kept.length === oldCount) return 0; /* nothing to evict */

    /* Update owned state */
    this._lines = kept;
    lines = kept; /* sync global work array reference */
    this.realizedFrom = retainFrom;
    this.realizedTo = retainTo;

    /* Rebuild all indexes from the trimmed lines */
    this._linesByPage = {};
    this._paraLines = {};
    this._paraLineOffsets = {};
    linesByPage = this._linesByPage; /* sync global reference */
    totalPages = 1;
    for (var i = 0; i < this._lines.length; i++) {
      var pi = this._lines[i].paraIdx;
      var pg = this._lines[i].page;
      if (pg + 1 > totalPages) totalPages = pg + 1;
      if (!this._linesByPage[pg]) this._linesByPage[pg] = [];
      this._linesByPage[pg].push(this._lines[i]);
      if (!(pi in this._paraLineOffsets)) this._paraLineOffsets[pi] = i;
      if (!this._lines[i].isPageBreak) {
        if (!this._paraLines[pi]) this._paraLines[pi] = [];
        this._paraLines[pi].push(this._lines[i]);
      }
    }
    /* Restore totalPages from _paraYState (eviction doesn't change page count) */
    for (var pi = 0; pi < _paraYState.length; pi++) {
      if (_paraYState[pi] && _paraYState[pi].page + 1 > totalPages) {
        totalPages = _paraYState[pi].page + 1;
      }
    }
    /* Even page count: must match runLayout() rule */
    if (totalPages % 2 !== 0) totalPages++;

    _pipelineGen.evict++;
    return oldCount - kept.length;
  },

  /* Compute retention window and evict far geometry if needed.
     Called from scroll handler. Uses visible page range + buffer.
     POLICY: Two-sided eviction — keeps a contiguous window
     [retainFromPara, retainToPara) around the visible area.
     Always retains the cursor paragraph regardless of distance. */
  maybeEvict: function() {
    /* Throttle */
    var now = Date.now();
    if (now - this._lastEvictCheck < this.EVICT_THROTTLE_MS) return;
    this._lastEvictCheck = now;

    /* Need at least a full layout pass worth of _paraYState */
    if (_paraYState.length < doc.paragraphs.length) return;
    /* Don't evict during realization */
    if (this._realizing) return;

    /* Compute visible page range from pageWin */
    var visRange = pageWin.computeVisibleRange();
    var retainFromPage = Math.max(0, visRange.start - this.EVICT_PAGE_BUFFER);
    var retainToPage = Math.min(totalPages, visRange.end + this.EVICT_PAGE_BUFFER);

    /* Also retain currently mounted pages (prevents evicting what's being rendered) */
    if (pageWin.mountStart < retainFromPage) retainFromPage = pageWin.mountStart;
    if (pageWin.mountEnd > retainToPage) retainToPage = pageWin.mountEnd;

    /* Convert page range to paragraph range using _paraYState */
    var retainFromPara = 0;
    var retainToPara = doc.paragraphs.length;
    var foundFrom = false;
    for (var pi = 0; pi < _paraYState.length; pi++) {
      if (!_paraYState[pi]) continue;
      if (!foundFrom && _paraYState[pi].page >= retainFromPage) {
        retainFromPara = pi;
        foundFrom = true;
      }
      if (_paraYState[pi].page < retainToPage) {
        retainToPara = pi + 1;
      }
    }

    /* Always retain cursor paragraph */
    if (typeof cursor !== "undefined") {
      if (cursor.p < retainFromPara) retainFromPara = cursor.p;
      if (cursor.p + 1 > retainToPara) retainToPara = cursor.p + 1;
    }

    /* Only evict if we'd remove at least 10 paragraphs total */
    var currentRange = this.realizedTo - this.realizedFrom;
    var retainRange = retainToPara - retainFromPara;
    if (retainRange >= currentRange - 10) return;

    this.evictOutsideWindow(retainFromPara, retainToPara);
  }
};

/* Convert a document position to pixel coordinates and page index.
   Returns { x, y, page, lineHeight } or null if not found. Used
   for cursor rendering and scrolling into view. */
function posToCoords(pos) {
  var pLines = layoutRegion.linesForPara(pos.p);
  for (var li = 0; li < pLines.length; li++) {
    var line = pLines[li];
    for (var si = 0; si < line.segments.length; si++) {
      var seg = line.segments[si];
      if (pos.o >= seg.startOff && pos.o < seg.endOff) {
        var x = seg.x;
        var localOff = pos.o - seg.startOff;
        var cw = getSegCharWidths(seg);
        for (var k = 0; k < localOff && k < cw.length; k++) {
          x += cw[k];
        }
        return { x: x, y: line.baseline, page: line.page, lineHeight: line.height, lineY: line.y };
      }
    }
  }
  /* Fallback: last line for this paragraph */
  if (pLines.length > 0) {
    var line = pLines[pLines.length - 1];
    if (line.segments.length === 0) {
      return { x: line.leftEdge, y: line.baseline, page: line.page, lineHeight: line.height, lineY: line.y };
    }
    var lastSeg = line.segments[line.segments.length - 1];
    var x = lastSeg.x;
    var cw = getSegCharWidths(lastSeg);
    for (var k = 0; k < cw.length; k++) x += cw[k];
    return { x: x, y: line.baseline, page: line.page, lineHeight: line.height, lineY: line.y };
  }
  return { x: M_LEFT, y: M_TOP + 12 * 1.333, page: 0, lineHeight: 12 * 1.333 * 1.4, lineY: M_TOP };
}

