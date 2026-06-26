#Requires -Version 7.0
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Host "Administrator approval is required to trust the signing certificate."
    Start-Process pwsh `
        -Verb RunAs `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", $PSCommandPath
        )
    exit 0
}

$cerPath = Join-Path $Root "msix-signing.cer"
$msix = Get-ChildItem -Path (Join-Path $Root "*.msix") | Select-Object -First 1

if (-not (Test-Path -LiteralPath $cerPath)) {
    throw "msix-signing.cer not found in $Root"
}

if (-not $msix) {
    throw "No .msix file found in $Root"
}

Write-Host "Installing signing certificate to Local Machine > Trusted People..."
Import-Certificate `
    -FilePath $cerPath `
    -CertStoreLocation Cert:\LocalMachine\TrustedPeople `
    | Out-Null

Write-Host "Installing $($msix.Name)..."
Add-AppxPackage -Path $msix.FullName

Write-Host "Done. BlackboxEditor is installed."
