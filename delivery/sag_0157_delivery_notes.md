# Build 0157 — AI9 Delivery Notes

**File:** `sag_claude_0157.html`  
**Baseline:** `sag_claude_0156.html` (695 tests)

---

## Test Results

```
699 passed, 0 failed out of 699 tests
```

RINT-14 snapshot: PASS.

---

## Changes

### 1. Letter spacing default: 2 → 0
Font's native spacing is correct — no override needed. 0 means "use the font designer's intended spacing."

### 2. Sinkage max: 50% page height → page minus bottom margin
On 8.5" page with 0.75" bottom margin: max is now 7.75" (was 4.25"). The bottom margin is the only hard ceiling — everything above is the author's creative space.

### 3. Letter spacing control: fixed select → number input
Replaced the 0–10 integer `desCtlSelect` with `desCtlNumber` allowing -5 to 20pt in 0.5pt steps. Negative for tighter, positive for looser. "pt" suffix displayed. Removed stale "INERT" comment and `ltrOptions` loop.

### Hold resolution
LSPC-003b removed — checked DOM display value after prior test (DCHD-021) had mutated it. Redundant with LSPC-002 which verifies the schema default.

### Existing test modifications (2)
- SINK-001b: max computation uses `marginsIn.bottom`, assertion renamed
- DCHD-021: queries `input[type="number"][1]` instead of `selects002[5]`, value 3 instead of 5

### New tests (4 assertions, was 5 before hold)
- LSPC-002 (1): schema default letterSpacing is 0
- LSPC-003a (1): letter spacing number input exists
- LSPC-003c (1): min allows negative values
- LSPC-004 (1): negative value (-1.5) writes to changeset

### Zero remaining holds

## Verified NOT Changed
- Layout engine, editor renderer — untouched
- Undo, save/load, migration, selection, clipboard — untouched
- CSS, HTML structure — untouched
- `desCtlNumber` helper — untouched
