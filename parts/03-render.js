/* ================================================================
   PAGE WINDOW MANAGER: Virtualizes page canvas mounting.
   Only a small window of pages is mounted in the DOM at any time.
   Spacer divs maintain correct scroll position for unmounted pages.
   All code accesses page canvases through pageWin mapping.
   ================================================================ */

var pagesWrapper = document.getElementById("pages-wrapper");
var pageArea = document.getElementById("page-area");

/* Page Window Manager — the single source of truth for mounted pages. */
var pageWin = {
  BUFFER: 2,           /* pages before/after visible to pre-mount */
  mountStart: 0,       /* first document page currently mounted (inclusive) */
  mountEnd: 0,         /* last document page mounted (exclusive) */
  slots: [],           /* [{canvas, ctx, label, docPage}] for each mounted slot */
  spacerBefore: null,  /* spacer div before mounted pages */
  spacerAfter: null,   /* spacer div after mounted pages */
  _initialized: false,
  _cachedSlotH: 0,     /* cached measured slot height; 0 = needs measurement */

  /* Page slot height (CSS px): the vertical distance between the top of
     one page canvas and the top of the next, including all inter-page CSS
     gaps (canvas margin-bottom, page-number label layout).
     Measured from the real DOM when mounted pages exist. Cached until
     invalidated by zoom change or remount. */
  slotHeight: function() {
    if (this._cachedSlotH > 0) return this._cachedSlotH;
    /* Measure from DOM: requires 2+ mounted slots for an accurate
       top-to-top distance measurement. */
    if (this.slots.length >= 2) {
      var r0 = this.slots[0].canvas.getBoundingClientRect();
      var r1 = this.slots[1].canvas.getBoundingClientRect();
      this._cachedSlotH = Math.round(r1.top - r0.top);
      if (this._cachedSlotH > 0) return this._cachedSlotH;
    }
    /* Fallback for 1 slot: canvas CSS height + label contribution.
       Measure the actual label element height + margins. */
    if (this.slots.length >= 1) {
      var ch = this.slots[0].canvas.getBoundingClientRect().height;
      var lbl = this.slots[0].label;
      var lblStyle = window.getComputedStyle(lbl);
      var lblH = lbl.getBoundingClientRect().height
                 + parseFloat(lblStyle.marginTop)
                 + parseFloat(lblStyle.marginBottom);
      var canvasStyle = window.getComputedStyle(this.slots[0].canvas);
      var canvasMB = parseFloat(canvasStyle.marginBottom) || 0;
      this._cachedSlotH = Math.round(ch + canvasMB + lblH);
      if (this._cachedSlotH > 0) return this._cachedSlotH;
    }
    /* Final fallback: approximate from page dimensions (bootstrap only) */
    return Math.round(PAGE_H * zoom) + 40;
  },

  /* Wrapper padding-top (CSS px): measured from DOM, cached. */
  _cachedWrapPadTop: -1,
  wrapPaddingTop: function() {
    if (this._cachedWrapPadTop >= 0) return this._cachedWrapPadTop;
    var cs = window.getComputedStyle(pagesWrapper);
    this._cachedWrapPadTop = parseFloat(cs.paddingTop) || 0;
    return this._cachedWrapPadTop;
  },

  /* Invalidate geometry caches (called on zoom change and remount) */
  _invalidateGeomCache: function() {
    this._cachedSlotH = 0;
    this._cachedWrapPadTop = -1;
  },

  /* Initialize spacer elements (called once) */
  init: function() {
    if (this._initialized) return;
    this.spacerBefore = document.createElement("div");
    this.spacerBefore.style.width = "1px";
    this.spacerBefore.style.flexShrink = "0";
    this.spacerAfter = document.createElement("div");
    this.spacerAfter.style.width = "1px";
    this.spacerAfter.style.flexShrink = "0";
    pagesWrapper.appendChild(this.spacerBefore);
    pagesWrapper.appendChild(this.spacerAfter);
    this._initialized = true;
  },

  /* Get canvas for a document page index, or null if not mounted */
  canvasForPage: function(pg) {
    if (pg < this.mountStart || pg >= this.mountEnd) return null;
    var slot = this.slots[pg - this.mountStart];
    return slot ? slot.canvas : null;
  },

  /* Get 2d context for a document page index, or null if not mounted */
  ctxForPage: function(pg) {
    if (pg < this.mountStart || pg >= this.mountEnd) return null;
    var slot = this.slots[pg - this.mountStart];
    return slot ? slot.ctx : null;
  },

  /* Get all currently mounted canvas elements */
  mountedCanvases: function() {
    var arr = [];
    for (var i = 0; i < this.slots.length; i++) arr.push(this.slots[i].canvas);
    return arr;
  },

  /* Ensure a specific document page is mounted. Shifts window if needed.
     Returns the canvas element, or null if page is out of totalPages range. */
  ensureMounted: function(pg) {
    if (pg < 0 || pg >= totalPages) return null;
    if (pg >= this.mountStart && pg < this.mountEnd) return this.canvasForPage(pg);
    /* Need to shift window to include pg */
    var newStart = Math.max(0, pg - this.BUFFER);
    var newEnd = Math.min(totalPages, pg + this.BUFFER + 1);
    this._mountRange(newStart, newEnd);
    return this.canvasForPage(pg);
  },

  /* Compute which pages should be mounted based on scroll position.
     Accepts optional snapshot {scrollTop, viewH} for transactional use.
     Falls back to live DOM read if no snapshot provided. */
  computeVisibleRange: function(snap) {
    var scrollTop = snap ? snap.scrollTop : pageArea.scrollTop;
    var viewH = snap ? snap.viewH : pageArea.clientHeight;
    var sh = this.slotHeight();
    if (sh <= 0) return { start: 0, end: Math.min(1, totalPages) };
    var padTop = this.wrapPaddingTop();
    var firstVisible = Math.max(0, Math.floor((scrollTop - padTop) / sh));
    var lastVisible = Math.min(totalPages - 1, Math.floor((scrollTop + viewH - padTop) / sh));
    var start = Math.max(0, firstVisible - this.BUFFER);
    var end = Math.min(totalPages, lastVisible + this.BUFFER + 1);
    if (end <= start) end = Math.min(start + 1, totalPages);
    return { start: start, end: end };
  },

  /* Update mounted window from a scroll snapshot. Called on scroll.
     Uses the snapshot for all visible-range decisions. Gated by render
     generation to reject stale work if a newer snapshot arrived. */
  update: function(snap) {
    var range = this.computeVisibleRange(snap);
    var snapGen = snap ? snap.gen : 0;

    /* Pre-realize visible pages on every scroll tick.
       Track both boundaries to detect any realization change. */
    var preFrom = -1, preTo = -1;
    if (typeof layoutRegion !== "undefined") {
      preFrom = layoutRegion.realizedFrom;
      preTo = layoutRegion.realizedTo;
      layoutRegion.ensurePagesRealized(range.start, range.end - 1);
    }

    /* Stale-check: if a newer snapshot arrived during realization, skip render */
    if (snapGen > 0 && snapGen < _scrollSnap.gen) return;

    var realizationChanged = (typeof layoutRegion !== "undefined") &&
      (layoutRegion.realizedFrom !== preFrom || layoutRegion.realizedTo !== preTo);

    if (range.start === this.mountStart && range.end === this.mountEnd) {
      if (realizationChanged) { _renderGen = snapGen; render(); }
      return;
    }
    this._mountRange(range.start, range.end);
    _renderGen = snapGen;
    render();
  },

  /* Synchronize after layout changes (page count may have changed) */
  sync: function() {
    this.init();
    /* Recompute visible range for possibly new totalPages */
    var range = this.computeVisibleRange();
    this._mountRange(range.start, range.end);
  },

  /* Internal: mount a specific range [start, end) of document pages */
  _mountRange: function(start, end) {
    start = Math.max(0, start);
    end = Math.min(totalPages, end);
    if (end <= start) { start = 0; end = Math.min(1, totalPages); }

    /* Remove old slots */
    for (var i = 0; i < this.slots.length; i++) {
      pagesWrapper.removeChild(this.slots[i].label);
      pagesWrapper.removeChild(this.slots[i].canvas);
    }
    this.slots = [];

    /* Create new slots and insert into DOM */
    var frag = document.createDocumentFragment();
    for (var pg = start; pg < end; pg++) {
      var c = document.createElement("canvas");
      c.className = "page-canvas";
      c.setAttribute("data-page", pg);
      var label = document.createElement("div");
      label.className = "page-number";
      label.textContent = "Page " + (pg + 1);
      frag.appendChild(c);
      frag.appendChild(label);
      this.slots.push({ canvas: c, ctx: c.getContext("2d"), label: label, docPage: pg });
    }
    pagesWrapper.insertBefore(frag, this.spacerAfter);

    this.mountStart = start;
    this.mountEnd = end;

    /* Apply zoom to new canvases (also invalidates geometry cache) */
    this._applyZoom();

    /* Now measure slot height from the real DOM and update spacers */
    var sh = this.slotHeight();
    this.spacerBefore.style.height = (start * sh) + "px";
    this.spacerAfter.style.height = (Math.max(0, totalPages - end) * sh) + "px";
  },
  /* Internal: apply zoom to all mounted canvases and invalidate geometry cache */
  _applyZoom: function() {
    dpr = window.devicePixelRatio || 1;
    var cssW = Math.round(PAGE_W * zoom);
    var cssH = Math.round(PAGE_H * zoom);
    var bufW = Math.round(PAGE_W * zoom * dpr);
    var bufH = Math.round(PAGE_H * zoom * dpr);
    for (var i = 0; i < this.slots.length; i++) {
      var c = this.slots[i].canvas;
      c.width = bufW;
      c.height = bufH;
      c.style.width = cssW + "px";
      c.style.height = cssH + "px";
    }
    this._invalidateGeomCache();
  },

  /* Full re-zoom (called when zoom level changes).
     Order: resize canvases → invalidate cache → re-measure → update spacers. */
  applyZoom: function() {
    this._applyZoom();
    var sh = this.slotHeight();
    this.spacerBefore.style.height = (this.mountStart * sh) + "px";
    this.spacerAfter.style.height = (Math.max(0, totalPages - this.mountEnd) * sh) + "px";
  },

  /* Compute the pageArea.scrollTop value that positions a document-page
     coordinate at the vertical center of the visible editor pane.
     pg: document page index. yInPage: Y coordinate within the page
     (in layout units, pre-zoom). Returns the target scrollTop value. */
  scrollTopForPos: function(pg, yInPage) {
    var sh = this.slotHeight();
    var padTop = this.wrapPaddingTop();
    var posInScroll = padTop + pg * sh + yInPage * zoom;
    return Math.max(0, posInScroll - pageArea.clientHeight / 2);
  },

  /* Reveal a position: ensure page is mounted, set explicit scroll position,
     then re-render. pg: document page index. yInPage/heightInPage: layout
     coords (pre-zoom). Returns true if scroll was adjusted. */
  revealPosition: function(pg, yInPage, heightInPage) {
    if (pg < 0 || pg >= totalPages) return false;
    /* Mount the target page if needed */
    this.ensureMounted(pg);
    /* Compute position in scroll space */
    var sh = this.slotHeight();
    var padTop = this.wrapPaddingTop();
    var topInScroll = padTop + pg * sh + yInPage * zoom;
    var botInScroll = topInScroll + (heightInPage || 0) * zoom;
    var visTop = pageArea.scrollTop;
    var visBot = pageArea.scrollTop + pageArea.clientHeight;
    /* Already fully visible? */
    if (topInScroll >= visTop && botInScroll <= visBot) return false;
    /* Center the position in the visible pane */
    pageArea.scrollTop = Math.max(0, topInScroll - pageArea.clientHeight / 2);
    return true;
  }
};

