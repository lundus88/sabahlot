<#
.SYNOPSIS
  Read-only pre-commit gate. Confirms it is safe to commit the
  currently STAGED changes -- does not stage or commit anything itself.

.DESCRIPTION
  Run this after `git add <exact paths>` and before `git commit`, as a
  human-in-the-loop double-check. This script performs zero git
  mutations: no `git add`, no `git commit`, no `git restore`.

.PARAMETER ExpectedBranch
  The branch name this commit is expected to happen on. If omitted,
  the check is skipped (reported as SKIPPED, not PASS).

.PARAMETER RequireMigrationApprovalMarker
  If set, any staged file under supabase/migrations/** requires a file
  named `.ai-migration-approved` to exist at the repository root (a
  simple, explicit, human-created marker for "an owner has approved a
  migration in this sprint") -- otherwise the gate fails.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/ai/pre-commit-gate.ps1 -ExpectedBranch sprint-ai-f0-development-foundation
#>

param(
  [string]$ExpectedBranch = "",
  [switch]$RequireMigrationApprovalMarker
)

$failures = @()

Write-Output "=== pre-commit-gate.ps1 ==="

# 1. Correct branch
$currentBranch = (git branch --show-current 2>$null).Trim()
Write-Output "Current branch: $currentBranch"
if ($ExpectedBranch -ne "") {
  if ($currentBranch -ne $ExpectedBranch) {
    $failures += "Branch mismatch: expected '$ExpectedBranch', got '$currentBranch'"
  }
} else {
  Write-Output "(ExpectedBranch not provided -- branch check SKIPPED, not PASS)"
}

# 2. Exact staged files
$stagedFiles = git diff --cached --name-only 2>$null
Write-Output ""
Write-Output "--- Staged files ---"
if (-not $stagedFiles) {
  Write-Output "(none staged)"
  $failures += "No files are staged -- nothing to commit."
} else {
  $stagedFiles | ForEach-Object { Write-Output "  $_" }
}

# 3. No forbidden files among staged
$forbiddenPatterns = @(
  '^\.env',
  '^package\.json$',
  '^package-lock\.json$',
  '^supabase/\.temp/',
  '^next\.config\.',
  '^tsconfig\.json$',
  '^eslint\.config\.',
  '^vercel\.json$'
)
$forbiddenHits = @()
foreach ($file in $stagedFiles) {
  foreach ($pattern in $forbiddenPatterns) {
    if ($file -match $pattern) {
      $forbiddenHits += $file
    }
  }
}
if ($forbiddenHits.Count -gt 0) {
  Write-Output ""
  Write-Output "--- Forbidden staged files ---"
  $forbiddenHits | Select-Object -Unique | ForEach-Object { Write-Output "  $_" }
  $failures += "Forbidden file(s) staged: $($forbiddenHits -join ', ')"
}

# 4. No supabase/.temp/ specifically (belt and suspenders)
if ($stagedFiles -match '^supabase/\.temp/') {
  $failures += "supabase/.temp/ must never be staged/committed."
}

# 5. Migration staged without approval marker
$stagedMigrations = $stagedFiles | Where-Object { $_ -match '^supabase/migrations/' }
if ($stagedMigrations) {
  Write-Output ""
  Write-Output "--- Staged migration files ---"
  $stagedMigrations | ForEach-Object { Write-Output "  $_" }
  if ($RequireMigrationApprovalMarker) {
    if (-not (Test-Path ".ai-migration-approved")) {
      $failures += "Migration file(s) staged but '.ai-migration-approved' marker not found at repo root -- requires explicit owner approval for a migration sprint."
    } else {
      Write-Output "Migration approval marker found (.ai-migration-approved)."
    }
  } else {
    Write-Output "(RequireMigrationApprovalMarker not set -- not enforced this run; pass -RequireMigrationApprovalMarker to enforce)"
  }
}

# 6. Secret-shaped content in the staged diff
#
# Scans only ADDED lines (never removed/unchanged context lines), tracking
# which staged file each line belongs to via the "+++ b/<path>" diff header.
# A match is exempt ONLY if it appears on $secretScanAllowlist below, which
# requires BOTH the exact staged file path AND an exact structural line-shape
# match -- never a bare keyword, a whole file, or a whole directory. Every
# entry's Reason documents why that specific line is a detector-definition or
# documentation self-reference, not an actual credential. A real credential
# value (a service-role key assignment, bearer token, JWT, non-placeholder
# password, private-key marker, etc.) never matches these narrow shapes and
# therefore still fails this check.
# Canonical pattern set, kept identical to scripts/ai/verify-sabahlot.ps1's
# Section 9 so the two gates never disagree on the same file.
$secretPatterns = @('service_role', 'SUPABASE_SERVICE', 'createAdminClient', 'supabaseAdmin', '-----BEGIN', 'password\s*=\s*[''"]', 'secret\s*=\s*[''"]')

$secretScanAllowlist = @(
  @{
    File        = 'scripts/ai/pre-commit-gate.ps1'
    LinePattern = '^\+\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'scripts/ai/scan-cloud-operations.ps1'
    LinePattern = '^\+\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'scripts/ai/scan-cloud-operations.ps1'
    LinePattern = '^\+\s*Write-Output\s+"---.*pattern scan.*---"'
    Reason      = 'Static section-header banner naming the scan target, not a credential value.'
  },
  @{
    File        = 'scripts/ai/verify-sabahlot.ps1'
    LinePattern = '^\+\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'docs/ai/RELEASE_CHECKLIST.md'
    LinePattern = '^\+\d+\.\s+\*\*Secret scan\*\*\s+.'
    Reason      = 'Release-checklist bullet documenting the secret-scan requirement in prose, not a credential value.'
  }
)

$stagedDiffLines = @(git diff --cached 2>$null)
$currentFile = $null
$allowedHits = @()

foreach ($line in $stagedDiffLines) {
  if ($line -match '^\+\+\+ b/(.+)$') {
    $currentFile = $Matches[1]
    continue
  }
  if (-not $line.StartsWith('+') -or $line.StartsWith('+++')) {
    continue
  }

  foreach ($pattern in $secretPatterns) {
    if ($line -notmatch $pattern) { continue }

    $allowRule = $secretScanAllowlist | Where-Object {
      $_.File -eq $currentFile -and $line -match $_.LinePattern
    } | Select-Object -First 1

    if ($allowRule) {
      $allowedHits += "ALLOWED (confirmed false positive): $currentFile matches '$pattern' -- $($allowRule.Reason)"
    } else {
      $failures += "Staged diff matches a secret-shaped pattern '$pattern' in $currentFile (not on the allowlist)"
    }
  }
}

if ($allowedHits.Count -gt 0) {
  Write-Output ""
  Write-Output "--- Secret-scan allowlist hits (reviewed false positives) ---"
  $allowedHits | Select-Object -Unique | ForEach-Object { Write-Output "  $_" }
}

# 7. Tracked tree status (informational -- untracked files are expected
#    and fine; this just surfaces anything odd for human review).
Write-Output ""
Write-Output "--- Full git status (informational) ---"
git status

Write-Output ""
if ($failures.Count -gt 0) {
  Write-Output "--- FAILURES ---"
  $failures | ForEach-Object { Write-Output "  - $_" }
  Write-Output ""
  Write-Output "pre-commit-gate: FAIL"
  exit 1
} else {
  Write-Output "pre-commit-gate: PASS (informational check only -- this script does not commit anything)"
  exit 0
}
