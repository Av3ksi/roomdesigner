# CLAUDE.md

Read [AGENTS.md](./AGENTS.md) — it is the canonical agent orientation file
for this repo, and it is written to be read start-to-finish before touching
code.

Two things worth knowing before you open anything else:

- `README.md` is partly stale (it describes a `/studio` flow that now
  `redirect()`s away). Where it disagrees with AGENTS.md, AGENTS.md wins.
- `npm run typecheck && npm run build` is the entire verification gate —
  there is no test suite and no linter. Both must pass before you commit.
