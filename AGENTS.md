# Agent instructions — abline-evolve (AB Line Evolve)

Browser idle game: a paddock of tractors learns to autosteer along a guidance line via
mutate-the-champion neuroevolution (no gradient descent). Ships as a static web build.

- **Stack:** TypeScript + Vite + Canvas2D, no framework. Node 22.7+/24 (native TS stripping).
- **Vault note:** `ProjectVault/01_Repositories/abline-evolve.md` — read it for current status,
  history, and open loops before non-trivial work. Canonical over anything stale here.
- **Runtime preflight:** `node`/`npm` on PATH. `npm test` (framework-free harness, Node native
  TS) — passes count wobbles 86–90 by design (one assertion per procedurally-generated
  obstacle); it's green when `0 failed`. `npm run build` must be clean; `tsc --noEmit` catches
  what `vite build` doesn't.
- **`sim/` is pure/headless** — zero DOM references, so the offline-progress replay can reuse
  it. Keep it that way; rendering/platform code lives in `game/`, `ui/`, `main.ts`.
- **Deploy:** not deployed. Portfolio card on Aussietin.github.io; itch.io upload pending.

## Operating contract (Claude Code + Codex)

Austin's global rules live in `~/.claude/CLAUDE.md` + `CLAUDE-shared.md` (Claude Code) and
`~/.codex/AGENTS.md` (Codex) — same contract, both agents. Load-bearing: simplest viable
solution first (no new scripts/infra unless asked), confirm the path before editing, todos are
per-project (never a global TASKS.md), the git workflow in that contract (small solo repos: commit straight to the default branch; session end syncs every touched repo — commit, push, merge/prune — without asking), session-end `/document` capture to the vault if the work produced a decision/fix/learning.
