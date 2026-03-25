/* ================================================================
   UNDO/REDO: Snapshot-based command stack. Before each edit, a
   snapshot of the document paragraphs and cursor state is pushed
   to the undo stack. Undo restores the snapshot. Redo reverses
   the undo. Stack capped at 200 entries.

   This approach clones the full paragraphs array which is O(doc
   size) per edit. Acceptable for manuscripts up to ~200 pages.
   For novel-length performance, optimize to paragraph-level
   delta tracking in a future pass.
   ================================================================ */

var undoStack = [];
var redoStack = [];
var UNDO_MAX = 200;

/* ----------------------------------------------------------------
   UNDO ARCHITECTURE: TWO COMPLEMENTARY SYSTEMS

   1. SNAPSHOT UNDO (captureSplice / finishSplice)
      Captures full paragraph clones before bulk operations.
      Used by: role changes, list toggle, style application to
      selection, cut, drag-move, and any operation that modifies
      multiple paragraphs in ways too complex for individual deltas.
      37 call sites. Heavy but reliable.

   2. DELTA UNDO (pushDelta / applyUndo / applyRedo)
      Records fine-grained reversible deltas for individual edits.
      Used by: character insert/delete, paragraph split/merge,
      single-property style changes, drop cap toggle.
      26 call sites. Lightweight and precise.

   Both systems push to the same undoStack. They can be intermixed
   because each entry is self-contained — a snapshot entry carries
   its own paragraph clones, a delta entry carries its own reversal
   data. The undo/redo dispatcher checks the entry type.

   Long-term: snapshot undo could be replaced by compound deltas
   for all operations. This is not urgent — the current hybrid
   works correctly and is well-tested.
   ---------------------------------------------------------------- */

/* ================================================================
   DELTA UNDO SYSTEM: Records reversible deltas instead of full
   document clones. Delta types: insert, delete, splitPara, mergePara,
   style, paraStyle, splice, compound.
   ================================================================ */

function createDelta(type, data) { data.type = type; return data; }

/* Clone a run's style properties (excludes text). */
function cloneRunStyle(src) {
  return { fontFamily: src.fontFamily, fontSize: src.fontSize, fontWeight: src.fontWeight || "normal", fontStyle: src.fontStyle || "normal",
    textDecoration: src.textDecoration || "none", color: src.color || "#1a1a1a",
    "x-script": src["x-script"] || "normal", "x-linkHref": src["x-linkHref"] || null,
    backgroundColor: src.backgroundColor || null };
}

/* Clone a contiguous range of paragraphs [from, to). */
function cloneParaRange(from, to) {
  var result = [];
  for (var i = from; i < to; i++) result.push(clonePara(doc.paragraphs[i]));
  return result;
}

/* Begin capturing a splice delta. Records state before the operation.
   startP = first affected paragraph index, count = number of paragraphs affected. */
function captureSplice(startP, count) {
  return { p: startP, removeCount: count,
    removed: cloneParaRange(startP, startP + count),
    cursorBefore: clonePos(cursor),
    selBefore: selAnchor ? { a: clonePos(selAnchor), f: clonePos(selFocus) } : null };
}

/* Finish and push a splice delta. newCount = number of paragraphs now at the splice point. */
function finishSplice(cap, newCount) {
  cap.inserted = cloneParaRange(cap.p, cap.p + newCount);
  cap.cursorAfter = clonePos(cursor);
  cap.selAfter = selAnchor ? { a: clonePos(selAnchor), f: clonePos(selFocus) } : null;
  pushDelta(createDelta("splice", cap));
}

/* --- Low-level paragraph helpers for applyUndo/applyRedo --- */

