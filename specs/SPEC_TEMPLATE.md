# Build [NUMBER]: [Short Title]

**Spec written by:** Research AI / Project Lead
**Date:** [DATE]
**Status:** APPROVED / PENDING REVIEW

---

## Summary
[One paragraph: what this build does and why.]

---

## Files to Modify
List EVERY file that should be touched. If a file isn't listed here,
Claude Code must NOT modify it.

| File | What Changes |
|------|-------------|
| `parts/XX-name.js` | [specific description] |
| `shell/head.html` | [specific description] |

## Files NOT to Modify (explicit protection)
These files are OFF LIMITS for this build:

- `parts/01-core.js` — [reason, e.g., "no model changes in this build"]
- `parts/02-layout.js` — [reason]
- `parts/05-undo-edit.js` — [reason]
- `parts/08-persist.js` — [reason]
- `parts/11-cascade.js` — [reason]
- [add/remove as needed]

---

## Detailed Changes

### Change 1: [Name]
**File:** `parts/XX-name.js`
**Function(s):** `functionName()`

[Exact description of what to change. Be specific — line-level if needed.
Include before/after examples where helpful.]

### Change 2: [Name]
...

---

## What NOT to Do
- DO NOT [specific anti-pattern for this build]
- DO NOT [another specific thing to avoid]
- DO NOT modify any function not listed above
- DO NOT refactor or "clean up" surrounding code

---

## Tests Required
- [ ] Existing tests still pass after changes
- [ ] New test: [describe test case]
- [ ] New test: [describe test case]

## Verification Steps
After implementation, verify:
1. [specific thing to check in the browser]
2. [another specific thing]
3. [edge case to test]

---

## Implementation Notes
[Any context Claude Code needs that isn't in CLAUDE.md.
Architecture decisions, why this approach was chosen, what was considered
and rejected.]
