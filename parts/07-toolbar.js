/* ================================================================
   TOOLBAR: Style application and toolbar state synchronization.
   Character-level styles are applied per-run within selections.
   Paragraph-level styles apply to all affected paragraphs.
   ================================================================ */

/* Style toggle maps — shared by toggleStyle() and applyRunStyleToSelection(). */
var TOGGLE_MAP = {
  fontWeight: { on: "bold", off: "normal" },
  fontStyle: { on: "italic", off: "normal" }
};
var TD_SUB_TOGGLES = {
  underline: "underline",
  strike: "line-through"
};

/* Check if ALL runs within a selection range pass a test function.
   checkFn(run) returns true if the run matches. Returns true only
   if every run touching the range [r.s, r.e) passes. */
function checkAllRunsInRange(r, checkFn) {
  for (var p = r.s.p; p <= r.e.p; p++) {
    var para = doc.paragraphs[p];
    var sOff = (p === r.s.p) ? r.s.o : 0;
    var eOff = (p === r.e.p) ? r.e.o : paraTextLen(para);
    var acc = 0;
    for (var ri = 0; ri < para.runs.length; ri++) {
      var runEnd = acc + para.runs[ri].text.length;
      if (runEnd > sOff && acc < eOff) {
        if (!checkFn(para.runs[ri])) return false;
      }
      acc = runEnd;
    }
  }
  return true;
}

/* Toggle a style property. fontWeight/fontStyle use string values;
   underline/strike toggle keywords within textDecoration. */
function toggleStyle(prop) {
  if (hasSelection()) {
    applyRunStyleToSelection(prop, null);
  } else {
    var tm = TOGGLE_MAP[prop];
    var tdKey = TD_SUB_TOGGLES[prop];
    if (tm) {
      curStyle[prop] = (curStyle[prop] === tm.on) ? tm.off : tm.on;
    } else if (tdKey) {
      curStyle.textDecoration = tdToggle(curStyle.textDecoration, tdKey);
    } else {
      curStyle[prop] = !curStyle[prop];
    }
    updateToolbar();
  }
}

/* Apply a character-level style change to the selected text.
   For toggle props (fontWeight, fontStyle), toggles string values.
   For textDecoration sub-toggles (underline, strike), toggles keywords.
   For value props (linkHref, color, fontFamily, fontSize, script),
   sets the value directly. */