/* Delete count characters starting at offset in paragraph p. */
function deleteCharsInPara(p, offset, count) {
  if (count <= 0) return;
  var para = doc.paragraphs[p];
  /* Use the same double-split + splice approach as deleteRange */
  var locE = posToRun(para, offset + count);
  var endIdx = splitRunAt(para, locE.r, locE.ro);
  var locS = posToRun(para, offset);
  var startIdx = splitRunAt(para, locS.r, locS.ro);
  /* Recompute endIdx after the second split */
  var locE2 = posToRun(para, offset + count);
  var endIdx2 = splitRunAt(para, locE2.r, locE2.ro);
  var rc = Math.max(0, endIdx2 - startIdx);
  if (rc > 0) para.runs.splice(startIdx, rc);
  if (para.runs.length === 0) para.runs.push(makeRun(""));
  mergeAdjacentRuns(para);
}

/* Insert text with a given style at offset in paragraph p. */
function insertTextInPara(p, offset, text, style) {
  var para = doc.paragraphs[p];
  var loc = posToRun(para, offset);
  var run = para.runs[loc.r];
  if (style && styleMatch(style, run)) {
    run.text = run.text.slice(0, loc.ro) + text + run.text.slice(loc.ro);
  } else {
    var newIdx = splitRunAt(para, loc.r, loc.ro);
    para.runs.splice(newIdx, 0, makeRun(text, style || run));
  }
  mergeAdjacentRuns(para);
}

/* Insert an array of styled run fragments at offset in paragraph p. */
function insertRunsInPara(p, offset, runs) {
  insertRunSlice(doc.paragraphs[p], offset, runs);
}

/* Split paragraph p at character offset. Content after offset becomes
   a new paragraph at p+1 with the given style. */
function splitParaAt(p, offset, newStyle) {
  var para = doc.paragraphs[p];
  var loc = posToRun(para, offset);
  var splitIdx = splitRunAt(para, loc.r, loc.ro);
  var tailRuns = para.runs.splice(splitIdx);
  if (para.runs.length === 0) para.runs.push(makeRun(""));
  if (tailRuns.length === 0) tailRuns.push(makeRun(""));
  var ns = newStyle ? JSON.parse(JSON.stringify(newStyle)) : JSON.parse(JSON.stringify(para.style));
  doc.paragraphs.splice(p + 1, 0, { style: ns, runs: tailRuns });
}

/* Merge paragraph p+1 into paragraph p. */
function mergeParaAt(p) {
  if (p + 1 >= doc.paragraphs.length) return;
  var para = doc.paragraphs[p];
  var nextPara = doc.paragraphs[p + 1];
  for (var i = 0; i < nextPara.runs.length; i++) {
    para.runs.push(makeRun(nextPara.runs[i].text, nextPara.runs[i]));
  }
  mergeAdjacentRuns(para);
  doc.paragraphs.splice(p + 1, 1);
}

/* Set a run-level style property on a character range within paragraph p. */
function applyStyleToPara(p, from, to, property, value) {
  var para = doc.paragraphs[p];
  if (from >= to) return;
  var locE = posToRun(para, to);
  splitRunAt(para, locE.r, locE.ro);
  var locS = posToRun(para, from);
  splitRunAt(para, locS.r, locS.ro);
  var acc = 0;
  for (var ri = 0; ri < para.runs.length; ri++) {
    var runEnd = acc + para.runs[ri].text.length;
    if (runEnd > from && acc < to) para.runs[ri][property] = value;
    acc = runEnd;
  }
  mergeAdjacentRuns(para);
}

/* --- Apply undo/redo --- */

