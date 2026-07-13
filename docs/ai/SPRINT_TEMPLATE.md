# Sprint Template

Copy this structure when scoping any new AI sprint for SabahLot. Fill in every section — an empty section means "not applicable, confirmed," not "skipped."

---

## Sprint ID
`sprint-<area>-<short-name>` (matches the git branch name)

## Objective
One paragraph: what this sprint builds/changes, and what it explicitly does not.

## Base branch/commit
- Base branch: (usually `main`)
- Base commit: (exact SHA, verified with `git rev-parse HEAD` before starting)

## Allowed files
Explicit path list or globs. If a file isn't listed here, it isn't in scope, full stop.

## Forbidden files
Explicit list, at minimum: `.env*`, `package.json`, `package-lock.json`, `supabase/migrations/**` (unless this is a migration sprint), Vercel config, and any file outside "Allowed files" above.

## Database operations
State exactly which tables may be read, and which (if any) may be written (INSERT/UPDATE/DELETE), and which operations are explicitly forbidden this sprint.

## Security invariants
List the specific invariants this sprint must not violate (e.g. "owner_id is never accepted from a caller," "RLS is the authorization boundary," "no raw error reaches the UI"). Reference `docs/ai/ARCHITECTURE_DECISIONS.md` ADRs by number where applicable.

## Acceptance criteria
Concrete, checkable statements — not vague goals. E.g. "retry with an identical payload after a 23505 returns verified success," not "idempotency works."

## Tests
List required test scenarios. For each, state whether it must be an **executed** test (via a fake/mocked Supabase client), a **static assertion** (code/type review), or **documented-only** (with a stated reason why it can't be executed this sprint).

## Static verification
At minimum: `npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus any `.qa.ts` scripts relevant to this sprint's files. All must be run and their actual output reported — not assumed.

## Stop conditions
Explicit conditions under which the agent must halt and report rather than continue (e.g. "if the tracked working tree is not clean," "if a required schema column does not exist," "if RLS does not cover a required case").

## Required report
Structure (mirrors the sprint's actual work): Repository state → Files → Cloud operations → Security → Tests/Verification → Findings → Decision (PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
State explicitly, every time: whether commit is authorized this sprint (usually **no** — design/implementation sprints stop before commit; a separate "commit" sprint follows after review), whether push is authorized, and that merging to `main` always requires explicit owner approval regardless.
