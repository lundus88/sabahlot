<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## AI agent governance

This section applies to any AI agent (Claude, Codex, or otherwise) working on this repository, not just the Next.js note above.

### Repository workflow
- Verify branch, HEAD, and working-tree cleanliness (`git status`, `git diff --stat`) before starting any sprint. If the tree is dirty with unrelated work, isolate it with `git worktree add` rather than stashing, resetting, or committing it on the caller's behalf — see `docs/ai/WORKTREE_PLAN.md`.
- Stay within the current sprint's explicitly stated allowed-file scope. See `docs/ai/FILE_OWNERSHIP.md` for role-based ownership when multiple agents work in parallel.

### Roles
Foundation, Geometry, Points, Parties, Integration, QA, and Release agent roles are defined in `docs/ai/FILE_OWNERSHIP.md`. Know which role you are operating as before editing any file.

### Safe Git rules
- Never `git add .` / `git add -A` — stage exact paths.
- Never force-push, `git reset --hard`, or `git clean -f` without explicit owner instruction for that specific action.
- Never commit, push, or create/merge a Pull Request unless explicitly instructed to do that specific action in the current turn.
- Full rules: `docs/ai/SAFETY_RULES.md`.

### Testing requirements
Every sprint that touches `src/lib/land-records/**` (or any future cloud-write module) must actually run its `.qa.ts` scripts and the pre-existing ones (to catch regressions), plus `npx tsc --noEmit`, `npx eslint .`, and `npm run build` — and report real output, not assumed results. See `docs/ai/RELEASE_CHECKLIST.md`.

### Environment restrictions
Only `sabahlot-dev` (Supabase project ref `xsflrehitrmobiyfbfhk`) may ever be targeted by cloud read/write code or CLI commands. `sabahlot`/`hakncr` (Beta/Production) and any Production UI activation are forbidden without a separate, explicit approval. See `docs/ai/PROJECT_STATE.md`.

### Expected report format
Match the structure in `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files → Cloud operations → Security → Tests/Verification → Findings → Decision (PASS / CHANGES REQUIRED / BLOCKED). Always end with an explicit decision line.

### Prohibition against Production actions
No agent may activate cloud read/write in the Production UI, touch Beta/Production Supabase projects, run a migration or remote SQL outside an explicitly-scoped migration sprint, or deploy, without a separate explicit owner approval for that specific action. Full list: `docs/ai/SAFETY_RULES.md`.
