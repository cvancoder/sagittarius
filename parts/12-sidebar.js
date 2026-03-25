/* ================================================================
   DEV MENU: Toggle open/close, close on outside click.
   ================================================================ */

document.getElementById("dev-btn").addEventListener("click", function(e) {
  e.stopPropagation();
  document.getElementById("dev-menu").classList.toggle("open");
});
document.addEventListener("click", function(e) {
  var devMenu = document.getElementById("dev-menu");
  var devBtn = document.getElementById("dev-btn");
  if (!devMenu.contains(e.target) && e.target !== devBtn) {
    devMenu.classList.remove("open");
  }
});

/* Layout Info panel: shows bookSettings values read-only */
/* Layout panel: user-facing page setup (read-only for now) */
function openLayoutPanel() {
  var bs = doc.bookSettings;
  var t = bs.trim || {};
  var m = bs.marginsIn || {};
  var html = '<div class="lp-row">Trim size: <b>' + (t.widthIn||"?") + '\u2033 \u00D7 ' + (t.heightIn||"?") + '\u2033</b></div>';
  html += '<div class="lp-row">Margins (in): <b>T' + (m.top||0) + ' R' + (m.right||0) + ' B' + (m.bottom||0) + ' L' + (m.left||0) + '</b></div>';
  html += '<div class="lp-row">Gutter: <b>' + (m.gutter||0) + '\u2033</b></div>';
  html += '<div class="lp-row">Page pixels: <b>' + PAGE_W + ' \u00D7 ' + PAGE_H + '</b></div>';
  html += '<div class="lp-row">Total pages: <b>' + totalPages + '</b></div>';
  html += '<div class="lp-row" style="margin-top:8px;border-top:1px solid #eee;padding-top:6px;">Drop Caps: <span style="color:#888;">per-paragraph (use toolbar button)</span></div>';
  document.getElementById("layout-panel-body").innerHTML = html;
  document.getElementById("layout-panel").classList.add("open");
  document.getElementById("layout-overlay").classList.add("open");
}
function closeLayoutPanel() {
  document.getElementById("layout-panel").classList.remove("open");
  document.getElementById("layout-overlay").classList.remove("open");
}
document.getElementById("btn-layout-panel").addEventListener("click", function(e) {
  e.preventDefault(); openLayoutPanel();
});
document.getElementById("layout-close").addEventListener("click", function(e) {
  e.preventDefault(); closeLayoutPanel();
});
document.getElementById("layout-overlay").addEventListener("click", function() {
  closeLayoutPanel();
});

/* Scene and Page break insert buttons */
document.getElementById("btn-scene").addEventListener("click", function(e) {
  e.preventDefault();
  var insertAt = cursor.p + 1;
  var capScene = captureSplice(cursor.p, 1);
  var sbStyle = defaultParaStyle();
  sbStyle["x-role"] = "sceneBreak";
  sbStyle.textIndent = 0;
  sbStyle.marginTop = 12;
  sbStyle.marginBottom = 12;
  sbStyle.textAlign = "center";
  var sbPara = { style: sbStyle, runs: [makeRun("* * *")] };
  sbStyle["x-sectionId"] = currentSectionId();
  doc.paragraphs.splice(insertAt, 0, sbPara);
  cursor = mkPos(insertAt, 0);
  clearSel();
  finishSplice(capScene, 2);
  requestLayout({ fromPara: insertAt, reason: "split" }); updateToolbar(); resetBlink(); scrollCursorIntoView();
  inputEl.focus();
});
document.getElementById("btn-pagebreak").addEventListener("click", function(e) {
  e.preventDefault();
  var insertAt = cursor.p + 1;
  var capPB = captureSplice(cursor.p, 1);
  var pbStyle = defaultParaStyle();
  pbStyle["x-role"] = "pageBreak";
  pbStyle.textIndent = 0;
  pbStyle.marginTop = 0;
  pbStyle.marginBottom = 0;
  var pbPara = { style: pbStyle, runs: [makeRun("")] };
  pbStyle["x-sectionId"] = currentSectionId();
  doc.paragraphs.splice(insertAt, 0, pbPara);
  /* Ensure there is a body paragraph after the page break */
  if (insertAt + 1 >= doc.paragraphs.length) {
    var afterPb = { style: defaultParaStyle(), runs: [makeRun("")] };
    afterPb.style["x-sectionId"] = currentSectionId();
    doc.paragraphs.splice(insertAt + 1, 0, afterPb);
  }
  cursor = mkPos(insertAt + 1, 0);
  clearSel();
  finishSplice(capPB, doc.paragraphs.length >= capPB.p + 1 ? (cursor.p - capPB.p + 1) : 1);
  requestLayout({ fromPara: insertAt, reason: "split" }); updateToolbar(); resetBlink(); scrollCursorIntoView();
  inputEl.focus();
});

