<#.SYNOPSIS
  Create directory junctions: _blueprints/<name> -> sibling app under Documents/apps (or $env:BUILDER_APPS_ROOT).
.DESCRIPTION
  Deep agent filesystem tools are scoped to this repo. Linking optional Qwik apps here lets the builder read them as blueprints.
#>
param(
  [string]$AppsRoot = $env:BUILDER_APPS_ROOT
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$BlueprintsDir = Join-Path $RepoRoot "_blueprints"

if (-not $AppsRoot) {
  $AppsRoot = Split-Path $RepoRoot -Parent
}

$names = @("spelling-game", "koolinart", "iriparo", "crypto-helper")

if (-not (Test-Path $BlueprintsDir)) {
  New-Item -ItemType Directory -Path $BlueprintsDir | Out-Null
}

Write-Host "Apps root: $AppsRoot"
Write-Host "Blueprint targets under: $BlueprintsDir"
Write-Host ""

foreach ($name in $names) {
  $src = Join-Path $AppsRoot $name
  $dst = Join-Path $BlueprintsDir $name

  if (-not (Test-Path $src)) {
    Write-Host "[skip] $name — source not found: $src"
    continue
  }

  if (Test-Path $dst) {
    Write-Host "[skip] $name — already exists: $dst"
    continue
  }

  cmd.exe /c mklink /J "$dst" "$src" | Out-Null
  Write-Host "[ok]   $name -> $dst"
}

Write-Host ""
Write-Host "Done. Junctions are gitignored under _blueprints/spelling-game, koolinart, iriparo, crypto-helper."
