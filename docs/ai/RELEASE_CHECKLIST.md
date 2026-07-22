# SabahLot — Release Checklist

Every gate below must be explicitly confirmed (not assumed) before a sprint's work is committed and merged. Each gate maps to a script in `scripts/ai/` where automation exists.

1. **Scope check** — every changed file is inside the sprint's allowed-file list; nothing outside it was touched. (`scripts/ai/check-scope.ps1`)
2. **TypeScript** — `npx tsc --noEmit` returns zero errors.
3. **ESLint** — `npx eslint .` returns zero errors; any new warnings are explicitly called out and justified.
4. **Build** — `npm run build` completes successfully.
5. **QA** — all relevant `.qa.ts` scripts (new and pre-existing, to catch regressions) are actually run and pass; results are reported as executed/mock/static/documented-only, not blanket "PASS."
6. **Mobile/visual verification** — for any change touching mobile layout, CSS breakpoints, or touch-target positioning: real-device confirmation is required before the change can be reported as PASS and merged. A sandboxed browser-preview check (viewport resize, `getBoundingClientRect()`, DOM queries) is a useful diagnostic but is explicitly **not** a substitute — this environment's preview tab has repeatedly rendered as backgrounded/hidden, which silently breaks screenshots and CSS transform/animation recomputation while still returning plausible-looking geometry numbers. State explicitly which kind of verification was done; if only the sandboxed check was possible, say so and leave the item as unconfirmed rather than PASS.
7. **Secret scan** — no `service_role`, `SUPABASE_SERVICE`, hardcoded token, password, or credential-shaped string appears in the diff. (`scripts/ai/scan-cloud-operations.ps1` covers part of this; also grep manually for `.env` references.)
8. **Database-operation scan** — every `.insert(`/`.update(`/`.upsert(`/`.delete(`/`.rpc(` in the diff is accounted for: correct table, correct sprint scope, matches what the sprint's report claims. (`scripts/ai/scan-cloud-operations.ps1`)
9. **Sensitive-file scan** — confirm no changes to `.env*`, `supabase/migrations/**`, `supabase/.temp/**`, `package.json`, `package-lock.json`, Vercel config, or any file outside the sprint's declared scope.
10. **Independent review** — a separate review pass (ideally a separate session/agent) re-verifies the above from scratch rather than trusting the implementer's own report, and specifically re-tries any security-relevant scenario (ownership, idempotency, conflict) rather than just reading the code.
11. **Owner merge approval** — the project owner explicitly approves commit, push, PR creation, and merge as separate, distinct actions. None of these are ever implied by an earlier approval of the design or implementation.
12. **Post-merge verification** — after merge, re-pull `main`, confirm the merge commit SHA, confirm the expected files are present, confirm no unintended files came along, and update `docs/ai/MODULE_STATUS.md` and `docs/ai/PROJECT_STATE.md` to reflect the new state.
