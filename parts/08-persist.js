/* ================================================================
   PERSISTENCE: IndexedDB with localStorage fallback. Saves the
   document in v3 sections format via stripDocument() + regroupSections().
   Loads via flattenSections() + resolveDocument(). Auto-save triggers
   on the Save button (Ctrl+S) and the Load button (Ctrl+L).
   ================================================================ */

var STORAGE_KEY = "sagittarius:default";
var DB_NAME = "Sagittarius";
var DB_VERSION = 1;
var DB_STORE = "documents";
var storageMode = "unknown";

/* statusPill(type, message)
   Valid types:
     "ok"   — green, success actions (save, load, paste)
     "bad"  — red, error conditions (failed operations)
     "warn" — orange, user warnings (invalid input)
     "info" — blue, informational (selection clamped, hints)
     null   — reset to default "Ready" state                */
function statusPill(state, text) {
  var el = document.getElementById("status-pill");
  el.classList.remove("ok", "warn", "bad");
  if (state) el.classList.add(state);
  el.textContent = text;
}

function openDB() {
  return new Promise(function(resolve, reject) {
    if (!("indexedDB" in window)) { reject(new Error("No IndexedDB")); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function idbPut(record) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, "readwrite");
      tx.oncomplete = function() { db.close(); resolve(true); };
      tx.onerror = function() { db.close(); reject(tx.error); };
      tx.objectStore(DB_STORE).put(record);
    });
  });
}

function idbGet(id) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, "readonly");
      var req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = function() { db.close(); resolve(req.result || null); };
      req.onerror = function() { db.close(); reject(req.error); };
    });
  });
}

function detectStorage() {
  return openDB().then(function(db) {
    db.close();
    storageMode = "idb";
    statusPill("ok", "Storage: IndexedDB");
  }).catch(function() {
    storageMode = "localStorage";
    statusPill("warn", "Storage: localStorage");
  });
}

function saveDoc() {
  var stripped = stripDocument(doc);
  var sections = regroupSections(stripped.paragraphs, doc._sectionMeta);
  var saveDoc3 = {
    version: 3,
    meta: stripped.meta,
    bookSettings: stripped.bookSettings,
    bookDefaults: stripped.bookDefaults,
    roleStyles: stripped.roleStyles,
    bookDesign: JSON.parse(JSON.stringify(doc.bookDesign || defaultBookDesign())),
    sections: sections
  };
  var payload = { id: STORAGE_KEY, savedAt: Date.now(), doc: saveDoc3 };
  if (storageMode === "idb") {
    return idbPut(payload).then(function() {
      statusPill("ok", "Saved");
    }).catch(function() {
      statusPill("bad", "Save failed");
    });
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    statusPill("ok", "Saved (localStorage)");
  } catch(e) {
    statusPill("bad", "Save failed");
  }
  return Promise.resolve();
}

/* ================================================================
   MIGRATION: Upgrades saved documents from older versions to the
   current format. Called on load before validation. Uses sequential
   version checks so documents upgrade through each version step.
   Never mutates input directly — works on a deep copy.
   ================================================================ */

