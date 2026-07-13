# SabahLot — Worktree Plan

**Documentation only. No worktree listed here is created by Sprint AI-F0.** This describes the intended layout for future parallel module work (Sprint 02D-1B onward), building on the precedent set during Sprint AI-F0 itself (isolating `sprint-02d1a-geometry-cloud-write`'s uncommitted work from a clean `sprint-ai-f0-development-foundation` worktree).

## Proposed layout

| Worktree path | Branch | Owning agent | Purpose |
|---|---|---|---|
| `C:\Users\ridin\sabahlot-app` | (whichever is current) | — | Original/primary workspace |
| `../sabahlot-geometry` | `sprint-02d1b-geometry-*` (or continuation of `sprint-02d1a-geometry-cloud-write`) | Geometry Agent | Geometry cloud-write module work |
| `../sabahlot-points` | `sprint-02d2-points-cloud-write` | Points Agent | Points create-only module work |
| `../sabahlot-parties` | `sprint-02d3-parties-cloud-write` | Parties Agent | Parties module work |
| `../sabahlot-qa` | (tracks whichever branch is under test) | QA Agent | Independent QA re-runs, without touching implementation |
| `../sabahlot-integration` | `sprint-02d-integration` | Integration Agent | Combines geometry+points+parties into one staged child-sync coordinator |

## Example commands (illustrative only — do not run outside an approved sprint)

```
cd C:\Users\ridin\sabahlot-app
git fetch origin
git worktree add -b sprint-02d2-points-cloud-write ../sabahlot-points origin/main
git worktree add -b sprint-02d3-parties-cloud-write ../sabahlot-parties origin/main
git worktree list
```

To remove a worktree once its branch is merged/abandoned (only after explicit owner approval):

```
git worktree remove ../sabahlot-points
```

## Rules

- Every worktree is created from `origin/main` (or an explicitly-named base branch), never from another agent's in-progress worktree.
- A worktree belongs to exactly one agent/module at a time — see `docs/ai/FILE_OWNERSHIP.md`.
- Uncommitted work in one worktree is never copied, merged, or moved into another worktree by hand. If two pieces of work need to come together, that happens through a commit + PR + Integration Agent merge, not a file copy.
- Before creating a new worktree, always check `git worktree list` and `git branch --list <name>` first, exactly as done in Sprint AI-F0's isolation step — do not create a duplicate branch or worktree for a name that already exists.
