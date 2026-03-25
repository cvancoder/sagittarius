/* ================================================================
   SELECTION DEBUG: Development tool. When enabled, status pill
   shows live selection state so testers can identify whether
   Delete failures are due to missing selection or focus routing.
   ================================================================ */

var debugSelection = false;
var debugOverlay = false;

document.getElementById("btn-debug").addEventListener("click", function(e) {
  e.preventDefault();
  debugSelection = !debugSelection;
  var chk = e.currentTarget.querySelector(".chk");
  if (chk) chk.textContent = debugSelection ? "\u2611" : "\u2610";
  if (!debugSelection) statusPill(null, "Ready");
  render();
  inputEl.focus();
});

document.getElementById("btn-debug-overlay").addEventListener("click", function(e) {
  e.preventDefault();
  debugOverlay = !debugOverlay;
  var chk = e.currentTarget.querySelector(".chk");
  if (chk) chk.textContent = debugOverlay ? "\u2611" : "\u2610";
  render();
  inputEl.focus();
});

document.getElementById("btn-pipeline-debug").addEventListener("click", function(e) {
  e.preventDefault();
  _pipelineDebugEnabled = !_pipelineDebugEnabled;
  var chk = e.currentTarget.querySelector(".chk");
  if (chk) chk.textContent = _pipelineDebugEnabled ? "\u2611" : "\u2610";
  var el = document.getElementById("pipeline-debug");
  if (el) el.style.display = _pipelineDebugEnabled ? "inline" : "none";
  if (_pipelineDebugEnabled && typeof updatePipelineDebug === "function") updatePipelineDebug();
  inputEl.focus();
});
document.getElementById("btn-rulers").addEventListener("click", function(e) {
  e.preventDefault();
  _showRulers = !_showRulers;
  var chk = e.currentTarget.querySelector(".chk");
  if (chk) chk.textContent = _showRulers ? "\u2611" : "\u2610";
  document.getElementById("ruler-h-bar").style.display = _showRulers ? "flex" : "none";
  document.getElementById("ruler-v-wrap").style.display = _showRulers ? "block" : "none";
  if (_showRulers) {
    updateHorizontalRuler();
    updateVerticalRuler();
  }
  inputEl.focus();
});

/* Update debug display. Called from render() when debug is on. */
function updateDebugDisplay() {
  if (!debugSelection) return;
  var info = "sel=" + (hasSelection() ? "YES" : "no");
  if (selAnchor) info += " A={" + selAnchor.p + "," + selAnchor.o + "}";
  if (selFocus) info += " F={" + selFocus.p + "," + selFocus.o + "}";
  info += " cur={" + cursor.p + "," + cursor.o + "}";
  info += " focus=" + (document.activeElement === inputEl ? "editor" : document.activeElement.tagName);
  document.getElementById("status-pill").textContent = info;
  document.getElementById("status-pill").classList.remove("ok", "warn", "bad");
}

/* Pipeline debug readout — updates on every render when visible */
var _pipelineDebugEnabled = false;
function updatePipelineDebug() {
  var el = document.getElementById("pipeline-debug");
  if (!el || !_pipelineDebugEnabled) return;
  var vis = pageWin._initialized ? pageWin.computeVisibleRange(_scrollSnap) : {start:0,end:0};
  el.textContent =
    "vis[" + vis.start + "," + vis.end + ")" +
    " mt[" + pageWin.mountStart + "," + pageWin.mountEnd + ")" +
    " rl[" + layoutRegion.realizedFrom + "," + layoutRegion.realizedTo + ")" +
    " ln=" + layoutRegion._lines.length +
    " tp=" + totalPages +
    " g:L" + _pipelineGen.layout + "/R" + _pipelineGen.render +
    "/S" + _pipelineGen.scroll + "/E" + _pipelineGen.evict + "/Z" + _pipelineGen.realize +
    " sn=" + _scrollSnap.gen + "/rn=" + _renderGen +
    " sc=" + Math.round(pageArea.scrollTop);
}

/* ================================================================
   SPELLCHECK SUBSYSTEM: Modular manuscript spellcheck foundation.
   Isolated from editor logic — only reads document model, produces
   misspelling results as {p, o, len, word} records.

   Subsystem boundaries:
   - spellProvider:  dictionary/lookup boundary (replaceable)
   - spellExtract:   word extraction from paragraph text
   - spellEngine:    orchestrates check, caches per-paragraph
   - spellState:     result storage and control flags
   ================================================================ */

