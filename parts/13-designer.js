/* ================================================================
   DESIGNER PREVIEW: Renders a sample chapter opener page on the
   preview canvas using current doc.bookDesign values. Completely
   independent of the editor's layout/render pipeline. Reads
   bookDesign and bookSettings, never writes.
   ================================================================ */

var DES_SAMPLE_TITLE = "The Tides of Morning";
var DES_SAMPLE_BODY = [
  "The morning sun cast long shadows across the cobblestone streets as she made her way toward the old bookshop on the corner. It had been years since her last visit, yet the familiar scent of aged paper and leather bindings greeted her like an old friend.",
  "She paused in the doorway, her hand resting on the worn oak frame. Inside, rows upon rows of shelves stretched toward the ceiling, each one brimming with volumes that held entire worlds within their pages. A quiet reverence settled over her as she stepped inside.",
  "The shopkeeper looked up from behind the counter, reading glasses perched on the end of his nose. He smiled as though he had been expecting her all along."
];

/* Simple word-wrap for preview text. Returns array of line strings.
   firstLineMax is optional — if provided, the first line wraps at
   that width (for indented paragraphs) and continuation lines at
   maxWidth. Completely independent — does not use tokenizePara. */
function desWrapText(ctx, text, maxWidth, firstLineMax) {
  var words = text.split(" ");
  var lines = [];
  var current = "";
  var lineMax = (typeof firstLineMax === "number")
    ? firstLineMax : maxWidth;
  for (var i = 0; i < words.length; i++) {
    var test = current ? current + " " + words[i] : words[i];
    if (ctx.measureText(test).width > lineMax && current) {
      lines.push(current);
      current = words[i];
      lineMax = maxWidth;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* Render the designer preview canvas. Called when entering designer
   mode and on container resize. Reads from doc.bookDesign and
   doc.bookSettings. Never writes to either. */
function renderDesignerPreview() {
  var container = document.getElementById("des-preview");
  var canvas = document.getElementById("des-preview-canvas");
  if (!canvas || !container) return;

  computePageDimensions();
  var PT = SCREEN_DPI / 72;

  /* ── Scale canvas to fit container with generous dead space ── */
  var DES_PADDING = 48;
  var availW = container.clientWidth - DES_PADDING * 2;
  var availH = container.clientHeight - DES_PADDING * 2 - 30;
  if (availW <= 0 || availH <= 0) return;

  var scale = Math.min(availW / PAGE_W, availH / PAGE_H);
  var cssW = Math.round(PAGE_W * scale);
  var cssH = Math.round(PAGE_H * scale);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  var _dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(PAGE_W * scale * _dpr);
  canvas.height = Math.round(PAGE_H * scale * _dpr);

  var ctx = canvas.getContext("2d");
  ctx.setTransform(scale * _dpr, 0, 0, scale * _dpr, 0, 0);

  /* ── White page background ── */
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  /* ── Margin guides ──
     Drawn in screen-pixel space for crisp 1px lines.
     Temporarily resets the transform, converts page
     coordinates to CSS pixels, snaps to pixel grid with
     the standard +0.5 offset, then restores. */
  ctx.save();
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  var _mgL = Math.round(M_LEFT * scale) + 0.5;
  var _mgT = Math.round(M_TOP * scale) + 0.5;
  var _mgW = Math.round(CONTENT_W * scale);
  var _mgH = Math.round((PAGE_H - M_TOP - M_BOT) * scale);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#c8c8c8";
  ctx.lineWidth = 1;
  ctx.strokeRect(_mgL, _mgT, _mgW, _mgH);
  ctx.restore();

  /* ── Read design template ── */
  var bd = desMergedDesign();
  var ch = bd.chapter || {};
  var heading = ch.heading || {};
  var hLabel = heading.label || {};
  var hNumber = heading.number || {};
  var hTitle = heading.title || {};
  var hLayout = heading.layout || {};
  var body = ch.body || {};

  var contentLeft = M_LEFT;
  var contentRight = PAGE_W - M_RIGHT;
  var contentW = contentRight - contentLeft;

  /* ── Heading label + number ── */
  var labelY = (hLayout.dropFromTop || 154) * PT;
  if (labelY < M_TOP) labelY = M_TOP;

  var labelText = buildHeadingLabel(ch, 1);
  if (labelText) {
    var labelFontParts = "";
    if (hLabel.fontStyle === "italic")
      labelFontParts += "italic ";
    if (hLabel.fontWeight === "bold")
      labelFontParts += "bold ";
    var labelFs = (hLabel.fontSize || 11);
    var labelFont = labelFontParts + labelFs + "pt "
      + (hLabel.fontFamily || "Georgia");

    ctx.save();
    ctx.font = labelFont;
    ctx.fillStyle = hLabel.color || "#666666";
    ctx.textBaseline = "top";

    /* Letter spacing */
    if (hLabel.letterSpacing) {
      ctx.letterSpacing = hLabel.letterSpacing + "pt";
    }

    var align = hLayout.alignment || "center";
    var labelX;
    if (align === "center") {
      ctx.textAlign = "center";
      labelX = contentLeft + contentW / 2;
    } else if (align === "right") {
      ctx.textAlign = "right";
      labelX = contentRight;
    } else {
      ctx.textAlign = "left";
      labelX = contentLeft;
    }
    ctx.fillText(labelText, labelX, labelY);

    /* Underline */
    if (hLabel.underline) {
      var desTw = ctx.measureText(labelText).width;
      var desUlX;
      if (align === "center") desUlX = labelX - desTw / 2;
      else if (align === "right") desUlX = labelX - desTw;
      else desUlX = labelX;
      var desUlY = labelY + labelFs * PT;
      ctx.beginPath();
      ctx.strokeStyle = hLabel.color || "#666666";
      ctx.lineWidth = Math.max(1,
        Math.round(labelFs * PT / 14));
      ctx.moveTo(desUlX, desUlY);
      ctx.lineTo(desUlX + desTw, desUlY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ── Record label zone ── */
  _desZones.label = {
    x: contentLeft,
    y: labelY,
    w: contentW,
    h: (hLabel.fontSize || 11) * PT
  };

  /* ── Title ── */
  var titleY = labelY
    + ((hLabel.fontSize || 11) * PT)
    + ((hLayout.spacingLabelToTitle || 8) * PT);

  var titleFontParts = "";
  if (hTitle.fontStyle === "italic")
    titleFontParts += "italic ";
  if (hTitle.fontWeight === "bold")
    titleFontParts += "bold ";
  var titleFs = hTitle.fontSize || 20;
  var titleFont = titleFontParts + titleFs + "pt "
    + (hTitle.fontFamily || "Georgia");

  ctx.font = titleFont;
  ctx.fillStyle = hTitle.color || "#1a1a1a";
  ctx.textBaseline = "top";

  var titleAlign = hTitle.alignment
    || hLayout.alignment || "center";
  var titleLines = desWrapText(ctx, DES_SAMPLE_TITLE, contentW);
  var titleLineH = titleFs * 1.333 * 1.3;

  for (var tli = 0; tli < titleLines.length; tli++) {
    var tx;
    if (titleAlign === "center") {
      ctx.textAlign = "center";
      tx = contentLeft + contentW / 2;
    } else if (titleAlign === "right") {
      ctx.textAlign = "right";
      tx = contentRight;
    } else {
      ctx.textAlign = "left";
      tx = contentLeft;
    }
    ctx.fillText(titleLines[tli], tx, titleY);
    titleY += titleLineH;
  }

  /* ── Record title zone ── */
  var titleStartY = labelY
    + ((hLabel.fontSize || 11) * PT)
    + ((hLayout.spacingLabelToTitle || 8) * PT);
  _desZones.title = {
    x: contentLeft,
    y: titleStartY,
    w: contentW,
    h: titleY - titleStartY
  };

  /* ── Body text ── */
  var bodyY = titleY + ((hLayout.spacingToBody || 12) * PT);
  var bodyFs = body.fontSize || 12;
  var bodyFontParts = "";
  var bodyFont = bodyFontParts + bodyFs + "pt "
    + (body.fontFamily || "Georgia");
  var bodyLH = bodyFs * 1.333 * (body.lineHeight || 1.2);
  var bodyIndent = (body.textIndent || 18) * PT;
  var bodyColor = body.color || "#1a1a1a";
  var bodyAlign = body.textAlign || "left";

  ctx.font = bodyFont;
  ctx.fillStyle = bodyColor;
  ctx.textBaseline = "top";

  var maxBodyY = PAGE_H - M_BOT;

  for (var bpi = 0; bpi < DES_SAMPLE_BODY.length; bpi++) {
    if (bodyY >= maxBodyY) break;

    /* First body paragraph after heading: no indent.
       Subsequent paragraphs: use textIndent. */
    var paraIndent = (bpi === 0) ? 0 : bodyIndent;
    var firstLineW = contentW - paraIndent;

    var bodyLines = desWrapText(
      ctx, DES_SAMPLE_BODY[bpi], contentW, firstLineW
    );

    for (var bli = 0; bli < bodyLines.length; bli++) {
      if (bodyY >= maxBodyY) break;

      var bx;
      var lineIndent = (bli === 0) ? paraIndent : 0;
      var lineW = contentW - lineIndent;

      if (bodyAlign === "center") {
        ctx.textAlign = "center";
        bx = contentLeft + lineIndent + lineW / 2;
      } else if (bodyAlign === "right") {
        ctx.textAlign = "right";
        bx = contentRight;
      } else {
        ctx.textAlign = "left";
        bx = contentLeft + lineIndent;
      }

      ctx.fillText(bodyLines[bli], bx, bodyY);
      bodyY += bodyLH;
    }

    /* Paragraph spacing */
    bodyY += (body.paragraphSpacing || 0) * PT;
  }

  /* ── Record body zone ── */
  var bodyStartY = titleY + ((hLayout.spacingToBody || 12) * PT);
  _desZones.body = {
    x: contentLeft,
    y: bodyStartY,
    w: contentW,
    h: bodyY - bodyStartY
  };

  /* ── Zone highlight overlay ── */
  if (_desActiveGroup) {
    var zoneKey = null;
    var groups = DES_CHAPTER_GROUPS;
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi].id === _desActiveGroup) {
        zoneKey = groups[gi].zone;
        break;
      }
    }
    var zone = zoneKey ? _desZones[zoneKey] : null;
    if (zone && zone.w > 0 && zone.h > 0) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.10)";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.30)";
      ctx.lineWidth = 1;
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    }
  }
}

/* Re-render preview when the container resizes (window resize,
   panel adjustments, etc.). Only active in designer mode. */
var _desResizeObserver = null;
if (typeof ResizeObserver !== "undefined") {
  _desResizeObserver = new ResizeObserver(function() {
    if (_currentView === "designer") {
      renderDesignerPreview();
    }
  });
  var _desPreviewEl = document.getElementById("des-preview");
  if (_desPreviewEl) _desResizeObserver.observe(_desPreviewEl);
}

window.__sag.renderDesignerPreview = renderDesignerPreview;
window.__sag.desWrapText = desWrapText;

/* ================================================================
   DESIGNER INTERACTION: Section list click handling, property
   group display, and preview zone highlighting. Reads bookDesign
   for display. Never writes.
   ================================================================ */

/* Property groups for the "chapter" section type.
   Each group has an id, display label, a brief description,
   and a zone key that maps to a bounding rectangle recorded
   during preview rendering. */
var DES_CHAPTER_GROUPS = [
  {
    id: "chapterHead",
    label: "Chapter Head",
    desc: "The line above the title that identifies the chapter "
      + "— typically 'CHAPTER 1' or 'Part Two'. The prefix is "
      + "free text you type yourself. The number is "
      + "auto-generated. Sinkage controls how far down from "
      + "the top margin the heading begins.",
    zone: "label"
  },
  {
    id: "chapterTitle",
    label: "Chapter Title",
    desc: "The name of the chapter displayed below the chapter "
      + "head. This is the largest, most prominent text on the "
      + "opening page.",
    zone: "title"
  },
  {
    id: "bodyText",
    label: "Body Text",
    desc: "The main reading text of the book. These settings "
      + "apply to every body paragraph in every chapter. First "
      + "paragraph indent controls whether the paragraph after "
      + "a chapter heading is indented or flush.",
    zone: "body"
  },
  {
    id: "dropCap",
    label: "Drop Cap",
    desc: "A large decorative letter at the start of each "
      + "chapter's first paragraph. The letter drops down "
      + "across multiple lines and text wraps around it.",
    zone: null
  },
  {
    id: "leadInSmallCaps",
    label: "Lead-In Small Caps",
    desc: "The first few words after a chapter heading rendered "
      + "as optically corrected small caps \u2014 uppercase "
      + "letters scaled to x-height with stroke thickening and "
      + "letter spacing. Auto mode computes the best values "
      + "from the body font.",
    zone: null
  },
  {
    id: "sceneBreak",
    label: "Scene Break",
    desc: "The visual separator between scenes within a "
      + "chapter. Appears as centered text, a horizontal line, "
      + "or a blank space. The text is free \u2014 type any "
      + "characters or symbols you want.",
    zone: null
  },
  {
    id: "runningHeaders",
    label: "Running Headers",
    desc: "Repeated text at the top of each page. Traditionally "
      + "the book title on left-hand pages and the chapter "
      + "title on right-hand pages. Hidden on chapter opening "
      + "pages by default.",
    zone: null
  },
  {
    id: "folio",
    label: "Folio",
    desc: "Page numbers. Controls where they appear, their "
      + "format, and visibility. Hidden on chapter opening "
      + "pages and blank pages by default.",
    zone: null
  }
];

/* Currently selected section type in the left panel.
   null = no section selected. */
var _desActiveSection = null;

/* Currently selected property group id in the right panel.
   null = no group selected. */
var _desActiveGroup = null;

/* Zone rectangles recorded during preview rendering.
   Keys match the zone property in DES_CHAPTER_GROUPS.
   Values are { x, y, w, h } in page coordinate space. */
var _desZones = {};

/* Handle clicks on section list items. Disabled items are
   ignored. Selecting an item populates the property groups
   in the right panel and re-renders the preview. */
document.getElementById("des-sections-list")
  .addEventListener("click", function(e) {
    var item = e.target.closest(".des-sec-item");
    if (!item) return;
    if (item.classList.contains("disabled")) return;

    /* Update active state in section list */
    var items = document.querySelectorAll(
      "#des-sections-list .des-sec-item"
    );
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove("active");
    }
    item.classList.add("active");

    var sectionType = item.getAttribute("data-des-type");
    _desActiveSection = sectionType;
    _desActiveGroup = null;

    desPopulateGroups(sectionType);
    renderDesignerPreview();
  });

