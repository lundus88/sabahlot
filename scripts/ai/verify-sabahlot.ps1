<#
.SYNOPSIS
  Full read-only verification pass for a SabahLot sprint: git hygiene,
  forbidden-file/secret scans, cloud-operation inventory, and static
  verification (TypeScript / ESLint / build / QA).

.DESCRIPTION
  Does not modify any file. Does not run a database migration. Does
  not perform any cloud write. Does not read or print secret VALUES
  (only whether a secret-shaped pattern appears, and where). Exits
  non-zero if any blocking finding is detected.

.PARAMETER BaseRef
  Git ref to diff changed files against (default: origin/main).

.PARAMETER SkipBuild
  Skip `npm run build` (useful for a quick doc-only sprint check).

.PARAMETER SkipQa
  Skip discovering/running *.qa.ts scripts.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/ai/verify-sabahlot.ps1
#>

param(
  [string]$BaseRef = "origin/main",
  [switch]$SkipBuild,
  [switch]$SkipQa
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if ($repoRoot) { Set-Location $repoRoot }

$blockers = @()

function Write-Section {
  param([string]$Title)
  Write-Output ""
  Write-Output "================================================================"
  Write-Output "  $Title"
  Write-Output "================================================================"
}

Write-Section "1. Git branch check"
$branch = (git branch --show-current 2>$null).Trim()
Write-Output "Branch: $branch"
if ($branch -eq "main") {
  Write-Output "WARNING: currently on 'main' -- verify this is intentional (most sprints should be on a feature branch)."
}

Write-Section "2. Git status check"
git status
$trackedDirty = git diff --stat 2>$null
$untracked = git ls-files --others --exclude-standard 2>$null

Write-Section "3. Changed-file inventory"
# NOTE ON SCAN BASIS: this list (and every section below that uses
# $allChanged) is computed from the WORKING TREE -- tracked diff against
# $BaseRef (staged + unstaged) plus all untracked files -- NOT strictly the
# staged snapshot that `git commit` would actually record. For the
# staged-snapshot-only view immediately before a commit, use
# scripts/ai/pre-commit-gate.ps1, which scans `git diff --cached` exclusively.
# The comparison below makes any divergence between the two bases explicit
# and deterministic rather than silently assuming they are always the same.
$trackedChanged = git diff --name-only $BaseRef 2>$null
if (-not $trackedChanged) { $trackedChanged = git diff --name-only 2>$null }
$allChanged = @()
if ($trackedChanged) { $allChanged += $trackedChanged }
if ($untracked) { $allChanged += $untracked }
$allChanged = $allChanged | Where-Object { $_ -and $_.Trim() -ne "" } | Select-Object -Unique
if ($allChanged.Count -eq 0) {
  Write-Output "(no changes detected against $BaseRef and no untracked files)"
} else {
  $allChanged | ForEach-Object { Write-Output "  $_" }
}

$stagedNameOnly = @(git diff --cached --name-only 2>$null) | Where-Object { $_ -and $_.Trim() -ne "" }
$workingTreeOnly = @($allChanged | Where-Object { $stagedNameOnly -notcontains $_ })
$stagedOnly = @($stagedNameOnly | Where-Object { $allChanged -notcontains $_ })
Write-Output ""
if ($workingTreeOnly.Count -gt 0 -or $stagedOnly.Count -gt 0) {
  Write-Output "--- Staged vs. working-tree scan-basis divergence (informational, not a blocker) ---"
  if ($workingTreeOnly.Count -gt 0) {
    Write-Output "  In this working-tree scan but NOT staged (would not be committed by pre-commit-gate.ps1):"
    $workingTreeOnly | ForEach-Object { Write-Output "    $_" }
  }
  if ($stagedOnly.Count -gt 0) {
    Write-Output "  Staged but not present in this working-tree scan (unexpected -- investigate):"
    $stagedOnly | ForEach-Object { Write-Output "    $_" }
  }
  Write-Output "  This verifier scans the working tree; scripts/ai/pre-commit-gate.ps1 scans the staged snapshot only. Run both before committing."
} else {
  Write-Output "(staged snapshot and working-tree changed-file list are identical -- no scan-basis divergence)"
}

Write-Section "4. Forbidden-file scan"
$forbiddenPatterns = @(
  @{ Name = ".env"; Pattern = '(^|/)\.env' },
  @{ Name = "package.json"; Pattern = '(^|/)package\.json$' },
  @{ Name = "package-lock.json"; Pattern = '(^|/)package-lock\.json$' },
  @{ Name = "supabase/migrations"; Pattern = '(^|/)supabase/migrations/' },
  @{ Name = "supabase/.temp"; Pattern = '(^|/)supabase/\.temp/' },
  @{ Name = "next.config"; Pattern = '(^|/)next\.config\.' },
  @{ Name = "tsconfig.json"; Pattern = '(^|/)tsconfig\.json$' },
  @{ Name = "eslint config"; Pattern = '(^|/)eslint\.config\.' },
  @{ Name = "vercel.json"; Pattern = '(^|/)vercel\.json$' }
)
$forbiddenHits = @()
foreach ($file in $allChanged) {
  foreach ($fp in $forbiddenPatterns) {
    if ($file -match $fp.Pattern) {
      $forbiddenHits += [PSCustomObject]@{ File = $file; Rule = $fp.Name }
    }
  }
}
if ($forbiddenHits.Count -eq 0) {
  Write-Output "(no forbidden-path matches)"
} else {
  $forbiddenHits | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
  $blockers += "Forbidden file(s) changed -- see table above."
}

Write-Section "5. .env scan (existence/reference only -- values never read)"
$envReferenced = $allChanged | Where-Object { $_ -match '\.env' }
if ($envReferenced) {
  $blockers += ".env-related file(s) appear in the changed-file list: $($envReferenced -join ', ')"
  Write-Output "FOUND: $($envReferenced -join ', ')"
} else {
  Write-Output "(no .env file changed)"
}

Write-Section "6. Migration-change scan"
$migrationsChanged = $allChanged | Where-Object { $_ -match '^supabase/migrations/' }
if ($migrationsChanged) {
  Write-Output "FOUND:"
  $migrationsChanged | ForEach-Object { Write-Output "  $_" }
  $blockers += "Migration file(s) changed -- requires an explicitly-scoped migration sprint."
} else {
  Write-Output "(no migration files changed)"
}

Write-Section "7. Package/lock scan"
$packageChanged = $allChanged | Where-Object { $_ -match '(^|/)package(-lock)?\.json$' }
if ($packageChanged) {
  Write-Output "FOUND: $($packageChanged -join ', ')"
  $blockers += "package.json/package-lock.json changed."
} else {
  Write-Output "(no package/lock file changed)"
}

Write-Section "8. Vercel config scan"
$vercelChanged = $allChanged | Where-Object { $_ -match 'vercel\.json$' }
if ($vercelChanged) {
  Write-Output "FOUND: $($vercelChanged -join ', ')"
  $blockers += "Vercel config changed."
} else {
  Write-Output "(no Vercel config changed)"
}

Write-Section "9. service-role / secret pattern scan (changed files only)"
#
# Uses the SAME canonical pattern list and the SAME narrow, auditable
# allowlist structure as scripts/ai/pre-commit-gate.ps1, so the two gates
# never disagree on the same file. This section scans the CURRENT CONTENT
# of every file in the working-tree changed-file list above (not a diff),
# line by line. A match is exempt ONLY if it appears on
# $secretScanAllowlist below, which requires BOTH the exact file path AND
# an exact structural line-shape match -- never a bare keyword, a whole
# file, or a whole directory. A real credential value (a service-role key
# assignment, GitHub/Supabase token, non-placeholder password, private-key
# marker, admin-client instantiation, etc.) never matches these narrow
# shapes and therefore still fails this check.
$secretPatterns = @('service_role', 'SUPABASE_SERVICE', 'createAdminClient', 'supabaseAdmin', '-----BEGIN', 'password\s*=\s*[''"]', 'secret\s*=\s*[''"]')

$secretScanAllowlist = @(
  @{
    File        = 'scripts/ai/pre-commit-gate.ps1'
    LinePattern = '^\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'scripts/ai/scan-cloud-operations.ps1'
    LinePattern = '^\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'scripts/ai/scan-cloud-operations.ps1'
    LinePattern = '^\s*Write-Output\s+"---.*pattern scan.*---"'
    Reason      = 'Static section-header banner naming the scan target, not a credential value.'
  },
  @{
    File        = 'scripts/ai/verify-sabahlot.ps1'
    LinePattern = '^\s*\$secretPatterns\s*=\s*@\('
    Reason      = "Scanner's own secret-pattern-name array literal, not an assigned credential."
  },
  @{
    File        = 'docs/ai/RELEASE_CHECKLIST.md'
    LinePattern = '^\d+\.\s+\*\*Secret scan\*\*\s+.'
    Reason      = 'Release-checklist bullet documenting the secret-scan requirement in prose, not a credential value.'
  }
)

$secretHits = @()
$allowedSecretHits = @()
foreach ($file in $allChanged) {
  if (-not (Test-Path $file)) { continue }
  if ((Get-Item $file -ErrorAction SilentlyContinue).PSIsContainer) { continue }
  $lines = Get-Content -LiteralPath $file -ErrorAction SilentlyContinue
  if (-not $lines) { continue }

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    foreach ($pattern in $secretPatterns) {
      if ($line -notmatch $pattern) { continue }

      $allowRule = $secretScanAllowlist | Where-Object {
        $_.File -eq $file -and $line -match $_.LinePattern
      } | Select-Object -First 1

      if ($allowRule) {
        $allowedSecretHits += "ALLOWED (confirmed false positive): ${file}:$($i + 1) matches '$pattern' -- $($allowRule.Reason)"
      } else {
        $secretHits += [PSCustomObject]@{ File = $file; Line = $i + 1; Pattern = $pattern }
      }
    }
  }
}