function migrateDoc(d) {
  var result = JSON.parse(JSON.stringify(d));

  if (typeof result.version !== "number") result.version = 1;

  /* Ensure meta exists */
  if (!result.meta || typeof result.meta !== "object") result.meta = {};
  if (!result.meta.title) result.meta.title = "Untitled";
  if (!result.meta.author) result.meta.author = "";
  if (!result.meta.createdAt) result.meta.createdAt = Date.now();

  /* v1 -> v2: add bookSettings, paragraph spacing fields */
  if (result.version < 2) {
    result.meta.migratedFromVersion = result.version;

    if (!result.bookSettings) result.bookSettings = defaultBookSettings();

    if (!Array.isArray(result.paragraphs)) result.paragraphs = [];
    if (result.paragraphs.length === 0) result.paragraphs.push(makePara(""));

    for (var i = 0; i < result.paragraphs.length; i++) {
      var p = result.paragraphs[i];
      if (!p.style) p.style = defaultParaStyle();
      /* Migrate old indent field (integer multiplier) to textIndent */
      if (typeof p.style.indent === "number" && typeof p.style.textIndent !== "number") {
        p.style.textIndent = p.style.indent * 48 * 0.75;
        delete p.style.indent;
      }
      if (typeof p.style.textIndent !== "number") p.style.textIndent = 18;
      /* Migrate old lineSpacing to lineHeight */
      if (typeof p.style.lineSpacing === "number" && typeof p.style.lineHeight !== "number") {
        p.style.lineHeight = p.style.lineSpacing;
        delete p.style.lineSpacing;
      }
      if (typeof p.style.lineHeight !== "number") p.style.lineHeight = 1.2;
      if (typeof p.style.marginTop !== "number") p.style.marginTop = 0;
      if (typeof p.style.marginBottom !== "number") p.style.marginBottom = 0;
      if (!p.style["x-role"]) p.style["x-role"] = "body";
      if (typeof p.style.marginLeft !== "number") p.style.marginLeft = 0;
      if (typeof p.style.marginRight !== "number") p.style.marginRight = 0;
      if (typeof p.style["x-list"] === "undefined") p.style["x-list"] = null;
      /* Drop cap migration: normalize to { enabled: bool } object.
         Old formats: boolean true/false, or object { enabled: bool, lines: N, ... } */
      if (typeof p.style["x-dropCap"] === "boolean") {
        p.style["x-dropCap"] = { enabled: p.style["x-dropCap"] };
      } else if (typeof p.style["x-dropCap"] === "object" && p.style["x-dropCap"] !== null) {
        if (typeof p.style["x-dropCap"].enabled !== "boolean") p.style["x-dropCap"].enabled = false;
      } else {
        p.style["x-dropCap"] = { enabled: false };
      }
      /* Ensure all runs have script field */
      for (var r = 0; r < p.runs.length; r++) {
        if (!p.runs[r]["x-script"]) p.runs[r]["x-script"] = "normal";
        if (typeof p.runs[r]["x-linkHref"] === "undefined") p.runs[r]["x-linkHref"] = null;
      }
    }

    result.version = 2;
  }

  /* Ensure bookDefaults and roleStyles exist */
  if (!result.bookDefaults) result.bookDefaults = v2BookDefaults();
  if (!result.roleStyles) result.roleStyles = v2RoleStyles();

  /* v2 -> v3: convert flat paragraphs to sections */
  if (result.version < 3) {
    if (Array.isArray(result.paragraphs) && result.paragraphs.length > 0) {
      var sections = [];
      var currentParas = [];
      var foundChapter = false;

      for (var i = 0; i < result.paragraphs.length; i++) {
        var role = result.paragraphs[i].style
          ? (result.paragraphs[i].style["x-role"] || "body") : "body";

        if (role === "chapterTitle" && currentParas.length > 0) {
          sections.push({
            region: "body",
            type: "chapter",
            id: generateSectionId(),
            paragraphs: currentParas
          });
          currentParas = [];
          foundChapter = true;
        }

        if (role === "chapterTitle") foundChapter = true;
        currentParas.push(result.paragraphs[i]);
      }

      if (currentParas.length > 0) {
        sections.push({
          region: "body",
          type: "chapter",
          id: generateSectionId(),
          paragraphs: currentParas
        });
      }

      if (sections.length === 0) {
        sections.push({
          region: "body",
          type: "chapter",
          id: generateSectionId(),
          paragraphs: [makePara("")]
        });
      }

      result.sections = sections;
      delete result.paragraphs;
    } else {
      result.sections = [{
        region: "body",
        type: "chapter",
        id: generateSectionId(),
        paragraphs: [makePara("")]
      }];
      if (result.paragraphs) delete result.paragraphs;
    }

    result.version = 3;
  }

  return result;
}

/* Validate a document against the v2 schema. Returns an object with
   ok (boolean), errors (array of blocking issues), and warnings
   (array of non-blocking issues). Called after migration. */
