/* ================================================================
   HIT TESTING: Resolves mouse coordinates to document positions.
   Two-step approach: find line from Y, then find character offset
   from X within that line. Uses binary search on cumulative
   character widths within segments for precision.
   ================================================================ */

function hitTest(mx, my, pageIdx) {
  /* Step 1: find line from Y using layoutRegion page accessor */
  var pLines = layoutRegion.linesForPage(pageIdx);
  if (!pLines || pLines.length === 0) return null;

  var targetLine = null;
  for (var i = 0; i < pLines.length; i++) {
    var ln = pLines[i];
    if (my >= ln.y && my < ln.y + ln.height) { targetLine = ln; break; }
  }
  if (!targetLine) {
    var bestDist = Infinity;
    for (var i = 0; i < pLines.length; i++) {
      var d = Math.abs(my - (pLines[i].y + pLines[i].height / 2));
      if (d < bestDist) { bestDist = d; targetLine = pLines[i]; }
    }
  }
  if (!targetLine) return mkPos(0, 0);

  /* Step 2: find position from X within segments */
  var segs = targetLine.segments;
  if (segs.length === 0) return mkPos(targetLine.paraIdx, 0);
  if (segs[0].text.length === 0) return mkPos(targetLine.paraIdx, segs[0].startOff);
  if (mx <= segs[0].x) return mkPos(segs[0].paraIdx, segs[0].startOff);

  var lastSeg = segs[segs.length - 1];
  var lastEnd = lastSeg.x + lastSeg.width;
  if (mx >= lastEnd) return mkPos(lastSeg.paraIdx, lastSeg.endOff);

  /* On-demand character width resolution for click precision */
  for (var si = 0; si < segs.length; si++) {
    var seg = segs[si];
    if (mx >= seg.x && mx <= seg.x + seg.width) {
      var cw = getSegCharWidths(seg);
      var relX = mx - seg.x;
      var acc = 0;
      for (var ci = 0; ci < cw.length; ci++) {
        var half = cw[ci] / 2;
        if (relX < acc + half) return mkPos(seg.paraIdx, seg.startOff + ci);
        acc += cw[ci];
      }
      return mkPos(seg.paraIdx, seg.endOff);
    }
  }
  return mkPos(lastSeg.paraIdx, lastSeg.endOff);
}

/* ================================================================
   LINK UTILITIES: URL validation, normalization, and position lookup.
   ================================================================ */