/* Populate the properties panel with group items for the
   given section type. Currently only "chapter" is supported.
   Clears any previous content and resets the description. */
function desPopulateGroups(sectionType) {
  var container = document.getElementById("des-props-content");
  if (!container) return;

  container.innerHTML = "";

  var groups = null;
  if (sectionType === "chapter") {
    groups = DES_CHAPTER_GROUPS;
  }

  if (!groups) {
    container.innerHTML =
      '<div style="padding:12px 14px;color:#aaa;'
      + 'font-size:11px;font-style:italic;">'
      + 'No properties available for this section.</div>';
    desUpdateDescription(null);
    return;
  }

  for (var i = 0; i < groups.length; i++) {
    var wrap = document.createElement("div");
    wrap.className = "des-prop-group";
    wrap.setAttribute("data-des-group", groups[i].id);

    var hdr = document.createElement("div");
    hdr.className = "des-prop-group-hdr";
    hdr.setAttribute("data-des-idx", i);
    hdr.innerHTML = '<span class="des-arrow">&#9654;</span> '
      + groups[i].label;
    wrap.appendChild(hdr);

    var body = document.createElement("div");
    body.className = "des-prop-group-body";
    var inner = document.createElement("div");
    inner.className = "des-prop-group-inner";
    if (DES_CONTROL_BUILDERS[groups[i].id]) {
      DES_CONTROL_BUILDERS[groups[i].id](inner);
    }
    body.appendChild(inner);
    wrap.appendChild(body);

    container.appendChild(wrap);
  }

  desUpdateDescription(null);
}