if ($allowedSecretHits.Count -gt 0) {
  Write-Output ""
  Write-Output "--- Secret-scan allowlist hits (reviewed false positives) ---"
  $allowedSecretHits | Select-Object -Unique | ForEach-Object { Write-Output "  $_" }
}

Write-Output ""
if ($secretHits.Count -eq 0) {
  Write-Output "(no unresolved secret-shaped pattern found)"
} else {
  $secretHits | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
  $blockers += "Secret-shaped pattern found in changed files -- see table above."
}

Write-Section "10. Cloud-operation inventory"
if (Test-Path "src/lib") {
  & (Join-Path $scriptDir "scan-cloud-operations.ps1") -Path "src/lib"
} else {
  Write-Output "(src/lib not present in this worktree -- skipping)"
}

Write-Section "11. TypeScript"
if (Test-Path "tsconfig.json") {
  npx tsc --noEmit
  if ($LASTEXITCODE -ne 0) {
    $blockers += "TypeScript check failed (npx tsc --noEmit exited $LASTEXITCODE)."
  } else {
    Write-Output "TypeScript: PASS"
  }
} else {
  Write-Output "(no tsconfig.json in this worktree -- skipping; expected for a docs/scripts-only worktree)"
}

Write-Section "12. ESLint"
if ((Test-Path "eslint.config.mjs") -or (Test-Path "eslint.config.js")) {
  npx eslint .
  if ($LASTEXITCODE -ne 0) {
    $blockers += "ESLint reported errors (exit $LASTEXITCODE)."
  } else {
    Write-Output "ESLint: PASS"
  }
} else {
  Write-Output "(no ESLint config in this worktree -- skipping)"
}

