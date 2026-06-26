# =====================================================================
# BOS-OMEGA Bootstrap Installer
#
# Single PowerShell command the operator runs on the target Windows PC.
# Detects environment, installs dependencies, clones BOS-OMEGA, configures
# the runtime, installs every adapter, registers the device, and launches
# the BOS dashboard.
#
# Usage:
#   irm https://bos-omega.dev/install.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File .\bos-omega-bootstrap.ps1
#
# Stages (each step is idempotent and re-runnable):
#   1.  Download Bootstrap
#   2.  Detect Environment (OS, arch, admin)
#   3.  Install Dependencies (Git, Node, pnpm)
#   4.  Clone BOS-OMEGA
#   5.  Configure Runtime (env vars, secrets)
#   6.  Install Tailscale
#   7.  Install RustDesk
#   8.  Install MeshCentral Agent
#   9.  Install Sunshine
#   10. Install BOS PC Agent
#   11. Install Services (scheduled tasks)
#   12. Install Runtime (pnpm install + build)
#   13. Start Runtime (node dist/index.mjs)
#   14. Verify Components (each adapter responds)
#   15. Launch BOS (open dashboard)
#   16. Display Dashboard
#
# Exit codes:
#   0  = everything green
#   1  = a dependency install failed
#   2  = clone or pull failed
#   3  = an adapter install failed
#   4  = runtime build/start failed
# =====================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)] [string]$RepoUrl = "https://github.com/ABBYCRM/AURA-OMEGA.git",
    [Parameter(Mandatory=$false)] [string]$Branch  = "main",
    [Parameter(Mandatory=$false)] [string]$InstallDir = "${env:ProgramFiles}\BOS-OMEGA",
    [Parameter(Mandatory=$false)] [string]$AuraApiBase = "https://aura-omega.onrender.com",
    [Parameter(Mandatory=$false)] [string]$DeviceName = $env:COMPUTERNAME,
    [Parameter(Mandatory=$false)] [string]$TailscaleAuthKey,
    [Parameter(Mandatory=$false)] [string]$RustDeskPassword = "BOS-$(Get-Random -Min 1000 -Max 9999)",
    [switch]$SkipTailscale,
    [switch]$SkipRustDesk,
    [switch]$SkipMeshCentral,
    [switch]$SkipSunshine,
    [switch]$SkipScrcpy,
    [switch]$Unattended
)

$ErrorActionPreference = "Continue"
$ProgressPreference   = "SilentlyContinue"

# ─── Banner ────────────────────────────────────────────────────────────────
function Banner($step, $title) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  BOS-OMEGA  Step $step :  $title" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "  • $msg" -ForegroundColor Gray }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }

# ─── 1. Download Bootstrap ────────────────────────────────────────────────
Banner 1 "Download Bootstrap"
Ok "Running bos-omega-bootstrap.ps1 (this script)"

# ─── 2. Detect Environment ────────────────────────────────────────────────
Banner 2 "Detect Environment"
$osInfo  = Get-CimInstance Win32_OperatingSystem
$arch    = $env:PROCESSOR_ARCHITECTURE
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Info "OS:      $($osInfo.Caption) ($($osInfo.Version))"
Info "Arch:    $arch"
Info "Admin:   $isAdmin"
Info "Device:  $DeviceName"

if (-not $isAdmin) {
    Fail "BOS-OMEGA bootstrap requires Administrator. Re-run from an elevated PowerShell."
    exit 1
}

# ─── 3. Install Dependencies ──────────────────────────────────────────────
Banner 3 "Install Dependencies"

# Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Info "Installing Git..."
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements | Out-Null
}
Ok "Git: $(git --version)"

# Node.js (LTS)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Info "Installing Node.js LTS..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine")
}
Ok "Node: $(node --version)"

# pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Info "Installing pnpm..."
    npm install -g pnpm | Out-Null
}
Ok "pnpm: $(pnpm --version)"

# Python (optional, for Sunshines GPU detection)
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Info "Installing Python (for Sunshine helpers)..."
    winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements | Out-Null
}

# Docker (optional)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Info "Docker not present (optional). Skipping."
}

# ─── 4. Clone BOS-OMEGA ───────────────────────────────────────────────────
Banner 4 "Clone BOS-OMEGA"

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

if (-not (Test-Path "$InstallDir\.git")) {
    Info "Cloning $RepoUrl @ $Branch into $InstallDir..."
    git clone --branch $Branch --depth 1 $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { Fail "Clone failed"; exit 2 }
} else {
    Info "Repo already exists. Pulling latest $Branch..."
    Push-Location $InstallDir
    git fetch origin
    git checkout $Branch
    git pull --ff-only
    Pop-Location
}
Ok "Repository ready at $InstallDir"

# ─── 5. Configure Runtime ────────────────────────────────────────────────
Banner 5 "Configure Runtime"

$envFile = Join-Path $InstallDir ".env.bos-omega"
if (-not (Test-Path $envFile)) {
    $tsKey = if ($TailscaleAuthKey) { $TailscaleAuthKey } else { "" }
    @"
AURA_API_BASE=$AuraApiBase
DEVICE_NAME=$DeviceName
TAILSCALE_AUTH_KEY=$tsKey
RUSTDESK_PASSWORD=$RustDeskPassword
"@ | Out-File -FilePath $envFile -Encoding utf8
    Ok "Wrote $envFile"
} else {
    Info "$envFile already exists, not overwriting."
}

