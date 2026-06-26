# =====================================================================
# install-meshagent.ps1
#
# Installs the MeshCentral mesh agent and connects it to a MeshCentral server.
# Reference: https://meshcentral.com/docs/MeshCentral/MeshAgentInstallation
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-meshagent.ps1 -MeshCentralUrl https://mesh.example.com
#
# BOS-OMEGA Round C
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$MeshCentralUrl = "https://mesh.example.com",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME,
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com"
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

$installer = Join-Path $env:TEMP "meshagent.msi"

function Log($msg) {
    Write-Host "[meshagent-install] $msg" -ForegroundColor Cyan
}

if (-not $MeshCentralUrl) {
    throw "MeshCentralUrl required (e.g. https://mesh.example.com)"
}

Log "Generating agent invite from $MeshCentralUrl..."
try {
    # The MeshCentral server's "Add Agent" page exposes a link with an
    # embedded install command. Operators can paste it directly. For
    # unattended installs we hit the server's agent-link endpoint.
    $response = Invoke-WebRequest -Uri "$MeshCentralUrl/meshserver?action=createagent" -UseBasicParsing -ErrorAction Stop
    $agentMsIUrl = ($response.Content | Select-String -Pattern "https://[^\"'\s]+\.msi" -AllMatches).Matches[0].Value
} catch {
    Log "Could not auto-fetch agent installer URL. Visit $MeshCentralUrl in a browser and copy the agent link manually."
    throw $_
}

Log "Downloading mesh agent MSI..."
Invoke-WebRequest -Uri $agentMsIUrl -OutFile $installer -UseBasicParsing

Log "Installing mesh agent (silent)..."
$msiArgs = @(
    "/i", "`"$installer`""
    "/qn"
)
Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -NoNewWindow

$meshagentExe = "${env:ProgramFiles}\Mesh Agent\meshagent.exe"
if (-not (Test-Path $meshagentExe)) {
    $meshagentExe = "${env:ProgramFiles(x86)}\Mesh Agent\meshagent.exe"
}
if (-not (Test-Path $meshagentExe)) {
    throw "Mesh agent install succeeded but meshagent.exe not found."
}

Log "Mesh agent installed. The device should appear in the MeshCentral dashboard shortly."

if ($AuraApiBase) {
    try {
        $payload = @{
            name    = $DeviceName
            host    = $DeviceName
            adapter = "meshcentral"
        } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$AuraApiBase/api/devices" -Method Post -ContentType "application/json" -Body $payload | Out-Null
        Log "Registered device with AURA."
    } catch {
        Log "Could not register with AURA: $_"
    }
}