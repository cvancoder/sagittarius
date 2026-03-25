# Sagittarius

Canvas-based book editor for indie authors.

## Dev Setup

This repo contains the split source files. Run `./build.sh` to assemble the
single HTML application. Open `sag_build.html` in any browser — no server
required for local testing.

For the full hosted dev environment with Claude Code, see `server/setup-vps.sh`.

## Quick Reference

```bash
./build.sh              # Build full app (with tests)
./build.sh --no-tests   # Build without test harness (~5K lines smaller)
```

See `MANIFEST.md` for the complete file map and `CLAUDE.md` for project rules.