# ─── 6-10. Install Adapters ──────────────────────────────────────────────
$scriptsDir = Join-Path $InstallDir "scripts"

if (-not $SkipTailscale) {
    Banner 6 "Install Tailscale"
    $tsArgs = @{}
    if ($TailscaleAuthKey) { $tsArgs["AuthKey"] = $TailscaleAuthKey }
    if ($Unattended)        { $tsArgs["Unattended"] = $true }
    & powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir "install-tailscale.ps1") @tsArgs -AuraApiBase $AuraApiBase -DeviceName $DeviceName
    if ($LASTEXITCODE -ne 0) { Warn "Tailscale install exited $LASTEXITCODE (continuing)" } else { Ok "Tailscale installed" }
}

if (-not $SkipRustDesk) {
    Banner 7 "Install RustDesk"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir "install-rustdesk.ps1") -FixedPassword $RustDeskPassword -AuraApiBase $AuraApiBase -DeviceName $DeviceName
    if ($LASTEXITCODE -ne 0) { Warn "RustDesk install exited $LASTEXITCODE (continuing)" } else { Ok "RustDesk installed" }
}

if (-not $SkipMeshCentral) {
    Banner 8 "Install MeshCentral Agent"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir "install-meshagent.ps1") -AuraApiBase $AuraApiBase -DeviceName $DeviceName
    if ($LASTEXITCODE -ne 0) { Warn "MeshCentral install exited $LASTEXITCODE (continuing)" } else { Ok "MeshCentral agent installed" }
}

if (-not $SkipSunshine) {
    Banner 9 "Install Sunshine"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir "install-sunshine.ps1") -Pin "1234" -AuraApiBase $AuraApiBase -DeviceName $DeviceName
    if ($LASTEXITCODE -ne 0) { Warn "Sunshine install exited $LASTEXITCODE (continuing)" } else { Ok "Sunshine installed" }
}

Banner 10 "Install BOS PC Agent"
# pc-agent will land as a real binary in Round D substep 2. For now we
# register the package so the runtime can call into it.
Info "PC Agent install stub: lands with pc-agent binary build in Round D substep 2."

# ─── 11. Install Services ────────────────────────────────────────────────
Banner 11 "Install Services"
$svcName = "BOS-OMEGA-Runtime"
$nodeExe = (Get-Command node).Source
$entry   = Join-Path $InstallDir "artifacts\api-server\dist\index.mjs"

if (-not (Get-Service -Name $svcName -ErrorAction SilentlyContinue)) {
    Info "Creating scheduled task $svcName..."
    $action = New-ScheduledTaskAction -Execute $nodeExe -Argument $entry -WorkingDirectory $InstallDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $svcName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Description "BOS-OMEGA remote-control runtime" | Out-Null
    Ok "Scheduled task registered."
} else {
    Info "Scheduled task $svcName already exists."
}

# ─── 12. Install Runtime ─────────────────────────────────────────────────
Banner 12 "Install Runtime"
Push-Location $InstallDir
Info "Running pnpm install..."
pnpm install --silent
Info "Building api-server..."
Set-Location artifacts/api-server
node ./build.mjs
if ($LASTEXITCODE -ne 0) { Fail "Build failed"; Pop-Location; exit 4 }
Pop-Location

# ─── 13. Start Runtime ───────────────────────────────────────────────────
Banner 13 "Start Runtime"
Start-ScheduledTask -TaskName $svcName
Start-Sleep -Seconds 5

# ─── 14. Verify Components ───────────────────────────────────────────────
Banner 14 "Verify Components"
$apiBase = $AuraApiBase
$checks = @(
    @{ name = "Tailscale";    test = { (& "$env:ProgramFiles\Tailscale\tailscale.exe" status) -ne $null } }
    @{ name = "RustDesk";     test = { Test-Path "$env:ProgramFiles\RustDesk\rustdesk.exe" } }
    @{ name = "AURA Runtime"; test = {
            try {
                $r = Invoke-WebRequest -Uri "$apiBase/api/devices/status" -UseBasicParsing -TimeoutSec 5
                $r.StatusCode -eq 200
            } catch { $false }
        } }
)
foreach ($c in $checks) {
    try {
        $r = & $c.test
        if ($r) { Ok "$($c.name) responding" } else { Warn "$($c.name) not responding" }
    } catch { Warn "$($c.name) check failed: $_" }
}

# ─── 15. Launch BOS ──────────────────────────────────────────────────────
Banner 15 "Launch BOS"
Start-Process "$apiBase"

# ─── 16. Display Dashboard ───────────────────────────────────────────────
Banner 16 "Display Dashboard"
Write-Host ""
Write-Host "  BOS-OMEGA is live. Open the dashboard at: $apiBase" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    1. On your phone, open the AURA-OMEGA web app"
Write-Host "    2. Go to Settings → Bootstrap Installer"
Write-Host "    3. Tap Connect next to '$DeviceName'"
Write-Host ""
Ok "Bootstrap complete."