/* --- Spell State --- */
var spellState = {
  enabled: false,
  misspellings: [],       /* [{p, o, len, word}, ...] across entire doc */
  byPara: {},             /* paraIdx → [misspelling, ...] for fast render lookup */
  paraHashes: {},         /* paraIdx → text content for dirty tracking */
  paraMisspellings: {},   /* paraIdx → [{o, len, word}, ...] cached results */
  ignoreSet: {},          /* words the user chose to ignore (session) */
  personalDict: {},       /* words the user added to dictionary (persisted) */
  ready: false            /* true when dictionary provider is loaded */
};

function rebuildSpellIndex() {
  spellState.byPara = {};
  for (var i = 0; i < spellState.misspellings.length; i++) {
    var m = spellState.misspellings[i];
    if (!spellState.byPara[m.p]) spellState.byPara[m.p] = [];
    spellState.byPara[m.p].push(m);
  }
}

/* Load personal dictionary from localStorage */
(function() {
  try {
    var pd = localStorage.getItem("sag_personal_dict");
    if (pd) {
      var words = JSON.parse(pd);
      for (var i = 0; i < words.length; i++) spellState.personalDict[words[i].toLowerCase()] = true;
    }
  } catch(e) { /* ignore */ }
})();

function savePersonalDict() {
  try {
    var words = Object.keys(spellState.personalDict);
    localStorage.setItem("sag_personal_dict", JSON.stringify(words));
  } catch(e) { /* ignore */ }
}

/* --- Spell Provider --- */
/* Modular dictionary boundary. Currently uses Typo.js (Hunspell).
   Replace this object to swap dictionary implementation. */
var spellProvider = {
  _typo: null,

  isReady: function() { return !!this._typo; },

  check: function(word) {
    if (!this._typo) return true; /* not loaded = assume correct */
    var lw = word.toLowerCase();
    if (spellState.ignoreSet[lw]) return true;
    if (spellState.personalDict[lw]) return true;
    return this._typo.check(word);
  },

  suggest: function(word, limit) {
    if (!this._typo) return [];
    return this._typo.suggest(word, limit || 5);
  },

  addToPersonal: function(word) {
    spellState.personalDict[word.toLowerCase()] = true;
    savePersonalDict();
  },

  addToIgnore: function(word) {
    spellState.ignoreSet[word.toLowerCase()] = true;
  },

  /* Async initialization — loads Typo.js + dictionary from CDN */
  init: function() {
    var self = this;
    /* Load Typo.js library */
    var script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/typo-js@1.2.4/typo.js";
    script.onload = function() {
      if (typeof Typo === "undefined") return;
      /* Load dictionary files */
      var affUrl = "https://cdn.jsdelivr.net/npm/dictionary-en@4.0.0/index.aff";
      var dicUrl = "https://cdn.jsdelivr.net/npm/dictionary-en@4.0.0/index.dic";
      Promise.all([
        fetch(affUrl).then(function(r) { return r.text(); }),
        fetch(dicUrl).then(function(r) { return r.text(); })
      ]).then(function(results) {
        self._typo = new Typo("en_US", results[0], results[1]);
        spellState.ready = true;
        /* Re-run spell check now that dictionary is loaded */
        if (spellState.enabled) spellRefresh();
      }).catch(function(err) {
        console.warn("Spellcheck: dictionary load failed", err);
      });
    };
    script.onerror = function() {
      console.warn("Spellcheck: Typo.js load failed");
    };
    document.head.appendChild(script);
  }
};

/* --- Word Extraction --- */
/* Extracts words from plain text, returning [{word, offset, length}].
   Handles: contractions (don't), possessives (John's), hyphens (well-known).
   Skips: numbers, URLs, all-punctuation tokens. */
