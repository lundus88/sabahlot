<#
.SYNOPSIS
  Compile and execute every SabahLot *.qa.ts / *.qa.tsx script.

.DESCRIPTION
  Read-only QA harness for CI/release verification. Each QA script uses its
  adjacent <name>.qa.tsconfig.json when present; recent focused QA scripts
  without a dedicated config are compiled ad hoc with conservative CommonJS
  settings. Output is written only under .qa-out and removed at the end.
#>

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

$outRoot = Join-Path $repoRoot ".qa-out"
if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
New-Item -ItemType Directory -Path $outRoot | Out-Null

$qaFiles = Get-ChildItem -Path (Join-Path $repoRoot "src") -Recurse -File |
  Where-Object { $_.Name -like "*.qa.ts" -or $_.Name -like "*.qa.tsx" } |
  Sort-Object FullName

if (-not $qaFiles -or $qaFiles.Count -eq 0) {
  throw "No *.qa.ts/*.qa.tsx scripts found."
}

Write-Output "Discovered $($qaFiles.Count) QA scripts."
$passed = 0
$index = 0

try {
  foreach ($qaFile in $qaFiles) {
    $index += 1
    $relativeQa = $qaFile.FullName.Substring($repoRoot.Length + 1)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($qaFile.Name)
    $configPath = Join-Path $qaFile.DirectoryName ($baseName + ".tsconfig.json")
    $outDir = Join-Path $outRoot ("qa-{0:D2}" -f $index)
    New-Item -ItemType Directory -Path $outDir | Out-Null

    Write-Output ""
    Write-Output "[$index/$($qaFiles.Count)] $relativeQa"

    if (Test-Path $configPath) {
      $relativeConfig = $configPath.Substring($repoRoot.Length + 1)
      Write-Output "  compile: dedicated config $relativeConfig"
      & npx tsc -p $configPath --outDir $outDir
    } else {
      Write-Output "  compile: ad hoc isolated config (no adjacent qa tsconfig)"
      & npx tsc $qaFile.FullName `
        --target ES2022 `
        --module CommonJS `
        --moduleResolution Node `
        --esModuleInterop `
        --skipLibCheck `
        --strict `
        --jsx react-jsx `
        --rootDir (Join-Path $repoRoot "src") `
        --outDir $outDir
    }

    if ($LASTEXITCODE -ne 0) {
      throw "Compilation failed for $relativeQa (exit $LASTEXITCODE)."
    }

    $expectedJs = $baseName + ".js"
    $compiled = Get-ChildItem -Path $outDir -Recurse -File -Filter $expectedJs |
      Select-Object -First 1
    if (-not $compiled) {
      throw "Compiled JS not found for $relativeQa (expected $expectedJs under $outDir)."
    }

    Write-Output "  execute: $($compiled.FullName.Substring($repoRoot.Length + 1))"
    & node $compiled.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "QA execution failed for $relativeQa (exit $LASTEXITCODE)."
    }

    $passed += 1
    Write-Output "  result: PASS"
  }

  Write-Output ""
  Write-Output "Full QA runner: PASS ($passed/$($qaFiles.Count))"
} finally {
  if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
}