function applyUndo(delta) {
  switch (delta.type) {
    case "insert":
      deleteCharsInPara(delta.p, delta.offset, delta.text.length);
      break;
    case "delete":
      insertRunsInPara(delta.p, delta.offset, delta.runs);
      break;
    case "splitPara":
      mergeParaAt(delta.p);
      break;
    case "mergePara":
      splitParaAt(delta.p, delta.offset, delta.removedStyle);
      break;
    case "style":
      applyStyleToPara(delta.p, delta.from, delta.to, delta.property, delta.oldValue);
      break;
    case "paraStyle":
      doc.paragraphs[delta.p].style[delta.property] = delta.oldValue;
      break;
    case "splice":
      doc.paragraphs.splice(delta.p, delta.inserted.length);
      for (var i = delta.removed.length - 1; i >= 0; i--) {
        doc.paragraphs.splice(delta.p, 0, clonePara(delta.removed[i]));
      }
      break;
    case "sectionMeta":
      doc._sectionMeta = JSON.parse(JSON.stringify(delta.oldMeta));
      break;
    case "bookDesign":
      for (var bdi = 0; bdi < delta.changes.length; bdi++) {
        var bdc = delta.changes[bdi];
        if (bdc.oldValue !== undefined) {
          desWritePath(doc.bookDesign, bdc.path, bdc.oldValue);
        }
      }
      requestFullLayout("undo");
      break;
    case "compound":
      for (var i = delta.deltas.length - 1; i >= 0; i--) applyUndo(delta.deltas[i]);
      return; /* compound cursor handled by sub-deltas */
  }
  if (delta.cursorBefore) { cursor = clonePos(delta.cursorBefore); }
  if (delta.selBefore) { selAnchor = clonePos(delta.selBefore.a); selFocus = clonePos(delta.selBefore.f); }
  else if (delta.type !== "compound") { selAnchor = null; selFocus = null; }
}

function applyRedo(delta) {
  switch (delta.type) {
    case "insert":
      insertTextInPara(delta.p, delta.offset, delta.text, delta.style);
      break;
    case "delete":
      var totalLen = 0;
      for (var i = 0; i < delta.runs.length; i++) totalLen += delta.runs[i].text.length;
      deleteCharsInPara(delta.p, delta.offset, totalLen);
      break;
    case "splitPara":
      splitParaAt(delta.p, delta.offset, delta.newStyle);
      break;
    case "mergePara":
      mergeParaAt(delta.p);
      break;
    case "style":
      applyStyleToPara(delta.p, delta.from, delta.to, delta.property, delta.newValue);
      break;
    case "paraStyle":
      doc.paragraphs[delta.p].style[delta.property] = delta.newValue;
      break;
    case "splice":
      doc.paragraphs.splice(delta.p, delta.removeCount);
      for (var i = delta.inserted.length - 1; i >= 0; i--) {
        doc.paragraphs.splice(delta.p, 0, clonePara(delta.inserted[i]));
      }
      break;
    case "sectionMeta":
      doc._sectionMeta = JSON.parse(JSON.stringify(delta.newMeta));
      break;
    case "bookDesign":
      for (var bdi = 0; bdi < delta.changes.length; bdi++) {
        var bdc = delta.changes[bdi];
        desWritePath(doc.bookDesign, bdc.path, bdc.newValue);
      }
      requestFullLayout("redo");
      break;
    case "compound":
      for (var i = 0; i < delta.deltas.length; i++) applyRedo(delta.deltas[i]);
      return; /* compound cursor handled by sub-deltas */
  }
  if (delta.cursorAfter) { cursor = clonePos(delta.cursorAfter); }
  if (delta.selAfter) { selAnchor = clonePos(delta.selAfter.a); selFocus = clonePos(delta.selAfter.f); }
  else if (delta.type !== "compound") { selAnchor = null; selFocus = null; }
}

/* Push a delta onto the undo stack. */
function pushDelta(delta) {
  undoStack.push(delta);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];
}

/* Find the minimum paragraph index affected by a delta. */
function deltaMinPara(delta) {
  if (delta.type === "compound") {
    var min = Infinity;
    for (var i = 0; i < delta.deltas.length; i++) {
      var m = deltaMinPara(delta.deltas[i]);
      if (m < min) min = m;
    }
    return min === Infinity ? 0 : min;
  }
  return delta.p || 0;
}

function doUndo() {
  if (undoStack.length === 0) return;
  var delta = undoStack.pop();
  applyUndo(delta);
  redoStack.push(delta);
  desiredX = null;
  updateCurStyle();
  requestFullLayout("undo");
  updateToolbar();
  resetBlink();
  scrollCursorIntoView();
}

function doRedo() {
  if (redoStack.length === 0) return;
  var delta = redoStack.pop();
  applyRedo(delta);
  undoStack.push(delta);
  desiredX = null;
  updateCurStyle();
  requestFullLayout("redo");
  updateToolbar();
  resetBlink();
  scrollCursorIntoView();
}

