/* ================================================================
   WRITER STATS: Live word/chapter/page counts. Updated on every
   layout pass. Read-only, does not affect editor behavior.
   ================================================================ */

function countWordsInText(text) {
  var trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(" ").length;
}

function updateStats() {
  if (!_statsDirty) return;
  _statsDirty = false;
  var totalWords = 0;
  var chapters = [];
  var currentChapter = null;

  for (var i = 0; i < doc.paragraphs.length; i++) {
    var para = doc.paragraphs[i];
    var role = (para.style["x-role"] || "body");
    var text = paraText(para);
    var wc = countWordsInText(text);

    if (role === "chapterTitle") {
      currentChapter = { title: text || "Untitled", startPara: i, words: 0 };
      chapters.push(currentChapter);
    }
    if (currentChapter && role !== "pageBreak") {
      currentChapter.words += wc;
    }
    totalWords += wc;
  }

  var cursorChapterIdx = -1;
  for (var c = chapters.length - 1; c >= 0; c--) {
    if (cursor.p >= chapters[c].startPara) { cursorChapterIdx = c; break; }
  }

  var sw = document.getElementById("stat-words");
  var sp = document.getElementById("stat-pages");
  var sc = document.getElementById("stat-chapters");
  var scc = document.getElementById("stat-cur-ch");
  var cl = document.getElementById("stats-detail");

  var selWc = hasSelection() ? countWordsInText(getSelectedText()) : 0;
  if (sw) sw.textContent = totalWords.toLocaleString() + (selWc > 0 ? " (" + selWc.toLocaleString() + " sel)" : "");
  if (sp) sp.textContent = totalPages;
  if (sc) sc.textContent = chapters.length;
  if (scc) {
    if (cursorChapterIdx >= 0) {
      var chTitle = chapters[cursorChapterIdx].title.slice(0, 20);
      scc.textContent = "Ch " + (cursorChapterIdx + 1) + ": " + chTitle + " (" + chapters[cursorChapterIdx].words.toLocaleString() + "w)";
    } else {
      scc.textContent = "\u2014";
    }
  }
  if (cl) {
    var html = "";
    for (var c = 0; c < chapters.length; c++) {
      html += "<div class='sd-row' data-chapter-para='" + chapters[c].startPara + "' style='cursor:pointer;'>" + (c + 1) + ". " + chapters[c].title.slice(0, 30) + " \u2014 <b>" + chapters[c].words.toLocaleString() + " words</b></div>";
    }
    if (chapters.length === 0) html = "<div class='sd-row' style='color:#999;'>No chapters yet</div>";
    cl.innerHTML = html;
  }
}

/* ================================================================
   FIND: Plain-text search across the manuscript. Searches within
   each paragraph independently using paraText(). Matches are
   stored as { p, o, len } and navigated via next/previous.
   ================================================================ */

var findState = { query: "", matches: [], currentIdx: -1 };

/* Search all paragraphs for plain-text matches (case-insensitive). */
function findAllMatches(query) {
  var results = [];
  if (!query || query.length === 0) return results;
  var needle = query.toLowerCase();
  for (var pi = 0; pi < doc.paragraphs.length; pi++) {
    var haystack = paraText(doc.paragraphs[pi]).toLowerCase();
    var idx = 0;
    while (idx <= haystack.length - needle.length) {
      var found = haystack.indexOf(needle, idx);
      if (found === -1) break;
      results.push({ p: pi, o: found, len: query.length });
      idx = found + 1;
    }
  }
  return results;
}

/* Navigate to a specific match by index. Sets editor selection to the match range. */
function goToMatch(matchIdx) {
  if (findState.matches.length === 0 || matchIdx < 0 || matchIdx >= findState.matches.length) return;
  findState.currentIdx = matchIdx;
  var m = findState.matches[matchIdx];
  selAnchor = mkPos(m.p, m.o);
  selFocus = mkPos(m.p, m.o + m.len);
  cursor = clonePos(selFocus);
  updateCurStyle();
  resetBlink();
  scrollCursorIntoView();
  updateFindCount();
}

function findNext() {
  if (findState.matches.length === 0) return;
  goToMatch((findState.currentIdx + 1) % findState.matches.length);
}