/* ── Accordion helpers ── */
function desActivateGroup(groupId, hdr) {
  /* Clear active from all headers */
  var allHdrs = document.querySelectorAll(
    ".des-prop-group-hdr");
  for (var i = 0; i < allHdrs.length; i++) {
    allHdrs[i].classList.remove("active");
  }
  /* Activate the target */
  if (hdr) hdr.classList.add("active");
  _desActiveGroup = groupId;
  desUpdateDescription(groupId);
}

function desClearActive() {
  var allHdrs = document.querySelectorAll(
    ".des-prop-group-hdr");
  for (var i = 0; i < allHdrs.length; i++) {
    allHdrs[i].classList.remove("active");
  }
  _desActiveGroup = null;
  desUpdateDescription(null);
}

/* Accordion click handler — complete state table:
   1. Click closed header         → open, activate
   2. Click open+active header    → close, clear active
   3. Click open non-active header → close only
   4. Body click non-active group → activate
   5. Body click active group     → no-op
   6. Click outside any group     → ignore */
document.getElementById("des-props-content")
  .addEventListener("click", function(e) {
    var hdr = e.target.closest(".des-prop-group-hdr");
    var wrap = e.target.closest(".des-prop-group");

    if (!wrap) return;                       /* case 6 */

    var groupId = wrap.getAttribute("data-des-group");

    if (hdr) {
      /* ── Header click ── */
      if (wrap.classList.contains("open")) {
        /* Group is open */
        wrap.classList.remove("open");
        if (_desActiveGroup === groupId) {
          desClearActive();                  /* case 2 */
        }
        /* else: case 3 — close only, active unchanged */
      } else {
        /* Group is closed */
        wrap.classList.add("open");
        desActivateGroup(groupId, hdr);      /* case 1, 2 */
      }
    } else if (_desActiveGroup !== groupId) {
      /* ── Body click, non-active group ── */
      var targetHdr = wrap.querySelector(".des-prop-group-hdr");
      desActivateGroup(groupId, targetHdr);  /* case 4 */
    }
    /* else: case 5 — body click on active group, no-op */

    renderDesignerPreview();
  });

