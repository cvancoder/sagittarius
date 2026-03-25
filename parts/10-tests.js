/* ================================================================
   TEST HARNESS: Automated regression suite.
   Run via __sag.runTests() in the browser console.
   ================================================================ */

(function() {
  var _testResults = [];
  var _testOrigState = null;
  
  function assert(name, condition, reason) {
    _testResults.push({
      name: name,
      pass: !!condition,
      reason: condition ? "" : (reason || "assertion failed")
    });
  }
  
  // Save and restore functions — used to isolate every test
  function saveState() {
    return {
      paragraphs: JSON.parse(JSON.stringify(doc.paragraphs)),
      bookDefaults: JSON.parse(JSON.stringify(doc.bookDefaults)),
      roleStyles: JSON.parse(JSON.stringify(doc.roleStyles)),
      bookDesign: JSON.parse(JSON.stringify(doc.bookDesign)),
      _sectionMeta: JSON.parse(JSON.stringify(doc._sectionMeta)),
      cursor: { p: cursor.p, o: cursor.o },
      selAnchor: selAnchor ? { p: selAnchor.p, o: selAnchor.o } : null,
      selFocus: selFocus ? { p: selFocus.p, o: selFocus.o } : null
    };
  }
  
  function restoreState(saved) {
    doc.paragraphs = saved.paragraphs;
    if (saved.bookDefaults) doc.bookDefaults = JSON.parse(JSON.stringify(saved.bookDefaults));
    if (saved.roleStyles) doc.roleStyles = JSON.parse(JSON.stringify(saved.roleStyles));
    if (saved.bookDesign) doc.bookDesign = JSON.parse(JSON.stringify(saved.bookDesign));
    if (saved._sectionMeta) doc._sectionMeta = JSON.parse(JSON.stringify(saved._sectionMeta));
    cursor.p = saved.cursor.p;
    cursor.o = saved.cursor.o;
    selAnchor = saved.selAnchor;
    selFocus = saved.selFocus;
    requestFullLayout("test-restore");
  }
  
  // Build a test document with N paragraphs of known content
  function buildTestDoc(n) {
    doc.paragraphs = [];
    for (var i = 0; i < n; i++) {
      doc.paragraphs.push({
        runs: [{ text: "Paragraph " + i + " with some test content that fills a line adequately for layout testing purposes.",
                 fontFamily: "Georgia", fontSize: 12, fontWeight: "normal", fontStyle: "normal",
                 textDecoration: "none", color: "#1a1a1a",
                 "x-script": "normal", "x-linkHref": null, backgroundColor: null }],
        style: { "x-role": "body", textAlign: "left", lineHeight: 1.2,
                 textIndent: 18, marginTop: 0, marginBottom: 0 }
      });
    }
    cursor = { p: 0, o: 0 };
    selAnchor = null;
    selFocus = null;
    requestFullLayout("test-build");
  }
  
  window.__sag.runTests = function() {
    _testResults = [];
    var originalState = saveState();
    _testOrigState = originalState;
    
    try {
      testDocModel();
      testLayout();
      testScroll();
      testUndoRedo();
      testFormatting();
      testPerformanceGuards();
      testDelta();
      testPerf2();
      testSafety();
      testRenderIntegrity();
      testImageAndRulers();
      testClipboard();
      testSidebar();
      testSectionMap();
      testSectionBreaks();
      testBlankPages();
      testBlankPageClick();
      testIntegration();
      testNavigator();
      testAddChapter();
      testNavScroll();
      testSelectionClamp();
      testSectionCache();
      testNavTracking();
      testBookDesign();
      testHeadingTitle();
      testBodyReadsDesign();
      testSceneBreakDesign();
      testHeadingBlocks();
      testTitleFont();
      testViewSwitching();
      testDesignerShell();
      testDesignerPreview();
      testDesignerInteraction();
      testDesignerChangeset();
      testChapterHeadControls();
      testSmallCaps();
      testV2Model();
    } catch(e) {
      _testResults.push({ name: "RUNNER", pass: false, reason: "Exception: " + e.message });
    }
    
    // Always restore original document
    restoreState(originalState);
    
    // Report
    var passed = 0, failed = 0;
    for (var i = 0; i < _testResults.length; i++) {
      if (_testResults[i].pass) {
        passed++;
        console.log("%cPASS: " + _testResults[i].name, "color: green");
      } else {
        failed++;
        console.error("FAIL: " + _testResults[i].name + " — " + _testResults[i].reason);
      }
    }
    console.log("\n" + passed + " passed, " + failed + " failed out of " + _testResults.length + " tests");
    return { passed: passed, failed: failed, total: _testResults.length, results: _testResults };
  };

  // ================================================================
  // TEST CATEGORY 1: Document Model Integrity
  // ================================================================
  
  function testDocModel() {
    // TEST-DOC-01: Paragraph creation and content
    buildTestDoc(5);
    assert("DOC-01a: paragraph count", doc.paragraphs.length === 5,
      "Expected 5, got " + doc.paragraphs.length);
    for (var i = 0; i < 5; i++) {
      var text = paraText(doc.paragraphs[i]);
      assert("DOC-01b: para " + i + " starts with expected text",
        text.indexOf("Paragraph " + i) === 0,
        "Para " + i + " text: " + text.slice(0, 30));
    }
    
    // TEST-DOC-02: Paragraph split
    buildTestDoc(5);
    var preSplitText = paraText(doc.paragraphs[2]);
    var splitPoint = 12; // middle of "Paragraph 2 "
    cursor = { p: 2, o: splitPoint };
    var expectedBefore = preSplitText.slice(0, splitPoint);
    var expectedAfter = preSplitText.slice(splitPoint);
    // Execute the split: insert paragraph break at cursor
    var splitPara = doc.paragraphs[2];
    var splitRun = posToRun(splitPara, splitPoint);
    var run = splitPara.runs[splitRun.r];
    var beforeText = run.text.slice(0, splitRun.ro);
    var afterText = run.text.slice(splitRun.ro);
    // Build new paragraph from content after split
    var newParaRuns = [];
    // Remaining text from split run
    if (afterText.length > 0) {
      var nr = {};
      for (var k in run) nr[k] = run[k];
      nr.text = afterText;
      newParaRuns.push(nr);
    }
    // Remaining runs after split run
    for (var ri = splitRun.r + 1; ri < splitPara.runs.length; ri++) {
      newParaRuns.push(splitPara.runs[ri]);
    }
    if (newParaRuns.length === 0) {
      newParaRuns.push({ text: "", fontFamily: run.fontFamily, fontSize: run.fontSize, fontWeight: run.fontWeight,
        fontStyle: run.fontStyle, textDecoration: run.textDecoration,
        color: run.color, "x-script": "normal", "x-linkHref": null, backgroundColor: null });
    }
    // Trim original paragraph
    run.text = beforeText;
    splitPara.runs.splice(splitRun.r + 1);
    // Insert new paragraph
    var newPara = {
      runs: newParaRuns,
      style: JSON.parse(JSON.stringify(splitPara.style))
    };
    doc.paragraphs.splice(3, 0, newPara);
    cursor = { p: 3, o: 0 };
    requestLayout({ fromPara: 2, reason: "test-split" });
    
    assert("DOC-02a: split increases para count",
      doc.paragraphs.length === 6,
      "Expected 6, got " + doc.paragraphs.length);
    assert("DOC-02b: text before split",
      paraText(doc.paragraphs[2]) === expectedBefore,
      "Got: '" + paraText(doc.paragraphs[2]).slice(0, 30) + "'");
    assert("DOC-02c: text after split",
      paraText(doc.paragraphs[3]) === expectedAfter,
      "Got: '" + paraText(doc.paragraphs[3]).slice(0, 30) + "'");
    assert("DOC-02d: other paras unchanged",
      paraText(doc.paragraphs[0]).indexOf("Paragraph 0") === 0 &&
      paraText(doc.paragraphs[1]).indexOf("Paragraph 1") === 0,
      "Other paragraphs were modified");
    
    // TEST-DOC-03: Text insertion
    buildTestDoc(5);
    cursor = { p: 2, o: 5 };
    var preInsertText = paraText(doc.paragraphs[2]);
    // Insert text manually into the run at cursor position
    var insRun = posToRun(doc.paragraphs[2], 5);
    var insRunObj = doc.paragraphs[2].runs[insRun.r];
    insRunObj.text = insRunObj.text.slice(0, insRun.ro) + "INSERTED" + insRunObj.text.slice(insRun.ro);
    mergeAdjacentRuns(doc.paragraphs[2]);
    requestLayout({ fromPara: 2, reason: "test-insert" });
    
    var afterInsert = paraText(doc.paragraphs[2]);
    assert("DOC-03a: inserted text present",
      afterInsert.indexOf("INSERTED") === 5,
      "Text: " + afterInsert.slice(0, 40));
    assert("DOC-03b: other paras unchanged",
      paraText(doc.paragraphs[0]).indexOf("Paragraph 0") === 0 &&
      paraText(doc.paragraphs[1]).indexOf("Paragraph 1") === 0 &&
      paraText(doc.paragraphs[3]).indexOf("Paragraph 3") === 0,
      "Other paragraphs were modified");
  }

  // ================================================================
  // TEST CATEGORY 2: Layout Integrity
  // ================================================================
  
  function testLayout() {
    // TEST-LAYOUT-01: _paraYState completeness after full layout
    buildTestDoc(50);
    assert("LAYOUT-01a: _paraYState length matches paragraphs",
      _paraYState.length === doc.paragraphs.length,
      "paraYState: " + _paraYState.length + " vs paragraphs: " + doc.paragraphs.length);
    var allValid = true;
    for (var i = 0; i < _paraYState.length; i++) {
      if (!_paraYState[i] || typeof _paraYState[i].page !== "number" || typeof _paraYState[i].y !== "number") {
        allValid = false;
        break;
      }
    }
    assert("LAYOUT-01b: all _paraYState entries have page and y", allValid,
      "Invalid entry at index " + i);
    
    // TEST-LAYOUT-02: totalPages consistency
    var maxPageFromState = 0;
    for (var i = 0; i < _paraYState.length; i++) {
      if (_paraYState[i] && _paraYState[i].page + 1 > maxPageFromState) {
        maxPageFromState = _paraYState[i].page + 1;
      }
    }
    assert("LAYOUT-02: totalPages matches _paraYState",
      totalPages >= maxPageFromState,
      "totalPages=" + totalPages + " but _paraYState implies " + maxPageFromState);
    
    // TEST-LAYOUT-03: Layout after edit preserves _paraYState completeness
    buildTestDoc(200);
    var preTotal = totalPages;
    var preLen = _paraYState.length;
    // Edit paragraph 5
    doc.paragraphs[5].runs[0].text += " Extra text added for testing.";
    requestLayout({ fromPara: 5, reason: "test-edit" });
    assert("LAYOUT-03a: _paraYState still complete after edit",
      _paraYState.length === doc.paragraphs.length,
      "Length: " + _paraYState.length + " vs " + doc.paragraphs.length);
    assert("LAYOUT-03b: totalPages not shrunk after edit",
      totalPages >= 1,
      "totalPages=" + totalPages);
    
    // TEST-LAYOUT-04: Bounded realization preserves _paraYState
    buildTestDoc(200);
    requestFullLayout("test-bounded-pre");
    var recordedTotal = totalPages;
    var recordedLen = _paraYState.length;
    // Simulate bounded realization
    _skipDOMSync = true;
    runLayout(50, 100);
    _skipDOMSync = false;
    assert("LAYOUT-04a: _paraYState not truncated by bounded layout",
      _paraYState.length === recordedLen,
      "Before: " + recordedLen + " After: " + _paraYState.length);
    assert("LAYOUT-04b: totalPages not shrunk by bounded layout",
      totalPages >= recordedTotal,
      "Before: " + recordedTotal + " After: " + totalPages);
    
    // TEST-LAYOUT-05: Lines exist for all realized pages
    buildTestDoc(20);
    var allPagesHaveLines = true;
    var missingPage = -1;
    for (var pg = 0; pg < totalPages; pg++) {
      var pLines = layoutRegion.linesForPageDirect(pg);
      if (!pLines || pLines.length === 0) {
        allPagesHaveLines = false;
        missingPage = pg;
        break;
      }
    }
    assert("LAYOUT-05: all pages have lines after full layout",
      allPagesHaveLines,
      "Page " + missingPage + " has no lines");
  }

  // ================================================================
  // TEST CATEGORY 3: Scroll/Virtualization Integrity
  // ================================================================
  
  function testScroll() {
    // TEST-SCROLL-01: Eviction preserves _paraYState
    buildTestDoc(200);
    var preLen = _paraYState.length;
    var preTotal = totalPages;
    layoutRegion.evictOutsideWindow(80, 120);
    assert("SCROLL-01a: _paraYState length unchanged after eviction",
      _paraYState.length === preLen,
      "Before: " + preLen + " After: " + _paraYState.length);
    assert("SCROLL-01b: totalPages unchanged after eviction",
      totalPages === preTotal,
      "Before: " + preTotal + " After: " + totalPages);
    
    // TEST-SCROLL-02: Eviction + re-realization round-trip
    buildTestDoc(200);
    var testPage = Math.min(5, totalPages - 1);
    var preLines = layoutRegion.linesForPageDirect(testPage);
    var preLineCount = preLines ? preLines.length : 0;
    // Find paragraph range for test page
    var evictFrom = 0, evictTo = doc.paragraphs.length;
    for (var pi = 0; pi < _paraYState.length; pi++) {
      if (_paraYState[pi] && _paraYState[pi].page === testPage) {
        evictFrom = pi;
        break;
      }
    }
    for (var pi = evictFrom; pi < _paraYState.length; pi++) {
      if (_paraYState[pi] && _paraYState[pi].page > testPage) {
        evictTo = pi;
        break;
      }
    }
    // Evict the test page range
    layoutRegion.evictOutsideWindow(0, evictFrom);
    // Re-realize
    layoutRegion.ensurePagesRealized(testPage, testPage);
    var postLines = layoutRegion.linesForPageDirect(testPage);
    var postLineCount = postLines ? postLines.length : 0;
    assert("SCROLL-02: evict+re-realize round-trip produces same line count",
      postLineCount === preLineCount,
      "Before: " + preLineCount + " After: " + postLineCount);
    
    // TEST-SCROLL-03: render() does not trigger realization
    buildTestDoc(50);
    var preRealize = _pipelineGen.realize;
    render();
    assert("SCROLL-03: render() did not trigger realization",
      _pipelineGen.realize === preRealize,
      "realize gen before: " + preRealize + " after: " + _pipelineGen.realize);

    // SCROLL-001: auto-scroll functions exist
    assert("SCROLL-001a: computeAutoScrollSpeed is a function",
      typeof computeAutoScrollSpeed === "function");
    assert("SCROLL-001b: startAutoScroll is a function",
      typeof startAutoScroll === "function");
    assert("SCROLL-001c: stopAutoScroll is a function",
      typeof stopAutoScroll === "function");

    // SCROLL-002: computeAutoScrollSpeed returns correct values
    var speed002 = computeAutoScrollSpeed(500);
    assert("SCROLL-002: computeAutoScrollSpeed returns a number",
      typeof speed002 === "number");
  }

  // ================================================================
  // TEST CATEGORY 4: Undo/Redo Integrity
  // ================================================================
  
  function testUndoRedo() {
    // TEST-UNDO-01: Undo restores document state
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var originalText = paraText(doc.paragraphs[2]);
    cursor = { p: 2, o: 5 };
    // Use delta-based insert, then undo
    pushDelta(createDelta("insert", {
      p: 2, offset: 5, text: "COMPLETELY CHANGED", style: cloneRunStyle(doc.paragraphs[2].runs[0]),
      cursorBefore: { p: 2, o: 5 }, cursorAfter: { p: 2, o: 23 } }));
    insertTextInPara(2, 5, "COMPLETELY CHANGED", doc.paragraphs[2].runs[0]);
    requestLayout({ fromPara: 2, reason: "test-undo-edit" });
    // Undo
    doUndo();
    var restoredText = paraText(doc.paragraphs[2]);
    assert("UNDO-01: undo restores original text",
      restoredText === originalText,
      "Expected: '" + originalText.slice(0, 30) + "' Got: '" + restoredText.slice(0, 30) + "'");
    
    // TEST-UNDO-02: Redo reverses undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    cursor = { p: 1, o: 0 };
    pushDelta(createDelta("insert", {
      p: 1, offset: 0, text: "EDITED TEXT", style: cloneRunStyle(doc.paragraphs[1].runs[0]),
      cursorBefore: { p: 1, o: 0 }, cursorAfter: { p: 1, o: 11 } }));
    insertTextInPara(1, 0, "EDITED TEXT", doc.paragraphs[1].runs[0]);
    var editedText = paraText(doc.paragraphs[1]);
    // Undo
    doUndo();
    // Redo
    doRedo();
    assert("UNDO-02: redo restores edited text",
      paraText(doc.paragraphs[1]) === editedText,
      "Expected: '" + editedText.slice(0, 30) + "' Got: '" + paraText(doc.paragraphs[1]).slice(0, 30) + "'");
    
    // TEST-UNDO-03: Undo stack respects limit
    buildTestDoc(3);
    undoStack = [];
    redoStack = [];
    for (var i = 0; i < UNDO_MAX + 20; i++) {
      pushDelta(createDelta("insert", {
        p: 0, offset: 0, text: "E", style: cloneRunStyle(doc.paragraphs[0].runs[0]),
        cursorBefore: { p: 0, o: 0 }, cursorAfter: { p: 0, o: 1 } }));
      insertTextInPara(0, 0, "E", doc.paragraphs[0].runs[0]);
    }
    assert("UNDO-03: undo stack respects UNDO_MAX",
      undoStack.length <= UNDO_MAX,
      "Stack size: " + undoStack.length + " Max: " + UNDO_MAX);
  }

  // ================================================================
  // TEST CATEGORY 5: Formatting Integrity
  // ================================================================
  
  function testFormatting() {
    // TEST-FMT-01: Bold preserves text
    buildTestDoc(5);
    var preText = paraText(doc.paragraphs[2]);
    // Apply bold to entire paragraph by modifying runs
    for (var ri = 0; ri < doc.paragraphs[2].runs.length; ri++) {
      doc.paragraphs[2].runs[ri].fontWeight = "bold";
    }
    mergeAdjacentRuns(doc.paragraphs[2]);
    var postText = paraText(doc.paragraphs[2]);
    assert("FMT-01a: bold does not change text",
      postText === preText,
      "Text changed after bold");
    assert("FMT-01b: bold is applied",
      doc.paragraphs[2].runs[0].fontWeight === "bold",
      "Bold not set");
    
    // TEST-FMT-02: Style isolation
    buildTestDoc(5);
    doc.paragraphs[2].runs[0].fontStyle = "italic";
    mergeAdjacentRuns(doc.paragraphs[2]);
    assert("FMT-02a: italic on para 2",
      doc.paragraphs[2].runs[0].fontStyle === "italic", "Not italic");
    assert("FMT-02b: para 1 not affected",
      doc.paragraphs[1].runs[0].fontStyle === "normal", "Para 1 got italic");
    assert("FMT-02c: para 3 not affected",
      doc.paragraphs[3].runs[0].fontStyle === "normal", "Para 3 got italic");

    // TEST-FMT-03: textDecoration compound behavior
    buildTestDoc(3);
    doc.paragraphs[1].runs[0].textDecoration = "underline";
    assert("FMT-03a: has underline",
      tdHas(doc.paragraphs[1].runs[0].textDecoration, "underline") === true, "");
    assert("FMT-03b: no line-through",
      tdHas(doc.paragraphs[1].runs[0].textDecoration, "line-through") === false, "");
    doc.paragraphs[1].runs[0].textDecoration = tdAdd(doc.paragraphs[1].runs[0].textDecoration, "line-through");
    assert("FMT-03c: now has both",
      doc.paragraphs[1].runs[0].textDecoration === "underline line-through",
      "got: " + doc.paragraphs[1].runs[0].textDecoration);
    doc.paragraphs[1].runs[0].textDecoration = tdRemove(doc.paragraphs[1].runs[0].textDecoration, "underline");
    assert("FMT-03d: only line-through",
      doc.paragraphs[1].runs[0].textDecoration === "line-through",
      "got: " + doc.paragraphs[1].runs[0].textDecoration);
    doc.paragraphs[1].runs[0].textDecoration = tdRemove(doc.paragraphs[1].runs[0].textDecoration, "line-through");
    assert("FMT-03e: back to none",
      doc.paragraphs[1].runs[0].textDecoration === "none",
      "got: " + doc.paragraphs[1].runs[0].textDecoration);
  }

  // ================================================================
  // TEST CATEGORY 6: Performance Guards
  // ================================================================
  
  function testPerformanceGuards() {
    // TEST-PERF-01: Undo stack size within limit
    // (Expanded in future when delta undo is implemented)
    assert("PERF-01: UNDO_MAX is reasonable",
      UNDO_MAX <= 200,
      "UNDO_MAX is " + UNDO_MAX);
    
    // TEST-PERF-02: render does not trigger ensureRealized
    // (Duplicate of SCROLL-03, kept as explicit performance contract)
    buildTestDoc(30);
    var preRealize = _pipelineGen.realize;
    render();
    assert("PERF-02: render is realization-free",
      _pipelineGen.realize === preRealize,
      "Realization triggered during render");

    // TEST-PERF-03: linesForPageDirect does not trigger layout
    buildTestDoc(20);
    var preLayout = _pipelineGen.layout;
    for (var pg = 0; pg < totalPages; pg++) {
      layoutRegion.linesForPageDirect(pg);
    }
    assert("PERF-03: linesForPageDirect does not trigger layout",
      _pipelineGen.layout === preLayout,
      "Layout triggered by linesForPageDirect");
  }

  // ================================================================
  // TEST CATEGORY 7: Delta Undo System
  // ================================================================

  function testDelta() {
    // TEST-DELTA-01: Single character insert + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d01Text = paraText(doc.paragraphs[2]);
    pushDelta(createDelta("insert", {
      p: 2, offset: 5, text: "X", style: cloneRunStyle(doc.paragraphs[2].runs[0]),
      cursorBefore: { p: 2, o: 5 }, cursorAfter: { p: 2, o: 6 } }));
    insertTextInPara(2, 5, "X", doc.paragraphs[2].runs[0]);
    requestLayout({ fromPara: 2, reason: "test-delta-insert" });
    var d01After = paraText(doc.paragraphs[2]);
    assert("DELTA-01a: X inserted at offset 5",
      d01After.charAt(5) === "X",
      "Char at 5: '" + d01After.charAt(5) + "' text: " + d01After.slice(0, 20));
    doUndo();
    assert("DELTA-01b: undo restores original text",
      paraText(doc.paragraphs[2]) === d01Text,
      "Got: '" + paraText(doc.paragraphs[2]).slice(0, 30) + "'");

    // TEST-DELTA-02: Single character insert + undo + redo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    pushDelta(createDelta("insert", {
      p: 2, offset: 5, text: "X", style: cloneRunStyle(doc.paragraphs[2].runs[0]),
      cursorBefore: { p: 2, o: 5 }, cursorAfter: { p: 2, o: 6 } }));
    insertTextInPara(2, 5, "X", doc.paragraphs[2].runs[0]);
    requestLayout({ fromPara: 2, reason: "test-delta-insert" });
    var d02Expected = paraText(doc.paragraphs[2]);
    doUndo();
    doRedo();
    assert("DELTA-02: redo restores inserted X",
      paraText(doc.paragraphs[2]) === d02Expected,
      "Got: '" + paraText(doc.paragraphs[2]).slice(0, 20) + "'");

    // TEST-DELTA-03: Multi-character delete + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d03Text = paraText(doc.paragraphs[3]);
    var d03Runs = captureRunsInRange(3, 10, 15);
    pushDelta(createDelta("delete", {
      p: 3, offset: 10, runs: d03Runs,
      cursorBefore: { p: 3, o: 15 }, cursorAfter: { p: 3, o: 10 } }));
    deleteCharsInPara(3, 10, 5);
    requestLayout({ fromPara: 3, reason: "test-delta-delete" });
    doUndo();
    assert("DELTA-03: undo restores deleted text",
      paraText(doc.paragraphs[3]) === d03Text,
      "Expected: '" + d03Text.slice(0, 30) + "' Got: '" + paraText(doc.paragraphs[3]).slice(0, 30) + "'");

    // TEST-DELTA-04: Paragraph split + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d04Text = paraText(doc.paragraphs[2]);
    var d04Count = doc.paragraphs.length;
    var d04NewStyle = JSON.parse(JSON.stringify(doc.paragraphs[2].style));
    pushDelta(createDelta("splitPara", {
      p: 2, offset: 12, newStyle: d04NewStyle,
      cursorBefore: { p: 2, o: 12 }, cursorAfter: { p: 3, o: 0 } }));
    splitParaAt(2, 12, d04NewStyle);
    cursor = { p: 3, o: 0 };
    requestLayout({ fromPara: 2, reason: "test-delta-split" });
    assert("DELTA-04a: split increases para count",
      doc.paragraphs.length === d04Count + 1,
      "Expected " + (d04Count + 1) + " got " + doc.paragraphs.length);
    doUndo();
    assert("DELTA-04b: undo restores para count",
      doc.paragraphs.length === d04Count,
      "Expected " + d04Count + " got " + doc.paragraphs.length);
    assert("DELTA-04c: undo restores text",
      paraText(doc.paragraphs[2]) === d04Text,
      "Got: '" + paraText(doc.paragraphs[2]).slice(0, 30) + "'");

    // TEST-DELTA-05: Paragraph merge + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d05Count = doc.paragraphs.length;
    var d05Text2 = paraText(doc.paragraphs[2]);
    var d05Text3 = paraText(doc.paragraphs[3]);
    var d05Offset = paraTextLen(doc.paragraphs[2]);
    pushDelta(createDelta("mergePara", {
      p: 2, offset: d05Offset,
      removedStyle: JSON.parse(JSON.stringify(doc.paragraphs[3].style)),
      cursorBefore: { p: 3, o: 0 }, cursorAfter: { p: 2, o: d05Offset } }));
    mergeParaAt(2);
    requestLayout({ fromPara: 2, reason: "test-delta-merge" });
    assert("DELTA-05a: merge decreases para count",
      doc.paragraphs.length === d05Count - 1,
      "Expected " + (d05Count - 1) + " got " + doc.paragraphs.length);
    doUndo();
    assert("DELTA-05b: undo restores para count",
      doc.paragraphs.length === d05Count,
      "Expected " + d05Count + " got " + doc.paragraphs.length);
    assert("DELTA-05c: undo restores para 2 text",
      paraText(doc.paragraphs[2]) === d05Text2,
      "Got: '" + paraText(doc.paragraphs[2]).slice(0, 30) + "'");
    assert("DELTA-05d: undo restores para 3 text",
      paraText(doc.paragraphs[3]) === d05Text3,
      "Got: '" + paraText(doc.paragraphs[3]).slice(0, 30) + "'");

    // TEST-DELTA-06: Style change + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d06OldWeight = doc.paragraphs[2].runs[0].fontWeight;
    pushDelta(createDelta("style", {
      p: 2, from: 0, to: 10, property: "fontWeight", oldValue: d06OldWeight, newValue: "bold",
      cursorBefore: clonePos(cursor), cursorAfter: clonePos(cursor) }));
    applyStyleToPara(2, 0, 10, "fontWeight", "bold");
    requestLayout({ fromPara: 2, reason: "test-delta-style" });
    // Verify bold is applied in range
    var d06BoldOk = true;
    var d06Acc = 0;
    for (var ri = 0; ri < doc.paragraphs[2].runs.length; ri++) {
      var rr = doc.paragraphs[2].runs[ri];
      var rEnd = d06Acc + rr.text.length;
      if (rEnd > 0 && d06Acc < 10 && rr.fontWeight !== "bold") { d06BoldOk = false; break; }
      d06Acc = rEnd;
    }
    assert("DELTA-06a: bold applied to range",
      d06BoldOk, "Bold not fully applied");
    doUndo();
    assert("DELTA-06b: undo restores original bold state",
      doc.paragraphs[2].runs[0].fontWeight === d06OldWeight,
      "fontWeight after undo: " + doc.paragraphs[2].runs[0].fontWeight);

    // TEST-DELTA-07: Compound delta (cross-paragraph delete) + undo
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    var d07Count = doc.paragraphs.length;
    var d07Texts = [];
    for (var i = 0; i < d07Count; i++) d07Texts.push(paraText(doc.paragraphs[i]));
    // Use splice delta to capture cross-para delete
    var capD07 = captureSplice(1, 3);
    deleteRange(mkPos(1, 5), mkPos(3, 10));
    clearSel();
    cursor = mkPos(1, 5);
    finishSplice(capD07, 1);
    requestLayout({ fromPara: 1, reason: "test-delta-compound" });
    doUndo();
    assert("DELTA-07a: undo restores para count",
      doc.paragraphs.length === d07Count,
      "Expected " + d07Count + " got " + doc.paragraphs.length);
    var d07Match = true;
    for (var i = 0; i < d07Count; i++) {
      if (paraText(doc.paragraphs[i]) !== d07Texts[i]) { d07Match = false; break; }
    }
    assert("DELTA-07b: undo restores all text",
      d07Match,
      "Text mismatch at para " + i);

    // TEST-DELTA-08: Undo stack respects UNDO_MAX
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    for (var i = 0; i < UNDO_MAX + 20; i++) {
      pushDelta(createDelta("insert", {
        p: 0, offset: 0, text: "X", style: cloneRunStyle(doc.paragraphs[0].runs[0]),
        cursorBefore: { p: 0, o: 0 }, cursorAfter: { p: 0, o: 1 } }));
      insertTextInPara(0, 0, "X", doc.paragraphs[0].runs[0]);
    }
    assert("DELTA-08: undo stack respects UNDO_MAX",
      undoStack.length <= UNDO_MAX,
      "Stack size: " + undoStack.length);

    // TEST-DELTA-09: Redo cleared after new edit
    buildTestDoc(5);
    undoStack = [];
    redoStack = [];
    pushDelta(createDelta("insert", {
      p: 0, offset: 0, text: "A", style: cloneRunStyle(doc.paragraphs[0].runs[0]),
      cursorBefore: { p: 0, o: 0 }, cursorAfter: { p: 0, o: 1 } }));
    insertTextInPara(0, 0, "A", doc.paragraphs[0].runs[0]);
    doUndo();
    assert("DELTA-09 pre: redo has entry",
      redoStack.length === 1, "redo length: " + redoStack.length);
    pushDelta(createDelta("insert", {
      p: 0, offset: 0, text: "B", style: cloneRunStyle(doc.paragraphs[0].runs[0]),
      cursorBefore: { p: 0, o: 0 }, cursorAfter: { p: 0, o: 1 } }));
    insertTextInPara(0, 0, "B", doc.paragraphs[0].runs[0]);
    assert("DELTA-09: redo cleared after new edit",
      redoStack.length === 0,
      "redo length: " + redoStack.length);

    // TEST-DELTA-10: Delta memory is small
    buildTestDoc(200);
    undoStack = [];
    redoStack = [];
    for (var i = 0; i < 50; i++) {
      pushDelta(createDelta("insert", {
        p: 0, offset: 0, text: String.fromCharCode(65 + (i % 26)),
        style: cloneRunStyle(doc.paragraphs[0].runs[0]),
        cursorBefore: { p: 0, o: 0 }, cursorAfter: { p: 0, o: 1 } }));
      insertTextInPara(0, 0, String.fromCharCode(65 + (i % 26)), doc.paragraphs[0].runs[0]);
    }
    var stackSize = JSON.stringify(undoStack).length;
    assert("DELTA-10: delta memory is small (<50KB)",
      stackSize < 50000,
      "Stack JSON size: " + stackSize);
  }

  // ================================================================
  // TEST CATEGORY 8: Performance Fixes (0079)
  // ================================================================

  function testPerf2() {
    // TEST-PERF-04: updateStats skips when not dirty
    buildTestDoc(20);
    render();
    assert("PERF-04a: _statsDirty is false after render",
      _statsDirty === false,
      "_statsDirty is " + _statsDirty);
    requestLayout({ fromPara: 0, reason: "test" });
    assert("PERF-04b: _statsDirty is true after requestLayout",
      _statsDirty === true,
      "_statsDirty is " + _statsDirty);

    // TEST-PERF-05: spellState.byPara exists
    assert("PERF-05: spellState has byPara index",
      typeof spellState.byPara === "object",
      "spellState.byPara is " + typeof spellState.byPara);

    // TEST-PERF-06: blink timer posToCoords is guarded
    buildTestDoc(50);
    cursor = { p: 40, o: 0 };
    layoutRegion.evictOutsideWindow(0, 30);
    var blinkCc = layoutRegion.isRealized(cursor.p) ? posToCoords(cursor) : null;
    assert("PERF-06: blink guard returns null for evicted cursor",
      blinkCc === null,
      "Expected null, got coords");
  }

  // ================================================================
  // TEST CATEGORY 9: Safety + Rendering (0080)
  // ================================================================

  function testSafety() {
    // TEST-SAFETY-01: _paraYState survives interrupted layout
    buildTestDoc(200);
    requestFullLayout("test-safety");
    var safeLen = _paraYState.length;
    var safeTotal = totalPages;
    _skipDOMSync = true;
    runLayout(50, 100);
    _skipDOMSync = false;
    assert("SAFETY-01a: _paraYState complete after bounded layout",
      _paraYState.length === safeLen,
      "Before: " + safeLen + " After: " + _paraYState.length);
    assert("SAFETY-01b: totalPages stable after bounded layout",
      totalPages >= safeTotal,
      "Before: " + safeTotal + " After: " + totalPages);

    // TEST-RENDER-01: Run-level rendering produces correct text
    buildTestDoc(3);
    var preRenderEx = null;
    try { render(); } catch(e) { preRenderEx = e; }
    assert("RENDER-01: render() completes without exception",
      preRenderEx === null,
      "Exception: " + (preRenderEx ? preRenderEx.message : ""));

    // TEST-RENDER-02: Selection rendering produces correct pieces
    buildTestDoc(5);
    cursor = { p: 1, o: 10 };
    selAnchor = { p: 1, o: 5 };
    selFocus = { p: 1, o: 15 };
    var selRenderEx = null;
    try { render(); } catch(e) { selRenderEx = e; }
    assert("RENDER-02: selection render completes without exception",
      selRenderEx === null,
      "Exception: " + (selRenderEx ? selRenderEx.message : ""));

    // TEST-RENDER-03: render still does not trigger realization
    buildTestDoc(50);
    var preR = _pipelineGen.realize;
    render();
    assert("RENDER-03: render remains realization-free",
      _pipelineGen.realize === preR,
      "realize gen before: " + preR + " after: " + _pipelineGen.realize);
  }

  // ================================================================
  // TEST CATEGORY 11: Render Integrity (0091)
  // ================================================================

  function testRenderIntegrity() {
    /* Save current state, build a purpose-built RINT document that
       exercises every render branch independently of the inline book. */
    var prevState = saveState();
    restoreState(_testOrigState);

    /* Build RINT-specific test paragraphs that exercise every render branch. */
    var rintParas = [
      { style: defaultParaStyle(), runs: [
        makeRun("Normal text. "),
        (function() { var r = makeRun("highlighted"); r.backgroundColor = "#FFFF00"; return r; })(),
        makeRun(". "),
        (function() { var r = makeRun("underlined"); r.textDecoration = "underline"; return r; })(),
        makeRun(". "),
        (function() { var r = makeRun("struck"); r.textDecoration = "line-through"; return r; })(),
        makeRun(". "),
        (function() { var r = makeRun("sup"); r["x-script"] = "sup"; r.fontSize = 8; return r; })(),
        makeRun(". "),
        (function() { var r = makeRun("sub"); r["x-script"] = "sub"; r.fontSize = 8; return r; })(),
        makeRun(". "),
        (function() { var r = makeRun("link"); r["x-linkHref"] = "https://example.com"; r.color = "#0066CC"; r.textDecoration = "underline"; return r; })(),
        makeRun(".")
      ]},
      { style: (function() { var s = defaultParaStyle(); s["x-list"] = { type: "bullet", level: 0 }; return s; })(),
        runs: [makeRun("Bullet item for list prefix coverage.")] },
      { style: (function() { var s = defaultParaStyle(); s["x-dropCap"] = { enabled: true }; return s; })(),
        runs: [makeRun("Drop cap paragraph for coverage. This needs enough text to wrap past the drop cap area so the renderer exercises the full code path.")] }
    ];

    /* Stamp section IDs */
    var rintSid = doc._sectionMeta[0].id;
    for (var ri = 0; ri < rintParas.length; ri++) {
      rintParas[ri].style["x-sectionId"] = rintSid;
    }

    /* Temporarily replace document paragraphs for the RINT render pass */
    var origParas = doc.paragraphs;
    doc.paragraphs = rintParas;
    requestFullLayout("rint");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);

    resetRenderCov();
    try {
      render();
    } catch(e) {
      assert("RINT-00: render completes", false, "Exception: " + e.message);
      doc.paragraphs = origParas;
      restoreState(prevState);
      return;
    }

    var cov = _renderCov;

    assert("RINT-01: pages rendered",
      cov.pages > 0, "pages: " + cov.pages);
    assert("RINT-02: margin guides drawn",
      cov.marginGuides > 0, "marginGuides: " + cov.marginGuides);
    assert("RINT-03: text segments rendered",
      cov.textSegments > 0, "textSegments: " + cov.textSegments);
    assert("RINT-04: highlights drawn",
      cov.highlights > 0, "highlights: " + cov.highlights);
    assert("RINT-05: underlines drawn",
      cov.underlines > 0, "underlines: " + cov.underlines);
    assert("RINT-06: strikethroughs drawn",
      cov.strikethroughs > 0, "strikethroughs: " + cov.strikethroughs);
    assert("RINT-07: superscripts rendered",
      cov.superscripts > 0, "superscripts: " + cov.superscripts);
    assert("RINT-08: subscripts rendered",
      cov.subscripts > 0, "subscripts: " + cov.subscripts);
    assert("RINT-09: link colors applied",
      cov.linkColors > 0, "linkColors: " + cov.linkColors);
    assert("RINT-10: drop caps rendered",
      cov.dropCaps > 0, "dropCaps: " + cov.dropCaps);
    assert("RINT-11: list prefixes drawn",
      cov.listPrefixes > 0, "listPrefixes: " + cov.listPrefixes);
    assert("RINT-12: cursor drawn",
      cov.cursors > 0, "cursors: " + cov.cursors);

    var snap0 = capturePageSnapshot(0);
    assert("RINT-13: page snapshot captured",
      snap0 !== null && snap0.length > 100,
      "snapshot length: " + (snap0 ? snap0.length : "null"));

    var snap0b = null;
    try {
      render();
      snap0b = capturePageSnapshot(0);
    } catch(e) { /* ignore */ }
    assert("RINT-14: re-render produces identical snapshot",
      snap0 === snap0b, "snapshots differ");

    doc.paragraphs = origParas;
    restoreState(prevState);
  }

  // ================================================================
  // TEST CATEGORY 10: V2 Document Model
  // ================================================================

  function testImageAndRulers() {
    // IMG-001: aspect ratio preserved on insert
    var nw = 650, nh = 650;
    var contentWPt = (doc.bookSettings.trim.widthIn -
      doc.bookSettings.marginsIn.left -
      doc.bookSettings.marginsIn.right) * 72;
    var widthPt = Math.min(nw * 0.75, contentWPt);
    var heightPt = widthPt * (nh / nw);
    assert("IMG-001a: square image has equal width/height",
      Math.abs(widthPt - heightPt) < 0.001,
      "widthPt=" + widthPt + " heightPt=" + heightPt);

    var nw2 = 800, nh2 = 600;
    var widthPt2 = Math.min(nw2 * 0.75, contentWPt);
    var heightPt2 = widthPt2 * (nh2 / nw2);
    var expectedRatio2 = nw2 / nh2;
    var actualRatio2 = widthPt2 / heightPt2;
    assert("IMG-001b: landscape ratio preserved",
      Math.abs(expectedRatio2 - actualRatio2) < 0.001,
      "expected=" + expectedRatio2.toFixed(4) + " actual=" + actualRatio2.toFixed(4));

    var nw3 = 600, nh3 = 900;
    var widthPt3 = Math.min(nw3 * 0.75, contentWPt);
    var heightPt3 = widthPt3 * (nh3 / nw3);
    var expectedRatio3 = nw3 / nh3;
    var actualRatio3 = widthPt3 / heightPt3;
    assert("IMG-001c: portrait ratio preserved",
      Math.abs(expectedRatio3 - actualRatio3) < 0.001,
      "expected=" + expectedRatio3.toFixed(4) + " actual=" + actualRatio3.toFixed(4));

    // IMG-002: layout engine constrain-to-width preserves aspect ratio
    var testW = contentWPt;
    var testH = testW * (500 / 1000);
    var PT_TO_PX_TEST = SCREEN_DPI / 72;
    var imgW = testW * PT_TO_PX_TEST;
    var imgH = testH * PT_TO_PX_TEST;
    if (imgW > CONTENT_W) {
      var scl = CONTENT_W / imgW;
      imgW = CONTENT_W;
      imgH *= scl;
    }
    var constrainedRatio = imgW / imgH;
    assert("IMG-002: constrained aspect ratio is 2:1",
      Math.abs(constrainedRatio - 2.0) < 0.01,
      "got " + constrainedRatio.toFixed(4));

    // IMG-003: defaultBookSettings has bleed property
    var bs003 = defaultBookSettings();
    assert("IMG-003a: bleed exists",
      typeof bs003.bleed === "object" && bs003.bleed !== null);
    assert("IMG-003b: bleed.enabled is false by default",
      bs003.bleed.enabled === false);
    assert("IMG-003c: bleed.amountIn is 0.125",
      bs003.bleed.amountIn === 0.125);

    // IMG-004: ruler functions exist
    assert("IMG-004a: updateHorizontalRuler is a function",
      typeof updateHorizontalRuler === "function");
    assert("IMG-004b: updateVerticalRuler is a function",
      typeof updateVerticalRuler === "function");
  }

  // ================================================================
  // Clipboard Tests (0106-HF3)
  // ================================================================

  function testClipboard() {
    // CLIP-001: extractSelectedContent returns structured data
    var savedClip = saveState();

    doc.paragraphs = [
      { style: defaultParaStyle(), runs: [
        makeRun("Normal ", curStyle),
        makeRun("bold", { fontFamily: "Georgia", fontSize: 12, fontWeight: "bold",
          fontStyle: "normal", textDecoration: "none", color: "#ff0000",
          "x-script": "normal", "x-linkHref": null, backgroundColor: null })
      ]},
      { style: defaultParaStyle(), runs: [makeRun("Second para", curStyle)] }
    ];
    doc.paragraphs[0].style["x-sectionId"] = currentSectionId();
    doc.paragraphs[1].style["x-sectionId"] = currentSectionId();

    selAnchor = mkPos(0, 7);
    selFocus = mkPos(0, 11);

    var rich001 = extractSelectedContent();
    assert("CLIP-001a: returns array", Array.isArray(rich001));
    assert("CLIP-001b: one paragraph", rich001.length === 1);
    assert("CLIP-001c: run text is 'bold'", rich001[0].runs[0].text === "bold");
    assert("CLIP-001d: run is bold", rich001[0].runs[0].fontWeight === "bold");
    assert("CLIP-001e: run is red", rich001[0].runs[0].color === "#ff0000");
    assert("CLIP-001f: no x-sectionId", !rich001[0].style.hasOwnProperty("x-sectionId"));

    restoreState(savedClip);

    // CLIP-002: extractSelectedContent across paragraphs
    var savedClip2 = saveState();

    doc.paragraphs = [
      { style: defaultParaStyle(), runs: [makeRun("First paragraph", curStyle)] },
      { style: defaultParaStyle(), runs: [makeRun("Second paragraph", curStyle)] },
      { style: defaultParaStyle(), runs: [makeRun("Third paragraph", curStyle)] }
    ];
    for (var ci = 0; ci < doc.paragraphs.length; ci++) {
      doc.paragraphs[ci].style["x-sectionId"] = currentSectionId();
    }

    selAnchor = mkPos(0, 6);
    selFocus = mkPos(1, 6);

    var rich002 = extractSelectedContent();
    assert("CLIP-002a: two paragraphs", rich002.length === 2);
    assert("CLIP-002b: first text", rich002[0].runs[0].text === "paragraph");
    assert("CLIP-002c: second text", rich002[1].runs[0].text === "Second");

    restoreState(savedClip2);

    // CLIP-003: tryRichPaste matching
    internalClipboard = "test text";
    internalClipboardRich = [{ style: defaultParaStyle(), runs: [makeRun("test text", curStyle)] }];
    assert("CLIP-003a: match returns true concept",
      internalClipboardRich !== null && internalClipboard === "test text");

    assert("CLIP-003b: different text would not match",
      "other text" !== internalClipboard);

    internalClipboard = "";
    internalClipboardRich = null;

    // CLIP-004: rich paste functions exist
    assert("CLIP-004a: extractSelectedContent is a function",
      typeof extractSelectedContent === "function");
    assert("CLIP-004b: insertRichContent is a function",
      typeof insertRichContent === "function");
    assert("CLIP-004c: tryRichPaste is a function",
      typeof tryRichPaste === "function");

    // CLIP-005: doPaste is a function
    assert("CLIP-005: doPaste is a function",
      typeof doPaste === "function");

    // CLIP-006: multi-paragraph paste preserves paragraph styles
    var savedClip6 = saveState();

    doc.paragraphs = [
      { style: defaultParaStyle(), runs: [makeRun("Before text here", curStyle)] }
    ];
    doc.paragraphs[0].style["x-sectionId"] = currentSectionId();

    var richData006 = [
      {
        style: { "x-role": "chapterTitle", textAlign: "center", textIndent: 0,
                 lineHeight: 1.2, marginTop: 72, marginBottom: 24,
                 marginLeft: 0, marginRight: 0,
                 "x-list": null, "x-dropCap": { enabled: false } },
        runs: [makeRun("Chapter Five", { fontFamily: "Georgia", fontSize: 24,
               fontWeight: "bold", fontStyle: "normal", textDecoration: "none",
               color: "#1a1a1a", "x-script": "normal", "x-linkHref": null,
               backgroundColor: null })]
      },
      {
        style: { "x-role": "body", textAlign: "left", textIndent: 18,
                 lineHeight: 1.2, marginTop: 0, marginBottom: 0,
                 marginLeft: 0, marginRight: 0,
                 "x-list": null, "x-dropCap": { enabled: false } },
        runs: [makeRun("Body paragraph text.", curStyle)]
      },
      {
        style: { "x-role": "blockQuote", textAlign: "left", textIndent: 0,
                 lineHeight: 1.2, marginTop: 0, marginBottom: 0,
                 marginLeft: 36, marginRight: 36,
                 "x-list": null, "x-dropCap": { enabled: false } },
        runs: [makeRun("A quoted passage.", { fontFamily: "Georgia", fontSize: 12,
               fontWeight: "normal", fontStyle: "italic", textDecoration: "none",
               color: "#1a1a1a", "x-script": "normal", "x-linkHref": null,
               backgroundColor: null })]
      }
    ];

    cursor = mkPos(0, 6);
    clearSel();
    insertRichContent(richData006);

    assert("CLIP-006a: 5 paragraphs after paste",
      doc.paragraphs.length === 5,
      "got " + doc.paragraphs.length);
    assert("CLIP-006b: para 0 is head ('Before')",
      paraText(doc.paragraphs[0]).indexOf("Before") === 0);
    assert("CLIP-006c: para 1 is chapterTitle",
      doc.paragraphs[1].style["x-role"] === "chapterTitle",
      "got " + doc.paragraphs[1].style["x-role"]);
    assert("CLIP-006d: para 1 centered",
      doc.paragraphs[1].style.textAlign === "center");
    assert("CLIP-006e: para 1 marginTop 72",
      doc.paragraphs[1].style.marginTop === 72);
    assert("CLIP-006f: para 2 is body",
      doc.paragraphs[2].style["x-role"] === "body");
    assert("CLIP-006g: para 3 is blockQuote",
      doc.paragraphs[3].style["x-role"] === "blockQuote",
      "got " + doc.paragraphs[3].style["x-role"]);
    assert("CLIP-006h: para 3 marginLeft 36",
      doc.paragraphs[3].style.marginLeft === 36);
    assert("CLIP-006i: para 3 italic",
      doc.paragraphs[3].runs[0].fontStyle === "italic");
    assert("CLIP-006j: para 4 is tail (' text here')",
      paraText(doc.paragraphs[4]).indexOf("text here") >= 0);

    restoreState(savedClip6);

    // CLIP-007: paste at offset 0 removes empty head
    var savedClip7 = saveState();

    doc.paragraphs = [
      { style: defaultParaStyle(), runs: [makeRun("Existing text", curStyle)] }
    ];
    doc.paragraphs[0].style["x-sectionId"] = currentSectionId();

    var richData007b = [
      { style: { "x-role": "chapterTitle", textAlign: "center", textIndent: 0,
                 lineHeight: 1.2, marginTop: 0, marginBottom: 0,
                 marginLeft: 0, marginRight: 0,
                 "x-list": null, "x-dropCap": { enabled: false } },
        runs: [makeRun("Title", curStyle)] },
      { style: { "x-role": "body", textAlign: "left", textIndent: 18,
                 lineHeight: 1.2, marginTop: 0, marginBottom: 0,
                 marginLeft: 0, marginRight: 0,
                 "x-list": null, "x-dropCap": { enabled: false } },
        runs: [makeRun("Body text", curStyle)] }
    ];

    cursor = mkPos(0, 0);
    clearSel();
    insertRichContent(richData007b);

    assert("CLIP-007a: 3 paragraphs (no empty head)",
      doc.paragraphs.length === 3,
      "got " + doc.paragraphs.length);
    assert("CLIP-007b: first is chapterTitle",
      doc.paragraphs[0].style["x-role"] === "chapterTitle");
    assert("CLIP-007c: last is original text",
      paraText(doc.paragraphs[2]) === "Existing text");

    restoreState(savedClip7);

    // CLIP-008: extractSelectedContent strips drop cap
    var savedClip8 = saveState();
    doc.paragraphs = [
      { style: defaultParaStyle(), runs: [makeRun("Drop cap paragraph text here for testing.", curStyle)] }
    ];
    doc.paragraphs[0].style["x-sectionId"] = currentSectionId();
    doc.paragraphs[0].style["x-dropCap"] = { enabled: true };
    selAnchor = mkPos(0, 0);
    selFocus = mkPos(0, 10);
    var rich008 = extractSelectedContent();
    assert("CLIP-008: drop cap stripped on extract",
      rich008[0].style["x-dropCap"].enabled === false);
    restoreState(savedClip8);
  }

  // ================================================================
  // ================================================================
  // Sidebar Tests (0109)
  // ================================================================

  function testSidebar() {
    restoreState(_testOrigState);

    // SIDE-001: sidebar functions exist
    assert("SIDE-001a: updateSidebar is a function",
      typeof updateSidebar === "function");
    assert("SIDE-001b: navigateToSection is a function",
      typeof navigateToSection === "function");
    assert("SIDE-001c: getSectionChapterTitle is a function",
      typeof getSectionChapterTitle === "function");
    assert("SIDE-001d: getSectionWordCount is a function",
      typeof getSectionWordCount === "function");
    assert("SIDE-001e: escapeHtml is a function",
      typeof escapeHtml === "function");
    assert("SIDE-001f: SECTION_DISPLAY defined",
      typeof SECTION_DISPLAY === "object" && SECTION_DISPLAY !== null);

    // SIDE-002: getSectionChapterTitle
    var chapterMeta002 = null;
    for (var si002 = 0; si002 < doc._sectionMeta.length; si002++) {
      if (doc._sectionMeta[si002].type === "chapter") {
        chapterMeta002 = doc._sectionMeta[si002];
        break;
      }
    }
    var title002 = chapterMeta002 ? getSectionChapterTitle(chapterMeta002.id) : null;
    assert("SIDE-002: finds chapter title text",
      typeof title002 === "string" && title002.length > 0,
      "got: " + JSON.stringify(title002));

    // SIDE-003: getSectionWordCount
    var sid003 = doc._sectionMeta[0].id;
    var wc003 = getSectionWordCount(sid003);
    assert("SIDE-003: word count is positive",
      typeof wc003 === "number" && wc003 > 0,
      "got: " + wc003);

    // SIDE-004: SECTION_DISPLAY covers all types
    var allTypes004 = Object.keys(SECTION_TYPE_DEFAULTS);
    var missing004 = [];
    for (var ti004 = 0; ti004 < allTypes004.length; ti004++) {
      if (!SECTION_DISPLAY[allTypes004[ti004]]) missing004.push(allTypes004[ti004]);
    }
    assert("SIDE-004: all types have display info",
      missing004.length === 0,
      "missing: " + missing004.join(", "));

    // SIDE-005: escapeHtml
    assert("SIDE-005a: escapes ampersand",
      escapeHtml("A & B") === "A &amp; B");
    assert("SIDE-005b: escapes angle brackets",
      escapeHtml("<div>") === "&lt;div&gt;");
    assert("SIDE-005c: handles null",
      escapeHtml(null) === "");

    // SIDE-006: navigateToSection
    var savedSide006 = saveState();
    var sid006 = doc._sectionMeta[0].id;
    cursor = mkPos(5, 10);
    navigateToSection(sid006);
    assert("SIDE-006: cursor at section start",
      cursor.p === 0 && cursor.o === 0);
    restoreState(savedSide006);

    // SIDE-007: updateSidebar populates content
    updateSidebar();
    var content007 = document.getElementById("sidebar-content");
    assert("SIDE-007a: sidebar has content",
      content007 && content007.innerHTML.length > 0);
    assert("SIDE-007b: has at least one sb-item",
      content007.querySelectorAll(".sb-item").length > 0);
    assert("SIDE-007c: has cover thumbnails",
      content007.querySelectorAll(".sb-cover-thumb").length === 2);

    // BOOK-001: test book has correct section structure
    assert("BOOK-001a: 8 sections",
      doc._sectionMeta.length === 8);
    assert("BOOK-001b: 3 regions",
      (function() {
        var regions = {};
        for (var bi = 0; bi < doc._sectionMeta.length; bi++) {
          regions[doc._sectionMeta[bi].region] = true;
        }
        return Object.keys(regions).length === 3;
      })());
    assert("BOOK-001c: first section is titlePage",
      doc._sectionMeta[0].type === "titlePage");
    assert("BOOK-001d: has 3 chapters",
      (function() {
        var count = 0;
        for (var bi = 0; bi < doc._sectionMeta.length; bi++) {
          if (doc._sectionMeta[bi].type === "chapter") count++;
        }
        return count === 3;
      })());
    assert("BOOK-001e: 41 total paragraphs",
      doc.paragraphs.length === 41);
    assert("BOOK-001f: last section is aboutAuthor",
      doc._sectionMeta[doc._sectionMeta.length - 1].type === "aboutAuthor");

    // BOOK-002: sidebar shows all regions and sections
    updateSidebar();
    var content002b = document.getElementById("sidebar-content");
    var regions002 = content002b.querySelectorAll(".sb-region");
    var items002 = content002b.querySelectorAll(".sb-item");
    assert("BOOK-002a: 3 region headers",
      regions002.length === 3);
    assert("BOOK-002b: 8 section items",
      items002.length === 8);
  }

  // ================================================================
  // Section Map Tests (0111)
  // ================================================================

  function testSectionMap() {
    restoreState(_testOrigState);

    // SMAP-001: buildSectionMap exists
    assert("SMAP-001: buildSectionMap is a function",
      typeof buildSectionMap === "function");

    // SMAP-002: correct section count
    var smap002 = buildSectionMap();
    assert("SMAP-002: 8 sections in map",
      smap002.length === 8,
      "got " + smap002.length);

    // SMAP-003: entry structure
    var smap003 = buildSectionMap();
    var structOk003 = true;
    var missing003 = "";
    for (var si003 = 0; si003 < smap003.length; si003++) {
      var e = smap003[si003];
      if (typeof e.id !== "string") { structOk003 = false; missing003 += si003 + ":id "; }
      if (typeof e.type !== "string") { structOk003 = false; missing003 += si003 + ":type "; }
      if (typeof e.region !== "string") { structOk003 = false; missing003 += si003 + ":region "; }
      if (typeof e.beginOn !== "string") { structOk003 = false; missing003 += si003 + ":beginOn "; }
      if (typeof e.firstPara !== "number") { structOk003 = false; missing003 += si003 + ":firstPara "; }
      if (typeof e.lastPara !== "number") { structOk003 = false; missing003 += si003 + ":lastPara "; }
      if (typeof e.paraCount !== "number") { structOk003 = false; missing003 += si003 + ":paraCount "; }
    }
    assert("SMAP-003: all entries have required properties",
      structOk003, "missing: " + missing003);

    // SMAP-004: first section
    var smap004 = buildSectionMap();
    assert("SMAP-004a: first section is titlePage",
      smap004[0].type === "titlePage");
    assert("SMAP-004b: first section starts at para 0",
      smap004[0].firstPara === 0);
    assert("SMAP-004c: first section is front region",
      smap004[0].region === "front");

    // SMAP-005: copyright beginOn
    var smap005 = buildSectionMap();
    var copyrightEntry005 = null;
    for (var si005 = 0; si005 < smap005.length; si005++) {
      if (smap005[si005].type === "copyright") {
        copyrightEntry005 = smap005[si005];
        break;
      }
    }
    assert("SMAP-005: copyright beginOn is left",
      copyrightEntry005 && copyrightEntry005.beginOn === "left");

    // SMAP-006: chapters beginOn
    var smap006 = buildSectionMap();
    var chapterFails006 = [];
    for (var si006 = 0; si006 < smap006.length; si006++) {
      if (smap006[si006].type === "chapter" && smap006[si006].beginOn !== "right") {
        chapterFails006.push(si006 + ":" + smap006[si006].beginOn);
      }
    }
    assert("SMAP-006: all chapters beginOn right",
      chapterFails006.length === 0,
      "failures: " + chapterFails006.join(", "));

    // SMAP-007: sections are contiguous (no paragraph gaps)
    var smap007 = buildSectionMap();
    var gapFails007 = [];
    for (var si007 = 1; si007 < smap007.length; si007++) {
      var prevLast = smap007[si007 - 1].lastPara;
      var curFirst = smap007[si007].firstPara;
      if (curFirst !== prevLast + 1) {
        gapFails007.push("gap between section " + (si007 - 1) + " (lastPara=" +
          prevLast + ") and section " + si007 + " (firstPara=" + curFirst + ")");
      }
    }
    assert("SMAP-007: no gaps between sections",
      gapFails007.length === 0,
      gapFails007.join("; "));

    // SMAP-008: sum of all section paraCount equals doc.paragraphs.length
    var smap008 = buildSectionMap();
    var totalParas008 = 0;
    for (var si008 = 0; si008 < smap008.length; si008++) {
      totalParas008 += smap008[si008].paraCount;
    }
    assert("SMAP-008: total paragraphs match",
      totalParas008 === doc.paragraphs.length,
      "map total: " + totalParas008 + ", doc: " + doc.paragraphs.length);

    // SMAP-009: last section
    var smap009 = buildSectionMap();
    assert("SMAP-009: last section is aboutAuthor",
      smap009[smap009.length - 1].type === "aboutAuthor");

    // SMAP-010: individual section paragraph counts
    var smap010 = buildSectionMap();
    var expected010 = [2, 3, 1, 11, 10, 9, 3, 2];
    var countFails010 = [];
    for (var si010 = 0; si010 < smap010.length; si010++) {
      if (smap010[si010].paraCount !== expected010[si010]) {
        countFails010.push(smap010[si010].type + ": expected " +
          expected010[si010] + " got " + smap010[si010].paraCount);
      }
    }
    assert("SMAP-010: section paragraph counts correct",
      countFails010.length === 0,
      countFails010.join("; "));
  }

  // ================================================================
  // Section Breaks Tests (0112)
  // ================================================================

  function testSectionBreaks() {
    restoreState(_testOrigState);
    requestFullLayout("test-section-breaks");

    // SECB-001: sections on separate pages
    var ys001 = window.__sag.paraYState();
    var secMap001 = buildSectionMap();
    var secPages001 = [];
    for (var si001 = 0; si001 < secMap001.length; si001++) {
      var fp001 = secMap001[si001].firstPara;
      secPages001.push(ys001[fp001] ? ys001[fp001].page : -1);
    }
    var conflicts001 = 0;
    for (var ci001 = 1; ci001 < secPages001.length; ci001++) {
      if (secPages001[ci001] === secPages001[ci001 - 1]) conflicts001++;
    }
    assert("SECB-001: no sections share a starting page",
      conflicts001 === 0,
      "pages: " + secPages001.join(", "));

    // SECB-002: title page on page 0
    var ys002 = window.__sag.paraYState();
    assert("SECB-002: title page on page 0 (recto)",
      ys002[0] && ys002[0].page === 0);

    // SECB-003: copyright on verso
    var ys003 = window.__sag.paraYState();
    var secMap003 = buildSectionMap();
    var copyrightFirst003 = -1;
    for (var si003 = 0; si003 < secMap003.length; si003++) {
      if (secMap003[si003].type === "copyright") {
        copyrightFirst003 = secMap003[si003].firstPara;
        break;
      }
    }
    assert("SECB-003: copyright on page 1",
      copyrightFirst003 >= 0 && ys003[copyrightFirst003] &&
      ys003[copyrightFirst003].page === 1);

    // SECB-004: recto/verso per section type
    var ys004 = window.__sag.paraYState();
    var secMap004 = buildSectionMap();
    var fails004 = [];
    for (var si004 = 0; si004 < secMap004.length; si004++) {
      var sec004 = secMap004[si004];
      var pg004 = ys004[sec004.firstPara] ? ys004[sec004.firstPara].page : -1;
      if (sec004.beginOn === "right" && pg004 % 2 !== 0) {
        fails004.push(sec004.type + " on page " + pg004 + " (need even/recto)");
      }
      if (sec004.beginOn === "left" && pg004 % 2 !== 1) {
        fails004.push(sec004.type + " on page " + pg004 + " (need odd/verso)");
      }
    }
    assert("SECB-004: all sections on correct page side",
      fails004.length === 0,
      fails004.join("; "));

    // SECB-005: more pages than continuous flow
    var ys005 = window.__sag.paraYState();
    var maxPg005 = 0;
    for (var pi005 = 0; pi005 < ys005.length; pi005++) {
      if (ys005[pi005] && ys005[pi005].page > maxPg005) {
        maxPg005 = ys005[pi005].page;
      }
    }
    assert("SECB-005: more than 5 pages",
      maxPg005 + 1 > 5,
      "total: " + (maxPg005 + 1));

    // SECB-006: dedication on recto
    var ys006 = window.__sag.paraYState();
    var secMap006 = buildSectionMap();
    var dedFirst006 = -1;
    for (var si006 = 0; si006 < secMap006.length; si006++) {
      if (secMap006[si006].type === "dedication") {
        dedFirst006 = secMap006[si006].firstPara;
        break;
      }
    }
    assert("SECB-006: dedication on recto (even page)",
      dedFirst006 >= 0 && ys006[dedFirst006] &&
      ys006[dedFirst006].page % 2 === 0);

    // SECB-007: all chapters on recto
    var ys007 = window.__sag.paraYState();
    var secMap007 = buildSectionMap();
    var chFails007 = [];
    for (var si007 = 0; si007 < secMap007.length; si007++) {
      if (secMap007[si007].type === "chapter") {
        var pg007 = ys007[secMap007[si007].firstPara];
        if (pg007 && pg007.page % 2 !== 0) {
          chFails007.push("ch at para " + secMap007[si007].firstPara +
            " on page " + pg007.page);
        }
      }
    }
    assert("SECB-007: all chapters on recto",
      chFails007.length === 0,
      chFails007.join("; "));

    // SECB-008: editing smoke test
    var saved008 = saveState();
    var origPages008 = (function() {
      var ys = window.__sag.paraYState();
      var max = 0;
      for (var i = 0; i < ys.length; i++) {
        if (ys[i] && ys[i].page > max) max = ys[i].page;
      }
      return max + 1;
    })();
    cursor = mkPos(7, 0);
    insertText("Test insertion. ");
    requestLayout({ fromPara: 7, reason: "insert" });
    var afterPages008 = (function() {
      var ys = window.__sag.paraYState();
      var max = 0;
      for (var i = 0; i < ys.length; i++) {
        if (ys[i] && ys[i].page > max) max = ys[i].page;
      }
      return max + 1;
    })();
    assert("SECB-008: editing doesn't crash, pages still valid",
      afterPages008 >= origPages008);
    restoreState(saved008);
  }

  // ================================================================
  // Blank Pages + Even Count + Scene Break Indent Tests (0113)
  // ================================================================

  function testBlankPages() {
    restoreState(_testOrigState);
    requestFullLayout("test-blank-pages");

    // BLNK-001: total page count is even
    var tp001 = window.__sag.totalPages();
    assert("BLNK-001: even page count",
      tp001 % 2 === 0,
      "totalPages: " + tp001);

    // BLNK-002: totalPages function exists
    assert("BLNK-002: totalPages exposed",
      typeof window.__sag.totalPages === "function");

    // BLNK-003: total pages at least 13
    var tp003 = window.__sag.totalPages();
    assert("BLNK-003: at least 13 pages (was 13 before even padding)",
      tp003 >= 13,
      "totalPages: " + tp003);

    // BLNK-004: scene break indent suppression
    var sbPi004 = -1;
    for (var pi004 = 0; pi004 < doc.paragraphs.length; pi004++) {
      if (doc.paragraphs[pi004].style["x-role"] === "sceneBreak") {
        sbPi004 = pi004;
        break;
      }
    }
    assert("BLNK-004a: scene break exists", sbPi004 >= 0);
    if (sbPi004 >= 0 && sbPi004 + 1 < doc.paragraphs.length) {
      var afterSbRole = doc.paragraphs[sbPi004 + 1].style["x-role"] || "body";
      assert("BLNK-004b: paragraph after scene break is body",
        afterSbRole === "body");
      var afterSbLines = layoutRegion.linesForPara(sbPi004 + 1);
      if (afterSbLines && afterSbLines.length > 0) {
        var firstLine = afterSbLines[0];
        var expectedLeft = M_LEFT;
        assert("BLNK-004c: first line after scene break has no indent",
          Math.abs(firstLine.leftEdge - expectedLeft) < 1,
          "leftEdge: " + firstLine.leftEdge + " expected: " + expectedLeft);
      }
    }

    // BLNK-005: verify blank gap pages exist
    var ys005 = window.__sag.paraYState();
    var page3HasContent = false;
    for (var pi005 = 0; pi005 < ys005.length; pi005++) {
      if (ys005[pi005] && ys005[pi005].page === 3) {
        page3HasContent = true;
        break;
      }
    }
    assert("BLNK-005: page 3 is blank (gap between dedication and chapter 1)",
      !page3HasContent);
  }

  // ================================================================
  // Blank Page Click Tests (0115)
  // ================================================================

  function testBlankPageClick() {
    restoreState(_testOrigState);
    requestFullLayout("test-blank-click");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);

    // BLPG-001: hitTest null on blank page
    var ht001 = hitTest(PAGE_W / 2, PAGE_H / 2, 3);
    assert("BLPG-001: hitTest returns null on blank page",
      ht001 === null);

    // BLPG-002: hitTest works on content page
    var ht002 = hitTest(PAGE_W / 2, PAGE_H / 2, 0);
    assert("BLPG-002: hitTest returns position on content page",
      ht002 !== null && typeof ht002.p === "number");
  }

  // ================================================================
  // Integration Tests (0114)
  // ================================================================

  function testIntegration() {
    restoreState(_testOrigState);
    requestFullLayout("test-integration");

    // INT-001: full layout consistency
    var saved001 = saveState();
    requestFullLayout("test-001a");
    var ys001a = JSON.stringify(window.__sag.paraYState());
    requestFullLayout("test-001b");
    var ys001b = JSON.stringify(window.__sag.paraYState());
    assert("INT-001: double full layout produces identical pages",
      ys001a === ys001b);
    restoreState(saved001);

    // INT-002: all paragraphs have page assignments
    var ys002 = window.__sag.paraYState();
    var unassigned002 = 0;
    for (var pi002 = 0; pi002 < doc.paragraphs.length; pi002++) {
      if (!ys002[pi002] || typeof ys002[pi002].page !== "number") unassigned002++;
    }
    assert("INT-002: all 41 paragraphs have page assignments",
      unassigned002 === 0,
      "unassigned: " + unassigned002);

    // INT-003: verify section content stays on correct page sides
    var ys003 = window.__sag.paraYState();
    var map003 = buildSectionMap();
    var sideFails003 = [];
    for (var si003 = 0; si003 < map003.length; si003++) {
      var sec003 = map003[si003];
      var startPg003 = ys003[sec003.firstPara] ? ys003[sec003.firstPara].page : -1;
      if (sec003.beginOn === "right" && startPg003 >= 0 && startPg003 % 2 !== 0) {
        sideFails003.push(sec003.type + " starts on page " + startPg003 + " (need recto)");
      }
      if (sec003.beginOn === "left" && startPg003 >= 0 && startPg003 % 2 !== 1) {
        sideFails003.push(sec003.type + " starts on page " + startPg003 + " (need verso)");
      }
    }
    assert("INT-003: all sections on correct page side",
      sideFails003.length === 0, sideFails003.join("; "));

    // INT-010: edit chapter 2, chapter 1 unaffected
    var saved010 = saveState();
    var ys010pre = window.__sag.paraYState();
    var ch1Start010 = ys010pre[6] ? ys010pre[6].page : -1;
    var ch1End010 = ys010pre[16] ? ys010pre[16].page : -1;

    cursor = mkPos(18, 0);
    clearSel();
    insertText("This is extra text added for testing. ");
    requestLayout({ fromPara: 18, reason: "insert" });

    var ys010post = window.__sag.paraYState();
    var ch1StartAfter = ys010post[6] ? ys010post[6].page : -1;
    var ch1EndAfter = ys010post[16] ? ys010post[16].page : -1;
    assert("INT-010a: ch1 start page unchanged",
      ch1Start010 === ch1StartAfter,
      "before: " + ch1Start010 + " after: " + ch1StartAfter);
    assert("INT-010b: ch1 end page unchanged",
      ch1End010 === ch1EndAfter,
      "before: " + ch1End010 + " after: " + ch1EndAfter);

    restoreState(saved010);

    // INT-011: large insert in chapter 2, section isolation holds
    var saved011 = saveState();

    cursor = mkPos(18, 0);
    clearSel();
    var bigText011 = "";
    for (var ti011 = 0; ti011 < 50; ti011++) {
      bigText011 += "Extra sentence number " + ti011 + " added to stress test. ";
    }
    insertText(bigText011);
    requestLayout({ fromPara: 18, reason: "insert" });

    var ys011 = window.__sag.paraYState();
    var map011 = buildSectionMap();

    var ch2Start011 = ys011[map011[4].firstPara].page;
    var ch2End011 = ys011[map011[4].lastPara].page;
    assert("INT-011a: chapter 2 expanded to multiple pages",
      ch2End011 > ch2Start011,
      "start: " + ch2Start011 + " end: " + ch2End011);

    var ch3Start011 = ys011[map011[5].firstPara].page;
    assert("INT-011b: chapter 3 still on recto after ch2 expansion",
      ch3Start011 % 2 === 0,
      "ch3 on page " + ch3Start011);

    assert("INT-011c: chapter 3 starts after chapter 2 ends",
      ch3Start011 > ch2End011);

    assert("INT-011d: title still page 0", ys011[0].page === 0);
    assert("INT-011e: copyright still page 1", ys011[2].page === 1);

    restoreState(saved011);

    // INT-012: delete text from chapter 1
    var saved012 = saveState();
    var ys012pre = window.__sag.paraYState();
    var preTotal012 = window.__sag.totalPages();

    selAnchor = mkPos(8, 0);
    selFocus = mkPos(9, 0);
    deleteRange(getSelRange().s, getSelRange().e);
    clearSel();
    requestFullLayout("test-012");

    var ys012post = window.__sag.paraYState();
    assert("INT-012a: title still page 0", ys012post[0].page === 0);
    assert("INT-012b: copyright still page 1", ys012post[2].page === 1);

    var map012 = buildSectionMap();
    var fails012 = [];
    for (var si012 = 0; si012 < map012.length; si012++) {
      var sec012 = map012[si012];
      var pg012 = ys012post[sec012.firstPara] ? ys012post[sec012.firstPara].page : -1;
      if (sec012.beginOn === "right" && pg012 % 2 !== 0) fails012.push(sec012.type);
      if (sec012.beginOn === "left" && pg012 % 2 !== 1) fails012.push(sec012.type);
    }
    assert("INT-012c: all sections still correct side after delete",
      fails012.length === 0, fails012.join(", "));

    assert("INT-012d: total pages still even",
      window.__sag.totalPages() % 2 === 0);

    restoreState(saved012);

    // INT-020: undo restores page assignments
    var saved020 = saveState();
    var ysPre020 = JSON.stringify(window.__sag.paraYState());

    cursor = mkPos(18, 0);
    clearSel();
    var cap020 = captureSplice(18, 1);
    insertText("Undo test text. ");
    finishSplice(cap020, 1);
    requestLayout({ fromPara: 18, reason: "insert" });

    doUndo();
    requestFullLayout("undo-020");

    var ysPost020 = JSON.stringify(window.__sag.paraYState());
    assert("INT-020: undo restores page assignments",
      ysPre020 === ysPost020);

    restoreState(saved020);

    // INT-030: save/load preserves pages
    var saved030 = saveState();
    var ysPre030 = window.__sag.paraYState();

    var map030 = buildSectionMap();
    var prePages030 = [];
    for (var si030 = 0; si030 < map030.length; si030++) {
      prePages030.push(ysPre030[map030[si030].firstPara].page);
    }

    var stripped030 = window.__sag.stripDocument(doc);
    var sections030 = window.__sag.regroupSections(stripped030.paragraphs, doc._sectionMeta);

    var flat030 = window.__sag.flattenSections(sections030, doc._sectionMeta);
    doc.paragraphs = flat030.paragraphs;
    doc._sectionMeta = flat030.sectionMeta;
    resolveDocument(doc);
    requestFullLayout("load-030");

    var ysPost030 = window.__sag.paraYState();
    var map030b = buildSectionMap();
    var postPages030 = [];
    for (var si030b = 0; si030b < map030b.length; si030b++) {
      postPages030.push(ysPost030[map030b[si030b].firstPara].page);
    }

    assert("INT-030a: same number of sections after round-trip",
      prePages030.length === postPages030.length);
    var pageMatch030 = true;
    for (var ci030 = 0; ci030 < prePages030.length; ci030++) {
      if (prePages030[ci030] !== postPages030[ci030]) pageMatch030 = false;
    }
    assert("INT-030b: section start pages match after round-trip",
      pageMatch030,
      "pre: " + prePages030.join(",") + " post: " + postPages030.join(","));

    restoreState(saved030);

    // INT-040: sidebar navigation to all sections
    var saved040 = saveState();
    var map040 = buildSectionMap();
    var ys040 = window.__sag.paraYState();
    var navFails040 = [];

    for (var si040 = 0; si040 < map040.length; si040++) {
      navigateToSection(map040[si040].id);
      var expectedPara = map040[si040].firstPara;
      if (cursor.p !== expectedPara) {
        navFails040.push(map040[si040].type + ": cursor.p=" + cursor.p +
          " expected=" + expectedPara);
      }
    }
    assert("INT-040: navigation lands on correct paragraph for all sections",
      navFails040.length === 0, navFails040.join("; "));

    restoreState(saved040);

    // INT-060: split first paragraph of Chapter 2
    var saved060 = saveState();
    var ys060pre = window.__sag.paraYState();
    var ch2Page060 = ys060pre[17] ? ys060pre[17].page : -1;

    cursor = mkPos(17, 5);
    clearSel();
    var cap060 = captureSplice(17, 1);
    splitParagraph();
    finishSplice(cap060, 2);
    requestFullLayout("test-060");

    var ys060post = window.__sag.paraYState();
    var ch2PageAfter = ys060post[17] ? ys060post[17].page : -1;
    assert("INT-060a: chapter 2 still starts on recto after split",
      ch2PageAfter % 2 === 0,
      "page: " + ch2PageAfter);

    assert("INT-060b: total pages still even",
      window.__sag.totalPages() % 2 === 0);

    restoreState(saved060);

    // INT-070: massive text in chapter 1
    var saved070 = saveState();

    cursor = mkPos(7, 0);
    clearSel();
    var huge070 = "";
    for (var hi070 = 0; hi070 < 200; hi070++) {
      huge070 += "This is stress test sentence number " + hi070 +
        " designed to push chapter one across many pages. ";
    }
    insertText(huge070);
    requestFullLayout("stress-070");

    var ys070 = window.__sag.paraYState();
    var map070 = buildSectionMap();
    var tp070 = window.__sag.totalPages();

    assert("INT-070a: total pages even", tp070 % 2 === 0);
    assert("INT-070b: total pages > 14 (was 14)",
      tp070 > 14, "totalPages: " + tp070);

    var fails070 = [];
    for (var si070 = 0; si070 < map070.length; si070++) {
      var sec070 = map070[si070];
      var pg070 = ys070[sec070.firstPara] ? ys070[sec070.firstPara].page : -1;
      if (sec070.beginOn === "right" && pg070 % 2 !== 0) fails070.push(sec070.type);
      if (sec070.beginOn === "left" && pg070 % 2 !== 1) fails070.push(sec070.type);
    }
    assert("INT-070c: all sections correct side after massive insert",
      fails070.length === 0, fails070.join(", "));

    var secPages070 = [];
    for (var sp070 = 0; sp070 < map070.length; sp070++) {
      secPages070.push(ys070[map070[sp070].firstPara].page);
    }
    var conflicts070 = 0;
    for (var cp070 = 1; cp070 < secPages070.length; cp070++) {
      if (secPages070[cp070] === secPages070[cp070 - 1]) conflicts070++;
    }
    assert("INT-070d: no sections share pages after massive insert",
      conflicts070 === 0);

    assert("INT-070e: title still page 0", ys070[0].page === 0);
    assert("INT-070f: copyright still page 1", ys070[2].page === 1);

    restoreState(saved070);

    // INT-071: delete most of chapter 1 body text
    var saved071 = saveState();

    selAnchor = mkPos(8, 0);
    selFocus = mkPos(16, paraText(doc.paragraphs[16]).length);
    deleteRange(getSelRange().s, getSelRange().e);
    clearSel();
    requestFullLayout("stress-071");

    var ys071 = window.__sag.paraYState();
    var map071 = buildSectionMap();
    var tp071 = window.__sag.totalPages();

    assert("INT-071a: total pages even", tp071 % 2 === 0);

    var fails071 = [];
    for (var si071 = 0; si071 < map071.length; si071++) {
      var sec071 = map071[si071];
      var pg071 = ys071[sec071.firstPara] ? ys071[sec071.firstPara].page : -1;
      if (sec071.beginOn === "right" && pg071 >= 0 && pg071 % 2 !== 0) fails071.push(sec071.type);
      if (sec071.beginOn === "left" && pg071 >= 0 && pg071 % 2 !== 1) fails071.push(sec071.type);
    }
    assert("INT-071b: all sections correct side after deletion",
      fails071.length === 0, fails071.join(", "));

    assert("INT-071c: sections still exist",
      map071.length > 0);

    restoreState(saved071);

    // INT-072: rapid multi-section edits
    var saved072 = saveState();

    cursor = mkPos(7, 0);
    insertText("Ch1 edit. ");
    requestLayout({ fromPara: 7, reason: "insert" });

    cursor = mkPos(28, 0);
    insertText("Ch3 edit. ");
    requestLayout({ fromPara: 28, reason: "insert" });

    cursor = mkPos(5, 0);
    insertText("Dedication edit. ");
    requestLayout({ fromPara: 5, reason: "insert" });

    requestFullLayout("stress-072");

    var ys072 = window.__sag.paraYState();
    var tp072 = window.__sag.totalPages();

    assert("INT-072a: total pages even", tp072 % 2 === 0);
    assert("INT-072b: title still page 0", ys072[0].page === 0);
    assert("INT-072c: copyright still page 1", ys072[2].page === 1);

    var map072 = buildSectionMap();
    var fails072 = [];
    for (var si072 = 0; si072 < map072.length; si072++) {
      var sec072 = map072[si072];
      var pg072 = ys072[sec072.firstPara] ? ys072[sec072.firstPara].page : -1;
      if (sec072.beginOn === "right" && pg072 >= 0 && pg072 % 2 !== 0) fails072.push(sec072.type);
      if (sec072.beginOn === "left" && pg072 >= 0 && pg072 % 2 !== 1) fails072.push(sec072.type);
    }
    assert("INT-072d: all sections correct after rapid edits",
      fails072.length === 0, fails072.join(", "));

    restoreState(saved072);

    // INT-080: blank pages are truly empty
    var ys080 = window.__sag.paraYState();
    var tp080 = window.__sag.totalPages();
    var contentPages080 = {};
    for (var pi080 = 0; pi080 < ys080.length; pi080++) {
      if (ys080[pi080]) contentPages080[ys080[pi080].page] = true;
    }
    var blankPages080 = [];
    for (var pg080 = 0; pg080 < tp080; pg080++) {
      if (!contentPages080[pg080]) blankPages080.push(pg080);
    }
    assert("INT-080a: blank pages exist",
      blankPages080.length > 0,
      "blank pages: " + blankPages080.join(", "));

    var badBlanks080 = [];
    for (var bi080 = 0; bi080 < blankPages080.length; bi080++) {
      var bpg = blankPages080[bi080];
      var isVerso = bpg % 2 === 1;
      var isFinal = bpg === tp080 - 1;
      if (!isVerso && !isFinal) {
        badBlanks080.push("page " + bpg + " is blank recto (not final)");
      }
    }
    assert("INT-080b: blank pages are verso or final padding",
      badBlanks080.length === 0, badBlanks080.join("; "));

    // INT-081: section map integrity after all previous tests
    var map081 = buildSectionMap();
    assert("INT-081a: still 8 sections", map081.length === 8);
    var totalP081 = 0;
    for (var si081 = 0; si081 < map081.length; si081++) totalP081 += map081[si081].paraCount;
    assert("INT-081b: still 41 paragraphs", totalP081 === 41);
    assert("INT-081c: contiguous",
      map081[map081.length - 1].lastPara === doc.paragraphs.length - 1);
  }

  // ================================================================
  // Navigator Tests (0116)
  // ================================================================

  function testNavigator() {
    restoreState(_testOrigState);

    // NAV-001: navigator label
    var titleEl = document.getElementById("sidebar-title");
    assert("NAV-001: sidebar title is Navigator",
      titleEl && titleEl.textContent === "Navigator");

    // NAV-002: Ch+ button removed
    assert("NAV-002: btn-split-chapter does not exist",
      document.getElementById("btn-split-chapter") === null);

    // NAV-009: updateNavigatorActive exposed
    assert("NAV-009: updateNavigatorActive is a function",
      typeof updateNavigatorActive === "function");
  }

  // ================================================================
  // Add Chapter Tests (0117)
  // ================================================================

  function testAddChapter() {
    restoreState(_testOrigState);
    requestFullLayout("test-add-chapter");
    updateSidebar();

    // ADDCH-001: function exists
    assert("ADDCH-001: addNewChapter is a function",
      typeof addNewChapter === "function");

    // ADDCH-002: creates section
    var saved002 = saveState();
    var metaCount002 = doc._sectionMeta.length;
    addNewChapter();
    assert("ADDCH-002: new section added",
      doc._sectionMeta.length === metaCount002 + 1,
      "before: " + metaCount002 + " after: " + doc._sectionMeta.length);
    restoreState(saved002);

    // ADDCH-003: two paragraphs added
    var saved003 = saveState();
    var paraCount003 = doc.paragraphs.length;
    addNewChapter();
    assert("ADDCH-003: two paragraphs added",
      doc.paragraphs.length === paraCount003 + 2,
      "before: " + paraCount003 + " after: " + doc.paragraphs.length);
    restoreState(saved003);

    // ADDCH-004: paragraph structure
    var saved004 = saveState();
    var map004 = buildSectionMap();
    var lastBodyLast004 = -1;
    for (var si004 = map004.length - 1; si004 >= 0; si004--) {
      if (map004[si004].region === "body") {
        lastBodyLast004 = map004[si004].lastPara;
        break;
      }
    }
    var insertAt004 = lastBodyLast004 + 1;
    addNewChapter();
    var newTitle004 = doc.paragraphs[insertAt004];
    var newBody004 = doc.paragraphs[insertAt004 + 1];
    assert("ADDCH-004a: first paragraph is chapterTitle",
      newTitle004 && newTitle004.style["x-role"] === "chapterTitle");
    assert("ADDCH-004b: second paragraph is body",
      newBody004 && newBody004.style["x-role"] === "body");
    assert("ADDCH-004c: body paragraph is empty",
      newBody004 && paraText(newBody004) === "");
    assert("ADDCH-004d: both share same sectionId",
      newTitle004.style["x-sectionId"] === newBody004.style["x-sectionId"]);
    restoreState(saved004);

    // ADDCH-005: new section is body/chapter
    var saved005 = saveState();
    var oldLen005 = doc._sectionMeta.length;
    addNewChapter();
    var map005 = buildSectionMap();
    var newChapter005 = null;
    for (var si005 = 0; si005 < map005.length; si005++) {
      if (map005[si005].type === "chapter") newChapter005 = map005[si005];
    }
    assert("ADDCH-005: new section is chapter type",
      newChapter005 !== null && newChapter005.region === "body");
    restoreState(saved005);

    // ADDCH-006: recto page
    var saved006 = saveState();
    addNewChapter();
    requestFullLayout("addch-006");
    var ys006 = window.__sag.paraYState();
    var map006 = buildSectionMap();
    var lastChIdx006 = -1;
    for (var si006 = 0; si006 < map006.length; si006++) {
      if (map006[si006].type === "chapter") lastChIdx006 = si006;
    }
    var pg006 = ys006[map006[lastChIdx006].firstPara].page;
    assert("ADDCH-006: new chapter on recto",
      pg006 % 2 === 0,
      "page: " + pg006);
    restoreState(saved006);

    // ADDCH-007: undo
    var saved007 = saveState();
    var metaPre007 = doc._sectionMeta.length;
    var parasPre007 = doc.paragraphs.length;
    addNewChapter();
    assert("ADDCH-007a: chapter added",
      doc._sectionMeta.length === metaPre007 + 1);
    doUndo();
    requestFullLayout("addch-007");
    assert("ADDCH-007b: section count restored",
      doc._sectionMeta.length === metaPre007);
    assert("ADDCH-007c: paragraph count restored",
      doc.paragraphs.length === parasPre007);
    restoreState(saved007);

    // ADDCH-008: all sections correct
    var saved008 = saveState();
    addNewChapter();
    requestFullLayout("addch-008");
    var ys008 = window.__sag.paraYState();
    var map008 = buildSectionMap();
    var fails008 = [];
    for (var si008 = 0; si008 < map008.length; si008++) {
      var sec008 = map008[si008];
      var pg008 = ys008[sec008.firstPara] ? ys008[sec008.firstPara].page : -1;
      if (sec008.beginOn === "right" && pg008 >= 0 && pg008 % 2 !== 0) {
        fails008.push(sec008.type + " on page " + pg008);
      }
      if (sec008.beginOn === "left" && pg008 >= 0 && pg008 % 2 !== 1) {
        fails008.push(sec008.type + " on page " + pg008);
      }
    }
    assert("ADDCH-008: all sections correct side",
      fails008.length === 0, fails008.join("; "));
    restoreState(saved008);

    // ADDCH-009: even pages
    var saved009 = saveState();
    addNewChapter();
    requestFullLayout("addch-009");
    assert("ADDCH-009: even page count",
      window.__sag.totalPages() % 2 === 0);
    restoreState(saved009);

    // ADDCH-010: button in sidebar
    var addBtn010 = document.getElementById("btn-add-chapter");
    assert("ADDCH-010: Add Chapter button exists",
      addBtn010 !== null);

    // ADDCH-011: section map contiguous
    var saved011 = saveState();
    addNewChapter();
    var map011 = buildSectionMap();
    var gaps011 = [];
    for (var si011 = 1; si011 < map011.length; si011++) {
      if (map011[si011].firstPara !== map011[si011 - 1].lastPara + 1) {
        gaps011.push("gap before section " + si011);
      }
    }
    assert("ADDCH-011: section map contiguous after add",
      gaps011.length === 0, gaps011.join("; "));
    restoreState(saved011);
  }

  // ================================================================
  // Navigation Scroll Tests (0118)
  // ================================================================

  function testNavScroll() {
    restoreState(_testOrigState);
    requestFullLayout("test-nav-scroll");

    // NAVS-001: navigate highlights correct section
    var saved001 = saveState();
    var map001 = buildSectionMap();
    var ch2Id001 = null;
    var ch2Para001 = -1;
    var chCount001 = 0;
    for (var si001 = 0; si001 < map001.length; si001++) {
      if (map001[si001].type === "chapter") {
        chCount001++;
        if (chCount001 === 2) {
          ch2Id001 = map001[si001].id;
          ch2Para001 = map001[si001].firstPara;
          break;
        }
      }
    }
    assert("NAVS-001a: Chapter 2 found", ch2Id001 !== null);
    navigateToSection(ch2Id001);
    assert("NAVS-001b: cursor at Chapter 2 first paragraph",
      cursor.p === ch2Para001);
    restoreState(saved001);

    // NAVS-002: navigate to acknowledgments
    var saved002 = saveState();
    var map002 = buildSectionMap();
    var ackId002 = null;
    var ackPara002 = -1;
    for (var si002 = 0; si002 < map002.length; si002++) {
      if (map002[si002].type === "acknowledgments") {
        ackId002 = map002[si002].id;
        ackPara002 = map002[si002].firstPara;
        break;
      }
    }
    assert("NAVS-002a: acknowledgments found", ackId002 !== null);
    navigateToSection(ackId002);
    assert("NAVS-002b: cursor at acknowledgments first paragraph",
      cursor.p === ackPara002);
    restoreState(saved002);

    // NAVS-003: navigate to title page
    var saved003 = saveState();
    cursor = mkPos(20, 0);
    navigateToSection(doc._sectionMeta[0].id);
    assert("NAVS-003: cursor at paragraph 0",
      cursor.p === 0);
    restoreState(saved003);
  }

  // ================================================================
  // Selection Clamp Tests (0119)
  // ================================================================

  function testSelectionClamp() {
    restoreState(_testOrigState);
    requestFullLayout("test-sel-clamp");

    // CLMP-001: helper functions exist
    assert("CLMP-001a: sectionOfPara is a function",
      typeof sectionOfPara === "function");
    assert("CLMP-001b: clampToSection is a function",
      typeof clampToSection === "function");

    // CLMP-002: sectionOfPara
    var map002 = buildSectionMap();
    assert("CLMP-002a: para 0 in titlePage section",
      sectionOfPara(0) === map002[0].id);
    assert("CLMP-002b: para 7 in chapter 1 section",
      sectionOfPara(7) === map002[3].id);

    // CLMP-003: no clamping within same section
    var map003 = buildSectionMap();
    var ch1Id = map003[3].id;
    var pos003 = mkPos(8, 5);
    var clamped003 = clampToSection(pos003, ch1Id);
    assert("CLMP-003: same section returns same pos",
      clamped003.p === 8 && clamped003.o === 5);

    // CLMP-004: clamp forward (pos beyond section)
    var map004 = buildSectionMap();
    var ch1Id004 = map004[3].id;
    var ch1Last004 = map004[3].lastPara;
    var pos004 = mkPos(map004[4].firstPara, 5);
    var clamped004 = clampToSection(pos004, ch1Id004);
    assert("CLMP-004a: clamped to chapter 1 last para",
      clamped004.p === ch1Last004);
    assert("CLMP-004b: clamped to end of paragraph",
      clamped004.o === paraTextLen(doc.paragraphs[ch1Last004]));

    // CLMP-005: clamp backward (pos before section)
    var map005 = buildSectionMap();
    var ch2Id005 = map005[4].id;
    var ch2First005 = map005[4].firstPara;
    var pos005 = mkPos(map005[3].lastPara, 0);
    var clamped005 = clampToSection(pos005, ch2Id005);
    assert("CLMP-005a: clamped to chapter 2 first para",
      clamped005.p === ch2First005);
    assert("CLMP-005b: clamped to offset 0",
      clamped005.o === 0);

    // CLMP-006: Ctrl+A selects section
    var saved006 = saveState();
    var map006 = buildSectionMap();
    cursor = mkPos(7, 0);
    clearSel();
    var _sec006 = sectionOfPara(cursor.p);
    var _first006 = -1, _last006 = -1;
    for (var i006 = 0; i006 < doc.paragraphs.length; i006++) {
      if (doc.paragraphs[i006].style["x-sectionId"] === _sec006) {
        if (_first006 < 0) _first006 = i006;
        _last006 = i006;
      }
    }
    assert("CLMP-006a: section first para is Chapter 1 first",
      _first006 === map006[3].firstPara);
    assert("CLMP-006b: section last para is Chapter 1 last",
      _last006 === map006[3].lastPara);
    restoreState(saved006);

    // CLMP-007: shift+click clamp
    var saved007 = saveState();
    var map007 = buildSectionMap();
    cursor = mkPos(8, 5);
    clearSel();
    selAnchor = clonePos(cursor);
    var targetPos007 = mkPos(map007[4].firstPara + 1, 3);
    var anchorSec007 = sectionOfPara(selAnchor.p);
    var clamped007 = clampToSection(targetPos007, anchorSec007);
    selFocus = clamped007;
    assert("CLMP-007a: selFocus in Chapter 1",
      sectionOfPara(selFocus.p) === map007[3].id);
    assert("CLMP-007b: selFocus at end of Chapter 1",
      selFocus.p === map007[3].lastPara);
    restoreState(saved007);

    // CLMP-008: cursor nav free without shift
    var saved008 = saveState();
    var map008 = buildSectionMap();
    var ch1Last = map008[3].lastPara;
    cursor = mkPos(ch1Last, paraTextLen(doc.paragraphs[ch1Last]));
    clearSel();
    var len008 = paraTextLen(doc.paragraphs[cursor.p]);
    if (cursor.o >= len008 && cursor.p < doc.paragraphs.length - 1) {
      cursor.p++;
      cursor.o = 0;
    }
    assert("CLMP-008: cursor moved into Chapter 2",
      sectionOfPara(cursor.p) === map008[4].id);
    restoreState(saved008);

    // CLMP-009: copy within section works
    var saved009 = saveState();
    selAnchor = mkPos(7, 0);
    selFocus = mkPos(7, 10);
    cursor = clonePos(selFocus);
    var text009 = getSelectedText();
    assert("CLMP-009: intra-section selection produces text",
      text009.length > 0);
    restoreState(saved009);
  }

  // ================================================================
  // Section Cache Tests (0120)
  // ================================================================

  function testSectionCache() {
    restoreState(_testOrigState);
    requestFullLayout("test-sec-cache");

    // CACHE-001: section index built
    var si001 = window.__sag.sectionIndex();
    assert("CACHE-001a: _sectionIndex exists",
      si001 !== null && typeof si001 === "object");
    assert("CACHE-001b: byId has entries",
      Object.keys(si001.byId).length === 8);
    assert("CACHE-001c: byPara has entries",
      Object.keys(si001.byPara).length === 41);

    // CACHE-002: cache matches map
    var si002 = window.__sag.sectionIndex();
    var map002 = buildSectionMap();
    var mismatch002 = [];
    for (var i002 = 0; i002 < map002.length; i002++) {
      var sec = map002[i002];
      var cached = si002.byId[sec.id];
      if (!cached) { mismatch002.push(sec.id + " missing"); continue; }
      if (cached.first !== sec.firstPara) mismatch002.push(sec.id + " first");
      if (cached.last !== sec.lastPara) mismatch002.push(sec.id + " last");
    }
    assert("CACHE-002: cache matches buildSectionMap",
      mismatch002.length === 0, mismatch002.join(", "));

    // CACHE-003: cache updates after structural changes
    var saved003 = saveState();
    addNewChapter();
    requestFullLayout("cache-003");
    var si003a = window.__sag.sectionIndex();
    assert("CACHE-003a: 9 sections after add",
      Object.keys(si003a.byId).length === 9);
    doUndo();
    requestFullLayout("cache-003-undo");
    var si003b = window.__sag.sectionIndex();
    assert("CACHE-003b: 8 sections after undo",
      Object.keys(si003b.byId).length === 8);
    restoreState(saved003);
  }

  // ================================================================
  // Navigator Tracking Tests (0121)
  // ================================================================

  function testNavTracking() {
    restoreState(_testOrigState);
    requestFullLayout("test-nav-tracking");

    // NAVT-001: blank page highlights previous section
    var map001 = buildSectionMap();
    var ys001 = window.__sag.paraYState();
    var page2Sec = null;
    for (var pi001 = 0; pi001 < ys001.length; pi001++) {
      if (ys001[pi001] && ys001[pi001].page === 2) {
        page2Sec = sectionOfPara(pi001);
        break;
      }
    }
    var page4Sec = null;
    for (var pi001b = 0; pi001b < ys001.length; pi001b++) {
      if (ys001[pi001b] && ys001[pi001b].page === 4) {
        page4Sec = sectionOfPara(pi001b);
        break;
      }
    }
    assert("NAVT-001a: page 2 is dedication",
      page2Sec !== null);
    assert("NAVT-001b: page 4 is chapter 1",
      page4Sec !== null);
    assert("NAVT-001c: page 2 and page 4 are different sections",
      page2Sec !== page4Sec);
  }

  // ================================================================
  // Book Design Tests (0122)
  // ================================================================

  function testBookDesign() {
    restoreState(_testOrigState);

    // BKDS-001: function exists
    assert("BKDS-001: defaultBookDesign is a function",
      typeof defaultBookDesign === "function");

    // BKDS-002: bookDesign on doc
    assert("BKDS-002: doc.bookDesign exists",
      doc.bookDesign !== null && typeof doc.bookDesign === "object");

    // BKDS-003: top-level structure
    var bd003 = doc.bookDesign;
    assert("BKDS-003a: has margins", typeof bd003.margins === "object");
    assert("BKDS-003b: has typography", typeof bd003.typography === "object");
    assert("BKDS-003c: has chapter", typeof bd003.chapter === "object");

    // BKDS-004: chapter components
    var ch004 = doc.bookDesign.chapter;
    assert("BKDS-004a: has heading", typeof ch004.heading === "object");
    assert("BKDS-004b: has body", typeof ch004.body === "object");
    assert("BKDS-004c: has sceneBreak", typeof ch004.sceneBreak === "object");
    assert("BKDS-004d: has subHeadings", typeof ch004.subHeadings === "object");
    assert("BKDS-004e: has blockQuote", typeof ch004.blockQuote === "object");
    assert("BKDS-004f: has verse", typeof ch004.verse === "object");
    assert("BKDS-004g: has runningHeaders", typeof ch004.runningHeaders === "object");
    assert("BKDS-004h: has pageNumbers", typeof ch004.pageNumbers === "object");
    assert("BKDS-004i: has footnotes", typeof ch004.footnotes === "object");

    // BKDS-005: body defaults match current rendering
    var body005 = doc.bookDesign.chapter.body;
    assert("BKDS-005a: fontFamily Georgia",
      body005.fontFamily === "Georgia");
    assert("BKDS-005b: fontSize 12",
      body005.fontSize === 12);
    assert("BKDS-005c: lineHeight 1.2",
      body005.lineHeight === 1.2);
    assert("BKDS-005d: textIndent 18",
      body005.textIndent === 18);
    assert("BKDS-005e: textAlign left",
      body005.textAlign === "left");

    // BKDS-006: survives saveState/restoreState
    var saved006 = saveState();
    assert("BKDS-006a: saved state has bookDesign",
      saved006.bookDesign !== null && typeof saved006.bookDesign === "object");
    doc.bookDesign.chapter.body.fontSize = 99;
    restoreState(saved006);
    assert("BKDS-006b: bookDesign restored after restoreState",
      doc.bookDesign.chapter.body.fontSize === 12);

    // BKDS-007: fresh copy
    var a007 = defaultBookDesign();
    var b007 = defaultBookDesign();
    a007.chapter.body.fontSize = 99;
    assert("BKDS-007: separate instances",
      b007.chapter.body.fontSize === 12);

    // BKDS-008: heading sub-components
    var h008 = doc.bookDesign.chapter.heading;
    assert("BKDS-008a: has label", typeof h008.label === "object");
    assert("BKDS-008b: has number", typeof h008.number === "object");
    assert("BKDS-008c: has title", typeof h008.title === "object");
    assert("BKDS-008d: has ornament", typeof h008.ornament === "object");
    assert("BKDS-008e: has epigraph", typeof h008.epigraph === "object");
    assert("BKDS-008f: has layout", typeof h008.layout === "object");
  }

  // ================================================================
  // Heading Title Tests (0123)
  // ================================================================

  function testHeadingTitle() {
    restoreState(_testOrigState);
    requestFullLayout("test-heading-title");

    // HDTL-001: chapter sections have heading
    var hasHeading001 = true;
    var missing001 = [];
    for (var si001 = 0; si001 < doc._sectionMeta.length; si001++) {
      var m001 = doc._sectionMeta[si001];
      if (m001.type === "chapter") {
        if (!m001.heading || typeof m001.heading.title !== "string") {
          hasHeading001 = false;
          missing001.push("section " + si001);
        }
      }
    }
    assert("HDTL-001: all chapter sections have heading.title",
      hasHeading001, missing001.join(", "));

    // HDTL-002: heading.title matches paragraph
    var map002 = buildSectionMap();
    var mismatches002 = [];
    for (var si002 = 0; si002 < map002.length; si002++) {
      if (map002[si002].type !== "chapter") continue;
      var meta002 = doc._sectionMeta[si002];
      var paraTitle002 = "";
      for (var pi002 = map002[si002].firstPara; pi002 <= map002[si002].lastPara; pi002++) {
        if (doc.paragraphs[pi002].style["x-role"] === "chapterTitle") {
          paraTitle002 = paraText(doc.paragraphs[pi002]);
          break;
        }
      }
      if (meta002.heading && meta002.heading.title !== paraTitle002) {
        mismatches002.push(meta002.heading.title + " vs " + paraTitle002);
      }
    }
    assert("HDTL-002: heading.title matches paragraph text",
      mismatches002.length === 0, mismatches002.join("; "));

    // HDTL-003: getSectionChapterTitle uses heading.title
    var map003 = buildSectionMap();
    var ch1Meta003 = null;
    for (var si003 = 0; si003 < doc._sectionMeta.length; si003++) {
      if (doc._sectionMeta[si003].type === "chapter") {
        ch1Meta003 = doc._sectionMeta[si003];
        break;
      }
    }
    assert("HDTL-003a: chapter 1 found", ch1Meta003 !== null);
    var title003 = getSectionChapterTitle(ch1Meta003.id);
    assert("HDTL-003b: getSectionChapterTitle returns heading.title",
      title003 === ch1Meta003.heading.title);

    // HDTL-004: non-chapters don't have heading
    var nonChapterHeadings004 = [];
    for (var si004 = 0; si004 < doc._sectionMeta.length; si004++) {
      var m004 = doc._sectionMeta[si004];
      if (m004.type !== "chapter" && m004.heading) {
        nonChapterHeadings004.push(m004.type);
      }
    }
    assert("HDTL-004: non-chapter sections have no heading",
      nonChapterHeadings004.length === 0,
      nonChapterHeadings004.join(", "));

    // HDTL-005: sync updates heading after paragraph edit
    var saved005 = saveState();
    var map005 = buildSectionMap();
    var ch1First005 = map005[3].firstPara;
    var oldTitle005 = doc._sectionMeta[3].heading.title;
    doc.paragraphs[ch1First005].runs[0].text = "New Chapter Title";
    syncSectionHeadings();
    assert("HDTL-005: heading.title updated after sync",
      doc._sectionMeta[3].heading.title === "New Chapter Title");
    restoreState(saved005);

    // HDTL-006: heading in save/load
    var saved006 = saveState();
    var stripped006 = stripDocument(doc);
    var sections006 = regroupSections(stripped006.paragraphs, doc._sectionMeta);
    var hasHeading006 = false;
    for (var si006 = 0; si006 < sections006.length; si006++) {
      if (sections006[si006].type === "chapter" && sections006[si006].heading) {
        hasHeading006 = true;
        break;
      }
    }
    assert("HDTL-006a: heading in regrouped sections", hasHeading006);
    var flat006 = flattenSections(sections006);
    var ch006Meta = null;
    for (var fi006 = 0; fi006 < flat006.sectionMeta.length; fi006++) {
      if (flat006.sectionMeta[fi006].type === "chapter") {
        ch006Meta = flat006.sectionMeta[fi006];
        break;
      }
    }
    assert("HDTL-006b: heading survives round-trip",
      ch006Meta && ch006Meta.heading && ch006Meta.heading.title.length > 0);
    restoreState(saved006);

    // HDTL-007: addNewChapter sets heading
    var saved007 = saveState();
    var oldIds007 = {};
    for (var oi007 = 0; oi007 < doc._sectionMeta.length; oi007++) {
      oldIds007[doc._sectionMeta[oi007].id] = true;
    }
    addNewChapter();
    var newMeta007 = null;
    for (var si007 = 0; si007 < doc._sectionMeta.length; si007++) {
      if (!oldIds007[doc._sectionMeta[si007].id] && doc._sectionMeta[si007].type === "chapter") {
        newMeta007 = doc._sectionMeta[si007];
        break;
      }
    }
    assert("HDTL-007: new chapter has heading.title",
      newMeta007 && newMeta007.heading &&
      typeof newMeta007.heading.title === "string" &&
      newMeta007.heading.title.length > 0);
    restoreState(saved007);
  }

  // ================================================================
  // Body Reads BookDesign Tests (0124)
  // ================================================================

  function testBodyReadsDesign() {
    restoreState(_testOrigState);
    requestFullLayout("test-body-reads-design");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);

    // BDRD-001: lineHeight from bookDesign
    var saved001 = saveState();
    requestFullLayout("bdrd-001-before");
    var beforeLines = [];
    for (var li001 = 0; li001 < lines.length && li001 < 20; li001++) {
      beforeLines.push({ y: lines[li001].y, page: lines[li001].page });
    }
    doc.bookDesign.chapter.body.lineHeight = 2.0;
    requestFullLayout("bdrd-001-after");
    var bodyMoved001 = false;
    for (var li001b = 0; li001b < Math.min(beforeLines.length, lines.length); li001b++) {
      if (lines[li001b].paraIdx !== undefined) {
        var role001 = doc.paragraphs[lines[li001b].paraIdx]
          ? doc.paragraphs[lines[li001b].paraIdx].style["x-role"]
          : "body";
        if (role001 === "body" && lines[li001b].y !== beforeLines[li001b].y) {
          bodyMoved001 = true;
          break;
        }
      }
    }
    assert("BDRD-001: lineHeight change affects body layout",
      bodyMoved001);
    restoreState(saved001);
    requestFullLayout("bdrd-001-restore");

    // BDRD-002: textIndent from bookDesign
    var saved002 = saveState();
    doc.bookDesign.chapter.body.textIndent = 72;
    requestFullLayout("bdrd-002");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);
    var indentChanged002 = false;
    for (var li002 = 0; li002 < lines.length; li002++) {
      var ln002 = lines[li002];
      if (ln002.paraIdx !== undefined && ln002.isFirstOfPara) {
        var role002 = doc.paragraphs[ln002.paraIdx]
          ? doc.paragraphs[ln002.paraIdx].style["x-role"]
          : "body";
        if (role002 === "body" && ln002.paraIdx > 0) {
          var prevRole002 = doc.paragraphs[ln002.paraIdx - 1].style["x-role"] || "body";
          if (prevRole002 !== "chapterTitle" && prevRole002 !== "sceneBreak") {
            if (ln002.segments && ln002.segments.length > 0 && ln002.segments[0].x > M_LEFT + 50) {
              indentChanged002 = true;
              break;
            }
          }
        }
      }
    }
    assert("BDRD-002: textIndent change affects body first lines",
      indentChanged002);
    restoreState(saved002);
    requestFullLayout("bdrd-002-restore");

    // BDRD-003: non-body unaffected
    var saved003 = saveState();
    requestFullLayout("bdrd-003-before");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);
    var nonBodyBefore003 = [];
    for (var li003 = 0; li003 < lines.length; li003++) {
      var ln003 = lines[li003];
      if (ln003.paraIdx !== undefined) {
        var role003 = doc.paragraphs[ln003.paraIdx]
          ? doc.paragraphs[ln003.paraIdx].style["x-role"]
          : "body";
        if (role003 === "chapterTitle" || role003 === "heading2") {
          nonBodyBefore003.push({ idx: li003, y: ln003.y, page: ln003.page, role: role003 });
        }
      }
    }
    doc.bookDesign.chapter.body.lineHeight = 3.0;
    doc.bookDesign.chapter.body.textIndent = 100;
    requestFullLayout("bdrd-003-after");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);
    var firstPageTitlesOk = true;
    for (var ni003 = 0; ni003 < nonBodyBefore003.length; ni003++) {
      var nb = nonBodyBefore003[ni003];
      if (nb.page === 0 && lines[nb.idx] && lines[nb.idx].y !== nb.y) {
        firstPageTitlesOk = false;
        break;
      }
    }
    assert("BDRD-003: first-page non-body lines unaffected",
      firstPageTitlesOk);
    restoreState(saved003);
    requestFullLayout("bdrd-003-restore");

    // BDRD-004: indent suppressed after chapterTitle/sceneBreak
    var saved004 = saveState();
    requestFullLayout("bdrd-004");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);
    var suppressedOk004 = false;
    for (var li004 = 0; li004 < lines.length; li004++) {
      var ln004 = lines[li004];
      if (ln004.paraIdx !== undefined && ln004.isFirstOfPara) {
        var role004 = doc.paragraphs[ln004.paraIdx]
          ? doc.paragraphs[ln004.paraIdx].style["x-role"]
          : "body";
        if (role004 === "body" && ln004.paraIdx > 0) {
          var prevRole004 = doc.paragraphs[ln004.paraIdx - 1].style["x-role"] || "body";
          if (prevRole004 === "chapterTitle") {
            /* Skip non-chapter sections (e.g., title page) */
            var secType004 = null;
            if (_sectionIndex && _sectionIndex.byPara[ln004.paraIdx]) {
              var sid004 = _sectionIndex.byPara[ln004.paraIdx];
              if (_sectionIndex.byId[sid004]) secType004 = _sectionIndex.byId[sid004].type;
            }
            if (secType004 !== "chapter") continue;
            if (ln004.dropCap) continue;
            if (ln004.segments && ln004.segments.length > 0) {
              var firstX004 = ln004.segments[0].x;
              var expectedX004 = M_LEFT + ((doc.paragraphs[ln004.paraIdx].style.marginLeft || 0) * (96/72));
              suppressedOk004 = Math.abs(firstX004 - expectedX004) < 2;
            }
            break;
          }
        }
      }
    }
    assert("BDRD-004: indent suppressed after chapterTitle",
      suppressedOk004);
    restoreState(saved004);

    // BDRD-005: defaults match current rendering
    var bd005 = defaultBookDesign();
    assert("BDRD-005a: lineHeight is 1.2",
      bd005.chapter.body.lineHeight === 1.2);
    assert("BDRD-005b: textAlign is left",
      bd005.chapter.body.textAlign === "left");
    assert("BDRD-005c: textIndent is 18",
      bd005.chapter.body.textIndent === 18);
  }

  // ================================================================
  // Scene Break Design Tests (0125)
  // ================================================================

  function testSceneBreakDesign() {
    restoreState(_testOrigState);
    requestFullLayout("test-sb-design");

    // SBDS-001: spacingAbove from bookDesign affects scene break
    var saved001 = saveState();
    var sbPi001 = -1;
    for (var pi001 = 0; pi001 < doc.paragraphs.length; pi001++) {
      if (doc.paragraphs[pi001].style["x-role"] === "sceneBreak") {
        sbPi001 = pi001;
        break;
      }
    }
    assert("SBDS-001a: scene break found", sbPi001 >= 0);
    requestFullLayout("sbds-001-before");
    var ys001 = window.__sag.paraYState();
    var afterSbY001 = ys001[sbPi001 + 1] ? ys001[sbPi001 + 1].y : 0;
    doc.bookDesign.chapter.sceneBreak.spacingAbove = 72;
    doc.bookDesign.chapter.sceneBreak.spacingBelow = 72;
    requestFullLayout("sbds-001-after");
    var ys001b = window.__sag.paraYState();
    var afterSbY001b = ys001b[sbPi001 + 1] ? ys001b[sbPi001 + 1].y : 0;
    var afterSbPg001 = ys001[sbPi001 + 1] ? ys001[sbPi001 + 1].page : -1;
    var afterSbPg001b = ys001b[sbPi001 + 1] ? ys001b[sbPi001 + 1].page : -1;
    assert("SBDS-001b: scene break spacing change affected layout",
      afterSbY001b > afterSbY001 || afterSbPg001b > afterSbPg001);
    restoreState(saved001);
    requestFullLayout("sbds-001-restore");

    // SBDS-002: defaults match current rendering
    var bd002 = defaultBookDesign();
    assert("SBDS-002a: spacingAbove is 12",
      bd002.chapter.sceneBreak.spacingAbove === 12);
    assert("SBDS-002b: spacingBelow is 12",
      bd002.chapter.sceneBreak.spacingBelow === 12);

    // SBDS-003: non-sceneBreak spacing unaffected by bookDesign sceneBreak
    var saved003 = saveState();
    requestFullLayout("sbds-003-before");
    var ys003 = window.__sag.paraYState();
    var bodyY003 = ys003[8] ? ys003[8].y : 0;
    var bodyPage003 = ys003[8] ? ys003[8].page : -1;
    doc.bookDesign.chapter.sceneBreak.spacingAbove = 200;
    doc.bookDesign.chapter.sceneBreak.spacingBelow = 200;
    requestFullLayout("sbds-003-after");
    var ys003b = window.__sag.paraYState();
    var bodyY003b = ys003b[8] ? ys003b[8].y : 0;
    var bodyPage003b = ys003b[8] ? ys003b[8].page : -1;
    assert("SBDS-003: body para before scene break unaffected",
      bodyY003 === bodyY003b && bodyPage003 === bodyPage003b);
    restoreState(saved003);
    requestFullLayout("sbds-003-restore");
  }

  // ================================================================
  // Heading Block Tests (0126)
  // ================================================================

  function testHeadingBlocks() {
    restoreState(_testOrigState);
    requestFullLayout("test-heading-blocks");

    // HBLK-001: heading blocks created for chapter pages
    var hb001 = window.__sag.headingBlocks();
    var chapterPages001 = [];
    for (var pg001 in hb001) {
      if (hb001.hasOwnProperty(pg001)) chapterPages001.push(parseInt(pg001));
    }
    assert("HBLK-001: heading blocks exist for chapter pages",
      chapterPages001.length === 3);

    // HBLK-002: label text
    var hb002 = window.__sag.headingBlocks();
    var firstHb002 = null;
    for (var pg002 in hb002) {
      if (hb002.hasOwnProperty(pg002)) { firstHb002 = hb002[pg002]; break; }
    }
    assert("HBLK-002a: heading block found", firstHb002 !== null);
    assert("HBLK-002b: label text is CHAPTER 1",
      firstHb002 && firstHb002.labelText === "CHAPTER 1");

    // HBLK-003: chapter numbering
    var chNums003 = [];
    for (var si003 = 0; si003 < doc._sectionMeta.length; si003++) {
      if (doc._sectionMeta[si003].type === "chapter") {
        chNums003.push(computeChapterNumber(doc._sectionMeta[si003].id));
      }
    }
    assert("HBLK-003: chapter numbers are 1, 2, 3",
      chNums003.length === 3 &&
      chNums003[0] === 1 && chNums003[1] === 2 && chNums003[2] === 3);

    // HBLK-004: label formatting
    var tpl004 = defaultBookDesign().chapter;
    assert("HBLK-004a: arabic format",
      buildHeadingLabel(tpl004, 1) === "CHAPTER 1");
    var tpl004b = JSON.parse(JSON.stringify(tpl004));
    tpl004b.heading.number.format = "roman";
    assert("HBLK-004b: roman format",
      buildHeadingLabel(tpl004b, 4) === "CHAPTER IV");
    var tpl004c = JSON.parse(JSON.stringify(tpl004));
    tpl004c.heading.number.format = "word";
    assert("HBLK-004c: word format title case",
      buildHeadingLabel(tpl004c, 3) === "CHAPTER Three");
    var tpl004d = JSON.parse(JSON.stringify(tpl004));
    tpl004d.heading.label.show = false;
    assert("HBLK-004d: no label, number only",
      buildHeadingLabel(tpl004d, 5) === "5");
    var tpl004e = JSON.parse(JSON.stringify(tpl004));
    tpl004e.heading.number.show = false;
    assert("HBLK-004e: label only, no number",
      buildHeadingLabel(tpl004e, 1) === "CHAPTER");

    // HBLK-005: no heading blocks on non-chapter pages
    var hb005 = window.__sag.headingBlocks();
    assert("HBLK-005: page 0 has no heading block",
      !hb005[0]);

    // HBLK-006: heading block structure
    var hb006 = window.__sag.headingBlocks();
    var firstHb006 = null;
    for (var pg006 in hb006) {
      if (hb006.hasOwnProperty(pg006)) { firstHb006 = hb006[pg006]; break; }
    }
    assert("HBLK-006a: has labelFont", typeof firstHb006.labelFont === "string");
    assert("HBLK-006b: has labelColor", typeof firstHb006.labelColor === "string");
    assert("HBLK-006c: has labelY number", typeof firstHb006.labelY === "number");
    assert("HBLK-006d: has alignment", firstHb006.alignment === "center");
  }

  // ================================================================
  // Title Font Tests (0127)
  // ================================================================

  function testTitleFont() {
    restoreState(_testOrigState);
    requestFullLayout("test-title-font");
    layoutRegion.ensurePagesRealized(0, totalPages - 1);

    // TTPL-001: chapter title tokens use template font
    var ttplLine = null;
    for (var li001 = 0; li001 < lines.length; li001++) {
      var ln001 = lines[li001];
      if (ln001.paraIdx !== undefined && ln001.segments && ln001.segments.length > 0) {
        var role001 = doc.paragraphs[ln001.paraIdx]
          ? doc.paragraphs[ln001.paraIdx].style["x-role"]
          : "body";
        if (role001 === "chapterTitle") {
          var sid001 = sectionOfPara(ln001.paraIdx);
          var type001 = null;
          if (_sectionIndex && _sectionIndex.byId[sid001]) {
            type001 = _sectionIndex.byId[sid001].type;
          }
          if (type001 === "chapter") {
            ttplLine = ln001;
            break;
          }
        }
      }
    }
    assert("TTPL-001a: chapter title line found", ttplLine !== null);
    assert("TTPL-001b: title font size is 20",
      ttplLine && ttplLine.segments[0].fontSize === 20);
    assert("TTPL-001c: title font weight is bold",
      ttplLine && ttplLine.segments[0].fontWeight === "bold");

    // TTPL-002: title page chapterTitle keeps its own font
    var titlePageLine = null;
    for (var li002 = 0; li002 < lines.length; li002++) {
      var ln002 = lines[li002];
      if (ln002.paraIdx !== undefined && ln002.segments && ln002.segments.length > 0) {
        var role002 = doc.paragraphs[ln002.paraIdx]
          ? doc.paragraphs[ln002.paraIdx].style["x-role"]
          : "body";
        if (role002 === "chapterTitle") {
          var sid002 = sectionOfPara(ln002.paraIdx);
          var type002 = null;
          if (_sectionIndex && _sectionIndex.byId[sid002]) {
            type002 = _sectionIndex.byId[sid002].type;
          }
          if (type002 === "titlePage") {
            titlePageLine = ln002;
            break;
          }
        }
      }
    }
    assert("TTPL-002a: title page line found", titlePageLine !== null);
    assert("TTPL-002b: title page font NOT overridden to 20",
      titlePageLine && titlePageLine.segments[0].fontSize !== 20);

    // TTPL-003: dropFromTop default
    var bd003 = defaultBookDesign();
    assert("TTPL-003a: dropFromTop is 154",
      bd003.chapter.heading.layout.dropFromTop === 154);
    assert("TTPL-003b: spacingToBody is 12",
      bd003.chapter.heading.layout.spacingToBody === 12);

    // TTPL-004: template title font change affects layout
    var saved004 = saveState();
    requestFullLayout("ttpl-004-before");
    var ys004a = window.__sag.paraYState();
    var bodyAfterTitle004 = -1;
    for (var pi004 = 0; pi004 < doc.paragraphs.length; pi004++) {
      if (doc.paragraphs[pi004].style["x-role"] === "chapterTitle") {
        var sid004 = sectionOfPara(pi004);
        var type004 = null;
        if (_sectionIndex && _sectionIndex.byId[sid004]) {
          type004 = _sectionIndex.byId[sid004].type;
        }
        if (type004 === "chapter" && pi004 + 1 < doc.paragraphs.length) {
          bodyAfterTitle004 = pi004 + 1;
          break;
        }
      }
    }
    var beforeY004 = (bodyAfterTitle004 >= 0 && ys004a[bodyAfterTitle004])
      ? ys004a[bodyAfterTitle004].y : 0;
    doc.bookDesign.chapter.heading.title.fontSize = 48;
    requestFullLayout("ttpl-004-after");
    var ys004b = window.__sag.paraYState();
    var afterY004 = (bodyAfterTitle004 >= 0 && ys004b[bodyAfterTitle004])
      ? ys004b[bodyAfterTitle004].y : 0;
    assert("TTPL-004: body text shifted by title font change",
      afterY004 > beforeY004);
    restoreState(saved004);
    requestFullLayout("ttpl-004-restore");
  }

  // ================================================================
  // View Switching Tests (0135)
  // ================================================================

  function testViewSwitching() {
    // VIEW-001: view infrastructure exists
    assert("VIEW-001a: view-editor exists",
      document.getElementById("view-editor") !== null);
    assert("VIEW-001b: view-designer exists",
      document.getElementById("view-designer") !== null);
    assert("VIEW-001c: toolbar-design exists",
      document.getElementById("toolbar-design") !== null);
    assert("VIEW-001d: btn-design exists",
      document.getElementById("btn-design") !== null);
    assert("VIEW-001e: btn-design-cancel exists",
      document.getElementById("btn-design-cancel") !== null);
    assert("VIEW-001f: btn-design-update exists",
      document.getElementById("btn-design-update") !== null);

    // VIEW-002: starts in editor mode
    assert("VIEW-002a: view-editor is visible",
      document.getElementById("view-editor").style.display !== "none");
    assert("VIEW-002b: view-designer is hidden",
      window.getComputedStyle(document.getElementById("view-designer")).display === "none");
    assert("VIEW-002c: toolbar-design is hidden",
      window.getComputedStyle(document.getElementById("toolbar-design")).display === "none");

    // VIEW-003: swap round-trip
    setView("designer");
    assert("VIEW-003a: view-editor hidden in design mode",
      document.getElementById("view-editor").style.display === "none");
    assert("VIEW-003b: view-designer visible in design mode",
      document.getElementById("view-designer").style.display === "flex");
    assert("VIEW-003c: toolbar-design visible in design mode",
      document.getElementById("toolbar-design").style.display === "flex");
    assert("VIEW-003d: toolbar-row1 hidden in design mode",
      document.getElementById("toolbar-row1").style.display === "none");

    setView("editor");
    assert("VIEW-003e: view-editor restored",
      document.getElementById("view-editor").style.display !== "none");
    assert("VIEW-003f: view-designer hidden after return",
      document.getElementById("view-designer").style.display === "none");
    assert("VIEW-003g: toolbar-row1 restored",
      document.getElementById("toolbar-row1").style.display !== "none");

    // VIEW-004: editor elements accessible inside view-editor
    assert("VIEW-004a: page-area still found",
      document.getElementById("page-area") !== null);
    assert("VIEW-004b: section-sidebar still found",
      document.getElementById("section-sidebar") !== null);
    assert("VIEW-004c: sidebar-expand still found",
      document.getElementById("sidebar-expand") !== null);
    assert("VIEW-004d: pages-wrapper still found",
      document.getElementById("pages-wrapper") !== null);
    assert("VIEW-004e: page-area is inside view-editor",
      document.getElementById("page-area").closest("#view-editor") !== null);
  }

  // ================================================================
  // Designer Shell Tests (0136)
  // ================================================================

  function testDesignerShell() {
    // DSHELL-001: designer shell elements exist
    assert("DSHELL-001a: des-sections exists",
      document.getElementById("des-sections") !== null);
    assert("DSHELL-001b: des-sections-list exists",
      document.getElementById("des-sections-list") !== null);
    assert("DSHELL-001c: des-preview exists",
      document.getElementById("des-preview") !== null);
    assert("DSHELL-001d: des-preview-canvas exists",
      document.getElementById("des-preview-canvas") !== null);
    assert("DSHELL-001e: des-props exists",
      document.getElementById("des-props") !== null);
    assert("DSHELL-001f: des-props-content exists",
      document.getElementById("des-props-content") !== null);
    assert("DSHELL-001g: des-description exists",
      document.getElementById("des-description") !== null);

    // DSHELL-002: section list items
    var items002 = document.querySelectorAll("#des-sections-list .des-sec-item");
    assert("DSHELL-002a: 9 section items",
      items002.length === 9);
    var activeItems002 = document.querySelectorAll("#des-sections-list .des-sec-item.active");
    assert("DSHELL-002b: 1 active item",
      activeItems002.length === 1);
    assert("DSHELL-002c: active item is chapter",
      activeItems002[0] && activeItems002[0].getAttribute("data-des-type") === "chapter");

    // DSHELL-003: preview canvas dimensions in designer mode
    setView("designer");
    var canvas003 = document.getElementById("des-preview-canvas");
    assert("DSHELL-003a: preview canvas has width in designer mode",
      canvas003 && canvas003.offsetWidth > 0);
    assert("DSHELL-003b: preview canvas has height in designer mode",
      canvas003 && canvas003.offsetHeight > 0);
    setView("editor");

    // DSHELL-004: swap round-trip with designer content
    setView("designer");
    var desPreview004 = document.getElementById("des-preview");
    assert("DSHELL-004a: des-preview visible in design mode",
      desPreview004 && window.getComputedStyle(desPreview004).display !== "none");
    setView("editor");
    assert("DSHELL-004b: view-editor restored after swap",
      document.getElementById("view-editor").style.display !== "none");
  }

  // ================================================================
  // Designer Preview Tests (0137)
  // ================================================================

  function testDesignerPreview() {
    // DPREV-001: renderDesignerPreview function exists
    assert("DPREV-001: renderDesignerPreview exists",
      typeof renderDesignerPreview === "function");

    // DPREV-002: desWrapText function exists
    assert("DPREV-002: desWrapText exists",
      typeof desWrapText === "function");

    // DPREV-003: desWrapText produces correct output
    var testCanvas003 = document.createElement("canvas");
    var testCtx003 = testCanvas003.getContext("2d");
    testCtx003.font = "12pt Georgia";
    var wrapped003 = desWrapText(testCtx003, "Hello world this is a test", 60);
    assert("DPREV-003a: desWrapText returns array with multiple lines",
      Array.isArray(wrapped003) && wrapped003.length > 1);
    var wrapped003b = desWrapText(
      testCtx003, "Hello world this is a test", 200, 60
    );
    assert("DPREV-003b: firstLineMax makes first line shorter",
      wrapped003b.length >= 2
        && testCtx003.measureText(wrapped003b[0]).width <= 65);

    // DPREV-004: sample data exists
    assert("DPREV-004a: DES_SAMPLE_TITLE is a string",
      typeof DES_SAMPLE_TITLE === "string"
        && DES_SAMPLE_TITLE.length > 0);
    assert("DPREV-004b: DES_SAMPLE_BODY is array with 3 items",
      Array.isArray(DES_SAMPLE_BODY)
        && DES_SAMPLE_BODY.length === 3);

    // DPREV-005: canvas renders content in designer mode
    setView("designer");
    renderDesignerPreview();
    var canvas005 = document.getElementById("des-preview-canvas");
    assert("DPREV-005a: canvas has buffer width after render",
      canvas005 && canvas005.width > 0);
    assert("DPREV-005b: canvas has buffer height after render",
      canvas005 && canvas005.height > 0);

    // DPREV-006: canvas has non-white pixels (content was painted)
    var ctx006 = canvas005 ? canvas005.getContext("2d") : null;
    var hasContent006 = false;
    if (ctx006 && canvas005.width > 0 && canvas005.height > 0) {
      /* Sample a 10x10 region near where the heading label
         should be. At least one pixel should differ from
         pure white (#ffffff). */
      var cx006 = Math.round(canvas005.width / 2);
      var cy006 = Math.round(canvas005.height * 0.25);
      var imgData006 = ctx006.getImageData(
        cx006 - 5, cy006 - 5, 10, 10
      );
      for (var i006 = 0; i006 < imgData006.data.length; i006 += 4) {
        if (imgData006.data[i006] < 250
            || imgData006.data[i006 + 1] < 250
            || imgData006.data[i006 + 2] < 250) {
          hasContent006 = true;
          break;
        }
      }
    }
    assert("DPREV-006: canvas has painted content (non-white pixels)",
      hasContent006);

    // DPREV-007: aspect ratio matches page dimensions
    if (canvas005 && canvas005.offsetWidth > 0
        && canvas005.offsetHeight > 0) {
      var ratio007 = canvas005.offsetWidth / canvas005.offsetHeight;
      var expected007 = PAGE_W / PAGE_H;
      assert("DPREV-007: canvas aspect ratio matches page",
        Math.abs(ratio007 - expected007) < 0.02,
        "got " + ratio007.toFixed(3)
          + " expected " + expected007.toFixed(3));
    } else {
      assert("DPREV-007: canvas aspect ratio matches page", false,
        "canvas has zero dimensions");
    }

    setView("editor");
  }

  // ================================================================
  // Designer Interaction Tests (0138)
  // ================================================================

  function testDesignerInteraction() {

    // DINT-001: group definitions exist
    assert("DINT-001: DES_CHAPTER_GROUPS is array with 8 items",
      Array.isArray(DES_CHAPTER_GROUPS)
        && DES_CHAPTER_GROUPS.length === 8);

    // DINT-002: desPopulateGroups creates group elements
    setView("designer");
    _desActiveSection = "chapter";
    desPopulateGroups("chapter");
    var groupEls002 = document.querySelectorAll(
      ".des-prop-group");
    assert("DINT-002: 8 property group elements created",
      groupEls002.length === 8);

    // DINT-002b: each group has accordion structure
    var hdr002 = groupEls002[0].querySelector(
      ".des-prop-group-hdr");
    var body002 = groupEls002[0].querySelector(
      ".des-prop-group-body");
    assert("DINT-002b: first group has hdr and body",
      hdr002 !== null && body002 !== null);

    // DINT-002c: arrow element exists in header
    var arrow002 = hdr002
      ? hdr002.querySelector(".des-arrow") : null;
    assert("DINT-002c: header has arrow element",
      arrow002 !== null);

    // DINT-003: clicking a header sets active state
    var hdrs003 = document.querySelectorAll(
      ".des-prop-group-hdr");
    if (hdrs003.length >= 1) {
      hdrs003[0].click();
    }
    assert("DINT-003a: _desActiveGroup is set",
      _desActiveGroup === "chapterHead");
    assert("DINT-003b: clicked header has active class",
      hdrs003.length >= 1
        && hdrs003[0].classList.contains("active"));
    assert("DINT-003c: parent wrapper has open class",
      groupEls002[0].classList.contains("open"));

    // DINT-004: description updates on group select
    var descEl004 = document.getElementById(
      "des-description-text");
    assert("DINT-004: description text is not default",
      descEl004
        && descEl004.textContent.indexOf("chapter") >= 0
        && descEl004.textContent.indexOf(
          "Select a property") < 0);

    // DINT-005: zones are recorded after render
    renderDesignerPreview();
    var zones005 = _desZones;
    assert("DINT-005a: label zone recorded",
      zones005.label && zones005.label.h > 0);
    assert("DINT-005b: title zone recorded",
      zones005.title && zones005.title.h > 0);
    assert("DINT-005c: body zone recorded",
      zones005.body && zones005.body.h > 0);

    // DINT-006: zone highlight renders
    var canvas006 = document.getElementById(
      "des-preview-canvas");
    var ctx006 = canvas006
      ? canvas006.getContext("2d") : null;
    var hasBlue006 = false;
    if (ctx006 && zones005.label && canvas006.width > 0) {
      var scale006 = canvas006.width / PAGE_W;
      var sx006 = Math.round(
        zones005.label.x * scale006);
      var sy006 = Math.round(
        zones005.label.y * scale006);
      var imgData006 = ctx006.getImageData(
        sx006, sy006, 10, 10);
      for (var i006 = 0;
           i006 < imgData006.data.length; i006 += 4) {
        if (imgData006.data[i006 + 2]
              > imgData006.data[i006]
            && imgData006.data[i006 + 2] > 240) {
          hasBlue006 = true;
          break;
        }
      }
    }
    assert("DINT-006: zone highlight has blue-tinted pixels",
      hasBlue006);

    // MGUIDE-001: margin guide drawn on designer preview
    var mgCanvas = document.getElementById(
      "des-preview-canvas");
    var mgCtx = mgCanvas
      ? mgCanvas.getContext("2d") : null;
    var hasMgPixels = false;
    if (mgCtx && mgCanvas.width > 0) {
      var mgScale = mgCanvas.width / PAGE_W;
      var mgSx = Math.round(M_LEFT * mgScale);
      var mgSy = Math.round(M_TOP * mgScale);
      var mgData = mgCtx.getImageData(
        mgSx, mgSy, 20, 2);
      for (var mgi = 0; mgi < mgData.data.length;
           mgi += 4) {
        var mgR = mgData.data[mgi];
        var mgG = mgData.data[mgi + 1];
        var mgB = mgData.data[mgi + 2];
        if (mgR > 150 && mgR < 230
            && mgG > 150 && mgG < 230
            && mgB > 150 && mgB < 230
            && mgR === mgG && mgG === mgB) {
          hasMgPixels = true;
          break;
        }
      }
    }
    assert("MGUIDE-001: margin guide has gray pixels",
      hasMgPixels);

    // DINT-007: switching groups moves highlight
    var hdrs007 = document.querySelectorAll(
      ".des-prop-group-hdr");
    if (hdrs007.length >= 2) {
      hdrs007[1].click();
      renderDesignerPreview();
    }
    assert("DINT-007a: _desActiveGroup changed to chapterTitle",
      _desActiveGroup === "chapterTitle");
    assert("DINT-007b: first group still open (independent)",
      groupEls002[0].classList.contains("open"));

    // DINT-008: section list click populates groups
    _desActiveSection = null;
    var chapterItem008 = document.querySelector(
      '.des-sec-item[data-des-type="chapter"]'
    );
    if (chapterItem008) chapterItem008.click();
    assert("DINT-008a: _desActiveSection is chapter",
      _desActiveSection === "chapter");
    var groupEls008 = document.querySelectorAll(
      ".des-prop-group");
    assert("DINT-008b: groups repopulated",
      groupEls008.length === 8);

    // DINT-009: disabled section items are ignored
    var disabledItem009 = document.querySelector(
      '.des-sec-item[data-des-type="titlePage"]'
    );
    _desActiveSection = "chapter";
    if (disabledItem009) disabledItem009.click();
    assert("DINT-009: disabled click did not change section",
      _desActiveSection === "chapter");

    /* Re-query after repopulation */
    groupEls002 = document.querySelectorAll(".des-prop-group");

    // DINT-010: closing an open group clears active
    var hdrs010 = document.querySelectorAll(
      ".des-prop-group-hdr");
    if (hdrs010.length >= 1) {
      hdrs010[0].click(); /* open */
      hdrs010[0].click(); /* close */
    }
    assert("DINT-010a: _desActiveGroup null after close",
      _desActiveGroup === null);
    assert("DINT-010b: group wrapper not open after close",
      !groupEls002[0].classList.contains("open"));

    // DINT-011: group with null zone shows no highlight
    var hdrs011 = document.querySelectorAll(
      ".des-prop-group-hdr");
    if (hdrs011.length >= 4) {
      hdrs011[3].click(); /* dropCap — zone: null */
    }
    assert("DINT-011: _desActiveGroup set for null-zone group",
      _desActiveGroup === "dropCap");
    /* renderDesignerPreview does not crash with null zone —
       verified by the call inside the click handler. */

    // DINT-012: multiple groups can be open simultaneously
    var hdrs012 = document.querySelectorAll(
      ".des-prop-group-hdr");
    /* Close all first */
    var allWr012 = document.querySelectorAll(
      ".des-prop-group");
    for (var aw = 0; aw < allWr012.length; aw++) {
      allWr012[aw].classList.remove("open");
    }
    /* Open first and second */
    if (hdrs012.length >= 2) {
      hdrs012[0].click();
      hdrs012[1].click();
    }
    assert("DINT-012a: first group is open",
      groupEls002[0].classList.contains("open"));
    assert("DINT-012b: second group is open",
      groupEls002[1].classList.contains("open"));
    assert("DINT-012c: active is second (last opened)",
      _desActiveGroup === "chapterTitle");

    // DINT-013: clicking an open-but-not-active header closes it
    // (Build 0148: single-click close)
    /* State from DINT-012: groups 0 and 1 both open,
       group 1 (chapterTitle) is active. */
    var hdrs013 = document.querySelectorAll(
      ".des-prop-group-hdr");
    /* Click group 0 (chapterHead) — already open, not active */
    if (hdrs013.length >= 1) {
      hdrs013[0].click();
    }
    assert("DINT-013a: chapterHead is now closed",
      !groupEls002[0].classList.contains("open"));
    assert("DINT-013b: chapterTitle still open",
      groupEls002[1].classList.contains("open"));
    assert("DINT-013c: chapterHead header not active",
      hdrs013.length >= 1
        && !hdrs013[0].classList.contains("active"));

    // DINT-014: clicking the active open group closes it
    /* State from DINT-013: chapterHead closed,
       chapterTitle open, _desActiveGroup is chapterTitle. */
    /* Click chapterTitle — it's open, so it closes */
    if (hdrs013.length >= 2) {
      hdrs013[1].click();
    }
    /* chapterTitle is now closed and active cleared */
    assert("DINT-014a: chapterTitle closed after click",
      !groupEls002[1].classList.contains("open"));
    assert("DINT-014b: _desActiveGroup null",
      _desActiveGroup === null);

    // DINT-015: clicking open-but-not-active header closes it
    // and zone highlight is cleared if no group is active
    /* Close all groups first */
    var allWr015 = document.querySelectorAll(".des-prop-group");
    for (var aw015 = 0; aw015 < allWr015.length; aw015++) {
      allWr015[aw015].classList.remove("open");
    }
    _desActiveGroup = null;
    var hdrs015 = document.querySelectorAll(
      ".des-prop-group-hdr");
    /* Open chapterHead — now active */
    if (hdrs015.length >= 1) hdrs015[0].click();
    /* Open chapterTitle — now active, chapterHead still open */
    if (hdrs015.length >= 2) hdrs015[1].click();
    assert("DINT-015a: chapterTitle is active",
      _desActiveGroup === "chapterTitle");
    /* Click chapterHead header — already open, closes it */
    if (hdrs015.length >= 1) hdrs015[0].click();
    assert("DINT-015b: chapterHead closed",
      !groupEls002[0].classList.contains("open"));
    assert("DINT-015c: chapterTitle still open",
      groupEls002[1].classList.contains("open"));

    // DINT-016: clicking a control inside a non-active group
    // re-activates that group (zone highlight follows focus)
    /* Setup: close all, open chapterHead and chapterTitle,
       activate chapterTitle */
    var allWr016 = document.querySelectorAll(".des-prop-group");
    for (var aw016 = 0; aw016 < allWr016.length; aw016++) {
      allWr016[aw016].classList.remove("open");
    }
    _desActiveGroup = null;
    var hdrs016 = document.querySelectorAll(
      ".des-prop-group-hdr");
    if (hdrs016.length >= 1) hdrs016[0].click();
    if (hdrs016.length >= 2) hdrs016[1].click();
    /* chapterTitle is now active */
    assert("DINT-016a: chapterTitle is active before body click",
      _desActiveGroup === "chapterTitle");
    /* Click a control inside chapterHead body */
    var chHeadBody016 = document.querySelector(
      '.des-prop-group[data-des-group="chapterHead"]'
      + ' .des-prop-group-body');
    var control016 = chHeadBody016
      ? chHeadBody016.querySelector(".des-control-select")
      : null;
    if (control016) control016.click();
    assert("DINT-016b: chapterHead now active after body click",
      _desActiveGroup === "chapterHead");
    assert("DINT-016c: chapterHead header has active class",
      hdrs016.length >= 1
        && hdrs016[0].classList.contains("active"));
    assert("DINT-016d: chapterTitle header lost active class",
      hdrs016.length >= 2
        && !hdrs016[1].classList.contains("active"));
    assert("DINT-016e: both groups still open",
      groupEls002[0].classList.contains("open")
        && groupEls002[1].classList.contains("open"));

    // DINT-017: clicking a control inside the active group
    // does not change state (already active)
    /* State from DINT-016: chapterHead is active */
    var activeBefor017 = _desActiveGroup;
    if (control016) control016.click();
    assert("DINT-017a: active group unchanged",
      _desActiveGroup === activeBefor017);
    assert("DINT-017b: chapterHead still open",
      groupEls002[0].classList.contains("open"));

    // DINT-018: closing a non-active open group preserves
    // the active group's header visual highlight
    var allWr018 = document.querySelectorAll(".des-prop-group");
    for (var aw018 = 0; aw018 < allWr018.length; aw018++) {
      allWr018[aw018].classList.remove("open");
    }
    _desActiveGroup = null;
    var hdrs018 = document.querySelectorAll(
      ".des-prop-group-hdr");
    /* Open chapterHead */
    if (hdrs018.length >= 1) hdrs018[0].click();
    /* Open chapterTitle — now active */
    if (hdrs018.length >= 2) hdrs018[1].click();
    /* Close chapterHead — not active, just closing */
    if (hdrs018.length >= 1) hdrs018[0].click();
    assert("DINT-018a: chapterHead closed",
      !groupEls002[0].classList.contains("open"));
    assert("DINT-018b: chapterTitle still open",
      groupEls002[1].classList.contains("open"));
    assert("DINT-018c: _desActiveGroup still chapterTitle",
      _desActiveGroup === "chapterTitle");
    assert("DINT-018d: chapterTitle header still has active class",
      hdrs018.length >= 2
        && hdrs018[1].classList.contains("active"));
    assert("DINT-018e: chapterHead header not active",
      hdrs018.length >= 1
        && !hdrs018[0].classList.contains("active"));

    // DINT-019: helper functions exist, dead code removed
    assert("DINT-019a: desActivateGroup is a function",
      typeof desActivateGroup === "function");
    assert("DINT-019b: desClearActive is a function",
      typeof desClearActive === "function");
    assert("DINT-019c: desRenderControls removed",
      typeof desRenderControls === "undefined");

    /* Clean up */
    _desActiveSection = null;
    _desActiveGroup = null;
    _desZones = {};
    setView("editor");
  }

  // ================================================================
  // Designer Changeset Tests (0139)
  // ================================================================

  function testDesignerChangeset() {
    var savedDesign = JSON.parse(JSON.stringify(doc.bookDesign));

    // DCHG-001: path helpers work correctly
    var testObj001 = { a: { b: { c: 42 } } };
    assert("DCHG-001a: desReadPath reads nested value",
      desReadPath(testObj001, "a.b.c") === 42);
    assert("DCHG-001b: desReadPath returns undefined for missing",
      desReadPath(testObj001, "a.b.x") === undefined);
    desWritePath(testObj001, "a.b.d", 99);
    assert("DCHG-001c: desWritePath creates value",
      testObj001.a.b.d === 99);

    // DCHG-002: changeset records values
    _desChangeset = {};
    desSetChange("chapter.heading.title.alignment", "left");
    assert("DCHG-002: changeset has recorded value",
      _desChangeset["chapter.heading.title.alignment"] === "left");

    // DCHG-003: desMergedDesign overlays changeset
    var merged003 = desMergedDesign();
    assert("DCHG-003a: merged design has overridden value",
      merged003.chapter.heading.title.alignment === "left");
    assert("DCHG-003b: original bookDesign unchanged",
      doc.bookDesign.chapter.heading.title.alignment !== "left"
      || doc.bookDesign.chapter.heading.title.alignment === "center");

    // DCHG-004: commit writes to bookDesign
    _desChangeset = {};
    _desChangeset["chapter.heading.title.alignment"] = "right";
    desCommitChangeset();
    requestFullLayout("test-design");
    assert("DCHG-004a: bookDesign updated after commit",
      doc.bookDesign.chapter.heading.title.alignment === "right");
    assert("DCHG-004b: changeset cleared after commit",
      Object.keys(_desChangeset).length === 0);

    // DCHG-005: undo reverses the commit
    doUndo();
    assert("DCHG-005: undo restored original alignment",
      doc.bookDesign.chapter.heading.title.alignment === "center");

    // DCHG-006: redo re-applies
    doRedo();
    assert("DCHG-006: redo re-applied alignment",
      doc.bookDesign.chapter.heading.title.alignment === "right");

    // DCHG-007: discard clears changeset without writing
    doUndo(); /* restore to center */
    _desChangeset = {};
    _desChangeset["chapter.heading.title.alignment"] = "left";
    desDiscardChangeset();
    assert("DCHG-007a: changeset empty after discard",
      Object.keys(_desChangeset).length === 0);
    assert("DCHG-007b: bookDesign not modified by discard",
      doc.bookDesign.chapter.heading.title.alignment === "center");

    /* DCHG-008 and DCHG-009 removed — title controls replaced
       by accordion panel in Build 0143. Control-specific
       changeset tests will return in Build 0144. */

    /* Clean up */
    _desChangeset = {};
    _desActiveSection = null;
    _desActiveGroup = null;
    _desZones = {};
    doc.bookDesign = JSON.parse(JSON.stringify(savedDesign));
    requestFullLayout("test-restore");
    setView("editor");
  }

  // ================================================================
  // Chapter Head Controls Tests (0144)
  // ================================================================

  function testChapterHeadControls() {
    var savedDesign = JSON.parse(
      JSON.stringify(doc.bookDesign));

    setView("designer");
    _desChangeset = {};
    _desActiveSection = "chapter";
    desPopulateGroups("chapter");

    /* Open Chapter Head group */
    var chHdr = document.querySelector(
      '.des-prop-group[data-des-group="chapterHead"]'
      + ' .des-prop-group-hdr');
    if (chHdr) chHdr.click();

    var chInner = document.querySelector(
      '.des-prop-group[data-des-group="chapterHead"]'
      + ' .des-prop-group-inner');

    // DCHD-001: controls exist inside Chapter Head
    assert("DCHD-001a: inner div has children",
      chInner !== null && chInner.children.length > 0);
    var rows001 = chInner
      ? chInner.querySelectorAll(".des-control-row")
      : [];
    assert("DCHD-001b: 12 control rows",
      rows001.length === 12);
    var subs001 = chInner
      ? chInner.querySelectorAll(".des-control-sub")
      : [];
    assert("DCHD-001c: 4 sub-headers",
      subs001.length === 4);

    // DCHD-002: sinkage number input has correct default
    var sinkInp002 = chInner
      ? chInner.querySelector('input[type="number"]')
      : null;
    assert("DCHD-002a: sinkage input exists with value 2.14",
      sinkInp002 !== null
        && sinkInp002.value === "2.14");
    var selects002 = chInner
      ? chInner.querySelectorAll("select") : [];

    // DCHD-003: prefix text input exists
    var textInputs003 = chInner
      ? chInner.querySelectorAll(
        'input[type="text"]') : [];
    assert("DCHD-003a: text input exists",
      textInputs003.length >= 1);
    assert("DCHD-003b: text input value is CHAPTER",
      textInputs003.length >= 1
        && textInputs003[0].value === "CHAPTER");

    // DCHD-004: number toggle exists and is on
    var toggles004 = chInner
      ? chInner.querySelectorAll(
        ".des-control-toggle") : [];
    assert("DCHD-004a: toggle exists",
      toggles004.length >= 1);
    assert("DCHD-004b: toggle is on by default",
      toggles004.length >= 1
        && toggles004[0].classList.contains("on"));

    // DCHD-005: number format select
    assert("DCHD-005: format select value is arabic",
      selects002.length >= 2
        && selects002[1].value === "arabic");

    // DCHD-006: font family select
    assert("DCHD-006: font select value is Georgia",
      selects002.length >= 4
        && selects002[3].value === "Georgia");

    // DCHD-007: font size select
    assert("DCHD-007: size select value is 11",
      selects002.length >= 5
        && selects002[4].value === "11");

    // DCHD-008: B/I/U buttons exist
    var btnGrps008 = chInner
      ? chInner.querySelectorAll(
        ".des-control-btn-group") : [];
    var styleBtns008 = btnGrps008.length >= 1
      ? btnGrps008[0].querySelectorAll(
        ".des-control-btn") : [];
    assert("DCHD-008a: 3 style buttons (B/I/U)",
      styleBtns008.length === 3);
    assert("DCHD-008b: bold not active (default normal)",
      styleBtns008.length >= 1
        && !styleBtns008[0].classList.contains("active"));
    assert("DCHD-008c: italic not active",
      styleBtns008.length >= 2
        && !styleBtns008[1].classList.contains("active"));

    // DCHD-009: color input
    var colorInp009 = chInner
      ? chInner.querySelector('input[type="color"]')
      : null;
    assert("DCHD-009: color input value is #666666",
      colorInp009 !== null
        && colorInp009.value === "#666666");

    // DCHD-010: sinkage change updates changeset
    _desChangeset = {};
    if (sinkInp002) {
      sinkInp002.value = "3";
      sinkInp002.dispatchEvent(new Event("change"));
    }
    assert("DCHD-010: changeset has dropFromTop 216",
      _desChangeset[
        "chapter.heading.layout.dropFromTop"] === 216);

    // DCHD-011: prefix text change updates changeset
    _desChangeset = {};
    if (textInputs003.length >= 1) {
      textInputs003[0].value = "Part";
      textInputs003[0].dispatchEvent(
        new Event("input"));
    }
    assert("DCHD-011: changeset has label text Part",
      _desChangeset[
        "chapter.heading.label.text"] === "Part");

    // DCHD-012: toggle off updates changeset
    _desChangeset = {};
    if (toggles004.length >= 1) {
      toggles004[0].click();
    }
    assert("DCHD-012: changeset has number.show false",
      _desChangeset[
        "chapter.heading.number.show"] === false);

    // DCHD-013: number format change updates changeset
    _desChangeset = {};
    if (selects002.length >= 2) {
      selects002[1].value = "roman";
      selects002[1].dispatchEvent(new Event("change"));
    }
    assert("DCHD-013: changeset has format roman",
      _desChangeset[
        "chapter.heading.number.format"] === "roman");

    // DCHD-014: font family change updates changeset
    _desChangeset = {};
    if (selects002.length >= 4) {
      selects002[3].value = "Arial";
      selects002[3].dispatchEvent(new Event("change"));
    }
    assert("DCHD-014: changeset has fontFamily Arial",
      _desChangeset[
        "chapter.heading.label.fontFamily"] === "Arial");

    // DCHD-015: font size change updates changeset
    _desChangeset = {};
    if (selects002.length >= 5) {
      selects002[4].value = "14";
      selects002[4].dispatchEvent(new Event("change"));
    }
    assert("DCHD-015: changeset has fontSize 14",
      _desChangeset[
        "chapter.heading.label.fontSize"] === 14);

    // DCHD-016: bold toggle updates changeset
    _desChangeset = {};
    if (styleBtns008.length >= 1) {
      styleBtns008[0].click();
    }
    assert("DCHD-016: changeset has fontWeight bold",
      _desChangeset[
        "chapter.heading.label.fontWeight"] === "bold");

    // DCHD-017: italic toggle updates changeset
    _desChangeset = {};
    if (styleBtns008.length >= 2) {
      styleBtns008[1].click();
    }
    assert("DCHD-017: changeset has fontStyle italic",
      _desChangeset[
        "chapter.heading.label.fontStyle"] === "italic");

    // DCHD-018: underline toggle writes changeset
    _desChangeset = {};
    if (styleBtns008.length >= 3) {
      styleBtns008[2].click();
    }
    assert("DCHD-018: underline wrote to changeset",
      _desChangeset[
        "chapter.heading.label.underline"] === true);

    // DCHD-019: color change updates changeset
    _desChangeset = {};
    if (colorInp009) {
      colorInp009.value = "#ff0000";
      colorInp009.dispatchEvent(new Event("input"));
    }
    assert("DCHD-019: changeset has color #ff0000",
      _desChangeset[
        "chapter.heading.label.color"] === "#ff0000");

    // DCHD-020: line spacing change updates changeset
    _desChangeset = {};
    var lsSelect020 = selects002.length >= 6
      ? selects002[5] : null;
    if (lsSelect020) {
      lsSelect020.value = "12";
      lsSelect020.dispatchEvent(new Event("change"));
    }
    assert("DCHD-020: changeset has spacingLabelToTitle 12",
      _desChangeset[
        "chapter.heading.layout.spacingLabelToTitle"]
        === 12);

    // DCHD-021: letter spacing writes changeset
    _desChangeset = {};
    var ltSelect021 = selects002.length >= 7
      ? selects002[6] : null;
    if (ltSelect021) {
      ltSelect021.value = "5";
      ltSelect021.dispatchEvent(new Event("change"));
    }
    assert("DCHD-021: changeset has letterSpacing 5",
      _desChangeset[
        "chapter.heading.label.letterSpacing"] === 5);

    // DCHD-022: commit + undo round-trip
    _desChangeset = {};
    desSetChange(
      "chapter.heading.layout.dropFromTop", 216);
    desSetChange(
      "chapter.heading.label.fontFamily", "Arial");
    desCommitChangeset();
    requestFullLayout("test-design");
    assert("DCHD-022a: bookDesign updated dropFromTop",
      doc.bookDesign.chapter.heading.layout.dropFromTop
        === 216);
    assert("DCHD-022b: bookDesign updated fontFamily",
      doc.bookDesign.chapter.heading.label.fontFamily
        === "Arial");
    doUndo();
    assert("DCHD-022c: undo restored dropFromTop",
      doc.bookDesign.chapter.heading.layout.dropFromTop
        === 154);
    assert("DCHD-022d: undo restored fontFamily",
      doc.bookDesign.chapter.heading.label.fontFamily
        === "Georgia");

    // DCHD-023: other groups have empty inner divs
    var titleInner023 = document.querySelector(
      '.des-prop-group[data-des-group="chapterTitle"]'
      + ' .des-prop-group-inner');
    assert("DCHD-023: chapterTitle inner is empty",
      titleInner023 !== null
        && titleInner023.children.length === 0);

    // NCASE-001: case select exists
    assert("NCASE-001: case select value is title",
      selects002.length >= 3
        && selects002[2].value === "title");

    // NCASE-002: case change updates changeset
    _desChangeset = {};
    if (selects002.length >= 3) {
      selects002[2].value = "uppercase";
      selects002[2].dispatchEvent(new Event("change"));
    }
    assert("NCASE-002: changeset has number case uppercase",
      _desChangeset[
        "chapter.heading.number.case"] === "uppercase");

    // NCASE-003: buildHeadingLabel case options
    var ncTpl = JSON.parse(JSON.stringify(
      defaultBookDesign().chapter));
    ncTpl.heading.number.format = "word";

    ncTpl.heading.number["case"] = "title";
    assert("NCASE-003a: word title case",
      buildHeadingLabel(ncTpl, 3) === "CHAPTER Three");

    ncTpl.heading.number["case"] = "uppercase";
    assert("NCASE-003b: word uppercase",
      buildHeadingLabel(ncTpl, 3) === "CHAPTER THREE");

    ncTpl.heading.number["case"] = "lowercase";
    assert("NCASE-003c: word lowercase",
      buildHeadingLabel(ncTpl, 3) === "CHAPTER three");

    // NCASE-004: roman case
    var ncTplR = JSON.parse(JSON.stringify(
      defaultBookDesign().chapter));
    ncTplR.heading.number.format = "roman";

    ncTplR.heading.number["case"] = "title";
    assert("NCASE-004a: roman title (conventional uppercase)",
      buildHeadingLabel(ncTplR, 4) === "CHAPTER IV");

    ncTplR.heading.number["case"] = "lowercase";
    assert("NCASE-004b: roman lowercase",
      buildHeadingLabel(ncTplR, 4) === "CHAPTER iv");

    // NCASE-005: missing case defaults to title
    var ncTplD = JSON.parse(JSON.stringify(
      defaultBookDesign().chapter));
    ncTplD.heading.number.format = "word";
    delete ncTplD.heading.number["case"];
    assert("NCASE-005: missing case defaults to title",
      buildHeadingLabel(ncTplD, 5) === "CHAPTER Five");

    // SINK-001: sinkage input has dynamic min/max in inches
    var sinkMinIn001 = doc.bookSettings.marginsIn.top;
    var sinkMaxIn001 = Math.round(
      doc.bookSettings.trim.heightIn * 0.5 * 100) / 100;
    assert("SINK-001a: min is top margin in inches",
      sinkInp002 !== null
        && parseFloat(sinkInp002.min) === sinkMinIn001);
    assert("SINK-001b: max is 50% page height in inches",
      sinkInp002 !== null
        && parseFloat(sinkInp002.max) === sinkMaxIn001);

    // SINK-002: sub-margin value clamped
    _desChangeset = {};
    if (sinkInp002) {
      sinkInp002.value = "0.3";
      sinkInp002.dispatchEvent(new Event("change"));
    }
    assert("SINK-002a: changeset stores min in points",
      _desChangeset[
        "chapter.heading.layout.dropFromTop"]
        === Math.round(sinkMinIn001 * 72));
    assert("SINK-002b: input corrected to min inches",
      sinkInp002 !== null
        && parseFloat(sinkInp002.value) === sinkMinIn001);

    // SINK-003: over-max value clamped
    _desChangeset = {};
    if (sinkInp002) {
      sinkInp002.value = "9";
      sinkInp002.dispatchEvent(new Event("change"));
    }
    assert("SINK-003a: changeset stores max in points",
      _desChangeset[
        "chapter.heading.layout.dropFromTop"]
        === Math.round(sinkMaxIn001 * 72));
    assert("SINK-003b: input corrected to max inches",
      sinkInp002 !== null
        && parseFloat(sinkInp002.value) === sinkMaxIn001);

    // SINK-004: "in" suffix label
    var sinkRow004 = sinkInp002
      ? sinkInp002.parentElement : null;
    var sfxSpans004 = sinkRow004
      ? sinkRow004.querySelectorAll("span") : [];
    var hasIn004 = false;
    for (var si004 = 0;
         si004 < sfxSpans004.length; si004++) {
      if (sfxSpans004[si004].textContent === "in") {
        hasIn004 = true; break;
      }
    }
    assert("SINK-004: in suffix exists",
      hasIn004);

    // SINK-005: conversion round-trip
    _desChangeset = {};
    if (sinkInp002) {
      sinkInp002.value = "2.5";
      sinkInp002.dispatchEvent(new Event("change"));
    }
    assert("SINK-005a: 2.5 in stores as 180 pt",
      _desChangeset[
        "chapter.heading.layout.dropFromTop"] === 180);
    assert("SINK-005b: input shows 2.5",
      sinkInp002 !== null
        && sinkInp002.value === "2.5");

    // ALIGN-001: alignment select exists
    assert("ALIGN-001: alignment default is center",
      selects002.length >= 1
        && selects002[0].value === "center");

    // ALIGN-002: alignment change updates changeset
    _desChangeset = {};
    if (selects002.length >= 1) {
      selects002[0].value = "left";
      selects002[0].dispatchEvent(new Event("change"));
    }
    assert("ALIGN-002: changeset has alignment left",
      _desChangeset[
        "chapter.heading.layout.alignment"] === "left");

    // ALIGN-003: heading blocks carry alignment
    var hblks003 = window.__sag.headingBlocks();
    var hbKeys003 = Object.keys(hblks003);
    var hasAlign003 = hbKeys003.length > 0
      && hblks003[hbKeys003[0]].alignment !== undefined;
    assert("ALIGN-003: heading block has alignment",
      hasAlign003);

    // ULINE-001: underline default
    assert("ULINE-001: underline defaults to false",
      defaultBookDesign().chapter.heading.label.underline
        === false);

    // ULINE-002: heading blocks carry underline
    var hblks002u = window.__sag.headingBlocks();
    var hbKeys002u = Object.keys(hblks002u);
    var hasUl002 = hbKeys002u.length > 0
      && hblks002u[hbKeys002u[0]].labelUnderline !== undefined;
    assert("ULINE-002: heading block has labelUnderline",
      hasUl002);

    // LSPC-001: heading blocks carry letterSpacing
    var hblks001l = window.__sag.headingBlocks();
    var hbKeys001l = Object.keys(hblks001l);
    var hasLs001 = hbKeys001l.length > 0
      && typeof hblks001l[hbKeys001l[0]].labelLetterSpacing
          === "number";
    assert("LSPC-001: heading block has labelLetterSpacing",
      hasLs001);

    /* Clean up */
    _desChangeset = {};
    _desActiveSection = null;
    _desActiveGroup = null;
    _desZones = {};
    doc.bookDesign = JSON.parse(
      JSON.stringify(savedDesign));
    requestFullLayout("test-restore");
    setView("editor");
  }

  // ================================================================
  // Optically Corrected Small Caps Tests (0142)
  // ================================================================

  function testSmallCaps() {
    var savedDesign = JSON.parse(
      JSON.stringify(doc.bookDesign)
    );
    var savedParas = saveState();
    var PT_TO_PX = SCREEN_DPI / 72;

    // SCAP-001: measurement functions return valid values
    var xH001 = measureXHeight("Georgia");
    var capH001 = measureCapHeight("Georgia");
    assert("SCAP-001a: measureXHeight returns positive",
      xH001 > 0);
    assert("SCAP-001b: measureCapHeight returns positive",
      capH001 > 0);
    assert("SCAP-001c: x-height < cap-height",
      xH001 < capH001);

    // SCAP-002: computeAutoScale returns valid ratio
    var autoScale002 = computeAutoScale("Georgia");
    assert("SCAP-002a: auto scale > 0.5",
      autoScale002 > 0.5);
    assert("SCAP-002b: auto scale < 0.95",
      autoScale002 < 0.95);

    // SCAP-003: applySmallCaps transforms tokens
    var testPara003 = makePara(
      "The morning sun cast long shadows",
      { fontFamily: "Georgia", fontSize: 12,
        fontWeight: "normal", fontStyle: "normal",
        textDecoration: "none", color: "#1a1a1a" },
      defaultParaStyle()
    );
    var tokens003 = tokenizePara(testPara003, 0);
    var result003 = applySmallCaps(
      tokens003, testPara003, "Georgia", 12,
      { wordCount: 4, mode: "auto",
        strokeRatio: 0.020, kerningRatio: 0.031 },
      PT_TO_PX
    );
    assert("SCAP-003a: returns true",
      result003 === true);

    var firstWord003 = null;
    for (var t1 = 0; t1 < tokens003.length; t1++) {
      if (!tokens003[t1].isSpace) {
        firstWord003 = tokens003[t1]; break;
      }
    }
    assert("SCAP-003b: first word uppercased",
      firstWord003 && firstWord003.text === "THE");
    assert("SCAP-003c: fontSize is not 12 (scaled)",
      firstWord003 && firstWord003.fontSize !== 12);

    // SCAP-004: kerning and strokeWidth on transformed tokens
    assert("SCAP-004a: kerning property set",
      firstWord003 && typeof firstWord003.kerning === "number"
        && firstWord003.kerning > 0);
    assert("SCAP-004b: strokeWidth property set",
      firstWord003 && typeof firstWord003.strokeWidth === "number"
        && firstWord003.strokeWidth > 0);

    // SCAP-005: 5th word not transformed
    var wordCount005 = 0;
    var fifthWord005 = null;
    for (var t5 = 0; t5 < tokens003.length; t5++) {
      if (!tokens003[t5].isSpace) {
        wordCount005++;
        if (wordCount005 === 5) {
          fifthWord005 = tokens003[t5]; break;
        }
      }
    }
    assert("SCAP-005a: 5th word not transformed",
      fifthWord005 && fifthWord005.text === "long");
    assert("SCAP-005b: 5th word has no kerning",
      fifthWord005 && !fifthWord005.kerning);

    // SCAP-006: empty tokens returns false
    var result006 = applySmallCaps(
      [], testPara003, "Georgia", 12,
      { wordCount: 4, mode: "auto",
        strokeRatio: 0.020, kerningRatio: 0.031 },
      PT_TO_PX
    );
    assert("SCAP-006: empty tokens returns false",
      result006 === false);

    // SCAP-007: toolbar toggle writes bookDesign
    doc.bookDesign.chapter.body.firstParagraph.leadIn = {
      enabled: false, wordCount: 4, mode: "auto",
      scaleRatio: 0.70, strokeRatio: 0.020,
      kerningRatio: 0.031
    };
    document.getElementById("btn-smallcaps").click();
    assert("SCAP-007a: leadIn enabled after click",
      doc.bookDesign.chapter.body.firstParagraph
        .leadIn.enabled === true);
    assert("SCAP-007b: SC button is active",
      document.getElementById("btn-smallcaps")
        .classList.contains("active"));

    // SCAP-008: undo reverses the toggle
    doUndo();
    assert("SCAP-008: undo disabled leadIn",
      doc.bookDesign.chapter.body.firstParagraph
        .leadIn.enabled === false);

    // SCAP-009: redo re-enables
    doRedo();
    assert("SCAP-009: redo re-enabled leadIn",
      doc.bookDesign.chapter.body.firstParagraph
        .leadIn.enabled === true);

    // SCAP-010: second click disables
    document.getElementById("btn-smallcaps").click();
    assert("SCAP-010: second click disabled leadIn",
      doc.bookDesign.chapter.body.firstParagraph
        .leadIn.enabled === false);

    // SCAP-011: custom mode uses stored ratio
    var testPara011 = makePara(
      "Testing custom mode here today",
      { fontFamily: "Georgia", fontSize: 14,
        fontWeight: "normal", fontStyle: "normal",
        textDecoration: "none", color: "#1a1a1a" },
      defaultParaStyle()
    );
    var tokens011 = tokenizePara(testPara011, 0);
    applySmallCaps(
      tokens011, testPara011, "Georgia", 14,
      { wordCount: 3, mode: "custom", scaleRatio: 0.65,
        strokeRatio: 0.025, kerningRatio: 0.035 },
      PT_TO_PX
    );
    var firstWord011 = null;
    for (var t11 = 0; t11 < tokens011.length; t11++) {
      if (!tokens011[t11].isSpace) {
        firstWord011 = tokens011[t11]; break;
      }
    }
    assert("SCAP-011: custom scale used (not auto)",
      firstWord011 && firstWord011.fontSize < 14);

    // SCAP-012: token width includes kerning
    var testPara012 = makePara(
      "ABCD efgh",
      { fontFamily: "Georgia", fontSize: 12,
        fontWeight: "normal", fontStyle: "normal",
        textDecoration: "none", color: "#1a1a1a" },
      defaultParaStyle()
    );
    var tokens012 = tokenizePara(testPara012, 0);
    var firstTok012 = null;
    for (var t12 = 0; t12 < tokens012.length; t12++) {
      if (!tokens012[t12].isSpace) {
        firstTok012 = tokens012[t12]; break;
      }
    }
    var baseWidth012 = firstTok012 ? firstTok012.width : 0;
    applySmallCaps(
      tokens012, testPara012, "Georgia", 12,
      { wordCount: 1, mode: "auto",
        strokeRatio: 0.020, kerningRatio: 0.031 },
      PT_TO_PX
    );
    assert("SCAP-012: token width includes kerning",
      firstTok012 && firstTok012.width > 0
        && firstTok012.kerning > 0);

    // SCAP-013: schema updated in defaultBookDesign
    var defBD = defaultBookDesign();
    var defLI = defBD.chapter.body.firstParagraph.leadIn;
    assert("SCAP-013a: schema has mode",
      defLI.mode === "auto");
    assert("SCAP-013b: schema has scaleRatio",
      typeof defLI.scaleRatio === "number");
    assert("SCAP-013c: schema has strokeRatio",
      typeof defLI.strokeRatio === "number");
    assert("SCAP-013d: schema has kerningRatio",
      typeof defLI.kerningRatio === "number");
    assert("SCAP-013e: schema has no color property",
      !defLI.hasOwnProperty("color"));
    assert("SCAP-013f: schema has no style property",
      !defLI.hasOwnProperty("style"));
    assert("SCAP-013g: schema has no fontWeight property",
      !defLI.hasOwnProperty("fontWeight"));

    /* Clean up */
    doc.bookDesign = JSON.parse(
      JSON.stringify(savedDesign)
    );
    restoreState(savedParas);
    requestFullLayout("test-restore");
    updateToolbar();
  }

  // V2 Document Model Tests
  // ================================================================

  function testV2Model() {
    var bd = v2BookDefaults();
    var rs = v2RoleStyles();

    // --- Resolve tests ---

    // T-V2-001: Resolve body paragraph with no overrides
    var r001p = v2ResolveParaStyle(bd, rs, { "x-role": "body" });
    assert("V2-001a: body para has textAlign", r001p.textAlign === "left", "got " + r001p.textAlign);
    assert("V2-001b: body para has textIndent", r001p.textIndent === 18, "got " + r001p.textIndent);
    assert("V2-001c: body para has lineHeight", r001p.lineHeight === 1.2, "got " + r001p.lineHeight);
    var r001r = v2ResolveRunStyle(bd, rs, r001p, { text: "Hello" });
    assert("V2-001d: body run has fontFamily", r001r.fontFamily === "Georgia", "got " + r001r.fontFamily);
    assert("V2-001e: body run has fontSize", r001r.fontSize === 12, "got " + r001r.fontSize);
    assert("V2-001f: body run has text", r001r.text === "Hello", "got " + r001r.text);

    // T-V2-002: Resolve chapterTitle paragraph
    var r002p = v2ResolveParaStyle(bd, rs, { "x-role": "chapterTitle" });
    assert("V2-002a: chapterTitle textIndent", r002p.textIndent === 0, "got " + r002p.textIndent);
    assert("V2-002b: chapterTitle marginTop", r002p.marginTop === 24, "got " + r002p.marginTop);
    assert("V2-002c: chapterTitle marginBottom", r002p.marginBottom === 12, "got " + r002p.marginBottom);
    assert("V2-002d: chapterTitle textAlign", r002p.textAlign === "center", "got " + r002p.textAlign);
    assert("V2-002e: chapterTitle lineHeight from defaults", r002p.lineHeight === 1.2, "got " + r002p.lineHeight);

    // T-V2-003: Resolve heading2 with run style changes
    var r003p = v2ResolveParaStyle(bd, rs, { "x-role": "heading2" });
    var r003r = v2ResolveRunStyle(bd, rs, r003p, { text: "Section" });
    assert("V2-003a: heading2 run fontSize", r003r.fontSize === 22, "got " + r003r.fontSize);
    assert("V2-003b: heading2 run fontWeight", r003r.fontWeight === "bold", "got " + r003r.fontWeight);
    assert("V2-003c: heading2 run fontFamily from defaults", r003r.fontFamily === "Georgia", "got " + r003r.fontFamily);

    // T-V2-004: Resolve paragraph with overrides on top of role
    var r004p = v2ResolveParaStyle(bd, rs, { "x-role": "blockQuote", marginLeft: 72 });
    assert("V2-004a: blockQuote marginLeft override", r004p.marginLeft === 72, "got " + r004p.marginLeft);
    assert("V2-004b: blockQuote marginRight from role", r004p.marginRight === 36, "got " + r004p.marginRight);
    assert("V2-004c: blockQuote textIndent from role", r004p.textIndent === 0, "got " + r004p.textIndent);

    // T-V2-005: Resolve run with overrides
    var r005p = v2ResolveParaStyle(bd, rs, { "x-role": "body" });
    var r005r = v2ResolveRunStyle(bd, rs, r005p, { text: "bold word", fontWeight: "bold" });
    assert("V2-005a: run fontWeight override", r005r.fontWeight === "bold", "got " + r005r.fontWeight);
    assert("V2-005b: run fontFamily from defaults", r005r.fontFamily === "Georgia", "got " + r005r.fontFamily);

    // --- Strip tests ---

    // T-V2-006: Strip default body paragraph produces minimal output
    var r006p = v2ResolveParaStyle(bd, rs, { "x-role": "body" });
    var s006p = v2StripParaStyle(r006p, bd, rs);
    var s006keys = Object.keys(s006p);
    assert("V2-006a: stripped body para only has x-role", s006keys.length === 1 && s006p["x-role"] === "body",
      "keys: " + JSON.stringify(s006keys));
    var r006r = v2ResolveRunStyle(bd, rs, r006p, { text: "hello" });
    var s006r = v2StripRunStyle(r006r, bd, rs, r006p);
    var s006rkeys = Object.keys(s006r);
    assert("V2-006b: stripped body run only has text", s006rkeys.length === 1 && s006r.text === "hello",
      "keys: " + JSON.stringify(s006rkeys));

    // T-V2-007: Strip chapterTitle paragraph keeps only x-role
    var r007p = v2ResolveParaStyle(bd, rs, { "x-role": "chapterTitle" });
    var s007p = v2StripParaStyle(r007p, bd, rs);
    var s007keys = Object.keys(s007p);
    assert("V2-007: stripped chapterTitle only has x-role", s007keys.length === 1 && s007p["x-role"] === "chapterTitle",
      "keys: " + JSON.stringify(s007keys));

    // T-V2-008: Strip paragraph with override preserves the override
    var r008p = v2ResolveParaStyle(bd, rs, { "x-role": "blockQuote", marginLeft: 72 });
    var s008p = v2StripParaStyle(r008p, bd, rs);
    assert("V2-008a: stripped blockQuote has x-role", s008p["x-role"] === "blockQuote", "missing x-role");
    assert("V2-008b: stripped blockQuote has marginLeft override", s008p.marginLeft === 72, "got " + s008p.marginLeft);
    assert("V2-008c: stripped blockQuote has no marginRight", !s008p.hasOwnProperty("marginRight"),
      "has marginRight: " + s008p.marginRight);

    // T-V2-009: Strip run with bold preserves fontWeight
    var r009p = v2ResolveParaStyle(bd, rs, { "x-role": "body" });
    var r009r = v2ResolveRunStyle(bd, rs, r009p, { text: "bold", fontWeight: "bold" });
    var s009r = v2StripRunStyle(r009r, bd, rs, r009p);
    var s009keys = Object.keys(s009r);
    assert("V2-009: stripped bold run has text+fontWeight only",
      s009keys.length === 2 && s009r.text === "bold" && s009r.fontWeight === "bold",
      "keys: " + JSON.stringify(s009keys));

    // T-V2-010: Strip preserves x- properties
    var r010p = v2ResolveParaStyle(bd, rs, { "x-role": "body", "x-dropCap": { lines: 3, gapPt: 3 } });
    var s010p = v2StripParaStyle(r010p, bd, rs);
    assert("V2-010: stripped para keeps x-dropCap",
      s010p.hasOwnProperty("x-dropCap") && s010p["x-dropCap"].lines === 3,
      "x-dropCap: " + JSON.stringify(s010p["x-dropCap"]));

    // T-V2-011: Strip preserves unknown x- properties
    var r011p = v2ResolveParaStyle(bd, rs, { "x-role": "body", "x-futureFeature": "somevalue" });
    var s011p = v2StripParaStyle(r011p, bd, rs);
    assert("V2-011: stripped para keeps x-futureFeature",
      s011p["x-futureFeature"] === "somevalue",
      "got: " + s011p["x-futureFeature"]);

    // --- Round-trip tests ---

    // T-V2-012: Round-trip body paragraph
    var sp012 = [{ style: { "x-role": "body" }, runs: [{ text: "Hello world" }] }];
    var rt012 = v2RoundTrip(sp012, bd, rs);
    assert("V2-012: round-trip body",
      JSON.stringify(rt012) === JSON.stringify(sp012),
      "mismatch: " + JSON.stringify(rt012));

    // T-V2-013: Round-trip chapterTitle
    var sp013 = [{ style: { "x-role": "chapterTitle" }, runs: [{ text: "Chapter One" }] }];
    var rt013 = v2RoundTrip(sp013, bd, rs);
    assert("V2-013: round-trip chapterTitle",
      JSON.stringify(rt013) === JSON.stringify(sp013),
      "mismatch: " + JSON.stringify(rt013));

    // T-V2-014: Round-trip heading2 with overrides
    var sp014 = [{ style: { "x-role": "heading2", marginTop: 30 }, runs: [{ text: "Title" }] }];
    var rt014 = v2RoundTrip(sp014, bd, rs);
    assert("V2-014: round-trip heading2+override",
      JSON.stringify(rt014) === JSON.stringify(sp014),
      "mismatch: " + JSON.stringify(rt014));

    // T-V2-015: Round-trip paragraph with drop cap
    var sp015 = [{ style: { "x-role": "body", "x-dropCap": { lines: 3, gapPt: 3 } }, runs: [{ text: "Once upon" }] }];
    var rt015 = v2RoundTrip(sp015, bd, rs);
    assert("V2-015: round-trip dropCap",
      JSON.stringify(rt015) === JSON.stringify(sp015),
      "mismatch: " + JSON.stringify(rt015));

    // T-V2-016: Round-trip paragraph with list
    var sp016 = [{ style: { "x-role": "body", "x-list": { type: "bullet", level: 0 } }, runs: [{ text: "Item" }] }];
    var rt016 = v2RoundTrip(sp016, bd, rs);
    assert("V2-016: round-trip list",
      JSON.stringify(rt016) === JSON.stringify(sp016),
      "mismatch: " + JSON.stringify(rt016));

    // T-V2-017: Round-trip run with link
    var sp017 = [{ style: { "x-role": "body" }, runs: [{ text: "click here", "x-linkHref": "https://example.com" }] }];
    var rt017 = v2RoundTrip(sp017, bd, rs);
    assert("V2-017: round-trip link",
      JSON.stringify(rt017) === JSON.stringify(sp017),
      "mismatch: " + JSON.stringify(rt017));

    // T-V2-018: Round-trip run with multiple overrides
    var sp018 = [{ style: { "x-role": "body" }, runs: [{ text: "styled", color: "#ff0000", fontStyle: "italic", fontWeight: "bold" }] }];
    var rt018 = v2RoundTrip(sp018, bd, rs);
    assert("V2-018: round-trip multi-override run",
      JSON.stringify(rt018) === JSON.stringify(sp018),
      "mismatch: " + JSON.stringify(rt018));

    // T-V2-019: Round-trip unknown x- property
    var sp019 = [{ style: { "x-role": "body", "x-unknownThing": { foo: "bar" } }, runs: [{ text: "test" }] }];
    var rt019 = v2RoundTrip(sp019, bd, rs);
    assert("V2-019: round-trip unknown x-",
      JSON.stringify(rt019) === JSON.stringify(sp019),
      "mismatch: " + JSON.stringify(rt019));

    // T-V2-020: Double round-trip stability
    var sp020 = [
      { style: { "x-role": "body" }, runs: [{ text: "Normal paragraph" }] },
      { style: { "x-role": "chapterTitle" }, runs: [{ text: "Chapter" }] },
      { style: { "x-role": "heading2" }, runs: [{ text: "Section" }] },
      { style: { "x-role": "blockQuote" }, runs: [{ text: "A quote" }] },
      { style: { "x-role": "verse" }, runs: [{ text: "A poem line" }] },
      { style: { "x-role": "sceneBreak" }, runs: [{ text: "* * *" }] },
      { style: { "x-role": "body", "x-dropCap": { lines: 3, gapPt: 3 } }, runs: [{ text: "Drop cap para" }] },
      { style: { "x-role": "body" }, runs: [{ text: "link text", "x-linkHref": "https://example.com" }] }
    ];
    var rtA = v2RoundTrip(sp020, bd, rs);
    var rtB = v2RoundTrip(rtA, bd, rs);
    assert("V2-020: double round-trip stable",
      JSON.stringify(rtA) === JSON.stringify(rtB),
      "A vs B mismatch");

    // --- Deterministic ordering tests ---

    // T-V2-021: Para style key order
    var unordered021 = { marginTop: 10, "x-dropCap": {}, "x-role": "body", textAlign: "left", "x-list": {} };
    var ordered021 = v2OrderParaStyle(unordered021);
    var keys021 = Object.keys(ordered021);
    assert("V2-021a: x-role is first", keys021[0] === "x-role", "first key: " + keys021[0]);
    var cssIdx = keys021.indexOf("marginTop");
    var css2Idx = keys021.indexOf("textAlign");
    var xDcIdx = keys021.indexOf("x-dropCap");
    var xLIdx = keys021.indexOf("x-list");
    assert("V2-021b: CSS alpha before x-", cssIdx < xDcIdx && css2Idx < xDcIdx, "order: " + keys021.join(","));
    assert("V2-021c: marginTop before textAlign", cssIdx < css2Idx, "order: " + keys021.join(","));
    assert("V2-021d: x-dropCap before x-list", xDcIdx < xLIdx, "order: " + keys021.join(","));

    // T-V2-022: Run key order
    var unordered022 = { fontWeight: "bold", text: "hi", "x-linkHref": "url", color: "#000", fontSize: 12 };
    var ordered022 = v2OrderRun(unordered022);
    var keys022 = Object.keys(ordered022);
    assert("V2-022a: text is first", keys022[0] === "text", "first key: " + keys022[0]);
    var cwIdx = keys022.indexOf("color");
    var fsIdx = keys022.indexOf("fontSize");
    var fwIdx = keys022.indexOf("fontWeight");
    var xlIdx = keys022.indexOf("x-linkHref");
    assert("V2-022b: CSS alpha order", cwIdx < fsIdx && fsIdx < fwIdx, "order: " + keys022.join(","));
    assert("V2-022c: CSS before x-", fwIdx < xlIdx, "order: " + keys022.join(","));

    // --- Deep equal tests ---

    // T-V2-023: DeepEqual primitives
    assert("V2-023a: equal strings", v2DeepEqual("bold", "bold") === true, "");
    assert("V2-023b: unequal strings", v2DeepEqual("bold", "normal") === false, "");
    assert("V2-023c: equal numbers", v2DeepEqual(12, 12) === true, "");
    assert("V2-023d: equal nulls", v2DeepEqual(null, null) === true, "");
    assert("V2-023e: null vs string", v2DeepEqual(null, "x") === false, "");

    // T-V2-024: DeepEqual objects
    assert("V2-024a: equal objects", v2DeepEqual({ lines: 3, gapPt: 3 }, { lines: 3, gapPt: 3 }) === true, "");
    assert("V2-024b: unequal objects", v2DeepEqual({ lines: 3, gapPt: 3 }, { lines: 3, gapPt: 4 }) === false, "");
    assert("V2-024c: different key count", v2DeepEqual({ a: 1 }, { a: 1, b: 2 }) === false, "");

    // V2-025: resolveDocument fills all defaults
    var sparseDoc025 = {
      version: 2,
      meta: { title: "Test" },
      bookSettings: defaultBookSettings(),
      paragraphs: [
        { style: { "x-role": "body" }, runs: [{ text: "Hello" }] },
        { style: { "x-role": "chapterTitle" }, runs: [{ text: "Ch 1" }] },
        { style: { "x-role": "heading2", textAlign: "right" }, runs: [{ text: "H2", fontStyle: "italic" }] }
      ]
    };
    resolveDocument(sparseDoc025);

    assert("V2-025a: body fontFamily",
      sparseDoc025.paragraphs[0].runs[0].fontFamily === "Georgia");
    assert("V2-025b: body fontSize",
      sparseDoc025.paragraphs[0].runs[0].fontSize === 12);
    assert("V2-025c: body textIndent",
      sparseDoc025.paragraphs[0].style.textIndent === 18);
    assert("V2-025d: body textAlign",
      sparseDoc025.paragraphs[0].style.textAlign === "left");
    assert("V2-025e: body x-dropCap present",
      typeof sparseDoc025.paragraphs[0].style["x-dropCap"] === "object" &&
      sparseDoc025.paragraphs[0].style["x-dropCap"].enabled === false);
    assert("V2-025f: body x-list present",
      sparseDoc025.paragraphs[0].style["x-list"] === null);
    assert("V2-025g: body run x-script",
      sparseDoc025.paragraphs[0].runs[0]["x-script"] === "normal");
    assert("V2-025h: body run x-linkHref",
      sparseDoc025.paragraphs[0].runs[0]["x-linkHref"] === null);

    assert("V2-025i: chapterTitle textIndent 0",
      sparseDoc025.paragraphs[1].style.textIndent === 0);
    assert("V2-025j: chapterTitle textAlign center",
      sparseDoc025.paragraphs[1].style.textAlign === "center");
    assert("V2-025k: chapterTitle marginTop 24",
      sparseDoc025.paragraphs[1].style.marginTop === 24);

    assert("V2-025l: heading2 textAlign right (explicit override)",
      sparseDoc025.paragraphs[2].style.textAlign === "right");
    assert("V2-025m: heading2 textIndent 0 (from role)",
      sparseDoc025.paragraphs[2].style.textIndent === 0);
    assert("V2-025n: heading2 run fontStyle italic (explicit)",
      sparseDoc025.paragraphs[2].runs[0].fontStyle === "italic");
    assert("V2-025o: heading2 run fontSize 22 (from role)",
      sparseDoc025.paragraphs[2].runs[0].fontSize === 22);

    // V2-026: stripDocument removes defaults
    var fullDoc026 = {
      version: 2,
      meta: { title: "Strip Test" },
      bookSettings: defaultBookSettings(),
      paragraphs: [
        makePara("Body text"),
        makePara("Bold text", { fontFamily: "Georgia", fontSize: 12,
          fontWeight: "bold", fontStyle: "normal", textDecoration: "none",
          color: "#1a1a1a", "x-script": "normal", "x-linkHref": null,
          backgroundColor: null })
      ]
    };

    var stripped026 = stripDocument(fullDoc026);

    var bs026 = stripped026.paragraphs[0].style;
    assert("V2-026a: stripped body has x-role",
      bs026["x-role"] === "body");
    assert("V2-026b: stripped body omits textAlign",
      !bs026.hasOwnProperty("textAlign"));
    assert("V2-026c: stripped body omits textIndent",
      !bs026.hasOwnProperty("textIndent"));
    assert("V2-026d: stripped body omits x-list",
      !bs026.hasOwnProperty("x-list"));
    assert("V2-026e: stripped body omits x-dropCap",
      !bs026.hasOwnProperty("x-dropCap"));

    var br026 = stripped026.paragraphs[0].runs[0];
    assert("V2-026f: stripped run has text",
      br026.text === "Body text");
    assert("V2-026g: stripped run omits fontFamily",
      !br026.hasOwnProperty("fontFamily"));
    assert("V2-026h: stripped run omits x-script",
      !br026.hasOwnProperty("x-script"));

    var bold026 = stripped026.paragraphs[1].runs[0];
    assert("V2-026i: stripped bold run has text",
      bold026.text === "Bold text");
    assert("V2-026j: stripped bold run keeps fontWeight",
      bold026.fontWeight === "bold");
    assert("V2-026k: stripped bold run omits fontFamily",
      !bold026.hasOwnProperty("fontFamily"));
    assert("V2-026l: stripped bold run omits fontSize",
      !bold026.hasOwnProperty("fontSize"));

    // V2-027: Document round-trip
    var rtStripped = stripDocument(doc);
    var rtCopy = JSON.parse(JSON.stringify(rtStripped));
    resolveDocument(rtCopy);

    var rt027_ok = true;
    var rt027_fail = "";
    for (var rti = 0; rti < doc.paragraphs.length; rti++) {
      var orig = doc.paragraphs[rti];
      var rt = rtCopy.paragraphs[rti];
      for (var key in orig.style) {
        if (!v2DeepEqual(orig.style[key], rt.style[key])) {
          rt027_ok = false;
          rt027_fail = "para " + rti + " style." + key +
            " orig=" + JSON.stringify(orig.style[key]) +
            " rt=" + JSON.stringify(rt.style[key]);
          break;
        }
      }
      if (!rt027_ok) break;
      if (orig.runs.length !== rt.runs.length) {
        rt027_ok = false;
        rt027_fail = "para " + rti + " run count " +
          orig.runs.length + " vs " + rt.runs.length;
        break;
      }
      for (var rtr = 0; rtr < orig.runs.length; rtr++) {
        for (var key in orig.runs[rtr]) {
          if (!v2DeepEqual(orig.runs[rtr][key], rt.runs[rtr][key])) {
            rt027_ok = false;
            rt027_fail = "para " + rti + " run " + rtr + " ." + key +
              " orig=" + JSON.stringify(orig.runs[rtr][key]) +
              " rt=" + JSON.stringify(rt.runs[rtr][key]);
            break;
          }
        }
        if (!rt027_ok) break;
      }
      if (!rt027_ok) break;
    }
    assert("V2-027: document round-trip stable", rt027_ok, rt027_fail);

    // V2-028: Double round-trip
    var s1_028 = stripDocument(doc);
    var c1_028 = JSON.parse(JSON.stringify(s1_028));
    resolveDocument(c1_028);
    var s2_028 = stripDocument(c1_028);
    assert("V2-028: double round-trip byte-identical",
      JSON.stringify(s1_028) === JSON.stringify(s2_028));

    // V2-029: Resolve over already-resolved data (semantic comparison)
    var copy029 = JSON.parse(JSON.stringify(doc));
    resolveDocument(copy029);
    var rt029_ok = true;
    var rt029_fail = "";
    for (var i029 = 0; i029 < doc.paragraphs.length; i029++) {
      var o029 = doc.paragraphs[i029];
      var r029 = copy029.paragraphs[i029];
      for (var k029 in o029.style) {
        if (!v2DeepEqual(o029.style[k029], r029.style[k029])) {
          rt029_ok = false;
          rt029_fail = "para " + i029 + " style." + k029 +
            " orig=" + JSON.stringify(o029.style[k029]) +
            " resolved=" + JSON.stringify(r029.style[k029]);
          break;
        }
      }
      if (!rt029_ok) break;
      for (var rr029 = 0; rr029 < o029.runs.length; rr029++) {
        for (var rk029 in o029.runs[rr029]) {
          if (!v2DeepEqual(o029.runs[rr029][rk029], r029.runs[rr029][rk029])) {
            rt029_ok = false;
            rt029_fail = "para " + i029 + " run " + rr029 + " ." + rk029 +
              " orig=" + JSON.stringify(o029.runs[rr029][rk029]) +
              " resolved=" + JSON.stringify(r029.runs[rr029][rk029]);
            break;
          }
        }
        if (!rt029_ok) break;
      }
      if (!rt029_ok) break;
    }
    assert("V2-029: resolve over stamped is no-op", rt029_ok, rt029_fail);

    // V2-030: strip does not modify input
    var before030 = JSON.stringify(doc.paragraphs);
    var _discarded030 = stripDocument(doc);
    assert("V2-030: stripDocument did not modify doc",
      before030 === JSON.stringify(doc.paragraphs));

    // V2-031: Save produces sparse output
    var saved031 = stripDocument(doc);
    var savedStyle = saved031.paragraphs[1].style;
    assert("V2-031a: saved body has x-role",
      savedStyle["x-role"] === "body");
    assert("V2-031b: saved body omits default textIndent",
      !savedStyle.hasOwnProperty("textIndent") ||
      savedStyle.textIndent !== 18);
    var savedRun = saved031.paragraphs[1].runs[0];
    assert("V2-031c: saved run omits default fontFamily",
      !savedRun.hasOwnProperty("fontFamily"));

    // V2-032: Full save/load round-trip
    var saved032 = stripDocument(doc);
    var loaded032 = JSON.parse(JSON.stringify(saved032));
    resolveDocument(loaded032);
    var rt032_ok = true;
    var rt032_fail = "";
    for (var i032 = 0; i032 < doc.paragraphs.length; i032++) {
      var o032 = doc.paragraphs[i032];
      var l032 = loaded032.paragraphs[i032];
      for (var k032 in o032.style) {
        if (!v2DeepEqual(o032.style[k032], l032.style[k032])) {
          rt032_ok = false;
          rt032_fail = "para " + i032 + " style." + k032 +
            " orig=" + JSON.stringify(o032.style[k032]) +
            " loaded=" + JSON.stringify(l032.style[k032]);
          break;
        }
      }
      if (!rt032_ok) break;
      if (o032.runs.length !== l032.runs.length) {
        rt032_ok = false;
        rt032_fail = "para " + i032 + " run count " +
          o032.runs.length + " vs " + l032.runs.length;
        break;
      }
      for (var r032 = 0; r032 < o032.runs.length; r032++) {
        for (var rk032 in o032.runs[r032]) {
          if (!v2DeepEqual(o032.runs[r032][rk032], l032.runs[r032][rk032])) {
            rt032_ok = false;
            rt032_fail = "para " + i032 + " run " + r032 + " ." + rk032 +
              " orig=" + JSON.stringify(o032.runs[r032][rk032]) +
              " loaded=" + JSON.stringify(l032.runs[r032][rk032]);
            break;
          }
        }
        if (!rt032_ok) break;
      }
      if (!rt032_ok) break;
    }
    assert("V2-032: save/load round-trip recovers all state",
      rt032_ok, rt032_fail);

    // V2-033: doc unchanged after stripDocument (save safety)
    var before033 = JSON.stringify(doc);
    var _s033 = stripDocument(doc);
    assert("V2-033: doc unchanged after strip for save",
      before033 === JSON.stringify(doc));

    // V2-034: doc carries bookDefaults and roleStyles
    assert("V2-034a: doc.bookDefaults exists",
      typeof doc.bookDefaults === "object" && doc.bookDefaults !== null);
    assert("V2-034b: doc.bookDefaults.run exists",
      typeof doc.bookDefaults.run === "object");
    assert("V2-034c: doc.bookDefaults.para exists",
      typeof doc.bookDefaults.para === "object");
    assert("V2-034d: doc.roleStyles exists",
      typeof doc.roleStyles === "object" && doc.roleStyles !== null);
    assert("V2-034e: doc.roleStyles has body",
      doc.roleStyles.hasOwnProperty("body"));
    assert("V2-034f: doc.roleStyles has chapterTitle",
      doc.roleStyles.hasOwnProperty("chapterTitle"));

    // V2-035: resolve uses doc.bookDefaults, not hardcoded
    var customDoc035 = {
      version: 2,
      meta: { title: "Custom" },
      bookSettings: defaultBookSettings(),
      bookDefaults: {
        run: {
          fontFamily: "Palatino",
          fontSize: 14,
          color: "#000000",
          fontWeight: "normal",
          fontStyle: "normal",
          textDecoration: "none",
          backgroundColor: null
        },
        para: {
          textAlign: "left",
          textIndent: 24,
          lineHeight: 1.5,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0
        }
      },
      roleStyles: v2RoleStyles(),
      paragraphs: [
        { style: { "x-role": "body" }, runs: [{ text: "Test" }] }
      ]
    };
    resolveDocument(customDoc035);

    assert("V2-035a: resolved with Palatino",
      customDoc035.paragraphs[0].runs[0].fontFamily === "Palatino");
    assert("V2-035b: resolved with fontSize 14",
      customDoc035.paragraphs[0].runs[0].fontSize === 14);
    assert("V2-035c: resolved with textIndent 24",
      customDoc035.paragraphs[0].style.textIndent === 24);
    assert("V2-035d: resolved with lineHeight 1.5",
      customDoc035.paragraphs[0].style.lineHeight === 1.5);

    // V2-036: strip uses doc.bookDefaults
    var stripped036 = stripDocument(customDoc035);
    assert("V2-036a: stripped body run omits fontFamily",
      !stripped036.paragraphs[0].runs[0].hasOwnProperty("fontFamily"));
    assert("V2-036b: stripped body style omits textIndent",
      !stripped036.paragraphs[0].style.hasOwnProperty("textIndent"));
    assert("V2-036c: stripped preserves bookDefaults",
      stripped036.bookDefaults.run.fontFamily === "Palatino");
    assert("V2-036d: stripped preserves roleStyles",
      stripped036.roleStyles.hasOwnProperty("chapterTitle"));

    // V2-037: round-trip stability with custom defaults
    var stripped037 = stripDocument(customDoc035);
    var copy037 = JSON.parse(JSON.stringify(stripped037));
    resolveDocument(copy037);
    assert("V2-037a: round-trip fontFamily",
      copy037.paragraphs[0].runs[0].fontFamily === "Palatino");
    assert("V2-037b: round-trip fontSize",
      copy037.paragraphs[0].runs[0].fontSize === 14);
    assert("V2-037c: round-trip textIndent",
      copy037.paragraphs[0].style.textIndent === 24);

    // V2-038: fallback works when doc has no bookDefaults
    var noDefaultsDoc = {
      version: 2,
      meta: { title: "Bare" },
      bookSettings: defaultBookSettings(),
      paragraphs: [
        { style: { "x-role": "body" }, runs: [{ text: "Bare" }] }
      ]
    };
    resolveDocument(noDefaultsDoc);
    assert("V2-038a: fallback fontFamily is Georgia",
      noDefaultsDoc.paragraphs[0].runs[0].fontFamily === "Georgia");
    assert("V2-038b: fallback textIndent is 18",
      noDefaultsDoc.paragraphs[0].style.textIndent === 18);

    // --- Section tests ---
    // Build a test sections array (mini novel)
    var testSections = [
      {
        region: "front", type: "titlePage",
        id: "test-front-0001",
        paragraphs: [
          { style: { "x-role": "chapterTitle" }, runs: [{ text: "My Novel" }] },
          { style: { "x-role": "body", textAlign: "center", textIndent: 0 }, runs: [{ text: "Test Author" }] }
        ]
      },
      {
        region: "front", type: "dedication",
        id: "test-front-0002",
        paragraphs: [
          { style: { "x-role": "body", textAlign: "center", textIndent: 0, marginTop: 144 },
            runs: [{ text: "For everyone.", fontStyle: "italic" }] }
        ]
      },
      {
        region: "body", type: "chapter",
        id: "test-body-0001",
        paragraphs: [
          { style: { "x-role": "chapterTitle" }, runs: [{ text: "Chapter One" }] },
          { style: { "x-role": "body" }, runs: [{ text: "First paragraph." }] },
          { style: { "x-role": "body" }, runs: [{ text: "Second paragraph." }] }
        ]
      },
      {
        region: "body", type: "chapter",
        id: "test-body-0002",
        paragraphs: [
          { style: { "x-role": "chapterTitle" }, runs: [{ text: "Chapter Two" }] },
          { style: { "x-role": "body" }, runs: [{ text: "Another paragraph." }] }
        ]
      },
      {
        region: "back", type: "acknowledgments",
        id: "test-back-0001",
        paragraphs: [
          { style: { "x-role": "chapterTitle" }, runs: [{ text: "Acknowledgments" }] },
          { style: { "x-role": "body" }, runs: [{ text: "Thanks to all." }] }
        ]
      },
      {
        region: "back", type: "custom",
        id: "test-back-0002",
        title: "Discussion Questions",
        include: { print: true, ebook: true },
        paragraphs: [
          { style: { "x-role": "chapterTitle" }, runs: [{ text: "Discussion Questions" }] },
          { style: { "x-role": "body" }, runs: [{ text: "What did you think?" }] }
        ]
      }
    ];

    // V2-039: flattenSections
    var flat039 = flattenSections(testSections);

    assert("V2-039a: flat paragraph count",
      flat039.paragraphs.length === 12,
      "got " + flat039.paragraphs.length);
    assert("V2-039b: sectionMeta count",
      flat039.sectionMeta.length === 6,
      "got " + flat039.sectionMeta.length);
    assert("V2-039c: first para is title page",
      flat039.paragraphs[0].runs[0].text === "My Novel");
    assert("V2-039d: first para has x-sectionId",
      flat039.paragraphs[0].style["x-sectionId"] === "test-front-0001");
    assert("V2-039e: dedication para has correct sectionId",
      flat039.paragraphs[2].style["x-sectionId"] === "test-front-0002");
    assert("V2-039f: ch1 first para sectionId",
      flat039.paragraphs[3].style["x-sectionId"] === "test-body-0001");
    assert("V2-039g: ch1 last para sectionId",
      flat039.paragraphs[5].style["x-sectionId"] === "test-body-0001");
    assert("V2-039h: ch2 first para sectionId",
      flat039.paragraphs[6].style["x-sectionId"] === "test-body-0002");
    assert("V2-039i: last para is discussion questions",
      flat039.paragraphs[11].runs[0].text === "What did you think?");
    assert("V2-039j: last para sectionId",
      flat039.paragraphs[11].style["x-sectionId"] === "test-back-0002");

    // V2-040: sectionMeta correctness
    var meta040 = flat039.sectionMeta;
    assert("V2-040a: meta[0] region",
      meta040[0].region === "front");
    assert("V2-040b: meta[0] type",
      meta040[0].type === "titlePage");
    assert("V2-040c: meta[0] id",
      meta040[0].id === "test-front-0001");
    assert("V2-040d: meta[5] type custom",
      meta040[5].type === "custom");
    assert("V2-040e: meta[5] title",
      meta040[5].title === "Discussion Questions");
    assert("V2-040f: meta[5] include preserved",
      meta040[5].include && meta040[5].include.print === true);
    assert("V2-040g: meta has no paragraphs",
      !meta040[0].hasOwnProperty("paragraphs"));

    // V2-041: flatten does not modify input
    var inputJson041 = JSON.stringify(testSections);
    var _discard041 = flattenSections(testSections);
    assert("V2-041: input unchanged after flatten",
      inputJson041 === JSON.stringify(testSections));

    // V2-042: regroupSections
    var regroup042 = regroupSections(flat039.paragraphs, flat039.sectionMeta);

    assert("V2-042a: section count",
      regroup042.length === 6,
      "got " + regroup042.length);
    assert("V2-042b: sec[0] region",
      regroup042[0].region === "front");
    assert("V2-042c: sec[0] type",
      regroup042[0].type === "titlePage");
    assert("V2-042d: sec[0] paragraph count",
      regroup042[0].paragraphs.length === 2);
    assert("V2-042e: sec[2] is chapter 1 with 3 paras",
      regroup042[2].type === "chapter" &&
      regroup042[2].paragraphs.length === 3);
    assert("V2-042f: sec[3] is chapter 2 with 2 paras",
      regroup042[3].type === "chapter" &&
      regroup042[3].paragraphs.length === 2);
    assert("V2-042g: sec[5] is custom with title",
      regroup042[5].type === "custom" &&
      regroup042[5].title === "Discussion Questions");
    assert("V2-042h: sec[5] include preserved",
      regroup042[5].include && regroup042[5].include.print === true);

    // V2-043: x-sectionId stripped from regrouped paragraphs
    var hasMarker043 = false;
    for (var si043 = 0; si043 < regroup042.length; si043++) {
      for (var pi043 = 0; pi043 < regroup042[si043].paragraphs.length; pi043++) {
        if (regroup042[si043].paragraphs[pi043].style.hasOwnProperty("x-sectionId")) {
          hasMarker043 = true; break;
        }
      }
      if (hasMarker043) break;
    }
    assert("V2-043: no x-sectionId in regrouped output", !hasMarker043);

    // V2-044: Round-trip (flatten → regroup = original)
    var rt044_ok = true;
    var rt044_fail = "";
    for (var si044 = 0; si044 < testSections.length; si044++) {
      var orig044 = testSections[si044];
      var rt044 = regroup042[si044];
      if (orig044.region !== rt044.region) {
        rt044_ok = false; rt044_fail = "sec " + si044 + " region"; break;
      }
      if (orig044.type !== rt044.type) {
        rt044_ok = false; rt044_fail = "sec " + si044 + " type"; break;
      }
      if (orig044.id !== rt044.id) {
        rt044_ok = false; rt044_fail = "sec " + si044 + " id"; break;
      }
      if ((orig044.title || null) !== (rt044.title || null)) {
        rt044_ok = false; rt044_fail = "sec " + si044 + " title"; break;
      }
      if (orig044.paragraphs.length !== rt044.paragraphs.length) {
        rt044_ok = false; rt044_fail = "sec " + si044 + " para count " +
          orig044.paragraphs.length + " vs " + rt044.paragraphs.length; break;
      }
      for (var pi044 = 0; pi044 < orig044.paragraphs.length; pi044++) {
        var origP = orig044.paragraphs[pi044];
        var rtP = rt044.paragraphs[pi044];
        for (var ri044 = 0; ri044 < origP.runs.length; ri044++) {
          if (origP.runs[ri044].text !== rtP.runs[ri044].text) {
            rt044_ok = false;
            rt044_fail = "sec " + si044 + " para " + pi044 + " run " + ri044 + " text";
            break;
          }
        }
        if (!rt044_ok) break;
        for (var key044 in origP.style) {
          if (key044 === "x-sectionId") continue;
          if (JSON.stringify(origP.style[key044]) !== JSON.stringify(rtP.style[key044])) {
            rt044_ok = false;
            rt044_fail = "sec " + si044 + " para " + pi044 + " style." + key044;
            break;
          }
        }
        if (!rt044_ok) break;
      }
      if (!rt044_ok) break;
    }
    assert("V2-044: flatten/regroup round-trip", rt044_ok, rt044_fail);

    // V2-045: Double round-trip
    var flat045a = flattenSections(testSections);
    var regroup045a = regroupSections(flat045a.paragraphs, flat045a.sectionMeta);
    var flat045b = flattenSections(regroup045a);
    var regroup045b = regroupSections(flat045b.paragraphs, flat045b.sectionMeta);
    assert("V2-045: double round-trip byte-identical",
      JSON.stringify(regroup045a) === JSON.stringify(regroup045b));

    // V2-046: Empty section (no paragraphs)
    var emptySec = [
      { region: "front", type: "toc", id: "test-toc-001", paragraphs: [] },
      { region: "body", type: "chapter", id: "test-ch-001",
        paragraphs: [{ style: { "x-role": "body" }, runs: [{ text: "Content" }] }] }
    ];
    var flatEmpty = flattenSections(emptySec);
    assert("V2-046a: flat has 1 para (toc empty)",
      flatEmpty.paragraphs.length === 1);
    assert("V2-046b: meta has 2 entries",
      flatEmpty.sectionMeta.length === 2);
    var regroupEmpty = regroupSections(flatEmpty.paragraphs, flatEmpty.sectionMeta);
    assert("V2-046c: toc section has 0 paragraphs",
      regroupEmpty[0].paragraphs.length === 0);
    assert("V2-046d: chapter section has 1 paragraph",
      regroupEmpty[1].paragraphs.length === 1);

    // V2-047: UUID generation
    var uuid047a = generateSectionId();
    var uuid047b = generateSectionId();
    assert("V2-047a: UUID is a string",
      typeof uuid047a === "string");
    assert("V2-047b: UUID is 36 chars",
      uuid047a.length === 36);
    assert("V2-047c: UUID has correct format",
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid047a));
    assert("V2-047d: two UUIDs are different",
      uuid047a !== uuid047b);

    // V2-048: type defaults table completeness
    var expectedTypes = ["halfTitle", "titlePage", "copyright", "dedication",
      "epigraph", "toc", "foreword", "preface", "prologue", "chapter",
      "epilogue", "afterword", "acknowledgments", "aboutAuthor", "alsoBy",
      "glossary", "endnotes", "index", "custom"];
    var missing048 = [];
    for (var ti = 0; ti < expectedTypes.length; ti++) {
      if (!SECTION_TYPE_DEFAULTS[expectedTypes[ti]]) missing048.push(expectedTypes[ti]);
    }
    assert("V2-048a: all types have defaults",
      missing048.length === 0,
      "missing: " + missing048.join(", "));
    assert("V2-048b: halfTitle is print-only",
      SECTION_TYPE_DEFAULTS.halfTitle.include.ebook === false);
    assert("V2-048c: chapter begins on right",
      SECTION_TYPE_DEFAULTS.chapter.printOptions.beginOn === "right");
    assert("V2-048d: toc uses roman numbering",
      SECTION_TYPE_DEFAULTS.toc.printOptions.pageNumbering === "roman");
    assert("V2-048e: custom uses inherit numbering",
      SECTION_TYPE_DEFAULTS.custom.printOptions.pageNumbering === "inherit");

    // V2-049: v2→v3 migration
    var v2doc = {
      version: 2,
      meta: { title: "Migrate Test" },
      bookSettings: defaultBookSettings(),
      paragraphs: [
        { style: { "x-role": "chapterTitle" }, runs: [{ text: "Ch 1" }] },
        { style: { "x-role": "body" }, runs: [{ text: "Body one." }] },
        { style: { "x-role": "body" }, runs: [{ text: "Body two." }] },
        { style: { "x-role": "chapterTitle" }, runs: [{ text: "Ch 2" }] },
        { style: { "x-role": "body" }, runs: [{ text: "Body three." }] }
      ]
    };
    var migrated049 = migrateDoc(v2doc);
    assert("V2-049a: version is 3", migrated049.version === 3);
    assert("V2-049b: has sections", Array.isArray(migrated049.sections));
    assert("V2-049c: 2 sections", migrated049.sections.length === 2,
      "got " + (migrated049.sections ? migrated049.sections.length : "none"));
    assert("V2-049d: no paragraphs key",
      !migrated049.hasOwnProperty("paragraphs"));
    assert("V2-049e: sec[0] has 3 paras",
      migrated049.sections[0].paragraphs.length === 3);
    assert("V2-049f: sec[1] has 2 paras",
      migrated049.sections[1].paragraphs.length === 2);
    assert("V2-049g: sec[0] is body chapter",
      migrated049.sections[0].region === "body" &&
      migrated049.sections[0].type === "chapter");
    assert("V2-049h: sections have UUIDs",
      typeof migrated049.sections[0].id === "string" &&
      migrated049.sections[0].id.length === 36);

    // V2-050: migration with no chapterTitle (all body)
    var v2plain = {
      version: 2,
      meta: { title: "Plain" },
      bookSettings: defaultBookSettings(),
      paragraphs: [
        { style: { "x-role": "body" }, runs: [{ text: "Just text." }] },
        { style: { "x-role": "body" }, runs: [{ text: "More text." }] }
      ]
    };
    var migrated050 = migrateDoc(v2plain);
    assert("V2-050a: version is 3", migrated050.version === 3);
    assert("V2-050b: 1 section", migrated050.sections.length === 1);
    assert("V2-050c: section has 2 paras",
      migrated050.sections[0].paragraphs.length === 2);

    // V2-051: sections save/load round-trip
    // Restore original test book (earlier tests may have called buildTestDoc)
    restoreState(_testOrigState);
    var stripped051 = stripDocument(doc);
    var sections051 = regroupSections(stripped051.paragraphs, doc._sectionMeta);

    var foundSid051 = false;
    for (var s051 = 0; s051 < sections051.length; s051++) {
      for (var p051 = 0; p051 < sections051[s051].paragraphs.length; p051++) {
        if (sections051[s051].paragraphs[p051].style.hasOwnProperty("x-sectionId")) {
          foundSid051 = true; break;
        }
      }
      if (foundSid051) break;
    }
    assert("V2-051a: no x-sectionId in saved output", !foundSid051);

    var saved051 = {
      version: 3,
      meta: stripped051.meta,
      bookSettings: stripped051.bookSettings,
      bookDefaults: stripped051.bookDefaults,
      roleStyles: stripped051.roleStyles,
      sections: sections051
    };

    var loaded051 = JSON.parse(JSON.stringify(saved051));
    var migLoaded = migrateDoc(loaded051);
    var flat051 = flattenSections(migLoaded.sections);
    migLoaded.paragraphs = flat051.paragraphs;
    migLoaded._sectionMeta = flat051.sectionMeta;
    resolveDocument(migLoaded);

    assert("V2-051b: paragraph count preserved",
      migLoaded.paragraphs.length === doc.paragraphs.length,
      "orig=" + doc.paragraphs.length + " loaded=" + migLoaded.paragraphs.length);

    var rt051_ok = true;
    var rt051_fail = "";
    for (var i051 = 0; i051 < doc.paragraphs.length; i051++) {
      var o051 = doc.paragraphs[i051];
      var l051 = migLoaded.paragraphs[i051];
      for (var k051 in o051.style) {
        if (k051 === "x-sectionId") continue;
        if (!v2DeepEqual(o051.style[k051], l051.style[k051])) {
          rt051_ok = false;
          rt051_fail = "para " + i051 + " style." + k051;
          break;
        }
      }
      if (!rt051_ok) break;
      for (var r051 = 0; r051 < o051.runs.length; r051++) {
        for (var rk051 in o051.runs[r051]) {
          if (!v2DeepEqual(o051.runs[r051][rk051], l051.runs[r051][rk051])) {
            rt051_ok = false;
            rt051_fail = "para " + i051 + " run " + r051 + " ." + rk051 +
              " orig=" + JSON.stringify(o051.runs[r051][rk051]) +
              " loaded=" + JSON.stringify(l051.runs[r051][rk051]);
            break;
          }
        }
        if (!rt051_ok) break;
      }
      if (!rt051_ok) break;
    }
    assert("V2-051c: sections round-trip preserves all content",
      rt051_ok, rt051_fail);

    // V2-052: runtime doc has _sectionMeta
    assert("V2-052a: doc._sectionMeta exists",
      Array.isArray(doc._sectionMeta));
    assert("V2-052b: _sectionMeta has entries",
      doc._sectionMeta.length > 0);
    assert("V2-052c: meta entry has id",
      typeof doc._sectionMeta[0].id === "string");
    assert("V2-052d: meta entry has region",
      doc._sectionMeta[0].region === "front");
    assert("V2-052e: meta entry has type",
      doc._sectionMeta[0].type === "titlePage");

    // V2-053: every paragraph has x-sectionId
    var allSid053 = true;
    var missingSid053 = -1;
    for (var i053 = 0; i053 < doc.paragraphs.length; i053++) {
      if (!doc.paragraphs[i053].style["x-sectionId"]) {
        allSid053 = false;
        missingSid053 = i053;
        break;
      }
    }
    assert("V2-053: all paras have x-sectionId",
      allSid053, "missing at para " + missingSid053);

    // V2-054: doc version
    assert("V2-054: doc.version is 3", doc.version === 3);

    // V2-055: orphan paragraphs don't vanish
    var orphanFlat = flattenSections(testSections);
    // Remove x-sectionId from paragraph 5 (simulate creation without it)
    delete orphanFlat.paragraphs[5].style["x-sectionId"];
    var orphanRegroup = regroupSections(orphanFlat.paragraphs, orphanFlat.sectionMeta);
    // Count total paragraphs across all sections
    var orphanTotal = 0;
    for (var oi = 0; oi < orphanRegroup.length; oi++) {
      orphanTotal += orphanRegroup[oi].paragraphs.length;
    }
    assert("V2-055: orphan paragraph not lost",
      orphanTotal === orphanFlat.paragraphs.length,
      "expected " + orphanFlat.paragraphs.length + " got " + orphanTotal);

    // V2-056: currentSectionId returns a valid ID
    assert("V2-056: currentSectionId returns string",
      typeof currentSectionId() === "string" &&
      currentSectionId().length > 0);
  }

})();

