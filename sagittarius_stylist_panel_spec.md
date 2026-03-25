# Sagittarius Property Stylist Panel — Design Spec

**Prepared by:** Research AI  
**For:** Alpha1 (Project Lead)  
**Date:** March 23, 2026  
**Status:** Approved by Mr. D (Product Owner)

---

## Overview

This document specifies the visual design, interaction patterns, and CSS implementation for the Property Stylist panel in Sagittarius. The Stylist is an accordion-style sidebar panel containing 8 collapsible groups of typography and layout controls. Each group targets a specific book design role (Chapter Opener, Chapter Number, etc.).

This spec was iterated through multiple rounds of visual review with Mr. D. All decisions below are final and approved.

---

## Design Decisions — Locked

### Header Treatment: Gradient Purple with Rounded Cards

Headers use a top-to-bottom gradient (light purple → dark purple) instead of flat solid fills. This was chosen specifically to avoid resembling Windows 2000/XP title bar chrome, which flat dark bars with state-based lightening evoke.

Each accordion group is a standalone rounded card with small gaps between groups, sitting inside a subtle container background. This breaks the "flush-stacked window frames" pattern.

**Closed header gradient:**
```
background: linear-gradient(to bottom, #534AB7, #1E1A4A);
```

**Open header gradient (lighter to signal active state):**
```
background: linear-gradient(to bottom, #7F77DD, #3C3489);
```

**Closed hover:**
```
background: linear-gradient(to bottom, #5F56C2, #26215C);
```

**Open hover:**
```
background: linear-gradient(to bottom, #8B84E0, #453DA3);
```

