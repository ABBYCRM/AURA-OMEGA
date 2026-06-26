# =====================================================================
# install-pc-agent.ps1
#
# Installs the BOS-OMEGA PC Agent: a small Node service that listens on
# 127.0.0.1:8787 and accepts execute commands from AURA. The agent spawns
# the right adapter binary (tailscale, rustdesk, meshagent, scrcpy) and
# streams output back.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install-pc-agent.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-pc-agent.ps1 -AuraApiBase https://aura-omega.onrender.com
#
# BOS-OMEGA Round D follow-up
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com",
    [Parameter(Mandatory=$false)] [string]$SharedSecret,
    [Parameter(Mandatory=$false)] [int]$Port = 8787,
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
$ProgressPreference   = "SilentlyContinue"

$installDir = "${env:ProgramFiles}\BOS-OMEGA-PCAgent"
$nodeExe    = (Get-Command node).Source
$repoDir    = "${env:ProgramFiles}\BOS-OMEGA"

function Log($msg) {
    Write-Host "[pc-agent-install] $msg" -ForegroundColor Cyan
}

if (-not (Test-Path $repoDir)) {
    Fail "BOS-OMEGA repo not installed at $repoDir. Run install-tailscale.ps1 first or the bootstrap script."
    exit 1
}

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

Log "Copying pc-agent source from $repoDir to $installDir..."
Copy-Item -Path (Join-Path $repoDir "packages\pc-agent\*") -Destination $installDir -Recurse -Force

# pc-agent needs @workspace/db and a few shared packages. We symlink the
# relevant node_modules from the main repo so we don't have to re-install.
$repoNodeModules = Join-Path $repoDir "node_modules"
$agentNodeModules = Join-Path $installDir "node_modules"
if (-not (Test-Path $agentNodeModules)) {
    New-Item -ItemType Directory -Path $agentNodeModules -Force | Out-Null
}
foreach ($pkg in @("drizzle-orm", "pg", "@workspace")) {
    $src = Join-Path $repoNodeModules $pkg
    if (Test-Path $src) {
        $dst = Join-Path $agentNodeModules $pkg
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
        New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
    }
}
Log "Linked node_modules from main repo."

# Generate a shared secret if not supplied.
if (-not $SharedSecret) {
    $SharedSecret = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    Log "Generated shared secret (32 chars)."
}

# Write config.json
$config = @{
    port       = $Port
    secret     = $SharedSecret
    logLevel   = "info"
    auraApiBase = $AuraApiBase
    deviceName = $DeviceName
} | ConvertTo-Json -Depth 4

$configPath = Join-Path $installDir "config.json"
Set-Content -Path $configPath -Value $config -Encoding utf8
Log "Wrote $configPath"

# Start the agent in the background via Scheduled Task so it survives reboots.
$taskName = "BOS-OMEGA-PCAgent"
$entryScript = Join-Path $installDir "src\server.mjs"
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument $entryScript -WorkingDirectory $installDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Description "BOS-OMEGA PC Agent" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Log "Started scheduled task $taskName on port $Port."

# Register device with AURA
if ($AuraApiBase) {
    try {
        $payload = @{
            name    = "$DeviceName-pcagent"
            host    = "$DeviceName.tail.ts.net"
            adapter = "pcagent"
            tailscaleIp = $null
            metadata = @{ pcAgentPort = $Port; pcAgentSecretSet = $true }
        } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$AuraApiBase/api/devices" -Method Post -ContentType "application/json" -Body $payload | Out-Null
        Log "Registered PC agent with AURA."
    } catch {
        Log "Could not register with AURA: $_"
    }
}

Log "Done. The PC agent is listening on 127.0.0.1:$Port."
Log "Save the shared secret safely — AURA uses it to authenticate execute requests."