function syncPages() {
  pageWin.sync();
}

function applyZoom() {
  if (!pageWin._initialized) return;
  pageWin.applyZoom();
}

/* Scroll listener: synchronized pipeline.
   1. Capture transactional scroll snapshot
   2. Update: realize visible → mount → render (from snapshot)
   3. Defer eviction until scroll is idle (prevents mid-scroll geometry destruction) */
pageArea.addEventListener("scroll", function() {
  if (!pageWin._initialized) return;
  _pipelineGen.scroll++;

  /* 1. Capture snapshot — all downstream decisions use this, not live DOM */
  _scrollSnap.scrollTop = pageArea.scrollTop;
  _scrollSnap.viewH = pageArea.clientHeight;
  _scrollSnap.gen++;

  /* 2. Update: realize + mount + render from snapshot */
  pageWin.update(_scrollSnap);

  /* 3. Defer eviction — only runs after scroll idle period */
  if (_evictTimer) clearTimeout(_evictTimer);
  _evictTimer = setTimeout(function() {
    _evictTimer = null;
    if (typeof layoutRegion !== "undefined") layoutRegion.maybeEvict();
  }, _EVICT_IDLE_MS);
  updateVerticalRuler();
  updateNavigatorActive();
}, { passive: true });

/* ================================================================
   RENDERER: Draws each page canvas at the current zoom resolution.
   Iterates the lines[] array and renders margin guides, selection
   highlights, text with per-run styling, underline and strikethrough
   decorations, and the blinking cursor.
   ================================================================ */

