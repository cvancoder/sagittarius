/* ================================================================
   DOCUMENT CASCADE & SECTIONS
   Cascade: resolveDocument() fills defaults on load.
   stripDocument() removes defaults on save. Both read bookDefaults
   and roleStyles from the doc object with hardcoded fallback.
   Sections: flattenSections() converts file sections to flat
   paragraphs with x-sectionId. regroupSections() converts back
   for save. Safety net assigns orphan paragraphs to nearest section.
   Per-paragraph functions: v2ResolveParaStyle, v2StripParaStyle,
   v2ResolveRunStyle, v2StripRunStyle, v2DeepEqual, v2OrderParaStyle,
   v2OrderRun, v2RoundTrip — used by the document-level functions.
   Constants: SECTION_TYPE_DEFAULTS — page type default include and
   printOptions.
   ================================================================ */

function v2BookDefaults() {
  return {
    run: {
      fontFamily: "Georgia",
      fontSize: 12,
      color: "#1a1a1a",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      backgroundColor: null
    },
    para: {
      textAlign: "left",
      textIndent: 18,
      lineHeight: 1.2,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    }
  };
}

function v2RoleStyles() {
  return {
    body: {},
    chapterTitle: {
      run: {},
      para: {
        textIndent: 0,
        marginTop: 24,
        marginBottom: 12,
        textAlign: "center"
      }
    },
    heading2: {
      run: { fontSize: 22, fontWeight: "bold" },
      para: { textIndent: 0, marginTop: 18, marginBottom: 6 }
    },
    heading3: {
      run: { fontSize: 18, fontWeight: "bold" },
      para: { textIndent: 0, marginTop: 14, marginBottom: 4 }
    },
    heading4: {
      run: { fontSize: 16, fontWeight: "bold" },
      para: { textIndent: 0, marginTop: 12, marginBottom: 4 }
    },
    heading5: {
      run: { fontSize: 14, fontWeight: "bold" },
      para: { textIndent: 0, marginTop: 10, marginBottom: 2 }
    },
    heading6: {
      run: { fontSize: 12, fontWeight: "bold" },
      para: { textIndent: 0, marginTop: 8, marginBottom: 2 }
    },
    blockQuote: {
      run: {},
      para: { marginLeft: 36, marginRight: 36, textIndent: 0, marginTop: 6, marginBottom: 6 }
    },
    verse: {
      run: {},
      para: { marginLeft: 36, marginRight: 36, textIndent: 0, marginTop: 6, marginBottom: 6 }
    },
    sceneBreak: {
      run: {},
      para: { textIndent: 0, marginTop: 12, marginBottom: 12, textAlign: "center" }
    },
    pageBreak: {
      run: {},
      para: { textIndent: 0, marginTop: 0, marginBottom: 0 }
    }
  };
}

function v2ResolveParaStyle(bookDefaults, roleStyles, paraOverrides) {
  var result = {};
  var bd = bookDefaults.para;
  for (var key in bd) {
    if (bd.hasOwnProperty(key)) result[key] = bd[key];
  }
  var role = paraOverrides["x-role"] || "body";
  var rs = roleStyles[role];
  if (rs && rs.para) {
    for (var key in rs.para) {
      if (rs.para.hasOwnProperty(key)) result[key] = rs.para[key];
    }
  }
  for (var key in paraOverrides) {
    if (paraOverrides.hasOwnProperty(key)) result[key] = paraOverrides[key];
  }
  return result;
}

function v2ResolveRunStyle(bookDefaults, roleStyles, paraStyle, runOverrides) {
  var result = {};
  var bd = bookDefaults.run;
  for (var key in bd) {
    if (bd.hasOwnProperty(key)) result[key] = bd[key];
  }
  var role = paraStyle["x-role"] || "body";
  var rs = roleStyles[role];
  if (rs && rs.run) {
    for (var key in rs.run) {
      if (rs.run.hasOwnProperty(key)) result[key] = rs.run[key];
    }
  }
  for (var key in runOverrides) {
    if (runOverrides.hasOwnProperty(key) && key !== "text") {
      result[key] = runOverrides[key];
    }
  }
  result.text = runOverrides.text;
  return result;
}