Write-Section "13. Build"
if ($SkipBuild) {
  Write-Output "(-SkipBuild passed -- skipped)"
} elseif (Test-Path "package.json") {
  npm run build
  if ($LASTEXITCODE -ne 0) {
    $blockers += "npm run build failed (exit $LASTEXITCODE)."
  } else {
    Write-Output "Build: PASS"
  }
} else {
  Write-Output "(no package.json in this worktree -- skipping; expected for a docs/scripts-only worktree)"
}

Write-Section "14. Project QA commands"
if ($SkipQa) {
  Write-Output "(-SkipQa passed -- skipped)"
} else {
  $qaFiles = Get-ChildItem -Path "src" -Recurse -Filter "*.qa.ts" -File -ErrorAction SilentlyContinue
  if (-not $qaFiles) {
    Write-Output "(no *.qa.ts files found -- expected for a docs/scripts-only worktree)"
  } else {
    Write-Output "Found $($qaFiles.Count) QA script(s). Each must be compiled via its own <name>.qa.tsconfig.json and run with node -- see docs/ai/SPRINT_TEMPLATE.md."
    Write-Output "This script lists them; it does not auto-compile/run them (each has a distinct tsconfig entry-file list that must be kept in sync by hand)."
    $qaFiles | ForEach-Object { Write-Output "  $($_.FullName.Substring($repoRoot.Length + 1))" }
  }
}

Write-Section "Summary"
if ($blockers.Count -gt 0) {
  Write-Output "BLOCKERS:"
  $blockers | ForEach-Object { Write-Output "  - $_" }
  Write-Output ""
  Write-Output "verify-sabahlot: FAIL"
  exit 1
} else {
  Write-Output "verify-sabahlot: PASS"
  exit 0
}
