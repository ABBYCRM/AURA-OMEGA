# =====================================================================
# install-tailscale.ps1
#
# Run as Administrator on the Windows PC you want to control.
#
# What it does:
#   1. Downloads the official Tailscale MSI.
#   2. Silently installs it.
#   3. Starts tailscaled.
#   4. Prompts for an auth key (or accepts -AuthKey param).
#   5. Brings the node up.
#   6. Prints the MagicDNS name + 100.x IP so you can register the device.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-tailscale.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-tailscale.ps1 -AuthKey tskey-xxxxxxxxxxxx
#
# BOS-OMEGA Round B
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$AuthKey,
    [Parameter(Mandatory=$false)] [string]$Hostname,
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME,
    [switch]$Unattended
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

$tailscaleMsI   = "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi"
$tailscaleMsiPath = Join-Path $env:TEMP "tailscale-setup-amd64.msi"

function Log($msg) {
    Write-Host "[tailscale-install] $msg" -ForegroundColor Cyan
}

if (-not (Test-Path $tailscaleMsiPath)) {
    Log "Downloading Tailscale MSI..."
    Invoke-WebRequest -Uri $tailscaleMsI -OutFile $tailscaleMsiPath -UseBasicParsing
}

Log "Installing Tailscale (silent)..."
$msiArgs = @(
    "/i", "`"$tailscaleMsiPath`""
    "/qn"
    "TS_NOLAUNCH=1"
)
Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -NoNewWindow

$tailscaleExe = "${env:ProgramFiles}\Tailscale\tailscale.exe"
if (-not (Test-Path $tailscaleExe)) {
    $tailscaleExe = "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe"
}
if (-not (Test-Path $tailscaleExe)) {
    throw "Tailscale install succeeded but tailscale.exe not found."
}

Log "Starting tailscaled service..."
& sc.exe create tailscaled start=auto binPath="`"$tailscaleExe`"" | Out-Null
& sc.exe start tailscaled | Out-Null
Start-Sleep -Seconds 3

if ($Hostname) {
    Log "Setting hostname to $Hostname..."
    & $tailscaleExe set --hostname=$Hostname
}

if (-not $AuthKey) {
    if ($Unattended) {
        throw "AuthKey is required in unattended mode."
    }
    $AuthKey = Read-Host "Enter your Tailscale auth key (tskey-...)"
}

if ($AuthKey) {
    Log "Bringing node up with auth key..."
    & $tailscaleExe up --authkey=$AuthKey
} else {
    Log "Bringing node up (browser login)..."
    & $tailscaleExe up
}

Start-Sleep -Seconds 2
$statusJson = & $tailscaleExe status --json | Out-String
$tailscaleIp = (& $tailscaleExe ip -4) | Select-Object -First 1
$magicName   = (& $tailscaleExe status --json | ConvertFrom-Json).Self.DNSName

Log "Done. Tailscale IP: $tailscaleIp"
Log "MagicDNS name:    $magicName"

# Register with AURA if reachable.
if ($AuraApiBase) {
    try {
        $payload = @{
            name    = $DeviceName
            host    = $magicName
            adapter = "tailscale"
            tailscaleIp = $tailscaleIp
        } | ConvertTo-Json -Compress
        Log "Registering device with AURA at $AuraApiBase..."
        Invoke-RestMethod -Uri "$AuraApiBase/api/devices" -Method Post -ContentType "application/json" -Body $payload | Out-Null
        Log "Registered."
    } catch {
        Log "Could not register with AURA: $_"
    }
}