function v2DeepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  var keysA = Object.keys(a);
  var keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (var i = 0; i < keysA.length; i++) {
    if (!v2DeepEqual(a[keysA[i]], b[keysA[i]])) return false;
  }
  return true;
}

function v2StripParaStyle(resolvedPara, bookDefaults, roleStyles) {
  var role = resolvedPara["x-role"] || "body";
  var cascaded = v2ResolveParaStyle(bookDefaults, roleStyles, { "x-role": role });
  var overrides = {};
  overrides["x-role"] = role;
  for (var key in resolvedPara) {
    if (!resolvedPara.hasOwnProperty(key)) continue;
    if (key === "x-role") continue;
    if (key.indexOf("x-") === 0) {
      overrides[key] = resolvedPara[key];
      continue;
    }
    if (!v2DeepEqual(resolvedPara[key], cascaded[key])) {
      overrides[key] = resolvedPara[key];
    }
  }
  return overrides;
}

function v2StripRunStyle(resolvedRun, bookDefaults, roleStyles, paraStyle) {
  var cascaded = v2ResolveRunStyle(bookDefaults, roleStyles, paraStyle, { text: "" });
  var overrides = { text: resolvedRun.text };
  for (var key in resolvedRun) {
    if (!resolvedRun.hasOwnProperty(key)) continue;
    if (key === "text") continue;
    if (key.indexOf("x-") === 0) {
      overrides[key] = resolvedRun[key];
      continue;
    }
    if (!v2DeepEqual(resolvedRun[key], cascaded[key])) {
      overrides[key] = resolvedRun[key];
    }
  }
  return overrides;
}

function v2OrderParaStyle(style) {
  var ordered = {};
  if (style.hasOwnProperty("x-role")) ordered["x-role"] = style["x-role"];
  var cssKeys = [];
  var xKeys = [];
  for (var key in style) {
    if (!style.hasOwnProperty(key)) continue;
    if (key === "x-role") continue;
    if (key.indexOf("x-") === 0) { xKeys.push(key); }
    else { cssKeys.push(key); }
  }
  cssKeys.sort();
  xKeys.sort();
  for (var i = 0; i < cssKeys.length; i++) ordered[cssKeys[i]] = style[cssKeys[i]];
  for (var i = 0; i < xKeys.length; i++) ordered[xKeys[i]] = style[xKeys[i]];
  return ordered;
}

function v2OrderRun(run) {
  var ordered = {};
  ordered.text = run.text;
  var cssKeys = [];
  var xKeys = [];
  for (var key in run) {
    if (!run.hasOwnProperty(key)) continue;
    if (key === "text") continue;
    if (key.indexOf("x-") === 0) { xKeys.push(key); }
    else { cssKeys.push(key); }
  }
  cssKeys.sort();
  xKeys.sort();
  for (var i = 0; i < cssKeys.length; i++) ordered[cssKeys[i]] = run[cssKeys[i]];
  for (var i = 0; i < xKeys.length; i++) ordered[xKeys[i]] = run[xKeys[i]];
  return ordered;
}

function v2RoundTrip(sparseParagraphs, bookDefaults, roleStyles) {
  var resolved = [];
  for (var pi = 0; pi < sparseParagraphs.length; pi++) {
    var sp = sparseParagraphs[pi];
    var resolvedParaStyle = v2ResolveParaStyle(bookDefaults, roleStyles, sp.style);
    var resolvedRuns = [];
    for (var ri = 0; ri < sp.runs.length; ri++) {
      resolvedRuns.push(v2ResolveRunStyle(bookDefaults, roleStyles, resolvedParaStyle, sp.runs[ri]));
    }
    resolved.push({ style: resolvedParaStyle, runs: resolvedRuns });
  }
  var stripped = [];
  for (var pi = 0; pi < resolved.length; pi++) {
    var rp = resolved[pi];
    var strippedStyle = v2StripParaStyle(rp.style, bookDefaults, roleStyles);
    var strippedRuns = [];
    for (var ri = 0; ri < rp.runs.length; ri++) {
      strippedRuns.push(v2StripRunStyle(rp.runs[ri], bookDefaults, roleStyles, rp.style));
    }
    stripped.push({
      style: v2OrderParaStyle(strippedStyle),
      runs: strippedRuns.map(v2OrderRun)
    });
  }
  return stripped;
}