function findPrev() {
  if (findState.matches.length === 0) return;
  goToMatch((findState.currentIdx - 1 + findState.matches.length) % findState.matches.length);
}

/* Run search from the find input value and navigate to the nearest match. */
function runFind() {
  var query = document.getElementById("find-input").value;
  findState.query = query;
  findState.matches = findAllMatches(query);
  if (findState.matches.length > 0) {
    /* Find nearest match at or after current cursor */
    var best = 0;
    for (var i = 0; i < findState.matches.length; i++) {
      var m = findState.matches[i];
      if (cmpPos(mkPos(m.p, m.o), cursor) >= 0) { best = i; break; }
    }
    goToMatch(best);
  } else {
    findState.currentIdx = -1;
    clearSel();
    render();
  }
  updateFindCount();
}

function updateFindCount() {
  var el = document.getElementById("find-count");
  if (!el) return;
  if (findState.matches.length === 0) {
    el.textContent = "0/0";
  } else {
    el.textContent = (findState.currentIdx + 1) + "/" + findState.matches.length;
  }
}

function openFindBar() {
  /* W01: Close link bar if open */
  if (document.getElementById("link-bar").style.display === "block") hideLinkBar();
  var bar = document.getElementById("find-bar");
  bar.classList.add("visible");
  bar.style.display = "flex";
  var inp = document.getElementById("find-input");
  inp.focus();
  inp.select();
}

function closeFindBar() {
  var bar = document.getElementById("find-bar");
  bar.classList.remove("visible");
  bar.style.display = "none";
  findState.query = "";
  findState.matches = [];
  findState.currentIdx = -1;
  document.getElementById("find-input").value = "";
  document.getElementById("replace-input").value = "";
  clearSel();
  render();
  inputEl.focus({ preventScroll: true });
}

/* Replace the current active match with the replace input text. */
function replaceCurrent() {
  if (findState.currentIdx < 0 || findState.currentIdx >= findState.matches.length) return;
  var m = findState.matches[findState.currentIdx];
  var replaceText = document.getElementById("replace-input").value;
  var capRepl = captureSplice(m.p, 1);
  var start = mkPos(m.p, m.o);
  var end = mkPos(m.p, m.o + m.len);
  deleteRange(start, end);
  clearSel();
  if (replaceText) insertText(replaceText);
  finishSplice(capRepl, 1);
  /* Rebuild matches and navigate to next */
  findState.matches = findAllMatches(findState.query);
  if (findState.matches.length > 0) {
    findState.currentIdx = Math.min(findState.currentIdx, findState.matches.length - 1);
    goToMatch(findState.currentIdx);
  } else {
    findState.currentIdx = -1;
    clearSel();
    render();
  }
  updateFindCount();
}

/* Replace all matches. Processes in reverse document order to avoid
   offset drift. Inlines the insert logic to avoid per-replacement
   runLayout calls. Single undo step for the entire batch. */
function replaceAll() {
  if (findState.matches.length === 0) return;
  var replaceText = document.getElementById("replace-input").value;
  var firstChangedPara = findState.matches[0].p;
  var lastChangedPara = findState.matches[findState.matches.length - 1].p;
  var capReplAll = captureSplice(firstChangedPara, lastChangedPara - firstChangedPara + 1);
  for (var i = findState.matches.length - 1; i >= 0; i--) {
    var m = findState.matches[i];
    var start = mkPos(m.p, m.o);
    var end = mkPos(m.p, m.o + m.len);
    deleteRange(start, end);
    if (replaceText) {
      updateCurStyle();
      clampPos(cursor);
      var para = doc.paragraphs[cursor.p];
      var loc = posToRun(para, cursor.o);
      var run = para.runs[loc.r];
      if (styleMatch(curStyle, run)) {
        run.text = run.text.slice(0, loc.ro) + replaceText + run.text.slice(loc.ro);
        cursor.o += replaceText.length;
      } else {
        var newIdx = splitRunAt(para, loc.r, loc.ro);
        para.runs.splice(newIdx, 0, makeRun(replaceText, curStyle));
        cursor.o += replaceText.length;
      }
      mergeAdjacentRuns(para);
    }
  }
  clearSel();
  finishSplice(capReplAll, lastChangedPara - firstChangedPara + 1);
  requestLayout({ fromPara: firstChangedPara, reason: "replace" });
  findState.matches = findAllMatches(findState.query);
  findState.currentIdx = -1;
  updateFindCount();
  resetBlink();
  statusPill("ok", "Replaced all");
}