function applyRunStyleToSelection(prop, value) {
  if (!hasSelection()) {
    if (value !== null) {
      curStyle[prop] = value;
    } else if (TOGGLE_MAP[prop]) {
      curStyle[prop] = (curStyle[prop] === TOGGLE_MAP[prop].on) ? TOGGLE_MAP[prop].off : TOGGLE_MAP[prop].on;
    } else if (TD_SUB_TOGGLES[prop]) {
      curStyle.textDecoration = tdToggle(curStyle.textDecoration, TD_SUB_TOGGLES[prop]);
    } else {
      curStyle[prop] = value;
    }
    updateToolbar(); return;
  }
  var r = getSelRange();

  /* For toggle props, null means toggle.
     For value props (linkHref, color, fontFamily, fontSize, script),
     the value is applied directly. */
  var newVal = value;
  if (newVal === null && TOGGLE_MAP[prop]) {
    var allOn = checkAllRunsInRange(r, function(run) {
      return run[prop] === TOGGLE_MAP[prop].on;
    });
    newVal = allOn ? TOGGLE_MAP[prop].off : TOGGLE_MAP[prop].on;
  } else if (newVal === null && TD_SUB_TOGGLES[prop]) {
    var keyword = TD_SUB_TOGGLES[prop];
    var allOn = checkAllRunsInRange(r, function(run) {
      return tdHas(run.textDecoration, keyword);
    });
    /* Apply per-run because each run may have a different textDecoration value */
    var capStyle = captureSplice(r.s.p, r.e.p - r.s.p + 1);
    for (var p = r.s.p; p <= r.e.p; p++) {
      var para = doc.paragraphs[p];
      var sOff = (p === r.s.p) ? r.s.o : 0;
      var eOff = (p === r.e.p) ? r.e.o : paraTextLen(para);
      if (sOff >= eOff) continue;
      var locE = posToRun(para, eOff);
      splitRunAt(para, locE.r, locE.ro);
      var locS = posToRun(para, sOff);
      splitRunAt(para, locS.r, locS.ro);
      var acc2 = 0;
      for (var ri = 0; ri < para.runs.length; ri++) {
        var runEnd = acc2 + para.runs[ri].text.length;
        if (runEnd > sOff && acc2 < eOff) {
          if (allOn) {
            para.runs[ri].textDecoration = tdRemove(para.runs[ri].textDecoration, keyword);
          } else {
            para.runs[ri].textDecoration = tdAdd(para.runs[ri].textDecoration, keyword);
          }
        }
        acc2 = runEnd;
      }
      mergeAdjacentRuns(para);
    }
    finishSplice(capStyle, r.e.p - r.s.p + 1);
    curStyle.textDecoration = allOn ? tdRemove(curStyle.textDecoration, keyword) : tdAdd(curStyle.textDecoration, keyword);
    requestLayout({ fromPara: r.s.p, reason: "style" }); updateToolbar(); resetBlink();
    return;
  }

  /* Apply to each paragraph in range */
  var capStyle = captureSplice(r.s.p, r.e.p - r.s.p + 1);
  for (var p = r.s.p; p <= r.e.p; p++) {
    var para = doc.paragraphs[p];
    var sOff = (p === r.s.p) ? r.s.o : 0;
    var eOff = (p === r.e.p) ? r.e.o : paraTextLen(para);
    if (sOff >= eOff) continue;
    /* Split runs at boundaries */
    var locE = posToRun(para, eOff);
    splitRunAt(para, locE.r, locE.ro);
    var locS = posToRun(para, sOff);
    var startIdx = splitRunAt(para, locS.r, locS.ro);
    /* Set property on affected runs */
    var acc = 0;
    for (var ri = 0; ri < para.runs.length; ri++) {
      var runEnd = acc + para.runs[ri].text.length;
      if (runEnd > sOff && acc < eOff) {
        para.runs[ri][prop] = newVal;
      }
      acc = runEnd;
    }
    mergeAdjacentRuns(para);
  }
  finishSplice(capStyle, r.e.p - r.s.p + 1);
  curStyle[prop] = newVal;
  requestLayout({ fromPara: r.s.p, reason: "style" }); updateToolbar(); resetBlink();
}