/* Update the description panel text for the selected group.
   Reads from the group definitions array. */
function desUpdateDescription(groupId) {
  var el = document.getElementById("des-description-text");
  if (!el) return;

  if (!groupId) {
    el.textContent = "Select a property group to see its "
      + "description here.";
    return;
  }

  var groups = DES_CHAPTER_GROUPS;
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === groupId) {
      el.textContent = groups[i].desc;
      return;
    }
  }

  el.textContent = "No description available.";
}

window.__sag.desPopulateGroups = desPopulateGroups;
window.__sag.desUpdateDescription = desUpdateDescription;
window.__sag.desActiveGroup = function() {
  return _desActiveGroup;
};
window.__sag.desActiveSection = function() {
  return _desActiveSection;
};
window.__sag.desZones = function() {
  return _desZones;
};

/* ================================================================
   DESIGNER CHANGESET: Accumulates property changes made in the
   designer. The preview reads through the changeset overlay.
   Update commits to doc.bookDesign + pushes undo. Cancel discards.
   Never writes to doc.bookDesign directly — only desCommitChangeset
   does, and only on explicit Update.
   ================================================================ */

/* Active changeset. Keys are dot-paths into bookDesign
   (e.g., "chapter.heading.title.alignment"). Values are the
   new values set by the user. Empty = no changes. */
