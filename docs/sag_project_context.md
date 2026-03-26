# Sagittarius — Project Context

**Document owner:** AI51 (Project Lead)  
**For:** AI10 (Dev AI)  
**Last updated:** Build 0157

---

## What Sagittarius Is

Sagittarius is a browser-based, canvas-rendered book editor for
authors who want professional-quality typeset books without
professional-level tools or professional-level prices.

The user opens a single HTML file in their browser. No install,
no account, no subscription. They write, format, and design their
book in a true WYSIWYG environment that shows exactly how every
page will look when printed. The output is a print-ready PDF for
Amazon KDP, IngramSpark, and other print-on-demand platforms, and
an EPUB for digital distribution.

It is a single-file application (`sag_claude_NNNN.html`, ~15,000+
lines). All CSS, HTML, and JavaScript live in one file. This is
intentional and permanent. Do not suggest or attempt splitting it.

---

## Who It's For

Self-publishing authors:

- **Fiction authors** — novels, novellas, collections. They need
  chapter headings, scene breaks, drop caps, clean body text.
- **Non-fiction authors** — memoirs, guides, how-to. They need
  structured layouts, subheadings, eventually callout boxes,
  footnotes, images.
- **Prolific indie publishers** — multiple books a year. They need
  design templates applied once and reused across a series.
- **Authors who are not designers.** They don't know InDesign and
  shouldn't have to. The tool makes professional decisions for them
  while giving them controls to customize what matters.

---

## What the User Cares About

One thing: **does my book look like it came from a real publisher?**

That means:
- Consistent, balanced pages with no widows or orphans
- Proper margins including gutter space for binding
- Professional chapter openings with sinkage, ornaments, epigraphs
- Clean scene breaks
- Fonts that work for print (OFL licensed, embeddable)
- Drop caps, small caps, lead-in styling that look deliberate
- A PDF that passes KDP/IngramSpark validation without manual fixes
- Headers, footers, page numbering following publishing conventions

The user does NOT care about build numbers, layout engine internals,
or variable naming. They care about the result. Every engineering
decision traces back to a better result for the person using this.

---

## Why Canvas — The Strategic Foundation

Sagittarius started as a DOM-based editor using contenteditable,
like every other browser-based writing tool (Atticus, Reedsy, etc.).
We hit the same walls they all hit: contenteditable is
unpredictable, browser text layout is inconsistent, CSS rendering
imposes hard limits on typographic control.

So we moved to canvas. This is the entire competitive foundation.

Every competitor is trapped in the DOM — applying HTML tricks to
text and calling it a book. They are decorating web pages. We are
a graphics engine that happens to run in a browser.

**What canvas gives us:**
- We own every pixel. We measure every glyph, place every
  character, control every line break. No browser text layout
  between us and the page.
- No ceiling. DOM tools hit walls (contenteditable quirks, CSS
  paged media limitations, browser rendering differences). We
  have no such walls. The only limit is what we decide to build.
- Professional typesetting. Widow/orphan control, optical small
  caps calibration, precise kerning, baseline-accurate layout —
  possible because we control the rendering pipeline.
- True WYSIWYG. The user edits directly on the page as it will
  appear in print. The canvas IS the printed page.

**Competitors cannot follow us here without rewriting everything
from scratch.** Our head start grows with every feature we build.

---

## The Competitive Landscape

### Vellum ($250, Mac only)
Gold standard for ease of use. Beautiful templates. Limitations:
Mac only, 17 fonts, limited customization, all Vellum books look
the same, no collaboration, poor image handling.

### Atticus ($147, cross-platform)
Main challenger. Browser-based, combines writing and formatting.
1,500+ fonts. Limitations: slow/buggy with large files, limited
offline, non-fiction layouts lacking. Still DOM-based.

### Reedsy Studio (Free, browser-based)
Good for beginners. Limitations: basic print formatting, limited
customization, designed more for ebooks.

### Adobe InDesign ($23/month subscription)
Professional tool, complete control. Limitations: massive learning
curve, subscription pricing, overkill for self-publishing authors.

