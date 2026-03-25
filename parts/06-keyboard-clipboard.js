/* ================================================================
   KEYBOARD INPUT: Handles all keystrokes including navigation,
   editing, formatting shortcuts, and zoom.
   ================================================================ */

inputEl.addEventListener("keydown", function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  var shift = e.shiftKey;
  var changed = false;

  /* ── Formatting Shortcuts ── */
  if (ctrl && (e.key === "b" || e.key === "B")) { e.preventDefault(); toggleStyle("fontWeight"); return; }
  if (ctrl && (e.key === "i" || e.key === "I")) { e.preventDefault(); toggleStyle("fontStyle"); return; }
  if (ctrl && (e.key === "u" || e.key === "U")) { e.preventDefault(); toggleStyle("underline"); return; }

  /* ── Selection ── */
  if (ctrl && (e.key === "a" || e.key === "A")) {
    e.preventDefault();
    /* Select current section only */
    var _ctrlASec = sectionOfPara(cursor.p);
    var _ctrlAFirst = -1, _ctrlALast = -1;
    if (_sectionIndex && _sectionIndex.byId[_ctrlASec]) {
      _ctrlAFirst = _sectionIndex.byId[_ctrlASec].first;
      _ctrlALast = _sectionIndex.byId[_ctrlASec].last;
    } else {
      /* Fallback: scan */
      for (var _cai = 0; _cai < doc.paragraphs.length; _cai++) {
        if (doc.paragraphs[_cai].style["x-sectionId"] === _ctrlASec) {
          if (_ctrlAFirst < 0) _ctrlAFirst = _cai;
          _ctrlALast = _cai;
        }
      }
    }
    if (_ctrlAFirst < 0) { _ctrlAFirst = 0; _ctrlALast = doc.paragraphs.length - 1; }
    selAnchor = mkPos(_ctrlAFirst, 0);
    selFocus = mkPos(_ctrlALast, paraTextLen(doc.paragraphs[_ctrlALast]));
    cursor = clonePos(selFocus);
    updateToolbar(); resetBlink(); return;
  }

  /* ── Drag Cancel ── */
  if (e.key === "Escape" && dragMode === "move" && isDragging) {
    isDragging = false;
    dragMode = "select";
    dragMoveData = null;
    dropPos = null;
    for (var ci = 0; ci < pageWin.slots.length; ci++) pageWin.slots[ci].canvas.classList.remove("drag-move");
    render();
    return;
  }

  /* ── Undo / Redo ── */
  if (ctrl && (e.key === "z" || e.key === "Z") && !shift) { e.preventDefault(); doUndo(); return; }
  if (ctrl && (e.key === "z" || e.key === "Z") && shift) { e.preventDefault(); doRedo(); return; }
  if (ctrl && (e.key === "y" || e.key === "Y")) { e.preventDefault(); doRedo(); return; }

  /* ── Zoom ── */
  if (ctrl && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn(); return; }
  if (ctrl && e.key === "-") { e.preventDefault(); zoomOut(); return; }
  if (ctrl && e.key === "0") { e.preventDefault(); setZoom(1.00); return; }

  /* ── Navigation (Arrow keys, Home, End) ── */
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    if (cursor.o > 0) cursor.o--;
    else if (cursor.p > 0) { cursor.p--; cursor.o = paraTextLen(doc.paragraphs[cursor.p]); }
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    desiredX = null;
    updateCurStyle(); updateToolbar(); resetBlink(); return;
  }

  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    var len = paraTextLen(doc.paragraphs[cursor.p]);
    if (cursor.o < len) cursor.o++;
    else if (cursor.p < doc.paragraphs.length - 1) { cursor.p++; cursor.o = 0; }
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    desiredX = null;
    updateCurStyle(); updateToolbar(); resetBlink(); return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    if (desiredX === null) {
      var coords = posToCoords(cursor);
      if (coords) desiredX = coords.x;
    }
    cursor = findVertical(cursor, -1);
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    updateCurStyle(); updateToolbar(); resetBlink(); scrollCursorIntoView(); return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    if (desiredX === null) {
      var coords = posToCoords(cursor);
      if (coords) desiredX = coords.x;
    }
    cursor = findVertical(cursor, 1);
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    updateCurStyle(); updateToolbar(); resetBlink(); scrollCursorIntoView(); return;
  }

  if (e.key === "Home") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    cursor = lineStartOf(cursor);
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    desiredX = null;
    updateCurStyle(); updateToolbar(); resetBlink(); return;
  }

  if (e.key === "End") {
    e.preventDefault();
    if (!shift) clearSel();
    else if (!selAnchor) selAnchor = clonePos(cursor);
    cursor = lineEndOf(cursor);
    if (shift && selAnchor) { cursor = clampToSection(cursor, sectionOfPara(selAnchor.p)); }
    if (shift) selFocus = clonePos(cursor);
    desiredX = null;
    updateCurStyle(); updateToolbar(); resetBlink(); return;
  }

  /* ── Indentation ── */
  if (e.key === "Tab") {
    e.preventDefault();
    var paras = getAffectedParas();
    var capTab = captureSplice(paras[0], paras[paras.length - 1] - paras[0] + 1);
    var anyList = false;
    for (var i = 0; i < paras.length; i++) {
      if (doc.paragraphs[paras[i]].style["x-list"]) { anyList = true; break; }
    }
    if (anyList) {
      /* List level change */
      for (var i = 0; i < paras.length; i++) {
        var pp = doc.paragraphs[paras[i]].style;
        if (!pp["x-list"]) continue;
        if (shift) {
          if ((pp["x-list"].level || 0) > 0) pp["x-list"].level--;
          else pp["x-list"] = null;
        } else {
          pp["x-list"].level = Math.min((pp["x-list"].level || 0) + 1, 4);
        }
      }
    } else {
      /* Normal indent cycling */
      var indentPresets = [0, 18, 21.6, 23.76, 36];
      for (var i = 0; i < paras.length; i++) {
        var pp = doc.paragraphs[paras[i]].style;
        var cur = pp.textIndent || 0;
        var idx = 0;
        for (var j = 0; j < indentPresets.length; j++) {
          if (Math.abs(indentPresets[j] - cur) < 0.5) { idx = j; break; }
        }
        if (shift) { if (idx > 0) pp.textIndent = indentPresets[idx - 1]; }
        else { if (idx < indentPresets.length - 1) pp.textIndent = indentPresets[idx + 1]; }
      }
    }
    finishSplice(capTab, paras[paras.length - 1] - paras[0] + 1);
    requestLayout({ fromPara: paras[0], reason: "style" }); updateToolbar(); resetBlink(); return;
  }

  /* ── Paragraph Operations ── */
  if (e.key === "Enter") {
    e.preventDefault();
    var enterPara = doc.paragraphs[cursor.p];
    if (enterPara.style["x-list"] && paraTextLen(enterPara) === 0 && !hasSelection()) {
      /* Empty list item: exit list instead of creating new item */
      var oldList = enterPara.style["x-list"] ? JSON.parse(JSON.stringify(enterPara.style["x-list"])) : null;
      pushDelta(createDelta("paraStyle", {
        p: cursor.p, property: "x-list", oldValue: oldList, newValue: null,
        cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
      enterPara.style["x-list"] = null;
      requestLayout({ fromPara: cursor.p, reason: "style" }); updateToolbar(); resetBlink(); scrollCursorIntoView();
    } else {
      var capEnter = captureSplice(cursor.p, hasSelection() ? (getSelRange().e.p - getSelRange().s.p + 1) : 1);
      splitParagraph();
      finishSplice(capEnter, cursor.p - capEnter.p + 1);
    }
    return;
  }

  /* ── Deletion ── */
  if (e.key === "Backspace") {
    e.preventDefault();
    /* Guard: do not delete text WITHIN structural paragraphs (but allow merge at boundary) */
    var bsPara = doc.paragraphs[cursor.p];
    if ((bsPara.style["x-role"] === "sceneBreak" || bsPara.style["x-role"] === "pageBreak") && cursor.o > 0) return;
    doBackspace(); return;
  }
  if (e.key === "Delete") {
    e.preventDefault();
    /* Guard: do not delete text WITHIN structural paragraphs (but allow merge at boundary) */
    var delPara = doc.paragraphs[cursor.p];
    if ((delPara.style["x-role"] === "sceneBreak" || delPara.style["x-role"] === "pageBreak") && cursor.o < paraTextLen(delPara)) return;
    doDelete(); return;
  }

  /* ── Character Input ── */
  if (e.key.length === 1 && !ctrl) {
    e.preventDefault();
    /* Guard: do not insert text into structural paragraphs */
    var typePara = doc.paragraphs[cursor.p];
    if (typePara.style["x-role"] === "sceneBreak" || typePara.style["x-role"] === "pageBreak") return;
    if (hasSelection()) {
      var selR = getSelRange();
      var capType = captureSplice(selR.s.p, selR.e.p - selR.s.p + 1);
      insertText(e.key);
      finishSplice(capType, 1);
    } else {
      pushDelta(createDelta("insert", {
        p: cursor.p, offset: cursor.o, text: e.key, style: cloneRunStyle(curStyle),
        cursorBefore: clonePos(cursor), cursorAfter: {p: cursor.p, o: cursor.o + e.key.length} }));
      insertText(e.key);
    }
    return;
  }
});

/* ================================================================
   CLIPBOARD: Sentinel-based system following CodeMirror input
   reading pattern. The hidden textarea always contains either the
   selected text or a zero-width sentinel. Paste reads via the DOM
   paste event or the beforeinput/input fallback. Copy uses the
   modern clipboard API with execCommand fallback. Cut only deletes
   after confirmed copy.
   ================================================================ */

var SENTINEL = "\u200B";
var internalClipboard = "";
var internalClipboardRich = null;  /* Array of { style, runs } or null */
var pasteArmed = false;

/* Reload the textarea with current selection text or sentinel.
   Called after every cursor/selection change so the browser always
   has the right content for native copy and paste overwrites. */
function reloadSentinel() {
  var sel = hasSelection() ? getSelectedText() : "";
  inputEl.value = (sel && sel.length > 0) ? sel : SENTINEL;
  inputEl.select();
}

/* Insert plain text into the document, splitting on newlines to
   create paragraphs. Used by all paste paths. */
function insertPlainText(text) {
  if (!text) return;
  var minP = cursor.p, maxP = cursor.p;
  if (hasSelection()) { var sr = getSelRange(); minP = sr.s.p; maxP = sr.e.p; }
  var capPaste = captureSplice(minP, maxP - minP + 1);
  if (hasSelection()) { deleteRange(getSelRange().s, getSelRange().e); clearSel(); }
  var parts = text.replace(/\r\n/g, "\n").split("\n");
  insertText(parts[0]);
  for (var i = 1; i < parts.length; i++) {
    splitParagraph();
    insertText(parts[i]);
  }
  finishSplice(capPaste, cursor.p - minP + 1);
}

/* Insert structured content (array of { style, runs }) at the cursor.
   Preserves all run and paragraph formatting. Assigns x-sectionId
   to the current section. Handles undo via captureSplice. */
function insertRichContent(richData) {
  if (!richData || richData.length === 0) return;

  var minP = cursor.p, maxP = cursor.p;
  if (hasSelection()) { var sr = getSelRange(); minP = sr.s.p; maxP = sr.e.p; }
  var capPaste = captureSplice(minP, maxP - minP + 1);

  if (hasSelection()) { deleteRange(getSelRange().s, getSelRange().e); clearSel(); }
  clampPos(cursor);

  var sid = currentSectionId();

  if (richData.length === 1) {
    var para = doc.paragraphs[cursor.p];
    var runsToInsert = [];
    for (var i = 0; i < richData[0].runs.length; i++) {
      runsToInsert.push(makeRun(richData[0].runs[i].text, richData[0].runs[i]));
    }
    insertRunSlice(para, cursor.o, runsToInsert);
    var insertedLen = 0;
    for (var i = 0; i < runsToInsert.length; i++) insertedLen += runsToInsert[i].text.length;
    cursor.o += insertedLen;
  } else {
    /* Multi-paragraph: split destination, insert all pasted paragraphs between halves */
    var splitOff = cursor.o;

    splitParaAt(cursor.p, splitOff);

    var insertAt = cursor.p + 1;
    for (var pi = 0; pi < richData.length; pi++) {
      var newStyle = JSON.parse(JSON.stringify(richData[pi].style));
      newStyle["x-sectionId"] = sid;
      var newRuns = [];
      for (var ri = 0; ri < richData[pi].runs.length; ri++) {
        newRuns.push(makeRun(richData[pi].runs[ri].text, richData[pi].runs[ri]));
      }
      doc.paragraphs.splice(insertAt, 0, { style: newStyle, runs: newRuns });
      insertAt++;
    }

    if (splitOff === 0 && doc.paragraphs.length > 1) {
      doc.paragraphs.splice(cursor.p, 1);
      insertAt--;
    }

    var tailIdx = insertAt;
    if (tailIdx < doc.paragraphs.length) {
      var tailText = paraText(doc.paragraphs[tailIdx]);
      if (tailText.length === 0 && doc.paragraphs.length > 1) {
        doc.paragraphs.splice(tailIdx, 1);
      }
    }

    var lastPastedIdx = insertAt - 1;
    if (lastPastedIdx >= doc.paragraphs.length) lastPastedIdx = doc.paragraphs.length - 1;
    var lastPastedText = paraText(doc.paragraphs[lastPastedIdx]);
    cursor = mkPos(lastPastedIdx, lastPastedText.length);
  }

  clearSel();
  finishSplice(capPaste, cursor.p - minP + 1);
  requestLayout({ fromPara: minP, reason: "insert" });
  resetBlink(); scrollCursorIntoView();
}

/* Attempt rich paste using internal clipboard data.
   Returns true if rich paste was performed, false otherwise. */
function tryRichPaste(plainText) {
  if (internalClipboardRich &&
      internalClipboard &&
      plainText === internalClipboard) {
    insertRichContent(internalClipboardRich);
    return true;
  }
  return false;
}

/* Shared paste logic — used by both Ctrl+V and paste button.
   Tries system clipboard first, falls back to internal clipboard. */
function doPaste() {
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function(text) {
      if (text) {
        if (!tryRichPaste(text)) insertPlainText(text);
        reloadSentinel(); statusPill("ok", "Pasted");
      } else if (internalClipboard) {
        if (!tryRichPaste(internalClipboard)) insertPlainText(internalClipboard);
        reloadSentinel(); statusPill("ok", "Pasted (internal)");
      } else {
        statusPill("warn", "Nothing to paste");
      }
    }).catch(function() {
      if (internalClipboard) {
        if (!tryRichPaste(internalClipboard)) insertPlainText(internalClipboard);
        reloadSentinel(); statusPill("ok", "Pasted (internal)");
      } else {
        statusPill("warn", "Nothing to paste");
      }
    });
  } else {
    if (internalClipboard) {
      if (!tryRichPaste(internalClipboard)) insertPlainText(internalClipboard);
      reloadSentinel(); statusPill("ok", "Pasted (internal)");
    } else {
      statusPill("warn", "Nothing to paste");
    }
  }
}