/* Check if a URL uses a safe scheme (http, https, mailto). */
function isUrlSafe(url) {
  if (!url || typeof url !== "string") return false;
  var n = url.trim();
  if (n.length === 0) return false;
  if (/^javascript:/i.test(n)) return false;
  if (/^data:/i.test(n)) return false;
  if (/^file:/i.test(n)) return false;
  if (/^https?:\/\//i.test(n)) return true;
  if (/^mailto:/i.test(n)) return true;
  return false;
}

/* Normalize a URL: add https:// if no scheme present.
   Returns null for unsafe or empty URLs. */
function normalizeUrl(url) {
  if (!url || typeof url !== "string") return null;
  var t = url.trim();
  if (t.length === 0) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  if (/^javascript:|^data:|^file:/i.test(t)) return null;
  return "https://" + t;
}

/* Find the link href at a given character offset in a paragraph.
   Returns the href string or null. */
function getLinkAtOffset(para, offset) {
  var acc = 0;
  for (var r = 0; r < para.runs.length; r++) {
    var len = para.runs[r].text.length;
    if (offset >= acc && offset < acc + len) {
      return para.runs[r]["x-linkHref"] || null;
    }
    acc += len;
  }
  return null;
}

/* ================================================================
   MOUSE INPUT: Translates DOM events to document coordinates
   accounting for zoom. Supports three drag modes:
   - "select": normal drag to create/extend a selection
   - "move": drag existing selection to a new position
   Drag selection continues across page gaps using
   getNearestPageAndCoords fallback.
   ================================================================ */

var isDragging = false;
var dragMoved = false;
var dragStartX = 0, dragStartY = 0;
var DRAG_THRESHOLD = 3;
var dragMode = "select";
var dropPos = null;
var dragMoveData = null;
var inputEl = document.getElementById("input-capture");

/* Auto-scroll during selection drag */
var _autoScrollRAF = null;
var _autoScrollLastX = 0;
var _autoScrollLastY = 0;
var _autoScrollSpeed = 0;
var _AUTO_SCROLL_EDGE = 40;
var _AUTO_SCROLL_MAX = 12;

/* Compute auto-scroll speed based on mouse distance from edge. */
function computeAutoScrollSpeed(clientY) {
  var rect = pageArea.getBoundingClientRect();
  var topEdge = rect.top;
  var botEdge = rect.bottom;

  if (clientY < topEdge + _AUTO_SCROLL_EDGE) {
    var dist = (topEdge + _AUTO_SCROLL_EDGE) - clientY;
    var ratio = Math.min(1, dist / _AUTO_SCROLL_EDGE);
    return -Math.ceil(ratio * _AUTO_SCROLL_MAX);
  }

  if (clientY > botEdge - _AUTO_SCROLL_EDGE) {
    var dist = clientY - (botEdge - _AUTO_SCROLL_EDGE);
    var ratio = Math.min(1, dist / _AUTO_SCROLL_EDGE);
    return Math.ceil(ratio * _AUTO_SCROLL_MAX);
  }

  return 0;
}

/* Begin the auto-scroll animation loop. */
function startAutoScroll() {
  if (_autoScrollRAF) return;

  function tick() {
    if (!isDragging || _autoScrollSpeed === 0) {
      _autoScrollRAF = null;
      return;
    }

    var oldScroll = pageArea.scrollTop;
    pageArea.scrollTop += _autoScrollSpeed;

    if (pageArea.scrollTop !== oldScroll) {
      var info = getNearestPageAndCoords(_autoScrollLastX, _autoScrollLastY);
      var pos = hitTest(info.x, info.y, info.page);
      if (!pos) { _autoScrollRAF = requestAnimationFrame(tick); return; }

      if (dragMode === "select") {
        if (selAnchor) { pos = clampToSection(pos, sectionOfPara(selAnchor.p)); }
        selFocus = pos;
        cursor = clonePos(pos);
      } else if (dragMode === "move") {
        dropPos = pos;
      }

      render();
    }

    _autoScrollRAF = requestAnimationFrame(tick);
  }

  _autoScrollRAF = requestAnimationFrame(tick);
}

/* Cancel the auto-scroll animation loop. */
function stopAutoScroll() {
  if (_autoScrollRAF) {
    cancelAnimationFrame(_autoScrollRAF);
    _autoScrollRAF = null;
  }
  _autoScrollSpeed = 0;
}

function getPageAndCoords(e) {
  var target = e.target;
  if (!target || !target.classList || !target.classList.contains("page-canvas")) return null;
  var pageIdx = parseInt(target.getAttribute("data-page"));
  var rect = target.getBoundingClientRect();
  var mx = (e.clientX - rect.left) / zoom;
  var my = (e.clientY - rect.top) / zoom;
  return { page: pageIdx, x: mx, y: my };
}

function getNearestPageAndCoords(clientX, clientY) {
  var bestDist = Infinity;
  var bestPage = 0;
  var bestRect = null;
  for (var i = 0; i < pageWin.slots.length; i++) {
    var rect = pageWin.slots[i].canvas.getBoundingClientRect();
    var dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    var dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    var dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; bestPage = pageWin.slots[i].docPage; bestRect = rect; }
  }
  if (!bestRect) return { page: 0, x: M_LEFT, y: M_TOP };
  var cx = Math.max(bestRect.left, Math.min(bestRect.right, clientX));
  var cy = Math.max(bestRect.top, Math.min(bestRect.bottom, clientY));
  var mx = (cx - bestRect.left) / zoom;
  var my = (cy - bestRect.top) / zoom;
  return { page: bestPage, x: mx, y: my };
}

/* Check if a position falls within a selection range. */
function posInSelection(pos, range) {
  if (!range) return false;
  return cmpPos(pos, range.s) >= 0 && cmpPos(pos, range.e) < 0;
}

pagesWrapper.addEventListener("mousedown", function(e) {
  var info = getPageAndCoords(e);
  if (!info) return;
  var pos = hitTest(info.x, info.y, info.page);
  if (!pos) return;  /* Blank page — ignore click */

  /* Ctrl/Cmd+Click: open link if position is inside a linked run */
  var isMod = e.ctrlKey || e.metaKey;
  if (isMod && !e.shiftKey) {
    var para = doc.paragraphs[pos.p];
    if (para) {
      var href = getLinkAtOffset(para, pos.o);
      if (href) {
        var normalized = normalizeUrl(href);
        if (normalized && isUrlSafe(normalized)) {
          window.open(normalized, "_blank", "noopener,noreferrer");
          statusPill("ok", "Opened link");
        } else {
          statusPill("warn", "Invalid link URL");
        }
        e.preventDefault();
        return;
      }
    }
  }

  if (e.shiftKey) {
    if (!selAnchor) selAnchor = clonePos(cursor);
    var _shiftAnchorSec = sectionOfPara(selAnchor.p);
    pos = clampToSection(pos, _shiftAnchorSec);
    selFocus = pos;
    cursor = clonePos(pos);
    isDragging = true;
    dragMode = "select";
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    desiredX = null;
    updateCurStyle();
    resetBlink();
    inputEl.focus();
    return;
  }

  /* If clicking inside an existing selection, enter move mode */
  if (hasSelection() && posInSelection(pos, getSelRange())) {
    isDragging = true;
    dragMode = "move";
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragMoveData = { range: getSelRange(), text: getSelectedText() };
    dropPos = clonePos(pos);
    inputEl.focus();
    return;
  }

  /* Normal selection start */
  cursor = pos;
  selAnchor = clonePos(pos);
  selFocus = clonePos(pos);
  isDragging = true;
  dragMode = "select";
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  desiredX = null;
  updateCurStyle();
  resetBlink();
  inputEl.focus();
});