/* Stats detail toggle */
document.getElementById("btn-stats-detail").addEventListener("click", function(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("stats-detail").classList.toggle("open");
});
document.addEventListener("click", function(e) {
  var sd = document.getElementById("stats-detail");
  if (sd && !sd.contains(e.target) && e.target.id !== "btn-stats-detail") {
    sd.classList.remove("open");
  }
});
/* Chapter navigation: clicking a row in the chapter detail panel
   jumps the cursor to that chapter title paragraph. */
document.getElementById("stats-detail").addEventListener("click", function(e) {
  var row = e.target.closest("[data-chapter-para]");
  if (!row) return;
  var paraIdx = parseInt(row.getAttribute("data-chapter-para"), 10);
  if (isNaN(paraIdx) || paraIdx >= doc.paragraphs.length) return;
  cursor = mkPos(paraIdx, 0);
  clearSel();
  render(); updateToolbar(); resetBlink(); scrollCursorIntoView();
  inputEl.focus({ preventScroll: true });
  document.getElementById("stats-detail").classList.remove("open");
});

/* ================================================================
   SECTION SIDEBAR: Book structure navigation panel.
   Reads from doc._sectionMeta, doc.paragraphs, and doc.meta.
   Never writes data. Click to navigate. Active tracks cursor.
   ================================================================ */

var SECTION_DISPLAY = {
  halfTitle:       { name: "Half Title",        icon: "&#189;" },
  titlePage:       { name: "Title Page",        icon: "T" },
  copyright:       { name: "Copyright",         icon: "&copy;" },
  dedication:      { name: "Dedication",        icon: "&hearts;" },
  epigraph:        { name: "Epigraph",          icon: "&#10077;" },
  toc:             { name: "Table of Contents",  icon: "&#9776;" },
  foreword:        { name: "Foreword",          icon: "F" },
  preface:         { name: "Preface",           icon: "P" },
  prologue:        { name: "Prologue",          icon: "&#9654;" },
  chapter:         { name: "Chapter",           icon: "&sect;" },
  epilogue:        { name: "Epilogue",          icon: "&#9664;" },
  afterword:       { name: "Afterword",         icon: "A" },
  acknowledgments: { name: "Acknowledgments",   icon: "&starf;" },
  aboutAuthor:     { name: "About the Author",  icon: "&#128100;" },
  alsoBy:          { name: "Also By",           icon: "&#128218;" },
  glossary:        { name: "Glossary",          icon: "G" },
  endnotes:        { name: "Endnotes",          icon: "&#185;" },
  index:           { name: "Index",             icon: "&#128269;" },
  custom:          { name: "Custom",            icon: "&#10022;" }
};

var REGION_LABELS = { front: "Front Matter", body: "Body", back: "Back Matter" };

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
             .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Compute the 1-based chapter number for a section by counting
   chapter-type sections in _sectionMeta before and including it.
   Returns 0 if the section is not found or not a chapter. */
function computeChapterNumber(sectionId) {
  var count = 0;
  for (var si = 0; si < doc._sectionMeta.length; si++) {
    if (doc._sectionMeta[si].type === "chapter") {
      count++;
      if (doc._sectionMeta[si].id === sectionId) return count;
    }
  }
  return 0;
}

