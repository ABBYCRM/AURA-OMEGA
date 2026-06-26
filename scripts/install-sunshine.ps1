# =====================================================================
# install-sunshine.ps1
#
# Stub for Round D. Sunshine is the game-streaming server (Moonlight on phone).
# Installs silently and pins the default PIN.
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$Pin = "1234",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
function Log($msg) { Write-Host "[sunshine-install] $msg" -ForegroundColor Cyan }
Log "Round D stub. Will install Sunshine from https://github.com/LizardByte/Sunshine/releases/latest"
Log "Pin will be set to: $Pin (for $DeviceName)"