var _desChangeset = {};

/* Read a value from an object using a dot-separated path.
   Returns undefined if any segment is missing. */
function desReadPath(obj, path) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/* Write a value to an object at a dot-separated path.
   Creates intermediate objects if needed. */
function desWritePath(obj, path, value) {
  var parts = path.split(".");
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/* Return a bookDesign object with changeset values overlaid.
   If the changeset is empty, returns the live bookDesign directly
   (no copy needed). Otherwise returns a deep copy with overrides
   applied. Used by renderDesignerPreview for preview rendering. */
function desMergedDesign() {
  var base = doc.bookDesign || defaultBookDesign();
  var keys = Object.keys(_desChangeset);
  if (keys.length === 0) return base;

  var merged = JSON.parse(JSON.stringify(base));
  for (var i = 0; i < keys.length; i++) {
    desWritePath(merged, keys[i], _desChangeset[keys[i]]);
  }
  return merged;
}

/* Record a property change in the changeset and re-render
   the preview to show the effect immediately. */
function desSetChange(path, value) {
  _desChangeset[path] = value;
  renderDesignerPreview();
}

/* Commit all changeset values to doc.bookDesign and push a
   single undo delta. Called by the Update button handler.
   Does NOT trigger relayout or render — the caller is
   responsible for sequencing (switch view first, then relayout)
   so the editor is visible when layout runs. */
function desCommitChangeset() {
  var keys = Object.keys(_desChangeset);
  if (keys.length === 0) return false;

  var changes = [];
  for (var i = 0; i < keys.length; i++) {
    var path = keys[i];
    var oldValue = desReadPath(doc.bookDesign, path);
    var newValue = _desChangeset[path];
    changes.push({
      path: path,
      oldValue: (oldValue !== undefined)
        ? JSON.parse(JSON.stringify(oldValue)) : undefined,
      newValue: JSON.parse(JSON.stringify(newValue))
    });
    desWritePath(doc.bookDesign, path, newValue);
  }

  pushDelta(createDelta("bookDesign", {
    changes: changes,
    cursorBefore: clonePos(cursor),
    cursorAfter: clonePos(cursor)
  }));

  _desChangeset = {};
  return true;
}

/* Discard all changeset values. No changes written. */
function desDiscardChangeset() {
  _desChangeset = {};
}

/* ================================================================
   DESIGNER CONTROL HELPERS: Reusable DOM builders for property
   controls inside accordion groups. Each helper creates a row
   with a label and an input element, wired to desSetChange.
   ================================================================ */

/* Create a select dropdown control.
   options: array of {v: value, t: displayText}.
   path: dot-path into bookDesign, or null for inert. */
function desCtlSelect(parent, label, options, current, path) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var sel = document.createElement("select");
  sel.className = "des-control-select";
  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement("option");
    opt.value = options[i].v;
    opt.textContent = options[i].t;
    if (String(options[i].v) === String(current)) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  }
  if (path) {
    sel.addEventListener("change", function() {
      var val = sel.value;
      /* Detect numeric values */
      if (/^\d+(\.\d+)?$/.test(val)) {
        val = parseFloat(val);
        if (val === Math.floor(val)) val = parseInt(sel.value, 10);
      }
      desSetChange(path, val);
    });
  }
  row.appendChild(sel);
  parent.appendChild(row);
  return sel;
}