/* Synchronize all toolbar controls with the current cursor or selection state. */
function updateToolbar() {
  var style = curStyle;
  if (hasSelection()) {
    var r = getSelRange();
    var para = doc.paragraphs[r.s.p];
    if (paraTextLen(para) > 0) style = runStyleAt(para, Math.min(r.s.o, paraTextLen(para) - 1));
  } else if (cursor.o > 0) {
    style = runStyleAt(doc.paragraphs[cursor.p], cursor.o - 1);
  }

  document.getElementById("font-family").value = style.fontFamily;
  document.getElementById("font-size").value = style.fontSize;
  document.getElementById("color-pick").value = style.color;
  document.getElementById("btn-bold").classList.toggle("active", style.fontWeight === "bold");
  document.getElementById("btn-italic").classList.toggle("active", style.fontStyle === "italic");
  document.getElementById("btn-underline").classList.toggle("active", tdHas(style.textDecoration, "underline"));
  document.getElementById("btn-strike").classList.toggle("active", tdHas(style.textDecoration, "line-through"));
  document.getElementById("btn-highlight").classList.toggle("active", !!(style.backgroundColor));

  var ps = doc.paragraphs[cursor.p].style;
  document.getElementById("sel-indent").value = String(ps.textIndent || 0);
  document.getElementById("sel-line-height").value = String(ps.lineHeight || 1.2);
  document.getElementById("sel-space-before").value = String(ps.marginTop || 0);
  document.getElementById("sel-space-after").value = String(ps.marginBottom || 0);
  document.getElementById("sel-role").value = ps["x-role"] || "body";
  document.getElementById("sel-script").value = style["x-script"] || "normal";
  document.getElementById("btn-left").classList.toggle("active", ps.textAlign === "left");
  document.getElementById("btn-center").classList.toggle("active", ps.textAlign === "center");
  document.getElementById("btn-right").classList.toggle("active", ps.textAlign === "right");
  document.getElementById("btn-justify").classList.toggle("active", ps.textAlign === "justify");
  document.getElementById("btn-bullet").classList.toggle("active", !!(ps["x-list"] && ps["x-list"].type === "bullet"));
  document.getElementById("btn-number").classList.toggle("active", !!(ps["x-list"] && ps["x-list"].type === "number"));
  document.getElementById("list-level").textContent = ps["x-list"] ? "L" + (ps["x-list"].level || 0) : "";
  document.getElementById("btn-link").classList.toggle("active", !!(style["x-linkHref"]));

  /* Undo/redo button disabled state */
  document.getElementById("btn-undo").disabled = (undoStack.length === 0);
  document.getElementById("btn-redo").disabled = (redoStack.length === 0);

  /* Drop cap toggle: reflects current paragraph's dropCap property.
     Button is disabled if the paragraph cannot sustain 3+ wrapped lines. */
  var curParaDC = doc.paragraphs[cursor.p] && doc.paragraphs[cursor.p].style["x-dropCap"];
  var dcOn = !!(curParaDC && curParaDC.enabled);
  var dcBtn = document.getElementById("btn-dropcap");
  dcBtn.classList.toggle("active", dcOn);
  /* Eligibility: count layout lines for current paragraph */
  var dcLineCount = layoutRegion.paraLineCount(cursor.p);
  var curParaRole = doc.paragraphs[cursor.p] ? (doc.paragraphs[cursor.p].style["x-role"] || "body") : "";
  dcBtn.disabled = (curParaRole !== "body" || dcLineCount < 3);

  /* Lead-in small caps toggle: reflects bookDesign value.
     Always enabled — it's a global toggle, not per-paragraph. */
  var liEnabled = doc.bookDesign
    && doc.bookDesign.chapter
    && doc.bookDesign.chapter.body
    && doc.bookDesign.chapter.body.firstParagraph
    && doc.bookDesign.chapter.body.firstParagraph.leadIn
    && doc.bookDesign.chapter.body.firstParagraph.leadIn.enabled;
  document.getElementById("btn-smallcaps")
    .classList.toggle("active", !!liEnabled);
}

/* Toolbar button event listeners */

document.getElementById("btn-cut").addEventListener("click", function(e) {
  e.preventDefault();
  if (!hasSelection()) { inputEl.focus(); return; }
  var selText = getSelectedText();
  copySelection().then(function(ok) {
    if (ok || internalClipboard === selText) {
      var cutRange = getSelRange();
      var capCut2 = captureSplice(cutRange.s.p, cutRange.e.p - cutRange.s.p + 1);
      deleteRange(cutRange.s, cutRange.e);
      clearSel();
      finishSplice(capCut2, 1);
      requestLayout({ fromPara: cutRange.s.p, reason: "delete" }); resetBlink();
      statusPill("ok", "Cut");
    } else {
      statusPill("bad", "Copy failed \u2014 not cutting");
    }
    inputEl.focus();
  });
});
document.getElementById("btn-copy").addEventListener("click", function(e) {
  e.preventDefault();
  copySelection().then(function() { inputEl.focus(); });
});
document.getElementById("btn-paste").addEventListener("click", function(e) {
  e.preventDefault();
  inputEl.focus({ preventScroll: true });
  doPaste();
});
document.getElementById("btn-find").addEventListener("click", function(e) {
  e.preventDefault(); openFindBar();
});
document.getElementById("btn-spell").addEventListener("click", function(e) {
  e.preventDefault();
  spellState.enabled = !spellState.enabled;
  e.currentTarget.classList.toggle("active", spellState.enabled);
  if (spellState.enabled) {
    if (!spellProvider.isReady()) {
      statusPill("ok", "Loading dictionary\u2026");
    } else {
      spellState.paraHashes = {};
      spellRefresh();
      statusPill("ok", "Spell check on");
    }
  } else {
    spellState.misspellings = [];
    rebuildSpellIndex();
    statusPill("ok", "Spell check off");
  }
  render();
  inputEl.focus();
});