/* Primary paste: DOM paste event reads clipboardData directly. */
inputEl.addEventListener("paste", function(e) {
  var txt = "";
  try { txt = e.clipboardData.getData("text/plain"); } catch(ex) {}
  if (txt) {
    e.preventDefault();
    if (!tryRichPaste(txt)) {
      insertPlainText(txt);
    }
    pasteArmed = false;
    reloadSentinel();
    statusPill("ok", "Pasted");
    return;
  }
  pasteArmed = true;
});

/* Secondary paste: beforeinput flags paste, input reads the value. */
inputEl.addEventListener("beforeinput", function(e) {
  if (e.inputType === "insertFromPaste") pasteArmed = true;
});

inputEl.addEventListener("input", function() {
  var v = inputEl.value;
  if (!v || v === SENTINEL) return;
  if (!pasteArmed) return;
  pasteArmed = false;
  inputEl.value = SENTINEL;
  inputEl.select();
  if (!tryRichPaste(v)) {
    insertPlainText(v);
  }
  reloadSentinel();
  statusPill("ok", "Pasted");
});

/* Copy utility: modern API with execCommand fallback. */
function copyTextToClipboard(text) {
  if (!text || text.length === 0) return Promise.resolve(false);
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function() {
      return true;
    }).catch(function() {
      return execCommandCopyFallback(text);
    });
  }
  return Promise.resolve(execCommandCopyFallback(text));
}