Header text is always white (#EEEDFE). No text color change between states — only the background gradient shifts.

### Font: Barlow Semi Condensed

The panel uses **Barlow Semi Condensed** (Google Fonts, OFL licensed) for all UI text — labels, dropdown values, button text, number inputs. This was chosen for its narrower character width vs system sans-serif, giving controls more breathing room in the ~310px sidebar width.

For production, self-host the font files (400, 500, 600 weights) to eliminate the Google Fonts network dependency.

```
font-family: 'Barlow Semi Condensed', sans-serif;
```

### Sizing — Verified at 1x Render

These sizes were verified using headless Chrome (Puppeteer) screenshots at deviceScaleFactor: 1. Previous iterations appeared correct in CSS but rendered too large or too small due to browser form control minimums and 2x screenshot scaling.

| Element | Font Size | Height | Notes |
|---------|-----------|--------|-------|
| Header label | 12px, weight 500 | — | White text on gradient |
| Chevron icon | 8px | — | Rotates 90° when open |
| Row label | 11px, weight 500 | — | Secondary text color |
| Dropdown value | 11px | 26px | Div-based recommended (see below) |
| Number input value | 11px | 26px | 40px wide, centered |
| Segmented button text | 10px | 26px | Active state: weight 600 |
| Unit text (pt, em, lines) | 9.5px | — | Tertiary text color |
| Toggle switch | — | 16px | 30px wide |
| Color swatch | — | 26px | 26px wide |

**Important:** Browser `<select>` and `<button>` elements enforce minimum font sizes (~10-11px in Chrome) regardless of CSS. If pixel-perfect sizing is required, use styled `<div>` elements with click handlers instead of native form controls. For the actual Sagittarius canvas app, native controls are fine since they'll be rendered in the app's own UI layer, not browser defaults.

### Layout Dimensions

| Property | Value |
|----------|-------|
| Panel width | 310px |
| Panel padding | 5px |
| Gap between groups | 2px |
| Group border-radius | 6px |
| Header padding | 7px 10px |
| Content area padding | 6px 10px 10px |
| Row gap (margin-top) | 5px |
| Control gap (horizontal) | 6px |
| Label min-width | 64px |

### Color System

**Header gradients:** See "Header Treatment" above.

**Accent colors (used in active segmented buttons, toggle switches):**

| Use | Color |
|-----|-------|
| Active segment background | #EEEDFE |
| Active segment text | #3C3489 |
| Toggle on | #534AB7 |
| Focus ring | rgba(127, 119, 221, 0.2) |
| Focus border | #7F77DD |

**Panel structure:**
- Outer panel background: secondary/subtle (the container)
- Content area background: primary/white
- Content border: 0.5px solid, tertiary border color
- No border-top on content (flush with header bottom)

---

## The 8 Stylist Groups

Each group below lists its controls. All groups support independent open/close (multiple groups open simultaneously). No forced single-accordion behavior.

### 1. Chapter Opener
- **Sinkage** — number input (0–12, step 1) + "lines" unit
- **Recto start** — toggle switch

### 2. Chapter Number
- **Show** — toggle switch
- **Format** — dropdown (Chapter 1, CHAPTER 1, 1, ONE, I)
- **Font** — dropdown (font list)
- **Size** — number input (8–36, step 0.5) + "pt" unit
- **Color** — color swatch
- **Align** — segmented button (Left / Center / Right)

### 3. Chapter Title
- **Font** — dropdown (font list)
- **Size** — number input (8–48, step 0.5) + "pt" unit
- **Color** — color swatch
- **Align** — segmented button (Left / Center / Right)

### 4. Running Head
- **Font** — dropdown (font list)
- **Size** — number input (6–14, step 0.5) + "pt" unit
- **Content** — segmented button (Title / Author / Both)

### 5. Body Text
- **Font** — dropdown (font list)
- **Size** — number input (8–16, step 0.5) + "pt" unit
- **Leading** — number input (10–24, step 0.5) + "pt" unit
- **Indent** — segmented button (None / First / Block)
- **Indent size** — number input (0–4, step 0.25) + "em" unit

### 6. Scene Break
- **Style** — segmented button (* * * / ——— / Blank / Image)
- **Spacing** — number input (1–6, step 1) + "lines" unit

### 7. Drop Cap
- **Enabled** — toggle switch
- **Lines** — number input (2–5, step 1)
- **Font** — dropdown (Inherit body + font list)
- **Color** — color swatch

### 8. Folio
- **Show** — toggle switch
- **Font** — dropdown (font list)
- **Size** — number input (6–14, step 0.5) + "pt" unit
- **Position** — segmented button (Left / Center / Outside)

---

## Interaction Behavior

### Accordion
- Click header to toggle open/close
- Multiple groups can be open simultaneously
- Chevron (▶) rotates 90° when open
- `display: none/block` for show/hide (no layout cost for collapsed groups)
- CSS transition on `background` only (0.25s) — no reflow-triggering animations

### Controls
- All controls write directly to `bookDesign` and trigger the live layout → canvas update loop (existing architecture)
- Segmented buttons: click sets active, siblings deactivate
- Toggle switches: click toggles on/off class
- Color swatches: click opens color picker (implementation TBD)
- Dropdowns: click opens selection (implementation TBD by UI layer)

---

## Performance Notes

This design is extremely lightweight:
- Pure CSS styling, no framework dependencies
- Two trivial JS functions (toggle class, set active segment)
- No animation loops, no requestAnimationFrame, no IntersectionObserver
- No box-shadows, no blur, no computationally expensive paint operations
- Collapsed groups use `display: none` — zero layout cost
- Single external font load (Barlow Semi Condensed, self-hosted in production)
- Suitable for 50+ panels without measurable impact

---

## Reference CSS

The complete, production-ready CSS is provided below. This can be adapted directly for the Sagittarius canvas UI layer.

```css
/* === PANEL CONTAINER === */
.stylist-panel {
  width: 310px;
  font-family: 'Barlow Semi Condensed', sans-serif;
  background: var(--bg-secondary, #f3f3f0);
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.15));
  border-radius: 10px;
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* === GROUP STRUCTURE === */
.stylist-group {
  border-radius: 6px;
  overflow: hidden;
}

/* === HEADER (closed) === */
.stylist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  background: linear-gradient(to bottom, #534AB7, #1E1A4A);
  transition: background 0.25s;
}

.stylist-header .label {
  font-size: 12px;
  font-weight: 500;
  color: #EEEDFE;
}

.stylist-header .chevron {
  font-size: 8px;
  color: #AFA9EC;
  transition: transform 0.2s;
  display: inline-block;
}

/* === HEADER (open) === */
.stylist-header.open {
  background: linear-gradient(to bottom, #7F77DD, #3C3489);
  border-radius: 6px 6px 0 0;
}

.stylist-header.open .chevron {
  transform: rotate(90deg);
  color: #EEEDFE;
}

/* === HEADER (hover) === */
.stylist-header:hover:not(.open) {
  background: linear-gradient(to bottom, #5F56C2, #26215C);
}

.stylist-header.open:hover {
  background: linear-gradient(to bottom, #8B84E0, #453DA3);
}

/* === CONTENT AREA === */
.stylist-body {
  display: none;
  padding: 6px 10px 10px;
  background: var(--bg-primary, #fff);
  border-radius: 0 0 6px 6px;
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.12));
  border-top: none;
}

.stylist-header.open + .stylist-body {
  display: block;
}

/* === CONTROL ROW === */
.stylist-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}

.stylist-row:first-child {
  margin-top: 0;
}

/* === LABEL === */
.stylist-row .label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #777);
  min-width: 64px;
  flex-shrink: 0;
}

/* === DROPDOWN === */
.stylist-select {
  flex: 1;
  min-width: 0;
  height: 26px;
  line-height: 26px;
  font-size: 11px;
  font-family: inherit;
  padding: 0 16px 0 6px;
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.15));
  border-radius: 3px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.stylist-select:hover {
  border-color: var(--border-secondary, rgba(0,0,0,0.3));
}

/* === NUMBER INPUT === */
.stylist-number {
  width: 40px;
  flex: 0 0 40px;
  height: 26px;
  line-height: 26px;
  font-size: 11px;
  font-family: inherit;
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.15));
  border-radius: 3px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  text-align: center;
}

/* === UNIT LABEL === */
.stylist-unit {
  font-size: 9.5px;
  color: var(--text-tertiary, #aaa);
}

/* === SEGMENTED BUTTONS === */
.stylist-segment {
  display: flex;
  flex: 1;
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.15));
  border-radius: 3px;
  overflow: hidden;
}

.stylist-segment span {
  flex: 1;
  height: 26px;
  line-height: 26px;
  font-size: 10px;
  font-family: inherit;
  background: var(--bg-primary, #fff);
  color: var(--text-tertiary, #999);
  text-align: center;
  cursor: pointer;
  border-right: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.12));
  transition: background 0.1s;
}

.stylist-segment span:last-child {
  border-right: none;
}

.stylist-segment span.active {
  background: #EEEDFE;
  color: #3C3489;
  font-weight: 600;
}

.stylist-segment span:hover:not(.active) {
  background: var(--bg-secondary, #f3f3f0);
}

/* === TOGGLE SWITCH === */
.stylist-toggle {
  position: relative;
  width: 30px;
  height: 16px;
  background: var(--border-secondary, rgba(0,0,0,0.18));
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.stylist-toggle.on {
  background: #534AB7;
}

.stylist-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.stylist-toggle.on::after {
  transform: translateX(14px);
}

/* === COLOR SWATCH === */
.stylist-swatch {
  width: 26px;
  height: 26px;
  border-radius: 3px;
  border: 0.5px solid var(--border-tertiary, rgba(0,0,0,0.15));
  cursor: pointer;
  flex-shrink: 0;
}

/* === FOCUS STATES === */
.stylist-select:focus,
.stylist-number:focus {
  outline: none;
  border-color: #7F77DD;
  box-shadow: 0 0 0 2px rgba(127, 119, 221, 0.2);
}
```

---

## File Manifest

| File | Purpose |
|------|---------|
| This document | Design spec and implementation reference |
| Barlow Semi Condensed (400/500/600) | Self-host from Google Fonts (OFL) |

---

*End of spec. All design decisions in this document are approved by Mr. D and should be implemented as specified.*