document.getElementById("btn-undo").addEventListener("click", function(e) {
  e.preventDefault(); doUndo(); inputEl.focus();
});
document.getElementById("btn-redo").addEventListener("click", function(e) {
  e.preventDefault(); doRedo(); inputEl.focus();
});

document.getElementById("font-family").addEventListener("change", function() {
  applyRunStyleToSelection("fontFamily", this.value); inputEl.focus();
});
document.getElementById("font-size").addEventListener("change", function() {
  applyRunStyleToSelection("fontSize", parseInt(this.value)); inputEl.focus();
});
document.getElementById("btn-bold").addEventListener("click", function(e) {
  e.preventDefault(); toggleStyle("fontWeight"); inputEl.focus();
});
document.getElementById("btn-italic").addEventListener("click", function(e) {
  e.preventDefault(); toggleStyle("fontStyle"); inputEl.focus();
});
document.getElementById("btn-underline").addEventListener("click", function(e) {
  e.preventDefault(); toggleStyle("underline"); inputEl.focus();
});
document.getElementById("btn-strike").addEventListener("click", function(e) {
  e.preventDefault(); toggleStyle("strike"); inputEl.focus();
});
document.getElementById("btn-highlight").addEventListener("click", function(e) {
  e.preventDefault();
  var HIGHLIGHT_COLOR = "#FFFF00";
  if (hasSelection()) {
    /* Check if all selected text already has this highlight */
    var r = getSelRange();
    var allOn = checkAllRunsInRange(r, function(run) {
      return run.backgroundColor === HIGHLIGHT_COLOR;
    });
    applyRunStyleToSelection("backgroundColor", allOn ? null : HIGHLIGHT_COLOR);
  } else {
    curStyle.backgroundColor = (curStyle.backgroundColor === HIGHLIGHT_COLOR) ? null : HIGHLIGHT_COLOR;
    updateToolbar();
  }
  inputEl.focus();
});
document.getElementById("color-pick").addEventListener("input", function() {
  applyRunStyleToSelection("color", this.value); inputEl.focus();
});

function setParaAlign(align) {
  var paras = getAffectedParas();
  var capAlign = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) doc.paragraphs[paras[i]].style.textAlign = align;
  finishSplice(capAlign, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); updateToolbar(); resetBlink(); inputEl.focus();
}
document.getElementById("btn-left").addEventListener("click", function(e) { e.preventDefault(); setParaAlign("left"); });
document.getElementById("btn-center").addEventListener("click", function(e) { e.preventDefault(); setParaAlign("center"); });
document.getElementById("btn-right").addEventListener("click", function(e) { e.preventDefault(); setParaAlign("right"); });
document.getElementById("btn-justify").addEventListener("click", function(e) { e.preventDefault(); setParaAlign("justify"); });

document.getElementById("sel-indent").addEventListener("change", function() {
  var val = parseFloat(this.value);
  var paras = getAffectedParas();
  var capInd = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) doc.paragraphs[paras[i]].style.textIndent = val;
  finishSplice(capInd, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); resetBlink(); inputEl.focus();
});

document.getElementById("sel-line-height").addEventListener("change", function() {
  var val = parseFloat(this.value);
  var paras = getAffectedParas();
  var capLH = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) doc.paragraphs[paras[i]].style.lineHeight = val;
  finishSplice(capLH, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); resetBlink(); inputEl.focus();
});