/* Create a text input control. */
function desCtlText(parent, label, current, path) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var inp = document.createElement("input");
  inp.type = "text";
  inp.className = "des-control-input";
  inp.value = current || "";
  if (path) {
    inp.addEventListener("input", function() {
      desSetChange(path, inp.value);
    });
  }
  row.appendChild(inp);
  parent.appendChild(row);
  return inp;
}

/* Create a number input control with min/max clamping.
   suffix: optional unit label after input (e.g. "in").
   toStore: optional function(displayVal) → stored value.
     If provided, the displayed value is in user-facing units
     and toStore converts to internal units before calling
     desSetChange. If omitted, display value = stored value.
   toDisplay: optional function(storedVal) → display value.
     If provided, converts the internal stored value to
     user-facing units for display. If omitted, current is
     displayed as-is. */
function desCtlNumber(parent, label, current, path,
    min, max, step, suffix, toStore, toDisplay) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var inp = document.createElement("input");
  inp.type = "number";
  inp.className = "des-control-input";
  inp.style.maxWidth = "80px";
  var displayVal = toDisplay
    ? toDisplay(current) : current;
  inp.value = displayVal;
  inp.step = String(step || 1);
  if (typeof min === "number") inp.min = min;
  if (typeof max === "number") inp.max = max;
  if (path) {
    inp.addEventListener("change", function() {
      var val = parseFloat(inp.value);
      if (isNaN(val)) return;
      if (typeof min === "number" && val < min) {
        val = min;
      }
      if (typeof max === "number" && val > max) {
        val = max;
      }
      /* Round display value to step precision */
      var s = parseFloat(inp.step) || 1;
      val = Math.round(val / s) * s;
      /* Fix floating point display: round to 2 decimals */
      val = Math.round(val * 100) / 100;
      inp.value = val;
      var storeVal = toStore ? toStore(val) : val;
      desSetChange(path, storeVal);
    });
  }
  row.appendChild(inp);
  if (suffix) {
    var sfx = document.createElement("span");
    sfx.style.cssText =
      "flex:0 0 auto;font-size:11px;color:#888;";
    sfx.textContent = suffix;
    row.appendChild(sfx);
  }
  parent.appendChild(row);
  return inp;
}

/* Create an on/off toggle switch. */
function desCtlToggle(parent, label, isOn, path) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var toggle = document.createElement("div");
  toggle.className = "des-control-toggle"
    + (isOn ? " on" : "");
  var knob = document.createElement("div");
  knob.className = "des-knob";
  toggle.appendChild(knob);
  toggle.addEventListener("click", function() {
    toggle.classList.toggle("on");
    if (path) {
      desSetChange(path,
        toggle.classList.contains("on"));
    }
  });
  row.appendChild(toggle);
  parent.appendChild(row);
  return toggle;
}

