# =====================================================================
# install-scrcpy.ps1
#
# Stub for Round D. Drops scrcpy + adb into C:\Program Files\scrcpy\
# so we can control an Android device attached to this PC.
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME
)
$ErrorActionPreference = "Stop"
function Log($msg) { Write-Host "[scrcpy-install] $msg" -ForegroundColor Cyan }
Log "Round D stub. Will install scrcpy from https://github.com/Genymobile/scrcpy/releases/latest"