/* Build the composed label+number string for a chapter heading.
   Reads label text, case, number format, and combineWithLabel
   from the template. Returns the string to render.
   
   Examples: "CHAPTER 1", "CHAPTER ONE", "Chapter 1", "1", "" */
function buildHeadingLabel(template, chapterNum) {
  var h = template.heading;
  var parts = [];
  
  /* Label text */
  if (h.label && h.label.show && h.label.text) {
    var labelText = h.label.text;
    if (h.label["case"] === "uppercase") labelText = labelText.toUpperCase();
    else if (h.label["case"] === "lowercase") labelText = labelText.toLowerCase();
    parts.push(labelText);
  }
  
  /* Number */
  if (h.number && h.number.show && chapterNum > 0) {
    var numText = "";
    if (h.number.format === "arabic") {
      numText = String(chapterNum);
    } else if (h.number.format === "roman") {
      var romanNums = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
        "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
        "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX",
        "XXXI", "XXXII", "XXXIII", "XXXIV", "XXXV", "XXXVI", "XXXVII", "XXXVIII", "XXXIX", "XL",
        "XLI", "XLII", "XLIII", "XLIV", "XLV", "XLVI", "XLVII", "XLVIII", "XLIX", "L"];
      numText = chapterNum <= 50 ? romanNums[chapterNum] : String(chapterNum);
    } else if (h.number.format === "word") {
      var wordNums = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];
      numText = chapterNum <= 20 ? wordNums[chapterNum] : String(chapterNum);
    }

    /* Apply case to non-arabic formats */
    var numCase = (h.number["case"]) || "title";
    if (numCase === "uppercase") {
      numText = numText.toUpperCase();
    } else if (numCase === "lowercase") {
      numText = numText.toLowerCase();
    }
    /* "title": leave as stored — word array is title case,
       roman array is uppercase (conventional default) */

    parts.push(numText);
  }
  
  /* Combine or separate */
  if (h.number && h.number.combineWithLabel && parts.length === 2) {
    var sep = h.number.separator || " ";
    return parts[0] + sep + parts[1];
  }
  
  return parts.join("\n");
}

/* Find the chapter title for a section. Prefers heading.title from
   section metadata, falls back to scanning chapterTitle paragraphs. */
function getSectionChapterTitle(sectionId) {
  /* Prefer heading.title from section metadata */
  if (doc._sectionMeta) {
    for (var si = 0; si < doc._sectionMeta.length; si++) {
      if (doc._sectionMeta[si].id === sectionId) {
        if (doc._sectionMeta[si].heading && doc._sectionMeta[si].heading.title) {
          return doc._sectionMeta[si].heading.title;
        }
        break;
      }
    }
  }
  /* Fallback: scan paragraphs (for sections without heading data) */
  for (var i = 0; i < doc.paragraphs.length; i++) {
    if (doc.paragraphs[i].style["x-sectionId"] !== sectionId) continue;
    for (var j = i; j < doc.paragraphs.length && j < i + 5; j++) {
      if (doc.paragraphs[j].style["x-sectionId"] !== sectionId) break;
      if (doc.paragraphs[j].style["x-role"] === "chapterTitle") {
        return paraText(doc.paragraphs[j]);
      }
    }
    return null;
  }
  return null;
}

/* Sync heading.title on chapter sections from the chapterTitle
   paragraph text. Called from updateSidebar() to keep section
   data current after edits. Lightweight — only touches chapter
   sections and uses the section index cache for O(1) lookups. */