/* Capture run fragments in a character range for delete deltas.
   Returns array of cloned run objects covering [from, to) in paragraph p. */
function captureRunsInRange(p, from, to) {
  var para = doc.paragraphs[p];
  var runs = [];
  var acc = 0;
  for (var ri = 0; ri < para.runs.length; ri++) {
    var r = para.runs[ri];
    var rStart = acc, rEnd = acc + r.text.length;
    if (rEnd > from && rStart < to) {
      var sliceS = Math.max(from, rStart) - rStart;
      var sliceE = Math.min(to, rEnd) - rStart;
      var cloned = cloneRunStyle(r);
      cloned.text = r.text.slice(sliceS, sliceE);
      runs.push(cloned);
    }
    acc = rEnd;
  }
  return runs;
}

/* ================================================================
   EDITING OPERATIONS: Insert, delete, split and merge paragraphs.
   Each operation creates and pushes a delta before modifying the
   document, then calls mergeAdjacentRuns() as needed.
   ================================================================ */

/* Delete a range of text from start to end position. Handles both
   single-paragraph and multi-paragraph deletion.
   Pattern: split at end, split at start, splice out middle, merge.
   Splitting end first ensures start offsets are not shifted. */
function deleteRange(start, end) {
  if (cmpPos(start, end) >= 0) return;
  if (start.p === end.p) {
    /* Same paragraph: split end first, then start, adjust for shift.
       Splitting at end gives endIdx. Splitting at start may insert a
       run before endIdx if the start offset is inside a run, shifting
       endIdx forward by the number of new runs created. */
    var para = doc.paragraphs[start.p];
    var lenBefore = para.runs.length;
    var locE = posToRun(para, end.o);
    var endIdx = splitRunAt(para, locE.r, locE.ro);
    var lenAfterEnd = para.runs.length;
    var locS = posToRun(para, start.o);
    var startIdx = splitRunAt(para, locS.r, locS.ro);
    var lenAfterStart = para.runs.length;
    var delta = lenAfterStart - lenAfterEnd;
    var endIdxAdj = endIdx + delta;
    var count = Math.max(0, endIdxAdj - startIdx);
    if (count > 0) para.runs.splice(startIdx, count);
    if (para.runs.length === 0) para.runs.push(makeRun("", curStyle));
    mergeAdjacentRuns(para);
  } else {
    /* Multi-paragraph: keep head of start para, tail of end para */
    var startPara = doc.paragraphs[start.p];
    var endPara = doc.paragraphs[end.p];
    /* Split end paragraph and save tail */
    var locE = posToRun(endPara, end.o);
    var tailIdx = splitRunAt(endPara, locE.r, locE.ro);
    var tailRuns = endPara.runs.slice(tailIdx).map(function(r) { return makeRun(r.text, r); });
    /* Split start paragraph and remove everything after */
    var locS = posToRun(startPara, start.o);
    var headEnd = splitRunAt(startPara, locS.r, locS.ro);
    startPara.runs.splice(headEnd);
    /* Remove all paragraphs from start+1 through end */
    doc.paragraphs.splice(start.p + 1, end.p - start.p);
    /* Append tail runs to start paragraph */
    for (var i = 0; i < tailRuns.length; i++) startPara.runs.push(tailRuns[i]);
    if (startPara.runs.length === 0) startPara.runs.push(makeRun("", curStyle));
    mergeAdjacentRuns(startPara);
  }
  cursor = clonePos(start);
  clampPos(cursor);
}