/* Spacing before/after dropdowns */
document.getElementById("sel-space-before").addEventListener("change", function() {
  var val = parseFloat(this.value);
  var paras = getAffectedParas();
  var capSB = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) doc.paragraphs[paras[i]].style.marginTop = val;
  finishSplice(capSB, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); resetBlink(); inputEl.focus();
});
document.getElementById("sel-space-after").addEventListener("change", function() {
  var val = parseFloat(this.value);
  var paras = getAffectedParas();
  var capSA = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) doc.paragraphs[paras[i]].style.marginBottom = val;
  finishSplice(capSA, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); resetBlink(); inputEl.focus();
});

/* Paragraph role/style dropdown — uses applyRolePreset */
document.getElementById("sel-role").addEventListener("change", function() {
  var val = this.value;
  var paras = getAffectedParas();
  var capRole = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
  for (var i = 0; i < paras.length; i++) {
    applyRolePreset(doc.paragraphs[paras[i]], val);
  }
  finishSplice(capRole, paras[paras.length - 1] - paras[0] + 1);
  requestLayout({ fromPara: paras[0], reason: "style" }); updateToolbar(); resetBlink(); inputEl.focus();
});

/* Superscript/Subscript dropdown */
document.getElementById("sel-script").addEventListener("change", function() {
  applyRunStyleToSelection("x-script", this.value);
  inputEl.focus();
});

/* Clear Formatting button */
document.getElementById("btn-clear-fmt").addEventListener("click", function(e) {
  e.preventDefault();
  if (!hasSelection()) { inputEl.focus(); return; }
  var r = getSelRange();
  var capClear = captureSplice(r.s.p, r.e.p - r.s.p + 1);
  for (var p = r.s.p; p <= r.e.p; p++) {
    var para = doc.paragraphs[p];
    var pStart = (p === r.s.p) ? r.s.o : 0;
    var pEnd = (p === r.e.p) ? r.e.o : paraTextLen(para);
    if (pStart >= pEnd) continue;
    var slice = extractRunSlice(para, pStart, pEnd);
    for (var i = slice.startIdx; i < slice.endIdx; i++) {
      clearRunFormatting(para.runs[i]);
    }
    mergeAdjacentRuns(para);
  }
  finishSplice(capClear, r.e.p - r.s.p + 1);
  requestLayout({ fromPara: r.s.p, reason: "style" }); updateToolbar(); resetBlink(); inputEl.focus();
});

/* List toggle buttons */
document.getElementById("btn-bullet").addEventListener("click", function(e) {
  e.preventDefault(); toggleList("bullet"); inputEl.focus();
});
document.getElementById("btn-number").addEventListener("click", function(e) {
  e.preventDefault(); toggleList("number"); inputEl.focus();
});

/* Link button: prompts for URL and applies to selection */
/* Link bar state: saved selection for when bar is open */
var linkBarSavedSel = null;

function showLinkBar() {
  if (!hasSelection()) { statusPill("warn", "Select text first"); return; }
  /* W02: Close find bar if open (preserve selection for link) */
  var fb = document.getElementById("find-bar");
  if (fb.style.display === "flex") {
    fb.classList.remove("visible"); fb.style.display = "none";
    findState.query = ""; findState.matches = []; findState.currentIdx = -1;
    document.getElementById("find-input").value = "";
    document.getElementById("replace-input").value = "";
  }
  linkBarSavedSel = { anchor: clonePos(selAnchor), focus: clonePos(selFocus), cursor: clonePos(cursor) };
  /* Pre-fill with existing link if cursor is on one */
  var para = doc.paragraphs[cursor.p];
  var existing = getLinkAtOffset(para, Math.max(0, cursor.o - 1));
  var urlInput = document.getElementById("link-url-input");
  urlInput.value = existing || "https://";
  document.getElementById("link-bar").style.display = "block";
  urlInput.focus();
  urlInput.select();
}