/* Find bar event wiring */
document.getElementById("find-input").addEventListener("input", function() {
  runFind();
});
document.getElementById("find-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { e.preventDefault(); findNext(); }
  if (e.key === "Escape") { e.preventDefault(); closeFindBar(); }
});
document.getElementById("replace-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { e.preventDefault(); replaceCurrent(); }
  if (e.key === "Escape") { e.preventDefault(); closeFindBar(); }
});
document.getElementById("find-next").addEventListener("click", function(e) {
  e.preventDefault(); findNext();
});
document.getElementById("find-prev").addEventListener("click", function(e) {
  e.preventDefault(); findPrev();
});
document.getElementById("replace-one").addEventListener("click", function(e) {
  e.preventDefault(); replaceCurrent();
});
document.getElementById("replace-all").addEventListener("click", function(e) {
  e.preventDefault(); replaceAll();
});
document.getElementById("find-close").addEventListener("click", function(e) {
  e.preventDefault(); closeFindBar();
});

/* ================================================================
   PREFLIGHT: Pre-export validation checks. Returns { ok, errors,
   warnings } without modifying the document. Verifies bookSettings,
   page dimensions, font references, and structural rules.
   ================================================================ */

function preflight() {
  var errors = [];
  var warnings = [];
  var bs = doc.bookSettings;

  /* Check bookSettings existence and trim values */
  if (!bs) {
    errors.push("Missing bookSettings.");
  } else {
    if (!bs.trim || typeof bs.trim.widthIn !== "number" || typeof bs.trim.heightIn !== "number") {
      errors.push("bookSettings.trim is missing or has invalid dimensions.");
    } else {
      /* Sanity check page size conversions */
      var pdfW = bs.trim.widthIn * 72;
      var pdfH = bs.trim.heightIn * 72;
      if (pdfW < 200 || pdfW > 1200) warnings.push("PDF page width " + pdfW.toFixed(1) + "pt is unusual.");
      if (pdfH < 300 || pdfH > 1600) warnings.push("PDF page height " + pdfH.toFixed(1) + "pt is unusual.");
    }

    if (!bs.marginsIn) {
      errors.push("bookSettings.marginsIn is missing.");
    } else {
      var m = bs.marginsIn;
      if (bs.trim && m.left + m.right >= bs.trim.widthIn) errors.push("Horizontal margins exceed page width.");
      if (bs.trim && m.top + m.bottom >= bs.trim.heightIn) errors.push("Vertical margins exceed page height.");
    }
  }

  /* Check font references (stub: verify font strings are non-empty) */
  for (var i = 0; i < doc.paragraphs.length; i++) {
    var para = doc.paragraphs[i];
    for (var r = 0; r < para.runs.length; r++) {
      if (!para.runs[r].fontFamily || para.runs[r].fontFamily.length === 0) {
        warnings.push("Paragraph " + i + " run " + r + " has empty font family.");
      }
    }
  }

  /* Even page count rule */
  if (totalPages % 2 !== 0) {
    warnings.push("Page count is " + totalPages + " (odd). Print books typically require even page count.");
  }

  /* Check paragraphs have valid roles */
  var validRoles = ["body", "chapterTitle", "sceneBreak"];
  for (var i = 0; i < doc.paragraphs.length; i++) {
    var role = doc.paragraphs[i].style["x-role"];
    if (role && validRoles.indexOf(role) === -1) {
      warnings.push("Paragraph " + i + " has unknown role: " + role);
    }
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

document.getElementById("btn-preflight").addEventListener("click", function(e) {
  e.preventDefault();
  var result = preflight();
  if (result.ok && result.warnings.length === 0) {
    statusPill("ok", "Preflight: all clear");
  } else if (result.ok) {
    statusPill("warn", "Preflight: " + result.warnings.length + " warning(s)");
  } else {
    statusPill("bad", "Preflight: " + result.errors.length + " error(s)");
  }
  inputEl.focus();
});

/* ================================================================
   INITIALIZE: Detect storage, attempt auto-load, run initial
   layout, and start cursor blink.
   ================================================================ */

document.fonts.ready.then(function() {
  detectStorage().then(function() {
    /* Try auto-load */
    var promise;
    if (storageMode === "idb") promise = idbGet(STORAGE_KEY);
    else {
      var raw = localStorage.getItem(STORAGE_KEY);
      promise = Promise.resolve(raw ? JSON.parse(raw) : null);
    }
    promise.then(function(rec) {
      if (rec && rec.doc) {
        var migrated = migrateDoc(rec.doc);
        var v = validateDoc(migrated);
        if (v.ok) {
          var flat = flattenSections(migrated.sections);
          migrated.paragraphs = flat.paragraphs;
          migrated._sectionMeta = flat.sectionMeta;
          delete migrated.sections;
          resolveDocument(migrated);
          doc = migrated;
          if (!doc.bookDesign) doc.bookDesign = defaultBookDesign();
          /* Migration: bookDesign body values must match rendered defaults */
          if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.body) {
            var _bdb = doc.bookDesign.chapter.body;
            if (_bdb.lineHeight === 1.4) _bdb.lineHeight = 1.2;
            if (_bdb.textAlign === "justify") _bdb.textAlign = "left";
          }
          /* Migration: bookDesign sceneBreak spacing */
          if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.sceneBreak) {
            var _bds = doc.bookDesign.chapter.sceneBreak;
            if (_bds.spacingAbove === 18) _bds.spacingAbove = 12;
            if (_bds.spacingBelow === 18) _bds.spacingBelow = 12;
          }
          /* Migration: dropFromTop and spacingToBody defaults */
          if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.heading
              && doc.bookDesign.chapter.heading.layout) {
            var _bhl = doc.bookDesign.chapter.heading.layout;
            if (_bhl.dropFromTop === 216) _bhl.dropFromTop = 154;
            if (_bhl.spacingToBody === 24) _bhl.spacingToBody = 12;
          }
          /* Migration: label.case baked into text */
          if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.heading
              && doc.bookDesign.chapter.heading.label) {
            var _lbl = doc.bookDesign.chapter.heading.label;
            if (_lbl["case"] === "uppercase" && _lbl.text) {
              _lbl.text = _lbl.text.toUpperCase();
              _lbl["case"] = "none";
            } else if (_lbl["case"] === "lowercase" && _lbl.text) {
              _lbl.text = _lbl.text.toLowerCase();
              _lbl["case"] = "none";
            }
          }
          /* Populate heading.title for chapter sections missing it */
          if (doc._sectionMeta) {
            for (var _hsi = 0; _hsi < doc._sectionMeta.length; _hsi++) {
              var _hm = doc._sectionMeta[_hsi];
              if (_hm.type === "chapter" && !_hm.heading) {
                _hm.heading = { title: "" };
                for (var _hpi = 0; _hpi < doc.paragraphs.length; _hpi++) {
                  if (doc.paragraphs[_hpi].style["x-sectionId"] === _hm.id &&
                      doc.paragraphs[_hpi].style["x-role"] === "chapterTitle") {
                    _hm.heading.title = paraText(doc.paragraphs[_hpi]);
                    break;
                  }
                }
              }
            }
          }
          if (v.warnings.length > 0) console.warn("validateDoc warnings:", v.warnings);
          statusPill("ok", "Auto-loaded");
        } else {
          statusPill("warn", "Incompatible save data — using default");
        }
      }
      computePageDimensions();
      cursor = mkPos(0, 0);
      clearSel();
      requestFullLayout("load");
      applyZoom();
      updateToolbar();
      updateSidebar();
      resetBlink();
      inputEl.focus();
    }).catch(function() {
      computePageDimensions();
      requestFullLayout("load");
      applyZoom();
      updateToolbar();
      updateSidebar();
      resetBlink();
      inputEl.focus();
    });
  });
});

})();
