# SabahLot — AI Factory Workflow

The official flow for developing a module using multiple AI agents/sessions safely and in parallel.

1. **Owner defines scope.** The project owner writes (or approves) a sprint brief using `docs/ai/SPRINT_TEMPLATE.md` — allowed files, forbidden files, database operations, acceptance criteria.
2. **Architect freezes contracts.** Shared types/contracts that multiple builders will depend on (e.g. `child-types.ts`) are finalized first, by the Foundation Agent, before builder agents start.
3. **Foundation/shared files completed.** Any shared documentation, error-code unions, or cache-helper contracts are committed (on their own branch) before module work begins, so builders aren't working against a moving target.
4. **Builders work in separate worktrees.** Each module agent (Geometry, Points, Parties, ...) works in its own `git worktree`, on its own branch, touching only the files it owns per `docs/ai/FILE_OWNERSHIP.md`. See `docs/ai/WORKTREE_PLAN.md`.
5. **QA runs independently.** A QA Agent (or the same agent in a fresh, QA-only pass) re-runs each builder's QA scripts and, where useful, writes additional targeted tests — without trusting the builder's own "PASS" claim uncritically.
6. **Integration Agent combines modules.** Only the Integration Agent merges multiple module branches/worktrees together and resolves any shared-file changes. Module agents never merge each other's work directly.
7. **Independent reviewer performs read-only review.** A separate session (ideally with no memory of having written the code) re-audits security, idempotency, conflict handling, and scope — mirroring the pattern already proven across Sprints 01B-2, 01B-4, 02C-1, and 02D-1A in this project's history.
8. **Builder patches findings.** If the independent review returns CHANGES REQUIRED, the original builder (or Integration Agent, if the finding is cross-cutting) fixes it, and the review repeats until PASS/APPROVED.
9. **Release Agent commits and pushes.** Only after an explicit PASS/APPROVED verdict does the Release Agent stage exact files, commit, and push — never combined with implementation work in the same session.
10. **Owner approves merge.** No agent merges to `main` on its own initiative. The owner reviews the PR (or the final report) and gives explicit merge approval.
11. **Post-merge audit.** After merge, re-verify `main` matches expectations (see `docs/ai/RELEASE_CHECKLIST.md` item 11).
12. **Module status updated.** `docs/ai/MODULE_STATUS.md` and `docs/ai/PROJECT_STATE.md` are updated to reflect the new state before the sprint is considered closed.

## Rules of the road

- **Builder and reviewer must be separate sessions.** An agent should not "independently review" its own just-written code in the same continuous session/context — spin up a fresh session for the review step, as this project's actual sprint history (e.g. Sprint 01B-2, 02C-1 review, 02D-1A review) has consistently done.
- **Module agents do not edit shared files.** See `docs/ai/FILE_OWNERSHIP.md` — if a module needs a shared-file change, it requests one from the Foundation/Integration Agent rather than making it directly.
- **Worktrees, not branch-switching, for parallel work.** When more than one line of work has uncommitted changes at once (as happened between Sprint 02D-1A and Sprint AI-F0), isolate them with `git worktree add`, never by switching branches in the same working directory and hoping nothing collides.
- **Only the Integration Agent combines outputs.** Prevents two module agents from independently, inconsistently resolving the same shared-file conflict.
- **No direct merge to main.** Every merge to `main` goes through: independent review → owner approval → PR merge. No agent merges on its own judgment call, regardless of how confident the sprint report is.
