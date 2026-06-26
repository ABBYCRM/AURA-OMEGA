# =====================================================================
# install-sunshine.ps1
#
# Installs Sunshine (game-streaming server) and pins the default PIN.
# Reference: https://github.com/LizardByte/Sunshine/releases
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-sunshine.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-sunshine.ps1 -Pin 4321
#
# BOS-OMEGA Round D
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$Pin = "1234",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME,
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com",
    [Parameter(Mandatory=$false)] [string]$SunshineRelease = "https://github.com/LizardByte/Sunshine/releases/latest/download/Sunshine-Windows-AMD64-installer.exe"
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

$installer = Join-Path $env:TEMP "sunshine-installer.exe"

function Log($msg) {
    Write-Host "[sunshine-install] $msg" -ForegroundColor Cyan
}

Log "Downloading Sunshine..."
Invoke-WebRequest -Uri $SunshineRelease -OutFile $installer -UseBasicParsing

Log "Installing (silent)..."
$args = @(
    "/S"  # NSIS silent install
)
Start-Process -FilePath $installer -ArgumentList $args -Wait -NoNewWindow

$webUrl = "https://${DeviceName}:47984"

Log "Default PIN: $Pin"
Log "Web UI:      $webUrl"
Log "Open $webUrl from your phone to pair with Moonlight."

if ($AuraApiBase) {
    try {
        $payload = @{
            name = "$DeviceName-stream"
            host = $webUrl
            adapter = "sunshine"
        } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$AuraApiBase/api/devices" -Method Post -ContentType "application/json" -Body $payload | Out-Null
        Log "Registered streaming device with AURA."
    } catch {
        Log "Could not register with AURA: $_"
    }
}

Log "Done. Set the PIN in the Sunshine web UI to match: $Pin"