function execCommandCopyFallback(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:0;top:0;opacity:0;";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  var ok = false;
  try { ok = document.execCommand("copy"); } catch(ex) { ok = false; }
  ta.remove();
  inputEl.focus({ preventScroll: true });
  return ok;
}

/* Copy current selection. Stores in internalClipboard regardless. */
function copySelection() {
  var text = getSelectedText();
  if (!text) { statusPill("warn", "Nothing selected"); return Promise.resolve(false); }
  var rich = extractSelectedContent();
  return copyTextToClipboard(text).then(function(ok) {
    internalClipboard = text;
    internalClipboardRich = rich;
    if (ok) statusPill("ok", "Copied");
    else statusPill("warn", "Copy blocked \u2014 internal only");
    reloadSentinel();
    return ok;
  });
}

/* Keyboard copy/cut/paste + find */
document.addEventListener("keydown", function(e) {
  var ctrl = e.ctrlKey || e.metaKey;
  /* W05: Let browser handle copy/cut natively in bar inputs */
  var ae = document.activeElement;
  if (ctrl && ae && ae.tagName === "INPUT" && (ae.id === "find-input" || ae.id === "replace-input" || ae.id === "link-url-input")) {
    var k = e.key.toLowerCase();
    if (k === "c" || k === "x" || k === "v" || k === "a") return;
  }
  if (e.key === "Escape" && document.getElementById("find-bar").style.display === "flex") {
    e.preventDefault();
    closeFindBar();
    return;
  }
  if (ctrl && (e.key === "f" || e.key === "F")) {
    e.preventDefault();
    openFindBar();
    return;
  }
  if (ctrl && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    saveDoc();
    return;
  }
  if (ctrl && (e.key === "h" || e.key === "H")) {
    e.preventDefault();
    openFindBar();
    document.getElementById("replace-input").focus();
    return;
  }
  if (ctrl && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    showLinkBar();
    return;
  }
  if (ctrl && (e.key === "v" || e.key === "V")) {
    e.preventDefault();
    doPaste();
    return;
  }
  if (ctrl && (e.key === "c" || e.key === "C")) {
    e.preventDefault();
    copySelection();
    return;
  }
  if (ctrl && (e.key === "x" || e.key === "X")) {
    e.preventDefault();
    if (!hasSelection()) return;
    var selText = getSelectedText();
    copySelection().then(function(ok) {
      if (ok || internalClipboard === selText) {
        var cutRange = getSelRange();
        var capCut = captureSplice(cutRange.s.p, cutRange.e.p - cutRange.s.p + 1);
        deleteRange(cutRange.s, cutRange.e);
        clearSel();
        finishSplice(capCut, 1);
        requestLayout({ fromPara: cutRange.s.p, reason: "delete" }); resetBlink();
        statusPill("ok", "Cut");
      } else {
        statusPill("bad", "Copy failed \u2014 not cutting");
      }
    });
    return;
  }
});

/* Document-level keydown fallback: routes editing keys to the editor
   when focus is on a toolbar control (select, button). Ignores events
   when the target is a text input, textarea, or contenteditable. */
document.addEventListener("keydown", function(e) {
  var tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.target.isContentEditable) return;

  /* Only forward editing keys */
  var forwardKeys = ["Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab"];
  var isForward = forwardKeys.indexOf(e.key) !== -1;
  var isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

  if (isForward || isPrintable) {
    /* Refocus editor and redispatch the event */
    if (document.activeElement !== inputEl) {
      inputEl.focus({ preventScroll: true });
      /* The inputEl keydown handler will catch this since focus is now there.
         Dispatch a new event to it. */
      var newEvent = new KeyboardEvent("keydown", {
        key: e.key, code: e.code,
        ctrlKey: e.ctrlKey, metaKey: e.metaKey,
        shiftKey: e.shiftKey, altKey: e.altKey,
        bubbles: true, cancelable: true
      });
      inputEl.dispatchEvent(newEvent);
      e.preventDefault();
    }
  }
});