function syncSectionHeadings() {
  if (!doc._sectionMeta) return;
  for (var si = 0; si < doc._sectionMeta.length; si++) {
    var meta = doc._sectionMeta[si];
    if (meta.type !== "chapter") continue;

    /* Find the section's paragraph range from cache */
    var first = -1, last = -1;
    if (_sectionIndex && _sectionIndex.byId[meta.id]) {
      first = _sectionIndex.byId[meta.id].first;
      last = _sectionIndex.byId[meta.id].last;
    } else {
      for (var pi = 0; pi < doc.paragraphs.length; pi++) {
        if (doc.paragraphs[pi].style["x-sectionId"] === meta.id) {
          if (first < 0) first = pi;
          last = pi;
        }
      }
    }
    if (first < 0) continue;

    /* Find chapterTitle paragraph in the section */
    var titleText = "";
    for (var pi2 = first; pi2 <= last && pi2 < first + 5; pi2++) {
      if (doc.paragraphs[pi2] && doc.paragraphs[pi2].style["x-role"] === "chapterTitle") {
        titleText = paraText(doc.paragraphs[pi2]);
        break;
      }
    }

    /* Update heading */
    if (!meta.heading) meta.heading = {};
    meta.heading.title = titleText;
  }
}

/* Count words in all paragraphs of a section. */
function getSectionWordCount(sectionId) {
  var count = 0;
  for (var i = 0; i < doc.paragraphs.length; i++) {
    if (doc.paragraphs[i].style["x-sectionId"] === sectionId) {
      var text = paraText(doc.paragraphs[i]);
      if (text.length > 0) {
        var words = text.split(/\s+/);
        for (var w = 0; w < words.length; w++) {
          if (words[w].length > 0) count++;
        }
      }
    }
  }
  return count;
}

/* Build a section boundary map from _sectionMeta and doc.paragraphs.
   Returns an array of objects, one per section, each containing:
     id        — section UUID
     type      — section type (e.g., "chapter", "titlePage")
     region    — "front", "body", or "back"
     beginOn   — "right" or "left" (from section printOptions or SECTION_TYPE_DEFAULTS)
     firstPara — index of first paragraph in doc.paragraphs
     lastPara  — index of last paragraph in doc.paragraphs
     paraCount — number of paragraphs in this section
   
   Returns empty array if no sections defined.
   Does NOT modify any data. Pure read-only. */
function buildSectionMap() {
  var map = [];
  if (!doc._sectionMeta || doc._sectionMeta.length === 0) return map;

  for (var si = 0; si < doc._sectionMeta.length; si++) {
    var meta = doc._sectionMeta[si];
    var defaults = SECTION_TYPE_DEFAULTS[meta.type] || SECTION_TYPE_DEFAULTS.chapter;

    /* Resolve beginOn: section override → type default → "right" */
    var beginOn = "right";
    if (meta.printOptions && meta.printOptions.beginOn) {
      beginOn = meta.printOptions.beginOn;
    } else if (defaults.printOptions && defaults.printOptions.beginOn) {
      beginOn = defaults.printOptions.beginOn;
    }

    /* Find first and last paragraph for this section */
    var firstPara = -1;
    var lastPara = -1;
    for (var pi = 0; pi < doc.paragraphs.length; pi++) {
      if (doc.paragraphs[pi].style["x-sectionId"] === meta.id) {
        if (firstPara === -1) firstPara = pi;
        lastPara = pi;
      }
    }

    var paraCount = (firstPara >= 0 && lastPara >= 0)
      ? (lastPara - firstPara + 1)
      : 0;

    map.push({
      id: meta.id,
      type: meta.type,
      region: meta.region,
      beginOn: beginOn,
      firstPara: firstPara,
      lastPara: lastPara,
      paraCount: paraCount
    });
  }

  return map;
}

/* ── Section Index Cache ──
   Fast O(1) lookups for section boundaries and paragraph→section
   mapping. Rebuilt after layout, addNewChapter, and undo/redo.
   Used by clampToSection, navigateToSection, Ctrl+A, and any
   code that needs to know which section a paragraph belongs to.

   _sectionIndex.byId[sectionId]  → { first: paraIdx, last: paraIdx }
   _sectionIndex.byPara[paraIdx]  → sectionId
   _sectionIndex.map              → full buildSectionMap() result   */
var _sectionIndex = null;

