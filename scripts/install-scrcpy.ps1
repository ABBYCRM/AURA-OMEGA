# =====================================================================
# install-scrcpy.ps1
#
# Downloads scrcpy + adb into C:\Program Files\scrcpy\ and adds to PATH.
# Reference: https://github.com/Genymobile/scrcpy/releases
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-scrcpy.ps1
#
# BOS-OMEGA Round D
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME,
    [Parameter(Mandatory=$false)] [string]$ScrcpyRelease = "https://github.com/Genymobile/scrcpy/releases/download/v3.2/scrcpy-win64-v3.2.zip"
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

$installDir = "${env:ProgramFiles}\scrcpy"
$zipPath    = Join-Path $env:TEMP "scrcpy.zip"

function Log($msg) {
    Write-Host "[scrcpy-install] $msg" -ForegroundColor Cyan
}

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

Log "Downloading scrcpy..."
Invoke-WebRequest -Uri $ScrcpyRelease -OutFile $zipPath -UseBasicParsing

Log "Extracting to $installDir..."
Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

# Add to PATH for the current user.
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir", "User")
    Log "Added $installDir to user PATH."
}

Log "Done. Verify with: scrcpy --version"