window.addEventListener("mousemove", function(e) {
  if (!isDragging) return;
  if (!dragMoved) {
    var dx = Math.abs(e.clientX - dragStartX);
    var dy = Math.abs(e.clientY - dragStartY);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) dragMoved = true;
    else return;
  }

  /* Store mouse position for auto-scroll loop */
  _autoScrollLastX = e.clientX;
  _autoScrollLastY = e.clientY;

  var info = getPageAndCoords(e) || getNearestPageAndCoords(e.clientX, e.clientY);
  var pos = hitTest(info.x, info.y, info.page);
  if (!pos) return;  /* Blank page — ignore drag onto blank page */

  if (dragMode === "move") {
    dropPos = pos;
    for (var ci = 0; ci < pageWin.slots.length; ci++) pageWin.slots[ci].canvas.classList.add("drag-move");
    render();
    _autoScrollSpeed = computeAutoScrollSpeed(e.clientY);
    if (_autoScrollSpeed !== 0) startAutoScroll();
    else stopAutoScroll();
    return;
  }

  /* Normal selection drag */
  if (selAnchor) { pos = clampToSection(pos, sectionOfPara(selAnchor.p)); }
  selFocus = pos;
  cursor = clonePos(pos);
  render();

  /* Check if we need auto-scroll */
  _autoScrollSpeed = computeAutoScrollSpeed(e.clientY);
  if (_autoScrollSpeed !== 0) startAutoScroll();
  else stopAutoScroll();
});

/* Link tooltip: show URL + hint on hover over linked text */
var linkTooltipEl = document.getElementById("link-tooltip");
var lastTooltipHref = null;

pagesWrapper.addEventListener("mousemove", function(e) {
  if (isDragging) { linkTooltipEl.style.display = "none"; return; }
  var info = getPageAndCoords(e);
  if (!info) { linkTooltipEl.style.display = "none"; lastTooltipHref = null; return; }
  var pos = hitTest(info.x, info.y, info.page);
  if (!pos) { linkTooltipEl.style.display = "none"; return; }
  var para = doc.paragraphs[pos.p];
  var href = para ? getLinkAtOffset(para, pos.o) : null;
  if (href) {
    if (href !== lastTooltipHref) {
      var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
      var mod = isMac ? "\u2318" : "Ctrl";
      linkTooltipEl.textContent = href + "  \u2014  " + mod + "+Click to follow";
      lastTooltipHref = href;
    }
    linkTooltipEl.style.left = (e.clientX + 12) + "px";
    linkTooltipEl.style.top = (e.clientY + 16) + "px";
    linkTooltipEl.style.display = "block";
  } else {
    linkTooltipEl.style.display = "none";
    lastTooltipHref = null;
  }
});

pagesWrapper.addEventListener("mouseleave", function() {
  linkTooltipEl.style.display = "none";
  lastTooltipHref = null;
});