var cursorVisible = true, blinkTimer = null;

/* Render branch coverage — reset before each test render,
   checked after to verify all code paths executed. */
var _renderCov = {
  pages: 0,
  marginGuides: 0,
  pageBreaks: 0,
  images: 0,
  imgPlaceholders: 0,
  highlights: 0,
  selHighlights: 0,
  listPrefixes: 0,
  dropCaps: 0,
  textSegments: 0,
  underlines: 0,
  strikethroughs: 0,
  superscripts: 0,
  subscripts: 0,
  linkColors: 0,
  cursors: 0,
  debugLabels: 0,
  spellWiggles: 0,
  rulers: 0
};

var _showRulers = true;

function resetRenderCov() {
  for (var k in _renderCov) _renderCov[k] = 0;
}

/* Canvas operation logger — records drawing calls for comparison. */
function instrumentCtx(ctx) {
  var log = [];
  var originals = {};
  var methods = ["fillText", "fillRect", "strokeRect", "moveTo",
    "lineTo", "beginPath", "stroke", "fill", "drawImage", "arc"];
  for (var i = 0; i < methods.length; i++) {
    (function(fn) {
      originals[fn] = ctx[fn].bind(ctx);
      ctx[fn] = function() {
        log.push({ fn: fn, args: Array.prototype.slice.call(arguments) });
        return originals[fn].apply(null, arguments);
      };
    })(methods[i]);
  }
  return {
    log: log,
    restore: function() {
      for (var fn in originals) ctx[fn] = originals[fn];
    }
  };
}

/* Capture a canvas page as a data URL for pixel comparison. */
function capturePageSnapshot(pageIdx) {
  var slot = null;
  for (var i = 0; i < pageWin.slots.length; i++) {
    if (pageWin.slots[i].docPage === pageIdx) { slot = pageWin.slots[i]; break; }
  }
  if (!slot) return null;
  return slot.canvas.toDataURL("image/png");
}

/* Draw dashed margin guide rectangle, plus trim and bleed guides when enabled. */
function renderMarginGuides(ctx) {
  ctx.save();

  /* 1. Text margin guide (the content safe area) */
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#c8c8c8";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(M_LEFT, M_TOP, CONTENT_W, PAGE_H - M_TOP - M_BOT);
  _renderCov.marginGuides++;

  /* 2. Trim edge and bleed edge — only when bleed is enabled */
  var bs = doc.bookSettings;
  var bleedIn = (bs.bleed && bs.bleed.enabled) ? (bs.bleed.amountIn || 0.125) : 0;
  if (bleedIn > 0) {
    var bleedPx = bleedIn * SCREEN_DPI;
    /* Trim edge: solid green, inset from canvas by bleed amount */
    ctx.setLineDash([]);
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bleedPx, bleedPx,
      PAGE_W - 2 * bleedPx, PAGE_H - 2 * bleedPx);

    /* Bleed edge: dashed red at canvas boundary */
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.5, 0.5, PAGE_W - 1, PAGE_H - 1);
  }

  ctx.restore();
}