function validateDoc(d) {
  var errors = [];
  var warnings = [];
  var isObj = function(v) { return v && typeof v === "object" && !Array.isArray(v); };
  var isNum = function(v) { return typeof v === "number" && isFinite(v); };
  var isStr = function(v) { return typeof v === "string"; };

  if (!isObj(d)) { errors.push("Document is not an object."); return { ok: false, errors: errors, warnings: warnings }; }
  if (d.version !== 2 && d.version !== 3) errors.push("doc.version must be 2 or 3 (got " + d.version + ").");

  /* meta */
  if (!isObj(d.meta)) errors.push("doc.meta must be an object.");
  else {
    if (!isStr(d.meta.title)) warnings.push("doc.meta.title missing or not a string.");
    if ("createdAt" in d.meta && !isNum(d.meta.createdAt)) warnings.push("doc.meta.createdAt should be a number.");
  }

  /* bookSettings */
  var bs = d.bookSettings;
  if (!isObj(bs)) {
    errors.push("doc.bookSettings must be an object.");
  } else {
    if (!isObj(bs.trim)) errors.push("bookSettings.trim must be an object.");
    else {
      if (!isNum(bs.trim.widthIn)) errors.push("bookSettings.trim.widthIn must be a number (inches).");
      if (!isNum(bs.trim.heightIn)) errors.push("bookSettings.trim.heightIn must be a number (inches).");
    }
    if (!isObj(bs.marginsIn)) errors.push("bookSettings.marginsIn must be an object.");
    else {
      if (!isNum(bs.marginsIn.top)) errors.push("marginsIn.top must be a number.");
      if (!isNum(bs.marginsIn.right)) errors.push("marginsIn.right must be a number.");
      if (!isNum(bs.marginsIn.bottom)) errors.push("marginsIn.bottom must be a number.");
      if (!isNum(bs.marginsIn.left)) errors.push("marginsIn.left must be a number.");
    }
    if (!isObj(bs.defaults)) warnings.push("bookSettings.defaults missing.");
  }

  /* bookDefaults */
  if (!isObj(d.bookDefaults)) {
    warnings.push("doc.bookDefaults missing.");
  } else {
    if (!isObj(d.bookDefaults.run)) warnings.push("bookDefaults.run missing.");
    if (!isObj(d.bookDefaults.para)) warnings.push("bookDefaults.para missing.");
  }

  /* roleStyles */
  if (!isObj(d.roleStyles)) {
    warnings.push("doc.roleStyles missing.");
  }

  /* sections (v3) or paragraphs (v2 legacy) */
  if (d.version === 3) {
    if (!Array.isArray(d.sections)) {
      errors.push("doc.sections must be an array.");
    } else if (d.sections.length === 0) {
      errors.push("doc.sections is empty.");
    } else {
      for (var si = 0; si < d.sections.length; si++) {
        var sec = d.sections[si];
        if (!isObj(sec)) { errors.push("sections[" + si + "] is not an object."); continue; }
        if (!isStr(sec.region)) errors.push("sections[" + si + "].region missing.");
        if (!isStr(sec.type)) errors.push("sections[" + si + "].type missing.");
        if (!isStr(sec.id)) errors.push("sections[" + si + "].id missing.");
        if (!Array.isArray(sec.paragraphs)) {
          errors.push("sections[" + si + "].paragraphs must be an array.");
          continue;
        }
        for (var pi = 0; pi < sec.paragraphs.length; pi++) {
          var p = sec.paragraphs[pi];
          if (!isObj(p)) { errors.push("sections[" + si + "].paragraphs[" + pi + "] not an object."); continue; }
          if (!isObj(p.style)) errors.push("sections[" + si + "].paragraphs[" + pi + "].style missing.");
          if (!Array.isArray(p.runs) || p.runs.length === 0) {
            errors.push("sections[" + si + "].paragraphs[" + pi + "].runs must be a non-empty array.");
            continue;
          }
          for (var r = 0; r < p.runs.length; r++) {
            var run = p.runs[r];
            if (!isObj(run)) { errors.push("sections[" + si + "].paragraphs[" + pi + "].runs[" + r + "] not an object."); continue; }
            if (!isStr(run.text)) errors.push("sections[" + si + "].paragraphs[" + pi + "].runs[" + r + "].text must be a string.");
          }
        }
      }
    }
  } else {
    /* v2 legacy: flat paragraphs */
    if (!Array.isArray(d.paragraphs)) {
      errors.push("doc.paragraphs must be an array.");
      return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }
    if (d.paragraphs.length === 0) errors.push("doc.paragraphs is empty.");

    for (var i = 0; i < d.paragraphs.length; i++) {
      var p = d.paragraphs[i];
      if (!isObj(p)) { errors.push("paragraphs[" + i + "] is not an object."); continue; }
      if (!isObj(p.style)) errors.push("paragraphs[" + i + "].style missing.");
      else {
        if (!isNum(p.style.marginTop)) warnings.push("paragraphs[" + i + "].style.marginTop missing.");
        if (!isNum(p.style.marginBottom)) warnings.push("paragraphs[" + i + "].style.marginBottom missing.");
      }
      if (!Array.isArray(p.runs) || p.runs.length === 0) {
        errors.push("paragraphs[" + i + "].runs must be a non-empty array.");
        continue;
      }
      for (var r = 0; r < p.runs.length; r++) {
        var run = p.runs[r];
        if (!isObj(run)) { errors.push("paragraphs[" + i + "].runs[" + r + "] not an object."); continue; }
        if (!isStr(run.text)) errors.push("paragraphs[" + i + "].runs[" + r + "].text must be a string.");
        if (!isStr(run.fontFamily)) warnings.push("paragraphs[" + i + "].runs[" + r + "].fontFamily missing.");
        if (!isNum(run.fontSize)) warnings.push("paragraphs[" + i + "].runs[" + r + "].fontSize missing.");
      }
    }
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

function loadSavedDoc() {
  var promise;
  if (storageMode === "idb") {
    promise = idbGet(STORAGE_KEY);
  } else {
    var raw = localStorage.getItem(STORAGE_KEY);
    promise = Promise.resolve(raw ? JSON.parse(raw) : null);
  }
  return promise.then(function(rec) {
    if (!rec || !rec.doc) { statusPill("warn", "Nothing saved"); return; }
    var migrated = migrateDoc(rec.doc);
    var v = validateDoc(migrated);
    if (!v.ok) { statusPill("bad", "Invalid save data: " + v.errors[0]); console.warn("validateDoc errors:", v.errors); return; }
    /* Flatten sections into editor's flat paragraphs array */
    var flat = flattenSections(migrated.sections);
    migrated.paragraphs = flat.paragraphs;
    migrated._sectionMeta = flat.sectionMeta;
    delete migrated.sections;
    resolveDocument(migrated);
    doc = migrated;
    if (!doc.bookDesign) doc.bookDesign = defaultBookDesign();
    /* Migration: bookDesign body values must match rendered defaults
       until the template system is fully driving rendering.
       Build 0122 shipped with 1.4/justify but the engine renders 1.2/left. */
    if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.body) {
      var _bdb = doc.bookDesign.chapter.body;
      if (_bdb.lineHeight === 1.4) _bdb.lineHeight = 1.2;
      if (_bdb.textAlign === "justify") _bdb.textAlign = "left";
    }
    /* Migration: bookDesign sceneBreak spacing must match
       rendered defaults. Build 0122 shipped with 18/18 but
       the engine renders 12/12 via roleStyles. */
    if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.sceneBreak) {
      var _bds = doc.bookDesign.chapter.sceneBreak;
      if (_bds.spacingAbove === 18) _bds.spacingAbove = 12;
      if (_bds.spacingBelow === 18) _bds.spacingBelow = 12;
    }
    /* Migration: dropFromTop and spacingToBody defaults.
       Build 0126 shipped with dropFromTop: 216 (too low on page).
       Build 0127 corrects to 154 (25% of page).
       spacingToBody: 24 corrected to 12 to match current rendering. */
    if (doc.bookDesign && doc.bookDesign.chapter && doc.bookDesign.chapter.heading
        && doc.bookDesign.chapter.heading.layout) {
      var _bhl = doc.bookDesign.chapter.heading.layout;
      if (_bhl.dropFromTop === 216) _bhl.dropFromTop = 154;
      if (_bhl.spacingToBody === 24) _bhl.spacingToBody = 12;
    }
    /* Migration: label.case baked into text.
       Build 0130 used case transform (text "Chapter" + case "uppercase").
       Build 0131 stores text as-displayed (text "CHAPTER" + case "none"). */
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
    computePageDimensions();
    cursor = mkPos(0, 0);
    clearSel();
    requestFullLayout("load"); render();
    statusPill("ok", "Loaded");
    updateSidebar();
  }).catch(function() {
    statusPill("bad", "Load failed");
  });
}

function exportJSON() {
  var stripped = stripDocument(doc);
  var sections = regroupSections(stripped.paragraphs, doc._sectionMeta);
  var exportDoc = {
    version: 3,
    meta: stripped.meta,
    bookSettings: stripped.bookSettings,
    bookDefaults: stripped.bookDefaults,
    roleStyles: stripped.roleStyles,
    bookDesign: JSON.parse(JSON.stringify(doc.bookDesign || defaultBookDesign())),
    sections: sections
  };
  var json = JSON.stringify(exportDoc, null, 2);
  var blob = new Blob([json], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "sagittarius-document.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  statusPill("ok", "Exported");
}

document.getElementById("btn-save").addEventListener("click", function(e) {
  e.preventDefault(); saveDoc(); inputEl.focus();
});
document.getElementById("btn-load").addEventListener("click", function(e) {
  e.preventDefault(); loadSavedDoc(); inputEl.focus();
});
document.getElementById("btn-export").addEventListener("click", function(e) {
  e.preventDefault(); exportJSON(); inputEl.focus();
});

