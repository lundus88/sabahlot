# SabahLot — Release Checklist

Every gate below must be explicitly confirmed (not assumed) before a sprint's work is committed and merged. Each gate maps to a script in `scripts/ai/` where automation exists.

1. **Scope check** — every changed file is inside the sprint's allowed-file list; nothing outside it was touched. (`scripts/ai/check-scope.ps1`)
2. **TypeScript** — `npx tsc --noEmit` returns zero errors.
3. **ESLint** — `npx eslint .` returns zero errors; any new warnings are explicitly called out and justified.
4. **Build** — `npm run build` completes successfully.
5. **QA** — all relevant `.qa.ts` scripts (new and pre-existing, to catch regressions) are actually run and pass; results are reported as executed/mock/static/documented-only, not blanket "PASS." **Any sprint that changes `feature-gate.ts` (or any other shared gate/flag a `.qa.ts` script depends on) must re-run every pre-existing `.qa.ts` script that exercises a gated code path, not just the sprint's own new QA files** — a stricter gate can silently short-circuit an older script's fake-client calls to "disabled" and turn a real assertion into a false pass/fail without changing the script itself. (Found 2026-07-17: Sprint 02C-2's `isCloudWriteEnabled()` change broke `land-records-write.qa.ts` and `geometry-write.qa.ts`, neither of which set the newly-required `NEXT_PUBLIC_SUPABASE_URL`; fixed by setting it QA-process-only in both scripts, same pattern as `parent-ui-sync.qa.ts`.)
6. **Secret scan** — no `service_role`, `SUPABASE_SERVICE`, hardcoded token, password, or credential-shaped string appears in the diff. (`scripts/ai/scan-cloud-operations.ps1` covers part of this; also grep manually for `.env` references.)
7. **Database-operation scan** — every `.insert(`/`.update(`/`.upsert(`/`.delete(`/`.rpc(` in the diff is accounted for: correct table, correct sprint scope, matches what the sprint's report claims. (`scripts/ai/scan-cloud-operations.ps1`)
8. **Sensitive-file scan** — confirm no changes to `.env*`, `supabase/migrations/**`, `supabase/.temp/**`, `package.json`, `package-lock.json`, Vercel config, or any file outside the sprint's declared scope.
9. **Independent review** — a separate review pass (ideally a separate session/agent) re-verifies the above from scratch rather than trusting the implementer's own report, and specifically re-tries any security-relevant scenario (ownership, idempotency, conflict) rather than just reading the code.
10. **Owner merge approval** — the project owner explicitly approves commit, push, PR creation, and merge as separate, distinct actions. None of these are ever implied by an earlier approval of the design or implementation.
11. **Post-merge verification** — after merge, re-pull `main`, confirm the merge commit SHA, confirm the expected files are present, confirm no unintended files came along, and update `docs/ai/MODULE_STATUS.md` and `docs/ai/PROJECT_STATE.md` to reflect the new state.