### Microsoft Word / Kindle Create
What authors default to. Limitations: not designed for book layout,
easy to make rejection errors, enormous manual effort.

---

## Design Principles

### JSON Optimization
The document JSON is the single artifact the user's book lives in.
It saves, loads, becomes the PDF, becomes the EPUB. If it bloats,
everything downstream suffers. The rule:

**The JSON stores the minimum necessary to reconstruct the book.
Defaults live in the schema. Overrides live in the JSON. Nothing
redundant gets persisted.**

### Font Cascade (Approved Architecture)
One canonical source of truth for the default font:
`doc.bookSettings.defaults.defaultFontId`

One helper function for runtime access: `getDefaultFont()`

Design sections do NOT store `fontFamily` unless the user
explicitly set it to something different from the global default.
Everything inherits. Only overrides persist.

All fonts must be OFL (SIL Open Font License) — legally embeddable
in PDF and EPUB. No Microsoft-licensed fonts (Georgia, Times New
Roman, Arial, etc.) in any default or dropdown.

### Template-Driven Rendering
`bookDesign` controls the visual presentation of the entire book.
Change the body font in the designer → every body paragraph in
every chapter updates. Change the heading style → every chapter
opener updates. Same model as InDesign paragraph/character styles,
made accessible to non-designers.

The cascade: global default → bookDesign template → explicit
inline override. The JSON carries the exception, not the rule.

### Isolation and Modularity
Code is self-contained and self-dependent. A change in one place
must never require changes in multiple other places. Functions are
black boxes with stable interfaces. No invisible coupling. No
shotgun surgery.

---

## Technical Architecture

### The Document Model
- `doc.paragraphs[]` — every paragraph with style and styled runs
- `doc.bookSettings` — trim size, margins, header/footer, defaults
  (including `defaultFontId` — canonical font source)
- `doc.bookDesign` — visual design template (headings, body,
  scene breaks, typography rules)
- `doc.bookDefaults` — cascade defaults for runs and paragraphs
- `doc._sectionMeta[]` — section metadata (chapters, front/back matter)

### The Layout Engine
`runLayout()` produces rendered lines with exact positions:
- Token measurement via canvas `measureText()`
- Line breaking and word wrapping
- Paragraph spacing, indentation, text alignment
- Page breaks, widow/orphan control
- Chapter heading layout (sinkage, label, number, title, ornament)
- Scene break positioning
- Drop cap computation
- Small caps optical correction (lead-in styling)
- Template-driven overrides from `bookDesign`

### The Render Pipeline
Two-tier system:
- **Tier 1 (Global Index):** `_paraYState[]` — always spans full
  document, maps every paragraph to page/y-position. Never evicted.
- **Tier 2 (Realized Geometry):** `lines[]`, `linesByPage` —
  detailed line objects, only materialized for visible pages.

### The Designer
Visual interface for editing `bookDesign`. User clicks preview,
adjusts heading fonts/sizes/colors/spacing. Changes write to a
changeset → merge into `bookDesign` → trigger re-layout.

### The Test Suite
Embedded in the file. 699 assertions across 25+ categories.
Tests are sacred. Every build must pass all existing tests plus
new tests for the build's changes. Tests never decrease.

### Persistence
`localStorage` with automatic save. Includes migration logic for
schema upgrades (v1 → v2 → v3) and validation on load.

---

## Current State (Build 0157)

- 699/699 tests passing, zero holds
- Canvas-based text editing with full character/paragraph formatting
- Visual chapter heading designer with live preview
- Section management: chapters, front matter, back matter
- Full pagination with widow/orphan control
- Template system: `bookDesign` drives heading, body, scene break
- Persistence with schema migration
- Features: drop caps, small caps lead-in, scene breaks, images,
  undo/redo, find/replace, zoom, preflight, spellcheck underlines

---

## The Standard

This is not a prototype. Every feature must be something a
professional typesetter would recognize as correct. Every UI
control must be something a non-technical author can understand.
Every line of code must be something an engineer would be proud
to have written.

We do not cut corners. We do not ship "good enough." We build
it right, or we don't build it yet.