/* Draw page break indicator lines. */
function renderPageBreaks(ctx, pg) {
  var pLines = layoutRegion.linesForPageDirect(pg);
  if (!pLines) return;
  for (var pbli = 0; pbli < pLines.length; pbli++) {
    if (pLines[pbli].isPageBreak) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 0.5;
      var midY = M_TOP + 10;
      ctx.beginPath();
      ctx.moveTo(M_LEFT, midY);
      ctx.lineTo(PAGE_W - M_RIGHT, midY);
      ctx.stroke();
      ctx.font = "9px sans-serif";
      ctx.fillStyle = "#999";
      ctx.fillText("PAGE BREAK", M_LEFT + CONTENT_W / 2 - 25, midY - 3);
      _renderCov.pageBreaks++;
      ctx.restore();
    }
  }
}

/* Render chapter heading block (label + number) for a page.
   Draws the label text directly on the canvas at the position
   computed during layout. The title text is still rendered by
   the normal paragraph rendering pipeline.                    */
function renderHeadingBlocks(ctx, pg) {
  var hb = _headingBlocks[pg];
  if (!hb || !hb.labelText) return;
  
  ctx.save();
  ctx.textBaseline = "top";
  ctx.font = hb.labelFont;
  ctx.fillStyle = hb.labelColor;

  /* Letter spacing */
  if (hb.labelLetterSpacing) {
    ctx.letterSpacing = hb.labelLetterSpacing + "pt";
  }
  
  /* Compute x position from alignment */
  var x;
  if (hb.alignment === "center") {
    ctx.textAlign = "center";
    x = hb.pageWidth / 2;
  } else if (hb.alignment === "right") {
    ctx.textAlign = "right";
    x = hb.pageWidth - M_RIGHT;
  } else {
    ctx.textAlign = "left";
    x = M_LEFT;
  }
  
  ctx.fillText(hb.labelText, x, hb.labelY);

  /* Underline — manual stroke below label text */
  if (hb.labelUnderline && hb.labelFontSizePx) {
    var tw = ctx.measureText(hb.labelText).width;
    var ulX;
    if (hb.alignment === "center") ulX = x - tw / 2;
    else if (hb.alignment === "right") ulX = x - tw;
    else ulX = x;
    var ulY = hb.labelY + hb.labelFontSizePx;
    ctx.beginPath();
    ctx.strokeStyle = hb.labelColor;
    ctx.lineWidth = Math.max(1,
      Math.round(hb.labelFontSizePx / 14));
    ctx.moveTo(ulX, ulY);
    ctx.lineTo(ulX + tw, ulY);
    ctx.stroke();
  }

  ctx.restore();
}

/* Draw image block paragraphs: loaded images, placeholders, borders,
   and selection outlines. */
function renderImages(ctx, pLines) {
  if (!pLines) return;
  for (var ili = 0; ili < pLines.length; ili++) {
    var imgLine = pLines[ili];
    if (!imgLine.isImage) continue;
    var imgPara = doc.paragraphs[imgLine.paraIdx];
    if (!imgPara) continue;
    var imgSrc = imgPara.style.imageSrc;
    if (!imgSrc) continue;
    var imgEl = getImageCached(imgSrc);
    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      ctx.drawImage(imgEl, imgLine.imageX, imgLine.y, imgLine.imageW, imgLine.imageH);
      _renderCov.images++;
    } else {
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(imgLine.imageX, imgLine.y, imgLine.imageW, imgLine.imageH);
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 1;
      ctx.strokeRect(imgLine.imageX, imgLine.y, imgLine.imageW, imgLine.imageH);
      ctx.fillStyle = "#999";
      ctx.font = "10px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("Image", imgLine.imageX + imgLine.imageW / 2 - 15, imgLine.y + imgLine.imageH / 2);
      _renderCov.imgPlaceholders++;
      ctx.textBaseline = "alphabetic";
    }
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(imgLine.imageX, imgLine.y, imgLine.imageW, imgLine.imageH);
    if (cursor.p === imgLine.paraIdx) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(imgLine.imageX - 1, imgLine.y - 1, imgLine.imageW + 2, imgLine.imageH + 2);
    }
  }
}

/* Draw text background highlights (backgroundColor per segment). */
function renderHighlights(ctx, pLines) {
  if (!pLines) return;
  for (var li = 0; li < pLines.length; li++) {
    var line = pLines[li];
    for (var si = 0; si < line.segments.length; si++) {
      var seg = line.segments[si];
      if (!seg.backgroundColor || seg.text.length === 0) continue;
      var m = fontMetrics(seg.fontSize);
      ctx.fillStyle = seg.backgroundColor;
      ctx.fillRect(seg.x, line.baseline - m.ascent - 1, seg.width, seg.fontSize * 1.333 + 2);
      _renderCov.highlights++;
    }
  }
}

/* Draw blue selection highlight rectangles over selected text. */
function renderSelectionHighlights(ctx, pLines, sel) {
  if (!sel || !pLines) return;
  ctx.fillStyle = "#3390FF";
  for (var li = 0; li < pLines.length; li++) {
    var line = pLines[li];
    for (var si = 0; si < line.segments.length; si++) {
      var seg = line.segments[si];
      var segStart = mkPos(seg.paraIdx, seg.startOff);
      var segEnd = mkPos(seg.paraIdx, seg.endOff);
      var ovS = maxPos(sel.s, segStart);
      var ovE = minPos(sel.e, segEnd);
      if (cmpPos(ovS, ovE) >= 0) continue;
      var cw = getSegCharWidths(seg);
      var x1 = seg.x;
      var localS = ovS.o - seg.startOff;
      for (var k = 0; k < localS; k++) x1 += cw[k];
      var x2 = seg.x;
      var localE = ovE.o - seg.startOff;
      for (var k = 0; k < localE; k++) x2 += cw[k];
      var m = fontMetrics(seg.fontSize);
      ctx.fillRect(x1, line.baseline - m.ascent - 2, Math.max(1, x2 - x1), seg.fontSize * 1.333 + 4);
      _renderCov.selHighlights++;
    }
  }
}

