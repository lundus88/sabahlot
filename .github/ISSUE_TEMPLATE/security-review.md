---
name: Security Review
about: Independent security review of a cloud-write sprint's branch
title: "Security review — <branch/commit>"
labels: security-review
---

## Branch/commit

- Branch: `...`
- Commit: `...`

## Threat model

<!-- Who can attempt what, against which table(s), and what's the worst case if they succeed. -->

## RLS

<!-- For each affected table: SELECT/INSERT/UPDATE/DELETE policy summary, and whether it was independently re-verified (not just read) against a cross-user scenario. -->

## Ownership

- Owner/user id source: session-derived / accepted from caller (should always be the former)
- Cross-user write attempt tested: yes/no, result

## Payload allowlist

- Explicit allowlist confirmed: yes/no
- Unknown-key injection tested: yes/no, result
- Privileged-field injection tested (status, owner_id, etc.): yes/no, result

## Idempotency

- Stable ID strategy confirmed: yes/no
- Same-payload retry tested: yes/no, result
- Different-payload retry tested: yes/no, result (must be `duplicate_conflict`, not success)
- Inaccessible-duplicate tested: yes/no, result (must not reveal existence to non-owner)

## Conflict control

- Atomic `updated_at` filter confirmed in the actual query (not just in comments): yes/no
- Stale-write tested: yes/no, result
- Cache-on-conflict tested: yes/no, result (cache must be unchanged)

## Cache isolation

- Cross-user cache leak tested: yes/no, result
- Failed-write cache corruption tested: yes/no, result

## Sensitive files

- `.env*`, migrations, package/lock, Vercel config confirmed unchanged: yes/no

## Findings by severity

| Severity | File/line | Finding | Exploit/data risk | Block commit |
|---|---|---|---|---|

## Decision

<!-- APPROVED FOR COMMIT / CHANGES REQUIRED / REJECTED -->