/* ── Heading Block Render Data ──
   Built during runLayout(). Stores per-page heading block data
   for chapter first pages. The render function reads this to
   draw label+number text above the chapter title paragraph.
   
   _headingBlocks[pageNumber] = {
     labelText: "CHAPTER 1",        // composed from template
     labelFont: "11pt Georgia",      // CSS font string
     labelColor: "#666666",
     labelY: 288,                    // Y position (top of text)
     alignment: "center",
     pageWidth: PAGE_W
   }                                                           */
var _headingBlocks = {};

function rebuildSectionIndex() {
  var map = buildSectionMap();
  _sectionIndex = { byId: {}, byPara: {}, map: map };
  for (var i = 0; i < map.length; i++) {
    var sec = map[i];
    _sectionIndex.byId[sec.id] = {
      first: sec.firstPara,
      last: sec.lastPara,
      type: sec.type,
      region: sec.region,
      beginOn: sec.beginOn
    };
    for (var pi = sec.firstPara; pi <= sec.lastPara; pi++) {
      _sectionIndex.byPara[pi] = sec.id;
    }
  }
}

/* Jump cursor to first paragraph of a section. */
function navigateToSection(sectionId) {
  /* Use cache for O(1) lookup */
  var targetPara = -1;
  if (_sectionIndex && _sectionIndex.byId[sectionId]) {
    targetPara = _sectionIndex.byId[sectionId].first;
  } else {
    /* Fallback: scan */
    for (var i = 0; i < doc.paragraphs.length; i++) {
      if (doc.paragraphs[i].style["x-sectionId"] === sectionId) {
        targetPara = i;
        break;
      }
    }
  }
  if (targetPara < 0) return;

  /* Set cursor to start of section */
  cursor = mkPos(targetPara, 0);
  clearSel();

  /* Find which page this paragraph is on */
  var targetPage = _paraYState[targetPara]
    ? _paraYState[targetPara].page
    : 0;

  /* Scroll so the target page is at the TOP of the viewport */
  pageWin.ensureMounted(targetPage);
  var sh = pageWin.slotHeight();
  var padTop = pageWin.wrapPaddingTop();
  pageArea.scrollTop = Math.max(0, padTop + targetPage * sh);

  render();
  updateToolbar();
  inputEl.focus();
}