/* Draw bullet or number prefix on first line of list paragraphs. */
function renderListPrefixes(ctx, pLines) {
  if (!pLines) return;
  for (var lli = 0; lli < pLines.length; lli++) {
    var lline = pLines[lli];
    if (!lline.isFirstOfPara) continue;
    var lpi = lline.paraIdx;
    var lps = doc.paragraphs[lpi] ? doc.paragraphs[lpi].style : null;
    if (!lps || !lps["x-list"] || !lps["x-list"].type) continue;
    var prefix = getListPrefix(lpi);
    if (!prefix) continue;
    var listLevel = lps["x-list"].level || 0;
    var prefixX = M_LEFT + (lps.marginLeft || 0) * (SCREEN_DPI / 72) + listLevel * LIST_INDENT_PT * (SCREEN_DPI / 72);
    var prefixFs = lline.maxFs || 12;
    ctx.font = prefixFs + "pt Georgia";
    ctx.fillStyle = "#1a1a1a";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(prefix, prefixX, lline.baseline);
    _renderCov.listPrefixes++;
  }
}

/* Draw drop cap letters at paragraph left margin. Leading quotes and
   punctuation render at body size before the enlarged letter. */
function renderDropCaps(ctx, pLines) {
  if (!pLines) return;
  for (var dli = 0; dli < pLines.length; dli++) {
    var dcLine = pLines[dli];
    if (!dcLine.dropCap) continue;
    var dc = dcLine.dropCap;
    var dcX = M_LEFT + ((doc.paragraphs[dcLine.paraIdx].style.marginLeft || 0) * (SCREEN_DPI / 72));
    var dcBaseline = dcLine.baseline + (dc.dropLines - 1) * dc.bodyLineH;

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = dc.color;

    if (dc.leadingText && dc.leadingText.length > 0) {
      ctx.font = dc.bodyFont;
      ctx.fillText(dc.leadingText, dcX, dcLine.baseline);
      dcX += dc.leadingBodyWidth;
    }

    ctx.font = dc.font;
    ctx.fillText(dc.letter, dcX, dcBaseline);
    _renderCov.dropCaps++;
  }
}

/* Draw text segments with selection-aware piece splitting, super/subscript
   offsets, link colors, underlines, and strikethroughs. This is the main
   text rendering path — all visible characters pass through here. */
function renderTextAndDecorations(ctx, pLines, sel) {
  if (!pLines) return;
  ctx.textBaseline = "alphabetic";
  for (var li = 0; li < pLines.length; li++) {
    var line = pLines[li];
    for (var si = 0; si < line.segments.length; si++) {
      var seg = line.segments[si];
      if (seg.text.length === 0) continue;
      ctx.font = seg.font;

      /* Compute script offset and font */
      var scriptOff = 0;
      var scriptFont = seg.font;
      if (seg["x-script"] === "sup") {
        _renderCov.superscripts++;
        scriptOff = -(seg.fontSize * 0.4);
        scriptFont = fontStr({ fontFamily: seg.fontFamily, fontSize: Math.round(seg.fontSize * 0.7), fontWeight: seg.fontWeight, fontStyle: seg.fontStyle });
      } else if (seg["x-script"] === "sub") {
        _renderCov.subscripts++;
        scriptOff = seg.fontSize * 0.15;
        scriptFont = fontStr({ fontFamily: seg.fontFamily, fontSize: Math.round(seg.fontSize * 0.7), fontWeight: seg.fontWeight, fontStyle: seg.fontStyle });
      }
      if (seg["x-script"] && seg["x-script"] !== "normal") ctx.font = scriptFont;

      /* Determine selection overlap within this segment */
      var selStart = -1, selEnd = -1;
      if (sel) {
        var segDocStart = seg.startOff;
        var segDocEnd = seg.endOff;
        var segP = seg.paraIdx;
        if (sel.s.p < segP || (sel.s.p === segP && sel.s.o < segDocEnd)) {
          if (sel.e.p > segP || (sel.e.p === segP && sel.e.o > segDocStart)) {
            var overlapDocStart = (sel.s.p === segP) ? Math.max(sel.s.o, segDocStart) : segDocStart;
            var overlapDocEnd = (sel.e.p === segP) ? Math.min(sel.e.o, segDocEnd) : segDocEnd;
            selStart = overlapDocStart - segDocStart;
            selEnd = overlapDocEnd - segDocStart;
          }
        }
      }

      /* Get cached character widths */
      var cw = getSegCharWidths(seg);

      /* Draw the segment in up to 3 pieces: before-sel, in-sel, after-sel */
      var pieces = [];
      if (selStart < 0) {
        pieces.push({ from: 0, to: seg.text.length, selected: false });
      } else {
        if (selStart > 0) {
          pieces.push({ from: 0, to: selStart, selected: false });
        }
        pieces.push({ from: selStart, to: selEnd, selected: true });
        if (selEnd < seg.text.length) {
          pieces.push({ from: selEnd, to: seg.text.length, selected: false });
        }
      }

      for (var pi2 = 0; pi2 < pieces.length; pi2++) {
        var piece = pieces[pi2];
        var pieceText = seg.text.slice(piece.from, piece.to);
        if (pieceText.length === 0) continue;

        /* Set color based on selection state */
        if (piece.selected) {
          ctx.fillStyle = "#ffffff";
        } else if (seg["x-linkHref"]) {
          _renderCov.linkColors++;
          ctx.fillStyle = "#0066CC";
        } else {
          ctx.fillStyle = seg.color;
        }

        /* Compute x position for this piece */
        var pieceX = seg.x;
        for (var k = 0; k < piece.from; k++) pieceX += cw[k];

        /* Draw text: per-character if kerning, whole piece if not.
           strokeText if strokeWidth present. Both checks are
           single falsy lookups — zero cost for normal text. */
        if (seg.kerning) {
          for (var ci2 = 0; ci2 < pieceText.length; ci2++) {
            var ch = pieceText.charAt(ci2);
            ctx.fillText(ch, pieceX,
              line.baseline + scriptOff);
            if (seg.strokeWidth) {
              ctx.strokeStyle = ctx.fillStyle;
              ctx.lineWidth = seg.strokeWidth;
              ctx.lineJoin = "round";
              ctx.strokeText(ch, pieceX,
                line.baseline + scriptOff);
            }
            pieceX += cw[piece.from + ci2];
          }
        } else {
          ctx.fillText(pieceText, pieceX,
            line.baseline + scriptOff);
          if (seg.strokeWidth) {
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = seg.strokeWidth;
            ctx.lineJoin = "round";
            ctx.strokeText(pieceText, pieceX,
              line.baseline + scriptOff);
          }
        }
      }
      _renderCov.textSegments++;

      if (seg["x-script"] && seg["x-script"] !== "normal") ctx.font = seg.font;

      /* Underline (explicit or link) */
      if (tdHas(seg.textDecoration, "underline") || seg["x-linkHref"]) {
        ctx.strokeStyle = seg["x-linkHref"] ? "#0066CC" : seg.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(seg.x, line.baseline + 2);
        ctx.lineTo(seg.x + seg.width, line.baseline + 2);
        ctx.stroke();
        _renderCov.underlines++;
      }
      /* Strikethrough */
      if (tdHas(seg.textDecoration, "line-through")) {
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = 1;
        var mid = line.baseline - seg.fontSize * 1.333 * 0.3;
        ctx.beginPath();
        ctx.moveTo(seg.x, mid);
        ctx.lineTo(seg.x + seg.width, mid);
        ctx.stroke();
        _renderCov.strikethroughs++;
      }
    }
  }
}

