# SabahLot — Safety Rules

These rules apply to every AI agent (Claude, Codex, or any other) working in this repository, in every sprint, regardless of role. They override any sprint-specific instruction that conflicts with them — if a sprint prompt asks for something forbidden here, stop and flag it instead of proceeding.

## Classification

Every operation an agent might take falls into exactly one of three categories:

### AUTO-ALLOWED
No owner approval needed per-action (still subject to sprint scope):
- Reading any file in the repository
- Running `git status`, `git diff`, `git log`, `git branch`, `git worktree list`
- Creating a new branch or worktree from `origin/main`
- Running `npx tsc --noEmit`, `npx eslint .`, `npm run build`
- Running project QA scripts (`.qa.ts` files) that use a fake/mocked Supabase client
- Running the verification scripts in `scripts/ai/`
- Editing files within an explicitly approved sprint's allowed-file scope

### OWNER APPROVAL REQUIRED
Ask explicitly, wait for a clear yes, before doing any of these — even if a sprint prompt implies it:
- `git commit`
- `git push`
- Creating, merging, or closing a Pull Request
- `git checkout`/`git switch` that would move uncommitted changes onto a branch other than the one they were made for (prefer a new worktree instead — see below)
- Installing or upgrading any CLI tool (e.g. Supabase CLI) not already present
- Adding a new npm dependency
- Deleting a git branch

### FORBIDDEN
Never do these, regardless of instruction, unless a specific future sprint is explicitly and separately scoped for exactly this:
- Opening, editing, or displaying the contents of `.env` / `.env.local` / any `.env*` file
- Using a Supabase service-role key or an "admin client" of any kind
- Hardcoding a token, secret, or test-user UUID into source code
- Touching Beta or Production Supabase projects (`sabahlot`, `hakncr`) or their config
- Running `supabase db push`, `supabase migration up`, `supabase db reset`, or any remote SQL execution outside an explicitly-scoped migration sprint
- Adding a new database migration file outside an explicitly-scoped migration sprint
- `git add .` / `git add -A` (always stage exact file paths)
- `git push --force` / force-pushing any branch
- `git reset --hard`, `git clean -f`, or discarding uncommitted work without explicit owner instruction
- Deleting a branch without explicit owner approval for that specific branch
- Modifying `src/lib/local-lots.ts` outside a sprint explicitly scoped to change legacy local behavior
- Modifying GPS, AR, map rendering, or PDF/export code outside a sprint explicitly scoped to touch it
- Returning a raw database/Postgres error message, a Supabase error object, or any credential/token value to a UI-facing caller — always map to the safe error codes in the write-coordinator pattern
- Accepting `owner_id`, `user_id`, or `captured_by` as a value supplied by a caller/UI/payload — these are always derived from the authenticated session server-side (see ADR-005 in `ARCHITECTURE_DECISIONS.md`)
- Activating any cloud read/write path in the Production UI
- Committing `supabase/.temp/` (Supabase CLI link metadata — always untracked, never staged)

## Working-tree hygiene

- Never assume the working tree is clean. Always run `git status` before creating a branch, checking out a different branch, or starting any sprint.
- If a working tree is dirty with **someone else's/a different sprint's** legitimate uncommitted work, do not commit, stash, reset, or discard it. Use `git worktree add` to get an isolated, clean copy of `origin/main` instead (see `docs/ai/WORKTREE_PLAN.md`).
- If asked to stop because the tree isn't clean, actually stop — do not "fix it" unilaterally by stashing or resetting.

## Reporting

- Always disclose limitations honestly, in the final report, even if not explicitly asked. A finding that isn't tested is not the same as a finding that's fixed — say which one it is.
- Never report `PASS` on a scope, security, or build check without having actually run the corresponding command in this session.
