@AGENTS.md

## AI Development Foundation

Before doing anything else in this repository, read `docs/ai/PROJECT_STATE.md` and `docs/ai/SAFETY_RULES.md`. Do not assume the project's current state, module status, or approved next sprint — read `docs/ai/PROJECT_STATE.md` and `docs/ai/MODULE_STATUS.md` instead of guessing from memory of a prior session.

- Follow `docs/ai/FILE_OWNERSHIP.md` — do not edit a file outside your assigned role's ownership without saying so explicitly first.
- Do not touch any file outside the current sprint's explicitly stated scope.
- Do not commit, push, or open a Pull Request unless the current instruction explicitly authorizes that specific action — a prior approval (design, implementation, or review) never implies authorization for the next git action.
- If the actual database schema, RLS policy, or repository code disagrees with what a sprint brief assumes, stop and report the discrepancy — do not silently proceed on the brief's assumption or invent a migration to reconcile it.
- Report all limitations, gaps, and untested scenarios honestly in the final report, even if not explicitly asked — see `docs/ai/SAFETY_RULES.md`, "Reporting."
- See `docs/ai/ARCHITECTURE_DECISIONS.md` for binding decisions (idempotency, conflict control, ownership derivation, sync-status naming) that any new write-path code must follow.
