<#
.SYNOPSIS
  Installs a Kipple test build, starts it with WebView2's DevTools port and runs the desktop smoke tests,
  keeping a screenshot of every step.

.DESCRIPTION
  Test builds are the kipple-test-DATE-buildN-sha7 archives from Actions -> build -> Run workflow.
  The tests only read (see e2e/smoke.e2e.ts): no edits, no deleting, no import, nothing sent to Telegram.
  With an existing library they look at it as it is; on a fresh install they open the sample library.

.EXAMPLE
  scripts/test-build.ps1 -Build 307            # download build 307 from GitHub (needs gh), install, test
  scripts/test-build.ps1 -Installer .\Kipple_0.1.0_x64-setup.exe
  scripts/test-build.ps1 -NoInstall            # test the Kipple that is installed now
  scripts/test-build.ps1 -Build 307 -KeepOpen  # leave the app open afterwards (the DevTools port stays open too)
#>
[CmdletBinding(DefaultParameterSetName = "Build")]
param(
  [Parameter(ParameterSetName = "Build", Mandatory = $true)][int]$Build,
  [Parameter(ParameterSetName = "Installer", Mandatory = $true)][string]$Installer,
  [Parameter(ParameterSetName = "Installed", Mandatory = $true)][switch]$NoInstall,
  [string]$Repo = "khainpain/kipple",
  [string]$Out,
  [int]$Port = 9222,
  [switch]$KeepOpen
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $env:LOCALAPPDATA "Kipple\kipple.exe"
$label = if ($Build) { "build$Build" } elseif ($Installer) { [IO.Path]::GetFileNameWithoutExtension($Installer) } else { "installed" }
if (-not $Out) { $Out = Join-Path $root "e2e-desktop\$label" }

# Two copies of Kipple would share one library on disk, so the owner closes theirs first; this script never does.
if (Get-Process kipple -ErrorAction SilentlyContinue) {
  throw "Kipple is running. Close it first: a second copy would share the same library."
}

if ($Build) {
  # Only archives of a manual test build of this repository: a fork's pull request runs here too and could
  # upload an archive with a look-alike name, and this script installs and runs what it downloads.
  $pages = gh api --paginate "repos/$Repo/actions/artifacts?per_page=100" --jq '.artifacts[]'
  if ($LASTEXITCODE) { throw "gh api failed (signed in? run: gh auth status)" }
  $artifact = $pages | ForEach-Object { $_ | ConvertFrom-Json } |
    Where-Object { $_.name -match "^kipple-test-\d{4}-\d{2}-\d{2}-build$Build-[0-9a-f]{7}$" -and -not $_.expired } |
    Select-Object -First 1
  if (-not $artifact) { throw "No unexpired kipple-test archive for build $Build in $Repo." }
  $runId = $artifact.workflow_run.id
  $name = $artifact.name
  $run = gh api "repos/$Repo/actions/runs/$runId" | ConvertFrom-Json
  if ($LASTEXITCODE) { throw "gh api failed for run $runId" }
  if ($run.event -ne "workflow_dispatch" -or $run.path -ne ".github/workflows/build.yml" -or $run.head_repository.full_name -ne $Repo) {
    throw "Archive $name is not from a manual build of $Repo (event $($run.event), from $($run.head_repository.full_name)). Not installing it."
  }
  Write-Host "Build $Build`: branch $($run.head_branch), commit $($run.head_sha.Substring(0, 7)), started by $($run.triggering_actor.login)"
  $download = Join-Path ([IO.Path]::GetTempPath()) "kipple-$name"
  if (Test-Path $download) { Remove-Item -Recurse -Force $download }
  Write-Host "Downloading $name (run $runId)"
  gh run download $runId -R $Repo -n $name -D $download
  if ($LASTEXITCODE) { throw "gh run download failed" }
  $Installer = (Get-ChildItem $download -Recurse -Filter "Kipple_*-setup.exe" | Select-Object -First 1).FullName
  if (-not $Installer) { throw "No Kipple_*-setup.exe in $name" }
}

# Closes Kipple the way the window's close button does, so it can finish writing; forces it only if it hangs.
function Close-Kipple {
  foreach ($p in @(Get-Process kipple -ErrorAction SilentlyContinue)) {
    if ($p.CloseMainWindow()) { [void]$p.WaitForExit(10000) }
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
}

if ($Installer) {
  Write-Host "Installing $Installer"
  $p = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
  if ($p.ExitCode) { throw "Installer exited with code $($p.ExitCode)" }
  # The installer may start the app when it finishes; the tests need it started with the DevTools port.
  $until = (Get-Date).AddSeconds(10)
  while (-not (Get-Process kipple -ErrorAction SilentlyContinue) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
  Close-Kipple
}
if (-not (Test-Path $exe)) { throw "Kipple is not installed at $exe" }
Write-Host "Kipple $((Get-Item $exe).VersionInfo.FileVersion), $((Get-Item $exe).LastWriteTime)"

# A test build opens the real library and may update its files on start, so they are copied aside first
# (only the files at the top of the data folder: library, edits, settings; not the media).
$data = Join-Path $env:APPDATA "io.getkipple.app"
if (Test-Path $data) {
  $backup = Join-Path $Out "data-backup"
  New-Item -ItemType Directory -Force $backup | Out-Null
  Get-ChildItem $data -File | Copy-Item -Destination $backup -Force
  Write-Host "Library files copied to $backup"
}

# Something else on the port (a browser started for debugging) would answer instead of Kipple.
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. Close what listens there or pass -Port."
}

$code = 1
$cdp = "http://127.0.0.1:$Port"
try {
  # WebView2 reads extra browser flags from this variable. It goes to Kipple only, not to this shell,
  # and the port listens on 127.0.0.1 for as long as this copy of Kipple runs.
  $psi = New-Object Diagnostics.ProcessStartInfo $exe
  $psi.UseShellExecute = $false
  $psi.Environment["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--remote-debugging-port=$Port"
  $app = [Diagnostics.Process]::Start($psi)

  $deadline = (Get-Date).AddSeconds(30)
  $last = $null
  while ($true) {
    try {
      $pages = Invoke-RestMethod "$cdp/json/list" -TimeoutSec 2
      if ($pages | Where-Object { $_.type -eq "page" -and $_.url -match "^(https?://tauri\.localhost|tauri://localhost)" }) { break }
      $last = "no Kipple window among: $(($pages | ForEach-Object url) -join ', ')"
    } catch { $last = $_.Exception.Message }
    if ($app.HasExited) { throw "Kipple exited on start (code $($app.ExitCode))" }
    if ((Get-Date) -gt $deadline) { throw "No Kipple window on $cdp after 30 s: $last" }
    Start-Sleep -Milliseconds 500
  }

  Push-Location $root
  try {
    $env:KIPPLE_CDP = $cdp
    npx playwright test --project=desktop --output "$Out\results"
    $code = $LASTEXITCODE
  } finally {
    Remove-Item Env:KIPPLE_CDP -ErrorAction SilentlyContinue
    Pop-Location
  }
} finally {
  if ($KeepOpen) {
    Write-Warning "Kipple stays open with the DevTools port ${Port}: any program on this computer can act in the app, including on your Telegram account, until you close Kipple."
  } else {
    Close-Kipple
  }
}

# One folder with a picture per test, named after the test (a retry overwrites its first try).
$shots = Join-Path $Out "screens"
New-Item -ItemType Directory -Force $shots | Out-Null
$copied = 0
Get-ChildItem "$Out\results" -Recurse -Filter screen.png -ErrorAction SilentlyContinue | ForEach-Object {
  $dest = Join-Path $shots (($_.Directory.Name -replace "-retry\d+$", "") + ".png")
  Copy-Item $_.FullName $dest -Force
  $copied++
}
if ($copied) { Write-Host "Screenshots ($copied): $shots" } else { Write-Warning "No screenshots were taken: see the test output above." }
exit $code
