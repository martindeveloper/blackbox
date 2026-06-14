#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string]$CertificatePath,

    [Parameter(Mandatory)]
    [string]$CertificatePassword,

    [Parameter(Mandatory)]
    [string]$MsixGlob
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CertificatePath)) {
    throw "Signing certificate not found at $CertificatePath"
}

$signTool = Get-ChildItem `
    "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $signTool) {
    throw "signtool.exe not found. Install the Windows SDK on the runner."
}

$msixFiles = Get-ChildItem -Path $MsixGlob

if ($msixFiles.Count -eq 0) {
    throw "No MSIX files found matching $MsixGlob"
}

foreach ($msix in $msixFiles) {
    Write-Host "Signing $($msix.FullName)"
    & $signTool.FullName sign `
        /fd SHA256 `
        /a `
        /f $CertificatePath `
        /p $CertificatePassword `
        /tr "http://timestamp.digicert.com" `
        /td SHA256 `
        $msix.FullName
}
