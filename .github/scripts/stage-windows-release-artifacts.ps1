#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string]$ReleaseDir,

    [Parameter(Mandatory)]
    [string]$OutputDir,

    [Parameter(Mandatory)]
    [string]$Architecture,

    [Parameter(Mandatory)]
    [string]$PackageFormat
)

$ErrorActionPreference = "Stop"

Write-Host "Release directory contents:"
Get-ChildItem -LiteralPath $ReleaseDir -Force | ForEach-Object { Write-Host "  $($_.Name)" }

if (Test-Path -LiteralPath $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputDir | Out-Null

$staged = @()

if ($PackageFormat -eq "msix" -or $PackageFormat -eq "all") {
    $sideloadBundles = @(Get-ChildItem -LiteralPath $ReleaseDir -Filter "*-sideload.zip")

    if ($sideloadBundles.Count -eq 0) {
        throw "No sideload bundle found in $ReleaseDir"
    }

    $destinationName = "blackbox-editor-$Architecture.zip"
    Copy-Item -LiteralPath $sideloadBundles[0].FullName -Destination (Join-Path $OutputDir $destinationName)
    $staged += $destinationName
}

if ($PackageFormat -eq "zip" -or $PackageFormat -eq "all") {
    $portableArchives = @(
        Get-ChildItem -LiteralPath $ReleaseDir -Filter "*.zip" |
            Where-Object { $_.Name -notlike "*-sideload.zip" }
    )

    if ($portableArchives.Count -eq 0) {
        throw "No portable zip found in $ReleaseDir"
    }

    $destinationName = if ($PackageFormat -eq "all") {
        "blackbox-editor-$Architecture-portable.zip"
    } else {
        "blackbox-editor-$Architecture.zip"
    }

    Copy-Item -LiteralPath $portableArchives[0].FullName -Destination (Join-Path $OutputDir $destinationName)
    $staged += $destinationName
}

Write-Host "Staged artifacts:"
Get-ChildItem -LiteralPath $OutputDir | ForEach-Object { Write-Host "  $($_.Name)" }

if ($staged.Count -eq 0) {
    throw "No artifacts staged for package format '$PackageFormat'"
}