/* Default include and printOptions per page type.
   Omit-if-default: section entries only store overrides. */
var SECTION_TYPE_DEFAULTS = {
  halfTitle:       { include: { print: true, ebook: false }, printOptions: { beginOn: "right", pageNumbering: "none" } },
  titlePage:       { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "none" } },
  copyright:       { include: { print: true, ebook: true },  printOptions: { beginOn: "left",  pageNumbering: "none" } },
  dedication:      { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "none" } },
  epigraph:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "none" } },
  toc:             { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "roman" } },
  foreword:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "roman" } },
  preface:         { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "roman" } },
  prologue:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  chapter:         { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  epilogue:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  afterword:       { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  acknowledgments: { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  aboutAuthor:     { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  alsoBy:          { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  glossary:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  endnotes:        { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  index:           { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "arabic" } },
  custom:          { include: { print: true, ebook: true },  printOptions: { beginOn: "right", pageNumbering: "inherit" } }
};

/* Flatten a sections array into a single paragraphs array.
   Stamps x-sectionId on every paragraph for regrouping on save.
   Returns { paragraphs: [...], sectionMeta: [...] }.
   sectionMeta contains section headers (region, type, id, title,
   include, printOptions) without paragraphs. */
function flattenSections(sections) {
  var paragraphs = [];
  var sectionMeta = [];

  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];

    // Build section header (everything except paragraphs)
    var meta = { id: sec.id, region: sec.region, type: sec.type };
    if (sec.title) meta.title = sec.title;
    if (sec.include) meta.include = JSON.parse(JSON.stringify(sec.include));
    if (sec.printOptions) meta.printOptions = JSON.parse(JSON.stringify(sec.printOptions));
    if (sec.heading) meta.heading = JSON.parse(JSON.stringify(sec.heading));
    sectionMeta.push(meta);

    // Stamp x-sectionId on each paragraph and add to flat array
    var secParas = sec.paragraphs || [];
    for (var p = 0; p < secParas.length; p++) {
      // Deep clone the paragraph so we don't modify the input
      var para = JSON.parse(JSON.stringify(secParas[p]));
      para.style["x-sectionId"] = sec.id;
      paragraphs.push(para);
    }
  }

  return { paragraphs: paragraphs, sectionMeta: sectionMeta };
}

/* Regroup a flat paragraphs array into a sections array for saving.
   Uses x-sectionId on each paragraph to match to sectionMeta.
   Strips x-sectionId from output paragraphs (file doesn't store it).
   Returns a sections[] array. */
function regroupSections(paragraphs, sectionMeta) {
  // Build a map from section id to its paragraphs
  var groups = {};
  for (var i = 0; i < sectionMeta.length; i++) {
    groups[sectionMeta[i].id] = [];
  }

  var lastSid = sectionMeta.length > 0 ? sectionMeta[0].id : null;

  for (var i = 0; i < paragraphs.length; i++) {
    var sid = paragraphs[i].style["x-sectionId"];

    // Orphan paragraph: assign to same section as previous paragraph
    if (!sid || !groups[sid]) {
      sid = lastSid;
    }

    if (sid && groups[sid]) {
      var para = JSON.parse(JSON.stringify(paragraphs[i]));
      delete para.style["x-sectionId"];
      groups[sid].push(para);
      lastSid = sid;
    }
  }

  // Rebuild sections array in sectionMeta order
  var sections = [];
  for (var i = 0; i < sectionMeta.length; i++) {
    var meta = sectionMeta[i];
    var sec = {
      region: meta.region,
      type: meta.type,
      id: meta.id
    };
    if (meta.title) sec.title = meta.title;
    if (meta.include) sec.include = JSON.parse(JSON.stringify(meta.include));
    if (meta.printOptions) sec.printOptions = JSON.parse(JSON.stringify(meta.printOptions));
    if (meta.heading) sec.heading = JSON.parse(JSON.stringify(meta.heading));
    sec.paragraphs = groups[meta.id] || [];
    sections.push(sec);
  }

  return sections;
}

/* Generate a UUID v4 for section IDs. */
function generateSectionId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* Resolve a document from sparse v2 format to fully-stamped.
   Fills all cascade defaults (bookDefaults -> roleStyles -> overrides)
   so every property the editor needs is present.
   Modifies d in place and returns it. */
function resolveDocument(d) {
  var bd = d.bookDefaults || v2BookDefaults();
  var rs = d.roleStyles || v2RoleStyles();

  for (var i = 0; i < d.paragraphs.length; i++) {
    var p = d.paragraphs[i];

    // Resolve paragraph style via cascade
    p.style = v2ResolveParaStyle(bd, rs, p.style);

    // Guarantee editor-required x- properties
    if (!p.style["x-role"]) p.style["x-role"] = "body";
    if (typeof p.style["x-list"] === "undefined") p.style["x-list"] = null;
    if (!p.style["x-dropCap"] || typeof p.style["x-dropCap"] !== "object") {
      p.style["x-dropCap"] = { enabled: false };
    }

    // Resolve each run via cascade
    for (var r = 0; r < p.runs.length; r++) {
      p.runs[r] = v2ResolveRunStyle(bd, rs, p.style, p.runs[r]);

      // Guarantee editor-required x- properties on run
      if (!p.runs[r]["x-script"]) p.runs[r]["x-script"] = "normal";
      if (typeof p.runs[r]["x-linkHref"] === "undefined") p.runs[r]["x-linkHref"] = null;
    }
  }

  return d;
}

/* Strip a document from fully-stamped to sparse v2 format.
   Removes properties that match cascade defaults.
   Returns a NEW document object -- input is NOT modified.
   
   Strips default x- values: x-list null, x-dropCap {enabled:false},
   x-script "normal", x-linkHref null. Unknown x- preserved. */
function stripDocument(d) {
  var bd = d.bookDefaults || v2BookDefaults();
  var rs = d.roleStyles || v2RoleStyles();

  var result = {
    version: d.version,
    meta: JSON.parse(JSON.stringify(d.meta)),
    bookSettings: JSON.parse(JSON.stringify(d.bookSettings)),
    bookDefaults: JSON.parse(JSON.stringify(bd)),
    roleStyles: JSON.parse(JSON.stringify(rs)),
    paragraphs: []
  };

  for (var i = 0; i < d.paragraphs.length; i++) {
    var p = d.paragraphs[i];

    // Strip paragraph style
    var ss = v2StripParaStyle(p.style, bd, rs);

    // Strip default x- para values
    if (ss["x-list"] === null) delete ss["x-list"];
    if (ss["x-dropCap"] &&
        typeof ss["x-dropCap"] === "object" &&
        ss["x-dropCap"].enabled === false &&
        Object.keys(ss["x-dropCap"]).length === 1) {
      delete ss["x-dropCap"];
    }

    // Order keys
    ss = v2OrderParaStyle(ss);

    // Strip each run
    var strippedRuns = [];
    for (var r = 0; r < p.runs.length; r++) {
      var sr = v2StripRunStyle(p.runs[r], bd, rs, p.style);

      // Strip default x- run values
      if (sr["x-script"] === "normal") delete sr["x-script"];
      if (sr["x-linkHref"] === null) delete sr["x-linkHref"];

      strippedRuns.push(v2OrderRun(sr));
    }

    result.paragraphs.push({ style: ss, runs: strippedRuns });
  }

  return result;
}

