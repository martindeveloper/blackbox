#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string]$CertificateBase64,

    [Parameter(Mandatory)]
    [string]$CertificatePassword,

    [string]$OutputPath = (Join-Path $env:RUNNER_TEMP "msix-signing.pfx")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CertificateBase64)) {
    throw "CertificateBase64 is required (set BBX_WINDOWS_SIGNING_CERTIFICATE secret for CI)."
}

if ([string]::IsNullOrWhiteSpace($CertificatePassword)) {
    throw "CertificatePassword is required (set BBX_WINDOWS_SIGNING_PASSWORD secret for CI)."
}

[IO.File]::WriteAllBytes(
    $OutputPath,
    [Convert]::FromBase64String($CertificateBase64)
)

$password = ConvertTo-SecureString `
    $CertificatePassword `
    -AsPlainText `
    -Force

Import-PfxCertificate `
    -FilePath $OutputPath `
    -CertStoreLocation Cert:\CurrentUser\My `
    -Password $password

Write-Host "Imported signing certificate to $OutputPath"