window.addEventListener("mouseup", function() {
  if (!isDragging) return;
  stopAutoScroll();
  isDragging = false;

  if (dragMode === "move") {
    if (dragMoved && dragMoveData && dropPos) {
      var range = dragMoveData.range;
      /* Drop inside original selection is a no-op */
      if (!posInSelection(dropPos, range) && !eqPos(dropPos, range.s)) {
        var capDrag = captureSplice(0, doc.paragraphs.length);

        if (range.s.p === range.e.p) {
          /* CASE A: Single-paragraph selection. Move run slice. */
          var srcPara = doc.paragraphs[range.s.p];
          var slice = extractRunSlice(srcPara, range.s.o, range.e.o);
          removeRunSlice(srcPara, slice.startIdx, slice.endIdx);

          /* Adjust drop offset if in same paragraph and after source */
          var adjDrop = clonePos(dropPos);
          if (adjDrop.p === range.s.p && adjDrop.o > range.e.o) {
            adjDrop.o -= (range.e.o - range.s.o);
          } else if (adjDrop.p === range.s.p && adjDrop.o > range.s.o) {
            adjDrop.o = range.s.o;
          }

          insertRunSlice(doc.paragraphs[adjDrop.p], adjDrop.o, slice.sliceRuns);
          var insertedLen = runsTextLen(slice.sliceRuns);
          cursor = mkPos(adjDrop.p, adjDrop.o + insertedLen);

        } else {
          /* CASE B: Multi-paragraph selection. Extract block, then
             insert as paragraphs at the nearest paragraph boundary. */
          var startPara = doc.paragraphs[range.s.p];
          var endPara = doc.paragraphs[range.e.p];

          /* Build block: tail of start para, middle paras, head of end para */
          var tailSlice = extractRunSlice(startPara, range.s.o, paraTextLen(startPara));
          var headSlice = extractRunSlice(endPara, 0, range.e.o);
          var middleParas = [];
          for (var mp = range.s.p + 1; mp < range.e.p; mp++) {
            middleParas.push(clonePara(doc.paragraphs[mp]));
          }

          /* Build paragraph objects for the block */
          var blockParas = [];
          if (tailSlice.sliceRuns.length > 0 && runsTextLen(tailSlice.sliceRuns) > 0) {
            var tailPara = { style: JSON.parse(JSON.stringify(startPara.style)), runs: tailSlice.sliceRuns };
            blockParas.push(tailPara);
          }
          for (var mp = 0; mp < middleParas.length; mp++) {
            blockParas.push(middleParas[mp]);
          }
          if (headSlice.sliceRuns.length > 0 && runsTextLen(headSlice.sliceRuns) > 0) {
            var headPara = { style: JSON.parse(JSON.stringify(endPara.style)), runs: headSlice.sliceRuns };
            blockParas.push(headPara);
          }

          /* Remove source text using deleteRange. The extractRunSlice
             calls above already split runs at the extraction boundaries,
             but deleteRange handles re-splitting as no-ops at those
             boundaries, so this is safe. */
          deleteRange(range.s, range.e);

          /* If deleteRange left an empty ghost paragraph (happens when
             the selection spanned entire paragraphs), remove it. */
          var ghostP = range.s.p;
          var ghostRemoved = false;
          if (ghostP < doc.paragraphs.length && paraTextLen(doc.paragraphs[ghostP]) === 0 && doc.paragraphs.length > 1) {
            doc.paragraphs.splice(ghostP, 1);
            ghostRemoved = true;
          }

          /* Compute destination paragraph index. Snap to paragraph boundary:
             insert before the paragraph containing dropPos. Adjust for
             removed paragraphs (including ghost). */
          var destP = dropPos.p;
          var parasRemoved = range.e.p - range.s.p + (ghostRemoved ? 1 : 0);
          if (destP > range.s.p) {
            destP = Math.max(range.s.p, destP - parasRemoved);
          }
          destP = Math.min(destP, doc.paragraphs.length);

          /* Insert block paragraphs at destination */
          for (var bp = blockParas.length - 1; bp >= 0; bp--) {
            doc.paragraphs.splice(destP, 0, blockParas[bp]);
          }

          if (blockParas.length > 0) {
            cursor = mkPos(destP + blockParas.length - 1,
              paraTextLen(doc.paragraphs[destP + blockParas.length - 1]));
          } else {
            cursor = mkPos(destP, 0);
            clampPos(cursor);
          }
        }

        clearSel();
        finishSplice(capDrag, doc.paragraphs.length);
        requestFullLayout("drag");
        updateToolbar();
        resetBlink();
        scrollCursorIntoView();
      }
    } else if (!dragMoved) {
      /* Click inside selection without dragging: place caret there */
      if (dropPos) cursor = clonePos(dropPos);
      clearSel();
    }
    dragMoveData = null;
    dropPos = null;
    dragMode = "select";
    for (var ci = 0; ci < pageWin.slots.length; ci++) pageWin.slots[ci].canvas.classList.remove("drag-move");
    updateCurStyle();
    updateToolbar();
    resetBlink();
    reloadSentinel();
    inputEl.focus({ preventScroll: true });
    return;
  }

  /* Normal selection mouseup */
  if (!dragMoved) {
    if (selAnchor && selFocus && eqPos(selAnchor, selFocus)) clearSel();
  }
  updateToolbar();
  render();
  reloadSentinel();
  inputEl.focus({ preventScroll: true });
});