/* Rebuild entire sidebar content from live data. */
function updateSidebar() {
  syncSectionHeadings();
  var container = document.getElementById("sidebar-content");
  if (!container) return;

  var html = "";

  var title = (doc.meta && doc.meta.title) ? escapeHtml(doc.meta.title) : "Untitled";
  var author = (doc.meta && doc.meta.author) ? escapeHtml(doc.meta.author) : "";

  html += '<div class="sb-cover-wrap">';
  html += '<div class="sb-cover"><div class="sb-cover-thumb">';
  html += '<div class="sb-cover-title">' + title + '</div>';
  if (author) html += '<div class="sb-cover-author">' + author + '</div>';
  html += '</div><div class="sb-cover-label">eBook</div></div>';
  html += '<div class="sb-cover"><div class="sb-cover-thumb">';
  html += '<div class="sb-cover-title">' + title + '</div>';
  if (author) html += '<div class="sb-cover-author">' + author + '</div>';
  html += '</div><div class="sb-cover-label">Print</div></div>';
  html += '</div>';

  if (!doc._sectionMeta || doc._sectionMeta.length === 0) {
    html += '<div style="padding:10px;color:#999;font-style:italic;">No sections</div>';
    container.innerHTML = html;
    return;
  }

  /* Active section is determined by scroll position via
     updateNavigatorActive(), not cursor position. During
     sidebar rebuild, set no item as active — the next scroll
     event or explicit call will set it. */
  var activeSid = null;

  var chapterNum = 0;
  var lastRegion = null;
  var addChapterEmitted = false;

  for (var i = 0; i < doc._sectionMeta.length; i++) {
    var meta = doc._sectionMeta[i];
    var region = meta.region || "body";
    var type = meta.type || "custom";
    var display = SECTION_DISPLAY[type] || SECTION_DISPLAY.custom;
    var isActive = (meta.id === activeSid);

    if (region !== lastRegion) {
      /* Emit Add Chapter button at the end of the body region */
      if (lastRegion === "body" && !addChapterEmitted) {
        html += '<div id="btn-add-chapter" style="padding:5px 12px;'
             + 'margin:4px 8px 8px 8px;text-align:center;cursor:pointer;'
             + 'color:var(--accent,#3b82f6);font-size:11px;'
             + 'border:1px dashed var(--accent,#3b82f6);border-radius:4px;'
             + 'opacity:0.7;">+ Add Chapter</div>';
        addChapterEmitted = true;
      }
      html += '<div class="sb-region">' + (REGION_LABELS[region] || region) + '</div>';
      lastRegion = region;
    }

    var name = "";
    if (meta.title) {
      name = meta.title;
    } else if (type === "chapter") {
      chapterNum++;
      name = getSectionChapterTitle(meta.id) || "Untitled Chapter";
    } else {
      name = display.name;
    }

    html += '<div class="sb-item' + (isActive ? ' active' : '') + '" data-section-id="' + meta.id + '">';

    if (type === "chapter" || type === "prologue" || type === "epilogue") {
      html += '<span class="sb-item-grip">&#x2807;</span>';
    }

    html += '<span class="sb-item-icon">' + display.icon + '</span>';
    html += '<div class="sb-item-text">';

    if (type === "chapter") {
      html += '<div class="sb-item-type">Chapter ' + chapterNum + '</div>';
      html += '<div class="sb-item-name">' + escapeHtml(name) + '</div>';
      var wc = getSectionWordCount(meta.id);
      if (wc > 0) {
        html += '<div class="sb-item-type">' + wc.toLocaleString() + ' words</div>';
      }
    } else {
      html += '<div class="sb-item-name">' + escapeHtml(name) + '</div>';
    }

    html += '</div></div>';
  }

  /* If body was the last region, emit the button now */
  if (lastRegion === "body" && !addChapterEmitted) {
    html += '<div id="btn-add-chapter" style="padding:5px 12px;'
         + 'margin:4px 8px 8px 8px;text-align:center;cursor:pointer;'
         + 'color:var(--accent,#3b82f6);font-size:11px;'
         + 'border:1px dashed var(--accent,#3b82f6);border-radius:4px;'
         + 'opacity:0.7;">+ Add Chapter</div>';
    addChapterEmitted = true;
  }

  container.innerHTML = html;

  var items = container.querySelectorAll(".sb-item");
  for (var j = 0; j < items.length; j++) {
    (function(el) {
      el.addEventListener("click", function() {
        var sid = el.getAttribute("data-section-id");
        if (sid) navigateToSection(sid);
      });
    })(items[j]);
  }

  var addChBtn = document.getElementById("btn-add-chapter");
  if (addChBtn) {
    addChBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      addNewChapter();
    });
  }

  /* Set initial active state from scroll position */
  updateNavigatorActive();
}

/* Lightweight scroll-based active section update.
   Finds which section is on the topmost visible page and
   toggles the .active class in the sidebar. Does NOT rebuild DOM. */
