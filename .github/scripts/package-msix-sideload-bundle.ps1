#Requires -Version 7.0
param(
    [Parameter(Mandatory)]
    [string]$ReleaseDir,

    [Parameter(Mandatory)]
    [string]$CertificatePath,

    [Parameter(Mandatory)]
    [string]$InstallScriptDir
)

$ErrorActionPreference = "Stop"

$msixFiles = Get-ChildItem -Path (Join-Path $ReleaseDir "*.msix")

if ($msixFiles.Count -eq 0) {
    throw "No MSIX files found in $ReleaseDir"
}

if (-not (Test-Path -LiteralPath $CertificatePath)) {
    throw "Signing certificate not found at $CertificatePath"
}

$installFiles = @(
    "install-msix-sideload.ps1",
    "install-msix-sideload.cmd",
    "README-sideload.txt"
)

foreach ($installFile in $installFiles) {
    $source = Join-Path $InstallScriptDir $installFile
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Install bundle file not found at $source"
    }
}

foreach ($msix in $msixFiles) {
    $bundleName = [IO.Path]::GetFileNameWithoutExtension($msix.Name) + "-sideload.zip"
    $bundlePath = Join-Path $ReleaseDir $bundleName
    $stagingDir = Join-Path $env:RUNNER_TEMP ("msix-sideload-" + [Guid]::NewGuid().ToString("N"))

    New-Item -ItemType Directory -Path $stagingDir | Out-Null

    try {
        Copy-Item -LiteralPath $msix.FullName -Destination (Join-Path $stagingDir $msix.Name)
        Copy-Item -LiteralPath $CertificatePath -Destination (Join-Path $stagingDir "msix-signing.cer")

        foreach ($installFile in $installFiles) {
            Copy-Item -LiteralPath (Join-Path $InstallScriptDir $installFile) -Destination (Join-Path $stagingDir $installFile)
        }

        if (Test-Path -LiteralPath $bundlePath) {
            Remove-Item -LiteralPath $bundlePath -Force
        }

        Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $bundlePath -Force
        Write-Host "Created sideload bundle $bundlePath"
    }
    finally {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
