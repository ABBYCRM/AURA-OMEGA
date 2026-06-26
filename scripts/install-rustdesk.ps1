# =====================================================================
# install-rustdesk.ps1
#
# Run as Administrator on the Windows PC.
# Installs RustDesk and configures unattended access with a fixed password.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-rustdesk.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-rustdesk.ps1 -FixedPassword "TempPwd123"
#
# BOS-OMEGA Round B
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$FixedPassword,
    [Parameter(Mandatory=$false)] [string]$CustomClientUrl,
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

# Default to the official client. Operators can self-host by passing a URL.
if (-not $CustomClientUrl) {
    $CustomClientUrl = "https://github.com/rustdesk/rustdesk/releases/download/1.2.6/rustdesk-1.2.6-x86_64.exe"
}

$installer = Join-Path $env:TEMP "rustdesk-installer.exe"

function Log($msg) {
    Write-Host "[rustdesk-install] $msg" -ForegroundColor Cyan
}

Log "Downloading RustDesk client..."
Invoke-WebRequest -Uri $CustomClientUrl -OutFile $installer -UseBasicParsing

Log "Installing (silent)..."
$args = @(
    "--silent-install"
)
Start-Process -FilePath $installer -ArgumentList $args -Wait -NoNewWindow

$rustdeskExe = "${env:ProgramFiles}\RustDesk\rustdesk.exe"
if (-not (Test-Path $rustdeskExe)) {
    $rustdeskExe = "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe"
}
if (-not (Test-Path $rustdeskExe)) {
    throw "RustDesk install succeeded but rustdesk.exe not found."
}

# Get the device's RustDesk ID. The ID lives in the registry after install.
$regKey = "HKCU:\Software\rustdesk"
$rustdeskId = (Get-ItemProperty -Path $regKey -Name "ID" -ErrorAction SilentlyContinue).ID
if (-not $rustdeskId) {
    Log "Warning: rustdesk ID not yet in registry. Open RustDesk once to populate."
}

if ($FixedPassword) {
    Log "Setting fixed password..."
    & $rustdeskExe --password $FixedPassword
}

# Configure unattended access if both pieces are present.
if ($rustdeskId -and $FixedPassword) {
    Log "RustDesk ID: $rustdeskId"
    Log "Password:    $FixedPassword"

    if ($AuraApiBase) {
        try {
            $payload = @{
                name             = $DeviceName
                host             = (Get-WmiObject -Class Win32_ComputerSystem).Name
                adapter          = "rustdesk"
                rustdeskId       = $rustdeskId
                rustdeskPassword = $FixedPassword
            } | ConvertTo-Json -Compress
            Log "Registering with AURA at $AuraApiBase..."
            Invoke-RestMethod -Uri "$AuraApiBase/api/devices" -Method Post -ContentType "application/json" -Body $payload | Out-Null
            Log "Registered."
        } catch {
            Log "Could not register with AURA: $_"
        }
    }
}