function updateNavigatorActive() {
  var container = document.getElementById("sidebar-content");
  if (!container) return;

  /* Find topmost fully visible page */
  var sh = pageWin.slotHeight();
  if (sh <= 0) return;
  var padTop = pageWin.wrapPaddingTop();
  var scrollTop = pageArea.scrollTop;
  var topPage = Math.max(0, Math.floor((scrollTop - padTop + sh * 0.3) / sh));
  if (topPage >= totalPages) topPage = totalPages - 1;

  /* Find which section owns this page */
  var activeSid = null;
  for (var pi = 0; pi < _paraYState.length; pi++) {
    if (_paraYState[pi] && _paraYState[pi].page === topPage) {
      activeSid = doc.paragraphs[pi]
        ? doc.paragraphs[pi].style["x-sectionId"]
        : null;
      break;
    }
  }

  /* If the page is blank, look BACKWARD for the previous page
     with content. A blank page is a gap between sections — it
     belongs to the section that came before it. */
  if (!activeSid) {
    for (var _bpi = _paraYState.length - 1; _bpi >= 0; _bpi--) {
      if (_paraYState[_bpi] && _paraYState[_bpi].page < topPage) {
        activeSid = doc.paragraphs[_bpi]
          ? doc.paragraphs[_bpi].style["x-sectionId"]
          : null;
        break;
      }
    }
  }

  /* Toggle .active class on sidebar items */
  var items = container.querySelectorAll(".sb-item");
  for (var i = 0; i < items.length; i++) {
    var sid = items[i].getAttribute("data-section-id");
    if (sid === activeSid) {
      if (!items[i].classList.contains("active")) {
        items[i].classList.add("active");
        var sidebarScroll = container.parentElement;
        if (sidebarScroll) {
          var itemRect = items[i].getBoundingClientRect();
          var sidebarRect = sidebarScroll.getBoundingClientRect();
          if (itemRect.top < sidebarRect.top || itemRect.bottom > sidebarRect.bottom) {
            items[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }
    } else {
      items[i].classList.remove("active");
    }
  }
}

/* Add a new empty chapter after the last body-region chapter.
   Creates a new _sectionMeta entry, a chapterTitle paragraph,
   and an empty body paragraph. Supports undo via compound delta. */
function addNewChapter() {

  /* ── Find last body section ── */
  var lastBodyIdx = -1;
  for (var si = 0; si < doc._sectionMeta.length; si++) {
    if (doc._sectionMeta[si].region === "body") lastBodyIdx = si;
  }

  /* ── Find paragraph insertion point ── */
  var insertAfterPara = -1;
  if (lastBodyIdx >= 0) {
    var lastBodyId = doc._sectionMeta[lastBodyIdx].id;
    for (var pi = doc.paragraphs.length - 1; pi >= 0; pi--) {
      if (doc.paragraphs[pi].style["x-sectionId"] === lastBodyId) {
        insertAfterPara = pi;
        break;
      }
    }
  }
  if (insertAfterPara < 0) {
    for (var si2 = doc._sectionMeta.length - 1; si2 >= 0; si2--) {
      if (doc._sectionMeta[si2].region === "front") {
        var fid = doc._sectionMeta[si2].id;
        for (var pi2 = doc.paragraphs.length - 1; pi2 >= 0; pi2--) {
          if (doc.paragraphs[pi2].style["x-sectionId"] === fid) {
            insertAfterPara = pi2;
            break;
          }
        }
        break;
      }
    }
  }

  var insertAt = insertAfterPara + 1;

  /* ── Capture undo state ── */
  var metaBefore = JSON.parse(JSON.stringify(doc._sectionMeta));
  var capSplice = captureSplice(insertAt, 0);

  /* ── Count existing chapters for auto-numbering ── */
  var chapterCount = 0;
  for (var ci = 0; ci < doc._sectionMeta.length; ci++) {
    if (doc._sectionMeta[ci].type === "chapter") chapterCount++;
  }

  /* ── Create section in _sectionMeta ── */
  var newSecId = generateSectionId();
  var newMeta = {
    id: newSecId, region: "body", type: "chapter",
    heading: { title: "Chapter " + (chapterCount + 1) }
  };

  var metaInsertIdx = lastBodyIdx >= 0
    ? lastBodyIdx + 1
    : (function() {
        for (var bi = 0; bi < doc._sectionMeta.length; bi++) {
          if (doc._sectionMeta[bi].region === "back") return bi;
        }
        return doc._sectionMeta.length;
      })();

  doc._sectionMeta.splice(metaInsertIdx, 0, newMeta);

  /* ── Create paragraphs ── */
  var ctStyle = defaultParaStyle();
  ctStyle["x-role"] = "chapterTitle";
  ctStyle.textIndent = 0;
  ctStyle.marginTop = 24;
  ctStyle.marginBottom = 12;
  ctStyle.textAlign = "center";
  ctStyle["x-sectionId"] = newSecId;
  var titlePara = { style: ctStyle,
    runs: [makeRun("Chapter " + (chapterCount + 1))] };

  var bodyStyle = defaultParaStyle();
  bodyStyle["x-role"] = "body";
  bodyStyle.textIndent = 0;
  bodyStyle["x-sectionId"] = newSecId;
  var bodyPara = { style: bodyStyle, runs: [makeRun("")] };

  doc.paragraphs.splice(insertAt, 0, titlePara, bodyPara);

  /* ── Position cursor in empty body paragraph ── */
  cursor = mkPos(insertAt + 1, 0);
  clearSel();

  /* ── Push compound undo delta ── */
  var metaAfter = JSON.parse(JSON.stringify(doc._sectionMeta));

  capSplice.inserted = cloneParaRange(insertAt, insertAt + 2);
  capSplice.cursorAfter = clonePos(cursor);
  capSplice.selAfter = null;

  var metaDelta = createDelta("sectionMeta", {
    oldMeta: metaBefore,
    newMeta: metaAfter,
    cursorBefore: capSplice.cursorBefore,
    cursorAfter: capSplice.cursorAfter,
    selBefore: capSplice.selBefore,
    selAfter: null
  });

  var spliceDelta = createDelta("splice", capSplice);

  pushDelta(createDelta("compound", {
    deltas: [spliceDelta, metaDelta]
  }));

  /* ── Layout, render, navigate ── */
  requestLayout({ fromPara: insertAt, reason: "split" });
  updateToolbar();
  resetBlink();
  scrollCursorIntoView();
  inputEl.focus();
}

/* ══════════════════════════════════════════════════════
   VIEW SWITCHING: Editor ↔ Designer
   setView() toggles between writing mode and design mode.
   Additional views (data, etc.) can be added later by
   extending the if/else chain.
   ══════════════════════════════════════════════════════ */
var _currentView = "editor";

function setView(name) {
  _currentView = name;

  var viewEditor = document.getElementById("view-editor");
  var viewDesigner = document.getElementById("view-designer");
  var toolbarRow1 = document.getElementById("toolbar-row1");
  var toolbarRow2 = document.getElementById("toolbar-row2");
  var toolbarDesign = document.getElementById("toolbar-design");
  var rulerHBar = document.getElementById("ruler-h-bar");

  if (name === "designer") {
    viewEditor.style.display = "none";
    viewDesigner.style.display = "flex";
    toolbarRow1.style.display = "none";
    toolbarRow2.style.display = "none";
    toolbarDesign.style.display = "flex";
    if (rulerHBar) rulerHBar.style.display = "none";
  } else {
    /* Editor mode (default) */
    viewEditor.style.display = "";
    viewDesigner.style.display = "none";
    toolbarRow1.style.display = "";
    toolbarRow2.style.display = "";
    toolbarDesign.style.display = "none";
    if (rulerHBar) rulerHBar.style.display = _showRulers ? "flex" : "none";
  }
}

/* ── Design button: enter design mode ── */
document.getElementById("btn-design").addEventListener("click", function() {
  setView("designer");
  _desChangeset = {};
  _desActiveSection = "chapter";
  _desActiveGroup = null;
  _desZones = {};
  desPopulateGroups("chapter");
  renderDesignerPreview();
});

/* ── Design Cancel: return to editor ── */
document.getElementById("btn-design-cancel").addEventListener("click", function() {
  desDiscardChangeset();
  setView("editor");
});

/* ── Design Update: commit changeset and return to editor ──
   Writes changeset to doc.bookDesign, pushes undo delta,
   switches to editor, then relayouts. Sequencing matters:
   commit before view switch, relayout after. */
document.getElementById("btn-design-update").addEventListener("click", function() {
  var hadChanges = desCommitChangeset();
  setView("editor");
  if (hadChanges) {
    requestFullLayout("design");
    render();
  }
});

