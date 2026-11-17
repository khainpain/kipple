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
  $list = gh api "repos/$Repo/actions/artifacts?per_page=100" | ConvertFrom-Json
  $artifact = $list.artifacts | Where-Object { $_.name -match "-build$Build-" -and -not $_.expired } | Select-Object -First 1
  if (-not $artifact) { throw "No unexpired kipple-test archive for build $Build in $Repo." }
  $runId = $artifact.workflow_run.id
  $name = $artifact.name
  $download = Join-Path ([IO.Path]::GetTempPath()) "kipple-$name"
  if (Test-Path $download) { Remove-Item -Recurse -Force $download }
  Write-Host "Downloading $name (run $runId)"
  gh run download $runId -R $Repo -n $name -D $download
  if ($LASTEXITCODE) { throw "gh run download failed" }
  $Installer = (Get-ChildItem $download -Recurse -Filter "Kipple_*-setup.exe" | Select-Object -First 1).FullName
  if (-not $Installer) { throw "No Kipple_*-setup.exe in $name" }
}

if ($Installer) {
  Write-Host "Installing $Installer"
  $p = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
  if ($p.ExitCode) { throw "Installer exited with code $($p.ExitCode)" }
  # The installer may start the app when it finishes; the tests need it started with the DevTools port.
  Start-Sleep -Seconds 2
  Get-Process kipple -ErrorAction SilentlyContinue | Stop-Process
}
if (-not (Test-Path $exe)) { throw "Kipple is not installed at $exe" }
Write-Host "Kipple $((Get-Item $exe).VersionInfo.FileVersion), $((Get-Item $exe).LastWriteTime)"

# WebView2 reads extra browser flags from this variable; the port listens on 127.0.0.1 only.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
$app = Start-Process -FilePath $exe -PassThru
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$cdp = "http://127.0.0.1:$Port"
$deadline = (Get-Date).AddSeconds(30)
while ($true) {
  try { Invoke-RestMethod "$cdp/json/version" -TimeoutSec 2 | Out-Null; break } catch {}
  if ($app.HasExited) { throw "Kipple exited on start (code $($app.ExitCode))" }
  if ((Get-Date) -gt $deadline) { throw "No DevTools port on $cdp after 30 s" }
  Start-Sleep -Milliseconds 500
}

$code = 0
try {
  Push-Location $root
  $env:KIPPLE_CDP = $cdp
  npx playwright test --project=desktop --output "$Out\results"
  $code = $LASTEXITCODE
} finally {
  Remove-Item Env:KIPPLE_CDP -ErrorAction SilentlyContinue
  Pop-Location
  if (-not $KeepOpen) { Get-Process kipple -ErrorAction SilentlyContinue | Stop-Process }
}

# One folder with a picture per test, named after the test.
$shots = Join-Path $Out "screens"
New-Item -ItemType Directory -Force $shots | Out-Null
Get-ChildItem "$Out\results" -Recurse -Filter screen.png | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $shots ($_.Directory.Name + ".png"))
}
Write-Host "Screenshots: $shots"
exit $code