/* Draw debug overlay: per-line labels showing layout engine state.
   Called from render() when debugOverlay is enabled. Draws paragraph
   index, role, indent, spacing, and no-indent-rule markers on each
   line's first appearance. */
function renderDebugOverlay(ctx, pg) {
  ctx.save();
  ctx.font = "11px monospace";
  ctx.globalAlpha = 0.85;
  var lastOverlayPara = -1;
  var pLines = layoutRegion.linesForPageDirect(pg);
  if (pLines) {
    for (var dli = 0; dli < pLines.length; dli++) {
      var dline = pLines[dli];
      var pi = dline.paraIdx;
      var ps = doc.paragraphs[pi] ? doc.paragraphs[pi].style : null;
      if (!ps) continue;

      var curRole = ps["x-role"] || "body";
      var prevRole = (pi > 0 && doc.paragraphs[pi - 1]) ? (doc.paragraphs[pi - 1].style["x-role"] || "body") : "none";

      var PT_TO_PX_D = SCREEN_DPI / 72;
      var appliedIndentPx = dline.leftEdge - M_LEFT;
      var appliedIndentPt = Math.round(appliedIndentPx / PT_TO_PX_D * 10) / 10;

      var noIndentRule = false;
      if (curRole === "body" && prevRole === "chapterTitle" && appliedIndentPt === 0 && (ps.textIndent || 0) > 0) {
        noIndentRule = true;
      }

      if (pi !== lastOverlayPara) {
        lastOverlayPara = pi;
        var label = "p=" + pi;
        label += " prev=" + prevRole;
        label += " role=" + curRole;
        label += " indPt=" + (ps.textIndent || 0);
        label += " applPt=" + appliedIndentPt;
        if (noIndentRule) label += " \u00D8";
        label += " sB=" + (ps.marginTop || 0);
        label += " sA=" + (ps.marginBottom || 0);

        var tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(255,255,200,0.85)";
        var labelY = Math.max(4, dline.y - 4);
        ctx.fillRect(8, labelY - 10, tw + 4, 13);
        ctx.fillStyle = "#333333";
        ctx.fillText(label, 10, labelY);
        _renderCov.debugLabels++;
      } else {
        ctx.fillStyle = "#999999";
        ctx.fillText("  |", 10, Math.max(4, dline.y - 4));
      }
    }
  }
  ctx.restore();
}