/* Insert text at the cursor position using the current typing style. */
function insertText(text) {
  if (!text) return;
  /* Guard: do not insert text into structural paragraphs */
  var guardRole = doc.paragraphs[cursor.p].style["x-role"];
  if (guardRole === "sceneBreak" || guardRole === "pageBreak") return;
  if (hasSelection()) { deleteRange(getSelRange().s, getSelRange().e); clearSel(); }
  clampPos(cursor);
  var para = doc.paragraphs[cursor.p];
  var loc = posToRun(para, cursor.o);
  var run = para.runs[loc.r];
  if (styleMatch(curStyle, run)) {
    /* Style matches: insert directly into existing run */
    run.text = run.text.slice(0, loc.ro) + text + run.text.slice(loc.ro);
    cursor.o += text.length;
  } else {
    /* Style differs: split run and insert new run */
    var newIdx = splitRunAt(para, loc.r, loc.ro);
    para.runs.splice(newIdx, 0, makeRun(text, curStyle));
    cursor.o += text.length;
  }
  mergeAdjacentRuns(para);
  clearSel();
  requestLayout({ fromPara: cursor.p, reason: "insert" });
  resetBlink(); scrollCursorIntoView();
}

/* Split the current paragraph at the cursor, creating a new paragraph. */
function splitParagraph() {
  if (hasSelection()) { deleteRange(getSelRange().s, getSelRange().e); clearSel(); }
  clampPos(cursor);
  var para = doc.paragraphs[cursor.p];
  /* Structural roles: do not split content, just insert empty body paragraph after */
  var structuralRoles = { pageBreak:1, sceneBreak:1, image:1 };
  if (structuralRoles[para.style["x-role"]]) {
    var newBody = { style: defaultParaStyle(), runs: [makeRun("", curStyle)] };
    newBody.style["x-sectionId"] = currentSectionId();
    doc.paragraphs.splice(cursor.p + 1, 0, newBody);
    cursor = mkPos(cursor.p + 1, 0);
    clearSel();
    requestLayout({ fromPara: cursor.p - 1, reason: "split" });
    resetBlink(); scrollCursorIntoView();
    return;
  }
  var loc = posToRun(para, cursor.o);
  var splitIdx = splitRunAt(para, loc.r, loc.ro);
  var tailRuns = para.runs.splice(splitIdx);
  if (para.runs.length === 0) para.runs.push(makeRun("", curStyle));
  if (tailRuns.length === 0) tailRuns.push(makeRun("", curStyle));
  var newPara = {
    style: JSON.parse(JSON.stringify(para.style)),
    runs: tailRuns
  };
  /* Drop cap does not carry forward to the split-off fragment */
  newPara.style["x-dropCap"] = { enabled: false };
  /* Revert new paragraph to body for roles that should not carry forward */
  var resetRoles = { pageBreak:1, chapterTitle:1, sceneBreak:1, heading2:1, heading3:1, heading4:1, heading5:1, heading6:1, image:1 };
  if (resetRoles[newPara.style["x-role"]]) {
    newPara.style["x-role"] = "body";
    newPara.style.textIndent = 18;
    newPara.style.marginTop = 0;
    newPara.style.marginBottom = 0;
    newPara.style.marginLeft = 0;
    newPara.style.marginRight = 0;
    newPara.style.textAlign = "left";
  }
  doc.paragraphs.splice(cursor.p + 1, 0, newPara);
  cursor = mkPos(cursor.p + 1, 0);
  clearSel();
  requestLayout({ fromPara: cursor.p - 1, reason: "split" });
  resetBlink(); scrollCursorIntoView();
}

