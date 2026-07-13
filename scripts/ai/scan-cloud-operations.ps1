<#
.SYNOPSIS
  Inventories every Supabase write-shaped call and every
  service-role/admin-client pattern under a given path. Read-only.

.DESCRIPTION
  Does not modify any file. Does not execute any SQL or network call --
  this is a static text scan only (ripgrep-style patterns via
  Select-String). Intended to be run before every commit that touches
  src/lib/land-records/** (or any future cloud-write module) so a
  reviewer can see, at a glance, exactly which tables are written to.

.PARAMETER Path
  Root path to scan (default: src/lib).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/ai/scan-cloud-operations.ps1
#>

param(
  [string]$Path = "src/lib"
)

Write-Output "=== scan-cloud-operations.ps1 ==="
Write-Output "Scanning: $Path"
Write-Output ""

if (-not (Test-Path $Path)) {
  Write-Output "Path not found: $Path"
  exit 1
}

$files = Get-ChildItem -Path $Path -Recurse -Include *.ts,*.tsx -File -ErrorAction SilentlyContinue

$operationPattern = '\.(insert|update|upsert|delete|rpc)\('
$secretPatterns = @("service_role", "SUPABASE_SERVICE", "createAdminClient", "supabaseAdmin")

$results = @()
$secretHits = @()

foreach ($file in $files) {
  $lines = Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
  if (-not $lines) { continue }

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNumber = $i + 1

    if ($line -match $operationPattern) {
      $operation = $Matches[1]

      # Best-effort table name: look backwards up to 5 lines for the
      # nearest .from("table_name") / .from('table_name').
      $table = "(unknown -- see file/line)"
      for ($back = $i; $back -ge [Math]::Max(0, $i - 5); $back--) {
        if ($lines[$back] -match '\.from\(\s*["'']([a-zA-Z0-9_]+)["'']') {
          $table = $Matches[1]
          break
        }
      }

      $results += [PSCustomObject]@{
        File      = $file.FullName.Substring((Get-Location).Path.Length + 1)
        Table     = $table
        Operation = $operation
        Line      = $lineNumber
      }
    }

    foreach ($pattern in $secretPatterns) {
      if ($line -match [regex]::Escape($pattern)) {
        $secretHits += [PSCustomObject]@{
          File    = $file.FullName.Substring((Get-Location).Path.Length + 1)
          Line    = $lineNumber
          Pattern = $pattern
        }
      }
    }
  }
}

Write-Output "--- Database operation inventory ---"
if ($results.Count -eq 0) {
  Write-Output "(none found)"
} else {
  $results | Sort-Object File, Line | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
}

Write-Output ""
Write-Output "--- service_role / admin-client pattern scan ---"
if ($secretHits.Count -eq 0) {
  Write-Output "(none found)"
} else {
  $secretHits | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
}

Write-Output ""
Write-Output "Reminder: this script only lists what it finds. A human/reviewer"
Write-Output "must still confirm each operation's table and scope match what the"
Write-Output "current sprint's report claims -- this script does not know sprint scope."

if ($secretHits.Count -gt 0) {
  Write-Output ""
  Write-Output "scan-cloud-operations: FAIL (service-role/admin-client pattern found)"
  exit 1
}

Write-Output ""
Write-Output "scan-cloud-operations: PASS (no service-role/admin-client pattern found; review the operation inventory above manually against sprint scope)"
exit 0