function render(onlyPage) {
  if (typeof onlyPage !== "number") _pipelineGen.render++;
  var s = zoom * dpr;
  var sel = hasSelection() ? getSelRange() : null;
  var curCoords = layoutRegion.isRealized(cursor.p) ? posToCoords(cursor) : null;

  for (var _si = 0; _si < pageWin.slots.length; _si++) {
    var pg = pageWin.slots[_si].docPage;
    if (typeof onlyPage === "number" && pg !== onlyPage) continue;
    var ctx = pageWin.slots[_si].ctx;
    _renderCov.pages++;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    /* Margin guides */
    renderMarginGuides(ctx);

    /* Page break indicators */
    renderPageBreaks(ctx, pg);

    /* Lines for this page — used by remaining render sections */
    var pLines = layoutRegion.linesForPageDirect(pg);

    /* Blank page label (editor-only): pages with no content lines
       get informative centered labels so the user understands why
       the page is blank. NOT exported to PDF — editor display only. */
    if (!pLines || pLines.length === 0) {
      ctx.save();
      ctx.textAlign = "center";

      /* Line 1: statement */
      ctx.fillStyle = "#b0b0b0";
      ctx.font = "italic 11px sans-serif";
      ctx.fillText("This page intentionally left blank", PAGE_W / 2, PAGE_H / 2 - 10);

      /* Line 2: reason */
      ctx.fillStyle = "#c8c8c8";
      ctx.font = "italic 9px sans-serif";
      var _blankReason = "";
      if (pg % 2 === 0) {
        _blankReason = "Recto page \u2014 no section content assigned";
      } else {
        _blankReason = "Verso side \u2014 next section begins on the right-hand page";
      }
      /* Check if this is the final padding page */
      if (pg === totalPages - 1) {
        var _hasFinalContent = false;
        for (var _bpi = 0; _bpi < _paraYState.length; _bpi++) {
          if (_paraYState[_bpi] && _paraYState[_bpi].page === pg) {
            _hasFinalContent = true;
            break;
          }
        }
        if (!_hasFinalContent) {
          _blankReason = "Final page \u2014 books require an even number of pages for printing";
        }
      }
      ctx.fillText(_blankReason, PAGE_W / 2, PAGE_H / 2 + 8);

      ctx.restore();
    }

    /* Chapter heading blocks (label + number) */
    renderHeadingBlocks(ctx, pg);

    /* Image blocks */
    renderImages(ctx, pLines);

    /* Text highlights */
    renderHighlights(ctx, pLines);

    /* Selection highlights */
    renderSelectionHighlights(ctx, pLines, sel);

    /* List prefixes */
    renderListPrefixes(ctx, pLines);

    /* Drop caps */
    renderDropCaps(ctx, pLines);

    /* Text and decorations */
    renderTextAndDecorations(ctx, pLines, sel);

    /* Spellcheck wavy underlines — drawn after text/decorations, before cursor.
       Maps spellState.misspellings {p,o,len} to segment coordinates on this page. */
    if (spellState.enabled && spellState.misspellings.length > 0) {
      ctx.strokeStyle = "rgba(220, 38, 38, 0.8)";
      ctx.lineWidth = 1;
      if (pLines) for (var li = 0; li < pLines.length; li++) {
        var line = pLines[li];
        if (line.isImage) continue;
        for (var si = 0; si < line.segments.length; si++) {
          var seg = line.segments[si];
          if (seg.text.length === 0) continue;
          /* Check each misspelling for overlap with this segment */
          var _spParaMisspellings = spellState.byPara[seg.paraIdx];
          if (!_spParaMisspellings) continue;
          for (var mi = 0; mi < _spParaMisspellings.length; mi++) {
            var ms = _spParaMisspellings[mi];
            var msEnd = ms.o + ms.len;
            /* Overlap: misspelling [ms.o, msEnd) ∩ segment [seg.startOff, seg.endOff) */
            var overlapStart = Math.max(ms.o, seg.startOff);
            var overlapEnd = Math.min(msEnd, seg.endOff);
            if (overlapStart >= overlapEnd) continue;
            /* Compute x range within segment using character widths */
            var cw = getSegCharWidths(seg);
            var xStart = seg.x;
            for (var ci = 0; ci < overlapStart - seg.startOff; ci++) xStart += cw[ci];
            var xEnd = xStart;
            for (var ci2 = overlapStart - seg.startOff; ci2 < overlapEnd - seg.startOff; ci2++) xEnd += cw[ci2];
            /* Draw wavy line */
            var waveY = line.baseline + 3;
            var amp = 1.5;
            var waveLen = 4;
            ctx.beginPath();
            ctx.moveTo(xStart, waveY);
            for (var wx = xStart + 1; wx <= xEnd; wx++) {
              var phase = (wx - xStart) / waveLen * Math.PI * 2;
              ctx.lineTo(wx, waveY + Math.sin(phase) * amp);
            }
            ctx.stroke();
            _renderCov.spellWiggles++;
          }
        }
      }
    }

    /* Cursor */
    if (cursorVisible && !hasSelection() && curCoords && curCoords.page === pg) {
      var cfs = curStyle.fontSize;
      var curH = cfs * 1.333;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(curCoords.x, curCoords.y - curH * 0.8 - 1);
      ctx.lineTo(curCoords.x, curCoords.y + 3);
      ctx.stroke();
      _renderCov.cursors++;
    }

    /* Drop caret: shown during drag-move to indicate insertion point */
    if (dragMode === "move" && isDragging && dragMoved && dropPos) {
      var dropCoords = posToCoords(dropPos);
      if (dropCoords && dropCoords.page === pg) {
        var dfs = 12;
        var dH = dfs * 1.333;
        ctx.strokeStyle = "#0066CC";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dropCoords.x, dropCoords.y - dH * 0.8 - 1);
        ctx.lineTo(dropCoords.x, dropCoords.y + 3);
        ctx.stroke();
      }
    }

    /* Debug overlay */
    if (debugOverlay) {
      renderDebugOverlay(ctx, pg);
    }
  }
  if (typeof onlyPage !== "number") {
    updateDebugDisplay();
    if (typeof updatePipelineDebug === "function") updatePipelineDebug();
    if (typeof updateStats === "function") updateStats();
    updateHorizontalRuler();
    updateVerticalRuler();
    if (typeof updateSidebar === "function") updateSidebar();
  }
}

/* External ruler update functions — draw on separate ruler canvases
   positioned outside the page area. Called from render(), applyZoom(),
   scroll, and resize. */