/* Handle backspace key. */
function doBackspace() {
  if (hasSelection()) {
    var sr = getSelRange();
    var cap = captureSplice(sr.s.p, sr.e.p - sr.s.p + 1);
    deleteRange(sr.s, sr.e);
    clearSel();
    finishSplice(cap, 1);
    requestLayout({ fromPara: sr.s.p, reason: "delete" });
    resetBlink(); scrollCursorIntoView();
    return;
  }
  /* List item at offset 0: exit list instead of merging */
  var curPara = doc.paragraphs[cursor.p];
  if (cursor.o === 0 && curPara.style["x-list"]) {
    var oldList = curPara.style["x-list"] ? JSON.parse(JSON.stringify(curPara.style["x-list"])) : null;
    pushDelta(createDelta("paraStyle", {
      p: cursor.p, property: "x-list", oldValue: oldList, newValue: null,
      cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
    curPara.style["x-list"] = null;
    requestLayout({ fromPara: cursor.p, reason: "style" });
    updateToolbar(); resetBlink(); scrollCursorIntoView();
    return;
  }
  if (cursor.o > 0) {
    var delRuns = captureRunsInRange(cursor.p, cursor.o - 1, cursor.o);
    pushDelta(createDelta("delete", {
      p: cursor.p, offset: cursor.o - 1, runs: delRuns,
      cursorBefore: clonePos(cursor), cursorAfter: {p: cursor.p, o: cursor.o - 1} }));
    deleteRange(mkPos(cursor.p, cursor.o - 1), mkPos(cursor.p, cursor.o));
    requestLayout({ fromPara: cursor.p, reason: "delete" });
    resetBlink(); scrollCursorIntoView();
  } else if (cursor.p > 0) {
    /* Merge with previous paragraph */
    var prevPara = doc.paragraphs[cursor.p - 1];
    /* If previous is a pageBreak, just remove it instead of merging into it */
    if (prevPara.style["x-role"] === "pageBreak") {
      var cap = captureSplice(cursor.p - 1, 2);
      doc.paragraphs.splice(cursor.p - 1, 1);
      cursor = mkPos(cursor.p - 1, 0);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    /* If previous is an image, just remove it instead of merging into it */
    if (prevPara.style["x-role"] === "image") {
      var cap = captureSplice(cursor.p - 1, 2);
      doc.paragraphs.splice(cursor.p - 1, 1);
      cursor = mkPos(cursor.p - 1, 0);
      clampPos(cursor);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    /* If previous is a sceneBreak, just remove it instead of merging into it */
    if (prevPara.style["x-role"] === "sceneBreak") {
      var cap = captureSplice(cursor.p - 1, 2);
      doc.paragraphs.splice(cursor.p - 1, 1);
      cursor = mkPos(cursor.p - 1, 0);
      clampPos(cursor);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    var prevLen = paraTextLen(prevPara);
    pushDelta(createDelta("mergePara", {
      p: cursor.p - 1, offset: prevLen,
      removedStyle: JSON.parse(JSON.stringify(doc.paragraphs[cursor.p].style)),
      cursorBefore: clonePos(cursor), cursorAfter: {p: cursor.p - 1, o: prevLen} }));
    var curPara2 = doc.paragraphs[cursor.p];
    for (var i = 0; i < curPara2.runs.length; i++) {
      prevPara.runs.push(makeRun(curPara2.runs[i].text, curPara2.runs[i]));
    }
    mergeAdjacentRuns(prevPara);
    doc.paragraphs.splice(cursor.p, 1);
    cursor = mkPos(cursor.p - 1, prevLen);
    requestLayout({ fromPara: cursor.p, reason: "merge" });
    resetBlink(); scrollCursorIntoView();
  }
}

/* Handle delete key. */
function doDelete() {
  if (hasSelection()) {
    var sr = getSelRange();
    var cap = captureSplice(sr.s.p, sr.e.p - sr.s.p + 1);
    deleteRange(sr.s, sr.e);
    clearSel();
    finishSplice(cap, 1);
    requestLayout({ fromPara: sr.s.p, reason: "delete" });
    resetBlink(); scrollCursorIntoView();
    return;
  }
  var len = paraTextLen(doc.paragraphs[cursor.p]);
  if (cursor.o < len) {
    var delRuns = captureRunsInRange(cursor.p, cursor.o, cursor.o + 1);
    pushDelta(createDelta("delete", {
      p: cursor.p, offset: cursor.o, runs: delRuns,
      cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
    deleteRange(mkPos(cursor.p, cursor.o), mkPos(cursor.p, cursor.o + 1));
    requestLayout({ fromPara: cursor.p, reason: "delete" });
    resetBlink(); scrollCursorIntoView();
  } else if (cursor.p < doc.paragraphs.length - 1) {
    /* Merge next paragraph into current */
    var curPara = doc.paragraphs[cursor.p];
    if (curPara.style["x-role"] === "pageBreak") {
      var cap = captureSplice(cursor.p, 2);
      doc.paragraphs.splice(cursor.p, 1);
      cursor = mkPos(cursor.p, 0); clampPos(cursor);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    if (curPara.style["x-role"] === "image") {
      var cap = captureSplice(cursor.p, 2);
      doc.paragraphs.splice(cursor.p, 1);
      cursor = mkPos(cursor.p, 0); clampPos(cursor);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    if (curPara.style["x-role"] === "sceneBreak") {
      var cap = captureSplice(cursor.p, 2);
      doc.paragraphs.splice(cursor.p, 1);
      cursor = mkPos(cursor.p, 0); clampPos(cursor);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    var nextPara = doc.paragraphs[cursor.p + 1];
    if (nextPara.style["x-role"] === "image") {
      var cap = captureSplice(cursor.p, 2);
      doc.paragraphs.splice(cursor.p + 1, 1);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    if (nextPara.style["x-role"] === "sceneBreak") {
      var cap = captureSplice(cursor.p, 2);
      doc.paragraphs.splice(cursor.p + 1, 1);
      finishSplice(cap, 1);
      requestLayout({ fromPara: cursor.p, reason: "merge" });
      updateToolbar(); resetBlink(); scrollCursorIntoView();
      return;
    }
    var curLen = paraTextLen(curPara);
    pushDelta(createDelta("mergePara", {
      p: cursor.p, offset: curLen,
      removedStyle: JSON.parse(JSON.stringify(nextPara.style)),
      cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
    for (var i = 0; i < nextPara.runs.length; i++) {
      curPara.runs.push(makeRun(nextPara.runs[i].text, nextPara.runs[i]));
    }
    mergeAdjacentRuns(curPara);
    doc.paragraphs.splice(cursor.p + 1, 1);
    requestLayout({ fromPara: cursor.p, reason: "merge" });
    resetBlink(); scrollCursorIntoView();
  }
}

/* Extract plain text from the current selection. */
function getSelectedText() {
  if (!hasSelection()) return "";
  var r = getSelRange();
  var result = "";
  for (var p = r.s.p; p <= r.e.p; p++) {
    var text = paraText(doc.paragraphs[p]);
    var start = (p === r.s.p) ? r.s.o : 0;
    var end = (p === r.e.p) ? r.e.o : text.length;
    result += text.slice(start, end);
    if (p < r.e.p) result += "\n";
  }
  return result;
}

/* Extract structured content from the current selection.
   Returns an array of { style, runs } objects with fully cloned
   styles and runs. Used for rich internal clipboard.
   Does NOT modify the document — extraction is read-only. */
function extractSelectedContent() {
  if (!hasSelection()) return null;
  var r = getSelRange();
  var result = [];

  for (var p = r.s.p; p <= r.e.p; p++) {
    var para = doc.paragraphs[p];
    var text = paraText(para);
    var startOff = (p === r.s.p) ? r.s.o : 0;
    var endOff = (p === r.e.p) ? r.e.o : text.length;

    if (startOff >= endOff && p !== r.s.p && p !== r.e.p) continue;

    var clonedStyle = JSON.parse(JSON.stringify(para.style));
    delete clonedStyle["x-sectionId"];
    clonedStyle["x-dropCap"] = { enabled: false };

    var selectedRuns = [];
    var runStart = 0;
    for (var ri = 0; ri < para.runs.length; ri++) {
      var run = para.runs[ri];
      var runEnd = runStart + run.text.length;

      var overlapStart = Math.max(startOff, runStart);
      var overlapEnd = Math.min(endOff, runEnd);

      if (overlapStart < overlapEnd) {
        var sliceText = run.text.slice(overlapStart - runStart, overlapEnd - runStart);
        selectedRuns.push(makeRun(sliceText, run));
      }

      runStart = runEnd;
    }

    if (selectedRuns.length === 0) {
      selectedRuns.push(makeRun("", para.runs[0] || curStyle));
    }

    result.push({ style: clonedStyle, runs: selectedRuns });
  }

  return result.length > 0 ? result : null;
}

