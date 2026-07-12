# SabahLot — AI Agent File Ownership

Defines which agent role may touch which files during a multi-agent ("AI factory") sprint. An agent must not edit a file outside its own ownership, even if it seems convenient — cross-cutting changes go through the Foundation or Integration Agent instead.

## Foundation Agent
**Owns:** `docs/ai/**`, `scripts/ai/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`, and any shared type/contract file that multiple module agents depend on (e.g. `src/lib/land-records/child-types.ts`).
**May not touch:** any module-specific repository/validation/coordinator file (those belong to the relevant module agent).

## Geometry Agent
**Owns:** `src/lib/land-records/geometry-*.ts` (repository, validation, cache, write-coordinator) and `src/lib/land-records/geometry-write.qa.ts` + its tsconfig.
**May not touch:** `child-types.ts`, `points-*`, `parties-*`, `write-coordinator.ts` (land_records parent), any file outside `src/lib/land-records/`.

## Points Agent
**Owns:** `src/lib/land-records/points-repository.ts`, `points-validation.ts`, points write-coordinator, and the points QA file, once these exist. Create-only scope (ADR-011) — must not add an update/delete path.
**May not touch:** geometry-*, parties-*, `child-types.ts` (request changes to it via Foundation Agent).

## Parties Agent
**Owns:** `src/lib/land-records/parties-repository.ts`, `parties-validation.ts` (must enforce the PDPA-minimal allowlist per ADR-014 — no `id_number`), parties write-coordinator, and the parties QA file, once these exist.
**May not touch:** geometry-*, points-*, `child-types.ts`.

## Integration Agent
**Owns:** Any child-sync coordinator that combines geometry/points/parties results into one staged-sync flow, and cache-integration code that touches more than one child table's cache helper.
**Is the only agent permitted to modify shared files** (`child-types.ts`, `local-cache.ts`, `write-coordinator.ts`, `index.ts` exports) when a module agent's work requires a shared-file change — a module agent should request this rather than editing it directly.

## QA Agent
**Owns:** Nothing exclusively — operates read-only or QA-file-only across any module, to independently verify another agent's `.qa.ts` claims by re-running them and, where useful, writing additional targeted QA files.
**May not touch:** any non-QA repository/validation/coordinator file, and may not modify an existing `.qa.ts` file it didn't author without noting so explicitly in its report.

## Release Agent
**Owns:** Nothing in source — operates exclusively via git plumbing (`git status`, `git add <exact paths>`, `git commit`, `git push`, PR creation/merge) after an independent review has already returned PASS/APPROVED.
**May not touch:** any file's contents. If a Release Agent finds it needs to edit code to make a commit "work," that is itself a stop condition — return to the Builder/Integration Agent instead.

## Shared-file rule

Any file used by more than one module agent (`child-types.ts`, `local-cache.ts`, `write-coordinator.ts`, `index.ts`, `mapper.ts`, `feature-gate.ts`) may only be edited by the **Foundation** or **Integration** Agent, and only additively (export a new constant, add a new function) unless a specific sprint explicitly authorizes a breaking change to it. A module agent that believes it needs a shared-file change must say so in its report rather than making the edit itself.