/* Create bold/italic/underline style buttons.
   boldPath and italicPath are changeset paths.
   Underline is always inert (no path). */
function desCtlStyleBIU(parent, label,
    boldOn, italicOn, underlineOn,
    boldPath, italicPath, underlinePath) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var grp = document.createElement("div");
  grp.className = "des-control-btn-group";

  var boldBtn = document.createElement("button");
  boldBtn.className = "des-control-btn";
  boldBtn.innerHTML = "<b>B</b>";
  if (boldOn) boldBtn.classList.add("active");
  boldBtn.addEventListener("click", function() {
    boldBtn.classList.toggle("active");
    if (boldPath) {
      desSetChange(boldPath,
        boldBtn.classList.contains("active")
          ? "bold" : "normal");
    }
  });
  grp.appendChild(boldBtn);

  var italicBtn = document.createElement("button");
  italicBtn.className = "des-control-btn";
  italicBtn.innerHTML = "<i>I</i>";
  if (italicOn) italicBtn.classList.add("active");
  italicBtn.addEventListener("click", function() {
    italicBtn.classList.toggle("active");
    if (italicPath) {
      desSetChange(italicPath,
        italicBtn.classList.contains("active")
          ? "italic" : "normal");
    }
  });
  grp.appendChild(italicBtn);

  var underBtn = document.createElement("button");
  underBtn.className = "des-control-btn";
  underBtn.innerHTML = "<u>U</u>";
  if (underlineOn) underBtn.classList.add("active");
  underBtn.addEventListener("click", function() {
    underBtn.classList.toggle("active");
    if (underlinePath) {
      desSetChange(underlinePath,
        underBtn.classList.contains("active"));
    }
  });
  grp.appendChild(underBtn);

  row.appendChild(grp);
  parent.appendChild(row);
  return grp;
}

/* Create a color picker control. */
function desCtlColor(parent, label, current, path) {
  var row = document.createElement("div");
  row.className = "des-control-row";
  var lbl = document.createElement("span");
  lbl.className = "des-control-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  var inp = document.createElement("input");
  inp.type = "color";
  inp.className = "des-control-color";
  inp.value = current || "#000000";
  if (path) {
    inp.addEventListener("input", function() {
      desSetChange(path, inp.value);
    });
  }
  row.appendChild(inp);
  parent.appendChild(row);
  return inp;
}

/* Create a sub-section header label. */
function desCtlSub(parent, label) {
  var sub = document.createElement("div");
  sub.className = "des-control-sub";
  sub.textContent = label;
  parent.appendChild(sub);
}

/* ================================================================
   DESIGNER CONTROL BUILDERS: Per-group functions that populate
   the accordion inner div with controls. Keyed by group id.
   ================================================================ */

var DES_CONTROL_BUILDERS = {
  "chapterHead": desRenderChapterHeadControls
};

/* Build Chapter Head controls into the given container div.
   Reads current values from desMergedDesign(). Wires changes
   to desSetChange(). */