function hideLinkBar() {
  document.getElementById("link-bar").style.display = "none";
  if (linkBarSavedSel) {
    selAnchor = linkBarSavedSel.anchor;
    selFocus = linkBarSavedSel.focus;
    cursor = linkBarSavedSel.cursor;
    linkBarSavedSel = null;
  }
  inputEl.focus({ preventScroll: true });
}

function applyLinkFromBar() {
  var url = document.getElementById("link-url-input").value;
  var normalized = normalizeUrl(url);
  if (!normalized) { statusPill("warn", "Invalid URL"); return; }
  hideLinkBar();
  applyRunStyleToSelection("x-linkHref", normalized);
  statusPill("ok", "Link applied");
}

document.getElementById("link-apply-btn").addEventListener("click", function(e) {
  e.preventDefault(); applyLinkFromBar();
});
document.getElementById("link-cancel-btn").addEventListener("click", function(e) {
  e.preventDefault(); hideLinkBar();
});
document.getElementById("link-url-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { e.preventDefault(); applyLinkFromBar(); }
  if (e.key === "Escape") { e.preventDefault(); hideLinkBar(); }
});

document.getElementById("btn-link").addEventListener("click", function(e) {
  e.preventDefault();
  showLinkBar();
});

/* Unlink button: removes link from selection */
document.getElementById("btn-unlink").addEventListener("click", function(e) {
  e.preventDefault();
  if (!hasSelection()) { statusPill("warn", "Select linked text"); inputEl.focus(); return; }
  applyRunStyleToSelection("x-linkHref", null);
  inputEl.focus();
});