/* Track rapid clicks for double-click (word) and triple-click (paragraph).
   Uses a counter and timer instead of the dblclick event for consistency. */
var multiClickCount = 0;
var multiClickTimer = null;
var multiClickPos = null;

pagesWrapper.addEventListener("mousedown", function(e) {
  var info = getPageAndCoords(e);
  if (!info) return;
  var pos = hitTest(info.x, info.y, info.page);
  if (!pos) return;  /* Blank page — ignore click */

  /* Detect rapid clicks at the same approximate position */
  if (multiClickTimer && multiClickPos && Math.abs(e.clientX - multiClickPos.x) < 5 && Math.abs(e.clientY - multiClickPos.y) < 5) {
    multiClickCount++;
  } else {
    multiClickCount = 1;
  }
  multiClickPos = { x: e.clientX, y: e.clientY };
  clearTimeout(multiClickTimer);
  multiClickTimer = setTimeout(function() { multiClickCount = 0; }, 500);

  if (multiClickCount === 2) {
    /* Double-click: select word */
    var text = paraText(doc.paragraphs[pos.p]);
    var ws = pos.o, we = pos.o;
    while (ws > 0 && text[ws - 1] !== " ") ws--;
    while (we < text.length && text[we] !== " ") we++;
    selAnchor = mkPos(pos.p, ws);
    selFocus = mkPos(pos.p, we);
    cursor = mkPos(pos.p, we);
    desiredX = null;
    updateToolbar();
    resetBlink();
    inputEl.focus();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }

  if (multiClickCount >= 3) {
    /* Triple-click: select entire paragraph */
    selAnchor = mkPos(pos.p, 0);
    selFocus = mkPos(pos.p, paraTextLen(doc.paragraphs[pos.p]));
    cursor = clonePos(selFocus);
    desiredX = null;
    updateToolbar();
    resetBlink();
    inputEl.focus();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
}, true);

pagesWrapper.addEventListener("click", function(e) {
  if (e.target && e.target.classList && e.target.classList.contains("page-canvas")) {
    inputEl.focus();
  }
});

/* ================================================================
   NAVIGATION: Cursor movement functions. Vertical movement finds
   the nearest X position on adjacent lines, crossing page
   boundaries as needed.
   ================================================================ */

/* Update curStyle from the run at the current cursor position. */
function updateCurStyle() {
  var para = doc.paragraphs[cursor.p];
  if (cursor.o > 0) {
    curStyle = runStyleAt(para, cursor.o - 1);
  } else if (paraTextLen(para) > 0) {
    curStyle = runStyleAt(para, 0);
  }
}

/* Find the line containing the given position. */
function lineOfPos(pos) {
  return layoutRegion.lineIndexForPos(pos);
}

/* Find position on adjacent line using desiredX. If desiredX is set,
   use it instead of the current cursor X. This preserves the column
   position when moving vertically through lines of varying length. */
function findVertical(pos, dir) {
  var curLine = lineOfPos(pos);
  var targetLine = curLine + dir;
  if (targetLine < 0 || targetLine >= layoutRegion.lineCount()) {
    /* Boundary: might be at eviction edge. Try refilling adjacent paragraph. */
    var adjPara = (dir < 0) ? pos.p - 1 : pos.p + 1;
    if (adjPara >= 0 && adjPara < doc.paragraphs.length && !layoutRegion.isRealized(adjPara)) {
      layoutRegion.ensureRealized(Math.min(adjPara, pos.p), Math.max(adjPara, pos.p) + 1);
      /* Retry after refill */
      curLine = lineOfPos(pos);
      targetLine = curLine + dir;
      if (targetLine < 0 || targetLine >= layoutRegion.lineCount()) return pos;
    } else {
      return pos;
    }
  }
  var useX = desiredX;
  if (useX === null) {
    var coords = posToCoords(pos);
    if (!coords) return pos;
    useX = coords.x;
  }
  var line = layoutRegion.lineAt(targetLine);
  return hitTest(useX, line.y + line.height / 2, line.page);
}

/* Find start of current line. */
function lineStartOf(pos) {
  var line = layoutRegion.lineAt(lineOfPos(pos));
  if (!line || line.segments.length === 0) return mkPos(line ? line.paraIdx : 0, 0);
  return mkPos(line.segments[0].paraIdx, line.segments[0].startOff);
}

/* Find end of current line. */
function lineEndOf(pos) {
  var line = layoutRegion.lineAt(lineOfPos(pos));
  if (!line || line.segments.length === 0) return mkPos(line ? line.paraIdx : 0, 0);
  var last = line.segments[line.segments.length - 1];
  return mkPos(last.paraIdx, last.endOff);
}

