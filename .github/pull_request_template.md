## Summary

<!-- One paragraph: what this PR does, and what it explicitly does not. -->

## Scope

- Sprint ID: `sprint-...`
- Base commit: `...`
- Allowed files (per sprint brief): ...

## Files changed

| File | New/Modified | Purpose |
|---|---|---|

## Cloud operations

| Table | Operation | New this PR? |
|---|---|---|

- INSERT: ...
- UPDATE: ...
- UPSERT: 0 (confirm, or explain why not)
- DELETE: 0 (confirm, or explain why not)
- RPC: 0 (confirm, or explain why not)

## Security

- Owner/user identity source: (e.g. `supabase.auth.getUser()`, never accepted from caller)
- RLS reliance confirmed: yes/no
- Payload allowlist confirmed (no `{ ...input }` spread into `.insert()`/`.update()`): yes/no
- Idempotency behavior (if a create path): ...
- Conflict behavior (if an update path): ...

## Tests

- TypeScript: PASS/FAIL
- ESLint: PASS/FAIL (new errors: 0; new warnings: ...)
- Build: PASS/FAIL
- QA scripts run (list each, executed/mock/static, PASS/FAIL): ...

## Excluded work

<!-- What was explicitly out of scope for this PR, even if related. -->

## Risks

| Severity | Finding | Mitigation / follow-up |
|---|---|---|

## Review history

- Independent review verdict: (APPROVED FOR COMMIT / CHANGES REQUIRED / REJECTED, with date/session reference)

## Merge restrictions

- [ ] I have NOT merged this PR myself
- [ ] Owner approval for merge has been explicitly given (not implied by an earlier design/implementation approval)
- [ ] This PR does not touch Beta/Production or activate any cloud path in the Production UI