/* Drop Cap toggle: per-paragraph property toggle */
document.getElementById("btn-dropcap").addEventListener("click", function(e) {
  e.preventDefault();
  var p = doc.paragraphs[cursor.p];
  if (!p) { inputEl.focus(); return; }
  if (!p.style["x-dropCap"] || typeof p.style["x-dropCap"] !== "object") p.style["x-dropCap"] = { enabled: false };
  /* If trying to enable, verify eligibility (defense in depth) */
  if (!p.style["x-dropCap"].enabled) {
    var role = p.style["x-role"] || "body";
    if (role !== "body") { statusPill("bad", "Drop cap only for body paragraphs"); inputEl.focus(); return; }
    var lc = layoutRegion.paraLineCount(cursor.p);
    if (lc < 3) { statusPill("bad", "Paragraph needs at least 3 lines"); inputEl.focus(); return; }
  }
  var oldDcEnabled = p.style["x-dropCap"].enabled;
  p.style["x-dropCap"].enabled = !p.style["x-dropCap"].enabled;
  var on = p.style["x-dropCap"].enabled;
  pushDelta(createDelta("paraStyle", {
    p: cursor.p, property: "x-dropCap", oldValue: {enabled: oldDcEnabled}, newValue: {enabled: on},
    cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
  document.getElementById("btn-dropcap").classList.toggle("active", on);
  requestLayout({ fromPara: cursor.p, reason: "style" }); render();
  statusPill("ok", on ? "Drop cap enabled" : "Drop cap disabled");
  inputEl.focus();
});

/* Toggle lead-in small caps for all chapters. Writes to
   bookDesign.chapter.body.firstParagraph.leadIn.enabled
   and pushes a bookDesign delta for undo support. */
document.getElementById("btn-smallcaps")
  .addEventListener("click", function(e) {
    e.preventDefault();
    var bd = doc.bookDesign;
    if (!bd || !bd.chapter || !bd.chapter.body
        || !bd.chapter.body.firstParagraph) {
      inputEl.focus(); return;
    }
    var fp = bd.chapter.body.firstParagraph;
    if (!fp.leadIn) fp.leadIn = {
      enabled: false, wordCount: 4,
      mode: "auto", scaleRatio: 0.70,
      strokeRatio: 0.020, kerningRatio: 0.031
    };

    var oldVal = fp.leadIn.enabled;
    var newVal = !oldVal;
    fp.leadIn.enabled = newVal;

    pushDelta(createDelta("bookDesign", {
      changes: [{
        path: "chapter.body.firstParagraph.leadIn.enabled",
        oldValue: oldVal,
        newValue: newVal
      }],
      cursorBefore: clonePos(cursor),
      cursorAfter: clonePos(cursor)
    }));

    document.getElementById("btn-smallcaps")
      .classList.toggle("active", newVal);
    requestFullLayout("leadIn");
    render();
    statusPill("ok", newVal
      ? "Lead-in small caps enabled"
      : "Lead-in small caps disabled");
    inputEl.focus();
  });

/* Insert Image: reads a local image file and inserts it as an image paragraph */
document.getElementById("btn-insert-image").addEventListener("click", function(e) {
  e.preventDefault();
  document.getElementById("image-file-input").click();
});
document.getElementById("image-file-input").addEventListener("change", function() {
  var file = this.files && this.files[0];
  if (!file) return;
  this.value = "";  /* reset so re-selecting same file triggers change */
  statusPill("ok", "Loading image\u2026");
  var reader = new FileReader();
  reader.onload = function(ev) {
    var dataUrl = ev.target.result;
    var img = new Image();
    img.onload = function() {
      var nw = img.naturalWidth;
      var nh = img.naturalHeight;
      /* Compute display size in pt: fit to content width (in pt) */
      var contentWPt = (doc.bookSettings.trim.widthIn - doc.bookSettings.marginsIn.left - doc.bookSettings.marginsIn.right) * 72;
      var widthPt = Math.min(nw * 0.75, contentWPt);  /* 0.75 = 72/96 approx px→pt */
      var heightPt = widthPt * (nh / nw);
      var insertAt = cursor.p + 1;
      var capImg = captureSplice(insertAt > 0 ? insertAt - 1 : 0, 1);
      var imgPara = createImagePara(dataUrl, widthPt, heightPt, nw, nh);
      imgPara.style["x-sectionId"] = currentSectionId();
      doc.paragraphs.splice(insertAt, 0, imgPara);
      cursor = mkPos(insertAt, 0);
      clearSel();
      finishSplice(capImg, 2);
      requestLayout({ fromPara: insertAt, reason: "split" }); updateToolbar(); resetBlink(); scrollCursorIntoView();
      statusPill("ok", "Image inserted");
    };
    img.onerror = function() {
      statusPill("bad", "Invalid image file");
    };
    img.src = dataUrl;
  };
  reader.onerror = function() {
    statusPill("bad", "Could not read file");
  };
  reader.readAsDataURL(file);
});

/* ================================================================
   ZOOM: Resizes canvas buffers and re-renders at native resolution.
   ================================================================ */

function setZoom(val) {
  zoom = val;
  document.getElementById("zoom-select").value = val.toFixed(2);
  applyZoom(); render();
}
function zoomIn() {
  for (var i = 0; i < zoomLevels.length; i++) {
    if (zoomLevels[i] > zoom + 0.01) { setZoom(zoomLevels[i]); return; }
  }
}
function zoomOut() {
  for (var i = zoomLevels.length - 1; i >= 0; i--) {
    if (zoomLevels[i] < zoom - 0.01) { setZoom(zoomLevels[i]); return; }
  }
}
document.getElementById("zoom-select").addEventListener("change", function() {
  setZoom(parseFloat(this.value)); inputEl.focus();
});
document.getElementById("btn-zoom-in").addEventListener("click", function(e) {
  e.preventDefault(); zoomIn(); inputEl.focus();
});
document.getElementById("btn-zoom-out").addEventListener("click", function(e) {
  e.preventDefault(); zoomOut(); inputEl.focus();
});
document.getElementById("page-area").addEventListener("wheel", function(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  }
}, { passive: false });