function updateHorizontalRuler() {
  if (!_showRulers) return;
  var canvas = document.getElementById("ruler-h-canvas");
  if (!canvas) return;
  var wrap = document.getElementById("ruler-h-wrap");
  var wrapW = wrap.clientWidth;

  canvas.width = wrapW * dpr;
  canvas.height = 24 * dpr;
  canvas.style.width = wrapW + "px";
  canvas.style.height = "24px";

  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, wrapW, 24);

  var firstCanvas = null;
  for (var i = 0; i < pageWin.slots.length; i++) {
    if (pageWin.slots[i].canvas.offsetParent !== null) {
      firstCanvas = pageWin.slots[i].canvas;
      break;
    }
  }
  if (!firstCanvas) return;

  var pageRect = firstCanvas.getBoundingClientRect();
  var wrapRect = wrap.getBoundingClientRect();
  var pageLeft = pageRect.left - wrapRect.left;
  var pageW = pageRect.width;

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, wrapW, 24);

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(pageLeft, 0, pageW, 24);

  var mLeftScaled = M_LEFT * zoom;
  var mRightScaled = M_RIGHT * zoom;
  ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
  ctx.fillRect(pageLeft, 0, mLeftScaled, 24);
  ctx.fillRect(pageLeft + pageW - mRightScaled, 0, mRightScaled, 24);

  var trimW = doc.bookSettings.trim.widthIn;
  ctx.strokeStyle = "#888";
  ctx.fillStyle = "#555";
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  var pxPerInch = (pageW / trimW);

  for (var q = 0; q <= trimW * 4; q++) {
    var inch = q / 4;
    var x = pageLeft + inch * pxPerInch;
    var isMajor = (q % 4 === 0);
    var isHalf = (q % 2 === 0 && !isMajor);
    var tickH = isMajor ? 12 : (isHalf ? 8 : 5);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 24);
    ctx.lineTo(Math.round(x) + 0.5, 24 - tickH);
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(Math.round(inch).toString(), x, 24 - tickH - 1);
    }
  }

  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  ctx.moveTo(0, 23.5);
  ctx.lineTo(wrapW, 23.5);
  ctx.stroke();

  _renderCov.rulers++;
}

function updateVerticalRuler() {
  if (!_showRulers) return;
  var canvas = document.getElementById("ruler-v-canvas");
  if (!canvas) return;
  var wrap = document.getElementById("ruler-v-wrap");
  var wrapH = wrap.clientHeight;

  canvas.width = 24 * dpr;
  canvas.height = wrapH * dpr;
  canvas.style.width = "24px";
  canvas.style.height = wrapH + "px";

  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 24, wrapH);

  var firstCanvas = null;
  for (var i = 0; i < pageWin.slots.length; i++) {
    var r = pageWin.slots[i].canvas.getBoundingClientRect();
    var wr = wrap.getBoundingClientRect();
    if (r.bottom > wr.top && r.top < wr.bottom) {
      firstCanvas = pageWin.slots[i].canvas;
      break;
    }
  }
  if (!firstCanvas) return;

  var pageRect = firstCanvas.getBoundingClientRect();
  var wrapRect = wrap.getBoundingClientRect();
  var pageTop = pageRect.top - wrapRect.top;
  var pageH = pageRect.height;

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, 24, wrapH);

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, pageTop, 24, pageH);

  var mTopScaled = M_TOP * zoom;
  var mBotScaled = M_BOT * zoom;
  ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
  ctx.fillRect(0, pageTop, 24, mTopScaled);
  ctx.fillRect(0, pageTop + pageH - mBotScaled, 24, mBotScaled);

  var trimH = doc.bookSettings.trim.heightIn;
  ctx.strokeStyle = "#888";
  ctx.fillStyle = "#555";
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  var pxPerInch = (pageH / trimH);

  for (var q = 0; q <= trimH * 4; q++) {
    var inch = q / 4;
    var y = pageTop + inch * pxPerInch;
    var isMajor = (q % 4 === 0);
    var isHalf = (q % 2 === 0 && !isMajor);
    var tickW = isMajor ? 12 : (isHalf ? 8 : 5);
    ctx.beginPath();
    ctx.moveTo(24, Math.round(y) + 0.5);
    ctx.lineTo(24 - tickW, Math.round(y) + 0.5);
    ctx.stroke();
    if (isMajor) {
      ctx.fillText(Math.round(inch).toString(), 24 - tickW - 2, y);
    }
  }

  ctx.strokeStyle = "#ccc";
  ctx.beginPath();
  ctx.moveTo(23.5, 0);
  ctx.lineTo(23.5, wrapH);
  ctx.stroke();
}

function resetBlink() {
  cursorVisible = true;
  clearInterval(blinkTimer);
  blinkTimer = setInterval(function() {
    cursorVisible = !cursorVisible;
    var cc = layoutRegion.isRealized(cursor.p) ? posToCoords(cursor) : null;
    render(cc ? cc.page : -1);
  }, 530);
  /* Only reload sentinel (which calls inputEl.select()) when focus is NOT
     on a bar input — prevents stealing focus from Find/Replace/Link bars. */
  var ae = document.activeElement;
  if (!ae || ae.tagName !== "INPUT") reloadSentinel();
  render();
}

function scrollCursorIntoView() {
  var coords = posToCoords(cursor);
  if (!coords) return;
  /* Use explicit page-area scroll math — no reliance on scrollIntoView.
     coords.lineY is the top of the cursor line in page-local layout units.
     coords.lineHeight is the line height in layout units. */
  var scrolled = pageWin.revealPosition(coords.page, coords.lineY, coords.lineHeight);
  if (scrolled) render();
}

