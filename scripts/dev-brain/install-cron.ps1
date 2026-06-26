# Installs the dev-brain scheduled loop on Windows Task Scheduler.
#   - HybridDevBrain-Research : runs research-sync.sh daily (default 09:00)
#   - HybridDevBrain-AuthKeepalive : refreshes NotebookLM cookies every 20 min
#     so the unattended daily run does not die on a stale Google session.
#
# Usage (normal PowerShell, no admin needed for per-user tasks):
#   powershell -ExecutionPolicy Bypass -File scripts\dev-brain\install-cron.ps1
#   ...optional: -At "07:30"   -Uninstall
param(
  [string]$At = "09:00",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$RepoRoot   = (Resolve-Path "$PSScriptRoot\..\..").Path
$SyncScript = "$RepoRoot\scripts\dev-brain\research-sync.sh"

$ResearchTask = "HybridDevBrain-Research"
$KeepaliveTask = "HybridDevBrain-AuthKeepalive"

if ($Uninstall) {
  foreach ($t in @($ResearchTask, $KeepaliveTask)) {
    Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed task: $t"
  }
  exit 0
}

# Locate git bash.
$BashCandidates = @(
  "$env:ProgramFiles\Git\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)
$Bash = $BashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Bash) { throw "git bash not found. Install Git for Windows or edit `$BashCandidates." }

# --- research task (daily) ---
$researchAction  = New-ScheduledTaskAction -Execute $Bash -Argument "`"$SyncScript`""
$researchTrigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName $ResearchTask -Action $researchAction `
  -Trigger $researchTrigger -Settings $settings -Force `
  -Description "Hybrid dev-brain: NotebookLM research backlog -> Obsidian vault" | Out-Null
Write-Host "Installed: $ResearchTask (daily at $At)"

# --- auth keepalive (every 20 min) ---
$kaAction = New-ScheduledTaskAction -Execute $Bash `
  -Argument "-lc `"notebooklm auth refresh --quiet`""
$kaTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $KeepaliveTask -Action $kaAction `
  -Trigger $kaTrigger -Settings $settings -Force `
  -Description "Hybrid dev-brain: keep NotebookLM cookies warm" | Out-Null
Write-Host "Installed: $KeepaliveTask (every 20 min)"

Write-Host ""
Write-Host "Done. Verify: Get-ScheduledTask -TaskName 'HybridDevBrain-*'"
Write-Host "Manual run now: & '$Bash' '$SyncScript'"
