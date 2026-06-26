# =====================================================================
# install-meshagent.ps1
#
# Installs the MeshCentral mesh agent and registers it with the BOS-OMEGA
# self-hosted MeshCentral server (Round C).
#
# Stub for Round B — full impl lands when MeshCentral adapter lands.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-meshagent.ps1 -MeshCentralUrl https://mesh.example.com
#
# BOS-OMEGA Round B/C
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$MeshCentralUrl,
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

function Log($msg) {
    Write-Host "[meshagent-install] $msg" -ForegroundColor Cyan
}

Log "Round B stub. Full impl in Round C."
Log "When ready, install with: $MeshCentralUrl on device $DeviceName"
Log "Reference: https://meshcentral.com/docs/MeshCentral/MeshAgentInstallation"