function desRenderChapterHeadControls(container) {
  var bd = desMergedDesign();
  var ch = (bd.chapter && bd.chapter.heading) || {};
  var lbl = ch.label || {};
  var num = ch.number || {};
  var lay = ch.layout || {};

  /* Sinkage — displayed in inches, stored in points.
     min is top margin, max is 50% of page height.
     Both computed from live bookSettings so they adapt
     to any trim size and margin configuration. */
  var _sinkMinIn = doc.bookSettings.marginsIn.top;
  var _sinkMaxIn = Math.round(
    doc.bookSettings.trim.heightIn * 0.5 * 100) / 100;
  desCtlNumber(container, "Sinkage",
    lay.dropFromTop || 154,
    "chapter.heading.layout.dropFromTop",
    _sinkMinIn, _sinkMaxIn, 0.05, "in",
    function(v) { return Math.round(v * 72); },
    function(v) { return Math.round(v / 72 * 100) / 100; });

  desCtlSelect(container, "Alignment", [
    {v: "left", t: "Left"},
    {v: "center", t: "Center"},
    {v: "right", t: "Right"}
  ], lay.alignment || "center",
    "chapter.heading.layout.alignment");

  /* Prefix */
  desCtlSub(container, "Prefix");
  desCtlText(container, "Text", lbl.text || "CHAPTER",
    "chapter.heading.label.text");

  /* Number */
  desCtlSub(container, "Number");
  desCtlToggle(container, "Show",
    num.show !== false,
    "chapter.heading.number.show");
  desCtlSelect(container, "Format", [
    {v: "arabic", t: "1, 2, 3"},
    {v: "roman", t: "I, II, III"},
    {v: "word", t: "One, Two, Three"}
  ], num.format || "arabic",
    "chapter.heading.number.format");
  desCtlSelect(container, "Case", [
    {v: "title", t: "Title Case"},
    {v: "uppercase", t: "UPPERCASE"},
    {v: "lowercase", t: "lowercase"}
  ], num["case"] || "title",
    "chapter.heading.number.case");

  /* Appearance */
  desCtlSub(container, "Appearance");
  desCtlSelect(container, "Font", [
    {v: "Georgia", t: "Georgia"},
    {v: "Times New Roman", t: "Times New Roman"},
    {v: "Palatino Linotype", t: "Palatino"},
    {v: "Garamond", t: "Garamond"},
    {v: "Arial", t: "Arial"},
    {v: "Helvetica", t: "Helvetica"},
    {v: "Verdana", t: "Verdana"},
    {v: "Tahoma", t: "Tahoma"},
    {v: "Trebuchet MS", t: "Trebuchet MS"},
    {v: "Courier New", t: "Courier New"}
  ], lbl.fontFamily || "Georgia",
    "chapter.heading.label.fontFamily");
  desCtlSelect(container, "Size", [
    {v: "8", t: "8pt"}, {v: "9", t: "9pt"},
    {v: "10", t: "10pt"}, {v: "11", t: "11pt"},
    {v: "12", t: "12pt"}, {v: "14", t: "14pt"},
    {v: "16", t: "16pt"}, {v: "18", t: "18pt"}
  ], lbl.fontSize || 11,
    "chapter.heading.label.fontSize");
  desCtlStyleBIU(container, "Style",
    lbl.fontWeight === "bold",
    lbl.fontStyle === "italic",
    lbl.underline === true,
    "chapter.heading.label.fontWeight",
    "chapter.heading.label.fontStyle",
    "chapter.heading.label.underline");
  desCtlColor(container, "Color",
    lbl.color || "#666666",
    "chapter.heading.label.color");

  /* Spacing */
  desCtlSub(container, "Spacing");

  /* Line spacing: 2–24pt range */
  var lsOptions = [];
  for (var ls = 2; ls <= 24; ls++) {
    var lst = ls + "pt";
    if (ls === (lay.spacingLabelToTitle || 8)) {
      lst += " (default)";
    }
    lsOptions.push({v: String(ls), t: lst});
  }
  desCtlSelect(container, "Line spacing",
    lsOptions, lay.spacingLabelToTitle || 8,
    "chapter.heading.layout.spacingLabelToTitle");

  /* Letter spacing: 0–10pt range (INERT — renderer
     does not consume letterSpacing yet) */
  var ltrOptions = [];
  for (var lt = 0; lt <= 10; lt++) {
    var ltt = lt + "pt";
    if (lt === (lbl.letterSpacing || 2)) {
      ltt += " (default)";
    }
    ltrOptions.push({v: String(lt), t: ltt});
  }
  desCtlSelect(container, "Letter spacing",
    ltrOptions, lbl.letterSpacing || 2,
    "chapter.heading.label.letterSpacing");
}

window.__sag.desChangeset = function() {
  return _desChangeset;
};
window.__sag.desSetChange = desSetChange;
window.__sag.desCommitChangeset = desCommitChangeset;
window.__sag.desDiscardChangeset = desDiscardChangeset;
window.__sag.desReadPath = desReadPath;
window.__sag.desWritePath = desWritePath;
window.__sag.desMergedDesign = desMergedDesign;

document.getElementById("sidebar-toggle").addEventListener("click", function() {
  document.getElementById("section-sidebar").classList.add("collapsed");
  document.getElementById("sidebar-expand").style.display = "flex";
});
document.getElementById("sidebar-expand").addEventListener("click", function() {
  document.getElementById("section-sidebar").classList.remove("collapsed");
  document.getElementById("sidebar-expand").style.display = "none";
});

