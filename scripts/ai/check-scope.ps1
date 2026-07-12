<#
.SYNOPSIS
  Checks that all changed files (tracked + untracked) are within an
  allowed-path list, and none match a forbidden-path list.

.DESCRIPTION
  Read-only. Never stages, commits, or modifies any file. Exits 0 if
  every changed file is in scope, non-zero otherwise.

.PARAMETER BaseRef
  Git ref to diff against (default: origin/main).

.PARAMETER AllowedPaths
  Array of path prefixes/globs (simple prefix match) that are allowed
  to change. Defaults to the Sprint AI-F0 scope.

.PARAMETER ForbiddenPaths
  Array of path prefixes that must never appear in the diff, even if
  they'd otherwise match an allowed prefix. Defaults to the standing
  SabahLot forbidden list.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/ai/check-scope.ps1
  powershell -ExecutionPolicy Bypass -File scripts/ai/check-scope.ps1 -BaseRef origin/main -AllowedPaths @("src/lib/land-records/")
#>

param(
  [string]$BaseRef = "origin/main",
  [string[]]$AllowedPaths = @(
    "docs/ai/",
    "scripts/ai/",
    ".github/pull_request_template.md",
    ".github/ISSUE_TEMPLATE/",
    "CLAUDE.md",
    "AGENTS.md"
  ),
  [string[]]$ForbiddenPaths = @(
    ".env",
    "package.json",
    "package-lock.json",
    "supabase/migrations/",
    "supabase/.temp/",
    "next.config.",
    "tsconfig.json",
    "eslint.config.",
    "vercel.json",
    "src/lib/local-lots.ts"
  )
)

function Test-PathAllowed {
  param([string]$Path, [string[]]$Prefixes)
  foreach ($prefix in $Prefixes) {
    if ($Path -like "$prefix*" -or $Path -eq $prefix) {
      return $true
    }
  }
  return $false
}

Write-Output "=== check-scope.ps1 ==="
Write-Output "Base ref: $BaseRef"

$trackedChanged = git diff --name-only $BaseRef 2>$null
if (-not $trackedChanged) { $trackedChanged = git diff --name-only 2>$null }
$untracked = git ls-files --others --exclude-standard 2>$null

$allChanged = @()
if ($trackedChanged) { $allChanged += $trackedChanged }
if ($untracked) { $allChanged += $untracked }
$allChanged = $allChanged | Where-Object { $_ -and $_.Trim() -ne "" } | Select-Object -Unique

if ($allChanged.Count -eq 0) {
  Write-Output "No changed files detected."
  Write-Output "check-scope: PASS"
  exit 0
}

$outsideScope = @()
$forbiddenHit = @()
$allowedList = @()

foreach ($file in $allChanged) {
  $isForbidden = Test-PathAllowed -Path $file -Prefixes $ForbiddenPaths
  $isAllowed = Test-PathAllowed -Path $file -Prefixes $AllowedPaths

  if ($isForbidden) {
    $forbiddenHit += $file
  } elseif ($isAllowed) {
    $allowedList += $file
  } else {
    $outsideScope += $file
  }
}

Write-Output ""
Write-Output "--- Changed files ($($allChanged.Count)) ---"
$allChanged | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "--- Allowed ($($allowedList.Count)) ---"
$allowedList | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "--- Outside scope ($($outsideScope.Count)) ---"
$outsideScope | ForEach-Object { Write-Output "  $_" }

Write-Output ""
Write-Output "--- Forbidden path matched ($($forbiddenHit.Count)) ---"
$forbiddenHit | ForEach-Object { Write-Output "  $_" }

Write-Output ""
if ($outsideScope.Count -gt 0 -or $forbiddenHit.Count -gt 0) {
  Write-Output "check-scope: FAIL"
  exit 1
} else {
  Write-Output "check-scope: PASS"
  exit 0
}