var SPELL_WORD_RE = /[a-zA-Z\u00C0-\u024F](?:[a-zA-Z\u00C0-\u024F'''\-]*[a-zA-Z\u00C0-\u024F])?/g;

function spellExtractWords(text) {
  var words = [];
  var m;
  SPELL_WORD_RE.lastIndex = 0;
  while ((m = SPELL_WORD_RE.exec(text)) !== null) {
    var w = m[0];
    /* Skip single-letter words (a, I handled by dictionary) */
    /* Skip words that are entirely uppercase abbreviations >1 char if desired */
    words.push({ word: w, offset: m.index, length: w.length });
  }
  return words;
}

/* --- Spell Engine --- */
/* Roles that should be spell-checked */
var SPELL_CHECK_ROLES = { body:1, chapterTitle:1, heading2:1, heading3:1, heading4:1, heading5:1, heading6:1, blockQuote:1, verse:1 };

function spellCheckParagraph(para, paraIdx) {
  var role = (para.style && para.style["x-role"]) || "body";
  if (!SPELL_CHECK_ROLES[role]) return [];
  var text = paraText(para);
  if (!text) return [];
  var words = spellExtractWords(text);
  var results = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!spellProvider.check(w.word)) {
      results.push({ p: paraIdx, o: w.offset, len: w.length, word: w.word });
    }
  }
  return results;
}

/* Simple string hash for dirty tracking */
function spellHashPara(para) {
  var text = paraText(para);
  var role = (para.style && para.style["x-role"]) || "body";
  return role + ":" + text;
}

/* Full refresh: re-check dirty paragraphs, rebuild misspellings array */
function spellRefresh() {
  if (!spellState.enabled || !spellProvider.isReady()) {
    spellState.misspellings = [];
    rebuildSpellIndex();
    return;
  }
  var newHashes = {};
  var newParaMisspellings = {};
  for (var i = 0; i < doc.paragraphs.length; i++) {
    var hash = spellHashPara(doc.paragraphs[i]);
    newHashes[i] = hash;
    if (spellState.paraHashes[i] === hash && spellState.paraMisspellings[i]) {
      /* Paragraph unchanged — reuse cached results */
      newParaMisspellings[i] = spellState.paraMisspellings[i];
    } else {
      /* Paragraph changed or new — re-check */
      newParaMisspellings[i] = spellCheckParagraph(doc.paragraphs[i], i);
    }
  }
  spellState.paraHashes = newHashes;
  spellState.paraMisspellings = newParaMisspellings;

  /* Flatten into single array */
  var all = [];
  for (var j = 0; j < doc.paragraphs.length; j++) {
    var pm = newParaMisspellings[j];
    if (pm) {
      for (var k = 0; k < pm.length; k++) {
        /* Re-stamp paragraph index in case of reordering */
        all.push({ p: j, o: pm[k].o, len: pm[k].len, word: pm[k].word });
      }
    }
  }
  spellState.misspellings = all;
  rebuildSpellIndex();
}

/* Initialize provider on page load */
spellProvider.init();

/* --- Spell Suggestion Popup --- */
/* Finds the misspelling record at a given document position, if any. */
function spellMisspellingAtPos(pos) {
  for (var i = 0; i < spellState.misspellings.length; i++) {
    var m = spellState.misspellings[i];
    if (m.p === pos.p && pos.o >= m.o && pos.o < m.o + m.len) return m;
  }
  return null;
}

var spellPopupEl = document.getElementById("spell-popup");

function showSpellPopup(ms, clientX, clientY) {
  var suggestions = spellProvider.suggest(ms.word, 5);
  var html = "<div class='sp-word'>" + ms.word + "</div>";
  if (suggestions.length > 0) {
    for (var i = 0; i < suggestions.length; i++) {
      html += "<div class='sp-item' data-suggestion='" + suggestions[i].replace(/'/g, "&#39;") + "'>" + suggestions[i] + "</div>";
    }
  } else {
    html += "<div class='sp-none'>No suggestions</div>";
  }
  html += "<div class='sp-sep'></div>";
  html += "<div class='sp-action' data-action='ignore'>Ignore &ldquo;" + ms.word.slice(0, 15) + "&rdquo;</div>";
  html += "<div class='sp-action' data-action='add'>Add to dictionary</div>";
  spellPopupEl.innerHTML = html;
  spellPopupEl.style.display = "block";
  /* Store target misspelling data for click handler */
  spellPopupEl._ms = { p: ms.p, o: ms.o, len: ms.len, word: ms.word };
  /* Position near click, clamped to viewport */
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var pw = spellPopupEl.offsetWidth;
  var ph = spellPopupEl.offsetHeight;
  var left = Math.min(clientX, vw - pw - 8);
  var top = clientY + 4;
  if (top + ph > vh - 8) top = clientY - ph - 4;
  spellPopupEl.style.left = Math.max(4, left) + "px";
  spellPopupEl.style.top = Math.max(4, top) + "px";
}

function hideSpellPopup() {
  spellPopupEl.style.display = "none";
  spellPopupEl._ms = null;
}

/* Click inside spell popup: suggestion replace, ignore, or add */
spellPopupEl.addEventListener("mousedown", function(e) {
  e.preventDefault();
  e.stopPropagation();
  var target = e.target;
  var ms = spellPopupEl._ms;
  if (!ms) { hideSpellPopup(); return; }

  /* Suggestion click: replace misspelled word */
  var suggestion = target.getAttribute("data-suggestion");
  if (suggestion) {
    /* Verify the word is still at the expected position */
    var para = doc.paragraphs[ms.p];
    if (para) {
      var text = paraText(para);
      var currentWord = text.slice(ms.o, ms.o + ms.len);
      if (currentWord === ms.word) {
        var capSpell = captureSplice(ms.p, 1);
        deleteRange(mkPos(ms.p, ms.o), mkPos(ms.p, ms.o + ms.len));
        cursor = mkPos(ms.p, ms.o);
        insertText(suggestion);
        finishSplice(capSpell, 1);
        clearSel();
        requestLayout({ fromPara: ms.p, reason: "insert" }); updateToolbar(); resetBlink();
        statusPill("ok", "Replaced \u201c" + ms.word + "\u201d");
      } else {
        statusPill("warn", "Word changed since popup opened");
      }
    }
    hideSpellPopup();
    inputEl.focus({ preventScroll: true });
    return;
  }

  /* Ignore action */
  var action = target.getAttribute("data-action");
  if (action === "ignore") {
    spellProvider.addToIgnore(ms.word);
    spellState.paraHashes = {};
    spellRefresh();
    render();
    statusPill("ok", "Ignoring \u201c" + ms.word + "\u201d");
    hideSpellPopup();
    inputEl.focus({ preventScroll: true });
    return;
  }

  /* Add to dictionary */
  if (action === "add") {
    spellProvider.addToPersonal(ms.word);
    spellState.paraHashes = {};
    spellRefresh();
    render();
    statusPill("ok", "Added \u201c" + ms.word + "\u201d to dictionary");
    hideSpellPopup();
    inputEl.focus({ preventScroll: true });
    return;
  }
});

/* Right-click on canvas: check for misspelling at click position */
pagesWrapper.addEventListener("contextmenu", function(e) {
  if (!spellState.enabled || spellState.misspellings.length === 0) return;
  var info = getPageAndCoords(e);
  if (!info) return;
  var pos = hitTest(info.x, info.y, info.page);
  if (!pos) return;
  var ms = spellMisspellingAtPos(pos);
  if (!ms) return;
  e.preventDefault();
  showSpellPopup(ms, e.clientX, e.clientY);
});

/* Close spell popup on outside click or scroll */
document.addEventListener("mousedown", function(e) {
  if (spellPopupEl.style.display !== "none" && !spellPopupEl.contains(e.target)) {
    hideSpellPopup();
  }
});
pageArea.addEventListener("scroll", function() {
  if (spellPopupEl.style.display !== "none") hideSpellPopup();
}, { passive: true });

window.addEventListener("resize", function() {
  updateHorizontalRuler();
  updateVerticalRuler();
});

/* ================================================================
   DEBUG API: Stable read-only inspection hooks on window.__sag.
   Available in DevTools console for verifying layout state.
   ================================================================ */

window.__sag = {
  getDoc: function() { return doc; },
  getLayout: function() { return { lines: lines, linesByPage: linesByPage, totalPages: totalPages }; },
  getCaret: function() { return clonePos(cursor); },
  pageWin: pageWin,
  getSelection: function() {
    if (!hasSelection()) return null;
    return { anchor: clonePos(selAnchor), focus: clonePos(selFocus), range: getSelRange() };
  },
  getPara: function(p) { return doc.paragraphs[p] || null; },
  getParaStyle: function(p) { return doc.paragraphs[p] ? doc.paragraphs[p].style : null; },
  dumpPara: function(p) {
    var para = doc.paragraphs[p];
    if (!para) return null;
    return {
      p: p,
      "x-role": para.style["x-role"],
      textIndent: para.style.textIndent,
      lineHeight: para.style.lineHeight,
      marginTop: para.style.marginTop,
      marginBottom: para.style.marginBottom,
      textAlign: para.style.textAlign,
      runCount: para.runs.length,
      text: paraText(para)
    };
  },
  dumpAll: function() {
    var out = [];
    for (var i = 0; i < doc.paragraphs.length; i++) out.push(this.dumpPara(i));
    return out;
  },
  checkNoIndentAfterChapter: function() {
    var out = [];
    for (var i = 1; i < doc.paragraphs.length; i++) {
      var prev = doc.paragraphs[i - 1].style["x-role"] || "body";
      var cur = doc.paragraphs[i].style["x-role"] || "body";
      if (prev === "chapterTitle" && cur === "body") {
        out.push({
          i: i, prev: prev, cur: cur,
          expectedAppliedIndent: 0,
          textIndent: doc.paragraphs[i].style.textIndent
        });
      }
    }
    return out;
  },
  createImagePara: function(dataUrl, w, h, nw, nh) { return createImagePara(dataUrl, w, h, nw, nh); },
  insertImageAt: function(paraIdx, dataUrl, w, h, nw, nh) {
    var capImgAt = captureSplice(paraIdx > 0 ? paraIdx - 1 : 0, 1);
    var imgP = createImagePara(dataUrl, w, h, nw, nh);
    imgP.style["x-sectionId"] = currentSectionId();
    doc.paragraphs.splice(paraIdx, 0, imgP);
    cursor = mkPos(paraIdx + 1, 0); clampPos(cursor);
    clearSel(); finishSplice(capImgAt, 2); requestLayout({ fromPara: paraIdx, reason: "split" }); render(); resetBlink();
  },
  dropCap: {
    isOn: function(pi) { var dc = doc.paragraphs[pi] && doc.paragraphs[pi].style["x-dropCap"]; return !!(dc && dc.enabled); },
    enable: function(pi) {
      pi = (pi !== undefined) ? pi : cursor.p;
      if (doc.paragraphs[pi]) { if (!doc.paragraphs[pi].style["x-dropCap"] || typeof doc.paragraphs[pi].style["x-dropCap"] !== "object") doc.paragraphs[pi].style["x-dropCap"] = { enabled: false }; var _oldDc = doc.paragraphs[pi].style["x-dropCap"].enabled; doc.paragraphs[pi].style["x-dropCap"].enabled = true; pushDelta(createDelta("paraStyle", { p: pi, property: "x-dropCap", oldValue: {enabled: _oldDc}, newValue: {enabled: true}, cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) })); requestLayout({ fromPara: pi, reason: "style" }); render(); }
    },
    disable: function(pi) {
      pi = (pi !== undefined) ? pi : cursor.p;
      if (doc.paragraphs[pi]) { if (!doc.paragraphs[pi].style["x-dropCap"] || typeof doc.paragraphs[pi].style["x-dropCap"] !== "object") doc.paragraphs[pi].style["x-dropCap"] = { enabled: false }; var _oldDc2 = doc.paragraphs[pi].style["x-dropCap"].enabled; doc.paragraphs[pi].style["x-dropCap"].enabled = false; pushDelta(createDelta("paraStyle", { p: pi, property: "x-dropCap", oldValue: {enabled: _oldDc2}, newValue: {enabled: false}, cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) })); requestLayout({ fromPara: pi, reason: "style" }); render(); }
    },
    toggle: function(pi) {
      pi = (pi !== undefined) ? pi : cursor.p;
      if (doc.paragraphs[pi]) { if (!doc.paragraphs[pi].style["x-dropCap"] || typeof doc.paragraphs[pi].style["x-dropCap"] !== "object") doc.paragraphs[pi].style["x-dropCap"] = { enabled: false }; var _oldDc3 = doc.paragraphs[pi].style["x-dropCap"].enabled; doc.paragraphs[pi].style["x-dropCap"].enabled = !_oldDc3; pushDelta(createDelta("paraStyle", { p: pi, property: "x-dropCap", oldValue: {enabled: _oldDc3}, newValue: {enabled: !_oldDc3}, cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) })); requestLayout({ fromPara: pi, reason: "style" }); render(); }
    }
  },
  spell: {
    getState: function() { return spellState; },
    getMisspellings: function() { return spellState.misspellings; },
    isReady: function() { return spellProvider.isReady(); },
    enable: function() { spellState.enabled = true; spellRefresh(); },
    disable: function() { spellState.enabled = false; spellState.misspellings = []; rebuildSpellIndex(); },
    check: function(word) { return spellProvider.check(word); },
    suggest: function(word) { return spellProvider.suggest(word); },
    extractWords: function(text) { return spellExtractWords(text); },
    refresh: function() { spellRefresh(); },
    ignore: function(word) { spellProvider.addToIgnore(word); },
    addWord: function(word) { spellProvider.addToPersonal(word); },
    /* Initialize provider from pre-loaded dictionary data (for testing/offline) */
    initLocal: function(affData, dicData) {
      if (typeof Typo === "undefined") return false;
      spellProvider._typo = new Typo("en_US", affData, dicData);
      spellState.ready = true;
      if (spellState.enabled) spellRefresh();
      return true;
    }
  }
};

/* Navigation helpers exposed for testing */
window.__sag.scrollCursorIntoView = function() { scrollCursorIntoView(); };
window.__sag.posToCoords = function(pos) { return posToCoords(pos || cursor); };
window.__sag.getZoom = function() { return zoom; };
window.__sag.lastLayoutHint = function() { return _lastLayoutHint; };
window.__sag.paraYState = function() { return _paraYState; };
window.__sag.layoutStats = function() { return _layoutStats; };
window.__sag.layoutRegion = layoutRegion;
window.__sag.pipelineState = function() {
  var vis = pageWin._initialized ? pageWin.computeVisibleRange(_scrollSnap) : {start:0,end:0};
  return {
    scroll: Math.round(pageArea.scrollTop),
    snapGen: _scrollSnap.gen,
    renderGen: _renderGen,
    visiblePages: [vis.start, vis.end],
    mountedPages: [pageWin.mountStart, pageWin.mountEnd],
    realizedParas: [layoutRegion.realizedFrom, layoutRegion.realizedTo],
    realizedLines: layoutRegion._lines.length,
    totalPages: totalPages,
    totalParas: doc.paragraphs.length,
    gen: JSON.parse(JSON.stringify(_pipelineGen)),
    cursor: {p: cursor.p, o: cursor.o}
  };
};
window.__sag.pipelineGen = _pipelineGen;
window.__sag.setCursor = function(p, o) {
  cursor = {p: p, o: o || 0}; selAnchor = null; selFocus = null;
  clampPos(cursor); scrollCursorIntoView(); render();
};
window.__sag.renderCov = function() { return JSON.parse(JSON.stringify(_renderCov)); };
window.__sag.resetRenderCov = resetRenderCov;
window.__sag.capturePageSnapshot = capturePageSnapshot;
window.__sag.instrumentCtx = instrumentCtx;
window.__sag.updateSidebar = updateSidebar;
window.__sag.navigateToSection = navigateToSection;
window.__sag.getSectionChapterTitle = getSectionChapterTitle;
window.__sag.getSectionWordCount = getSectionWordCount;
window.__sag.buildSectionMap = buildSectionMap;
window.__sag.totalPages = function() { return totalPages; };
window.__sag.updateNavigatorActive = updateNavigatorActive;
window.__sag.addNewChapter = addNewChapter;
window.__sag.sectionOfPara = sectionOfPara;
window.__sag.clampToSection = clampToSection;
window.__sag.rebuildSectionIndex = rebuildSectionIndex;
window.__sag.defaultBookDesign = defaultBookDesign;
window.__sag.bookDesign = function() { return doc.bookDesign; };
window.__sag.syncSectionHeadings = syncSectionHeadings;
window.__sag.headingBlocks = function() { return _headingBlocks; };
window.__sag.computeChapterNumber = computeChapterNumber;
window.__sag.buildHeadingLabel = buildHeadingLabel;
window.__sag.applySmallCaps = applySmallCaps;
window.__sag.measureXHeight = measureXHeight;
window.__sag.measureCapHeight = measureCapHeight;
window.__sag.computeAutoScale = computeAutoScale;
window.__sag.sectionIndex = function() { return _sectionIndex; };
window.__sag.resolveDocument = resolveDocument;
window.__sag.stripDocument = stripDocument;
window.__sag.getBookDefaults = function() { return doc.bookDefaults; };
window.__sag.getRoleStyles = function() { return doc.roleStyles; };
window.__sag.flattenSections = flattenSections;
window.__sag.regroupSections = regroupSections;
window.__sag.generateSectionId = generateSectionId;
window.__sag.getSectionTypeDefaults = function() { return SECTION_TYPE_DEFAULTS; };

